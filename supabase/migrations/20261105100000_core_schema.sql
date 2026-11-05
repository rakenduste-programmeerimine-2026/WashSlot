-- Core schema: buildings, profiles, machines, cycles and the live machine overview.
-- Design: docs/database/schema-design.md

create extension if not exists btree_gist with schema extensions;

-- Helpers that must not be exposed through the Data API live in `private`.
create schema if not exists private;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.machine_type as enum ('washer', 'dryer');
create type public.member_role as enum ('resident', 'admin');
create type public.release_reason as enum ('collected', 'cancelled');
create type public.machine_state as enum ('free', 'in_use', 'awaiting_collection', 'reserved', 'out_of_order');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  join_code text not null unique check (join_code ~ '^[A-Z0-9]{6,12}$'),
  timezone text not null default 'Europe/Tallinn',
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 50),
  building_id uuid references public.buildings (id) on delete set null,
  role public.member_role not null default 'resident',
  created_at timestamptz not null default now()
);
create index profiles_building_id_idx on public.profiles (building_id);

create table public.machines (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 30),
  type public.machine_type not null,
  default_cycle_minutes integer not null default 60 check (default_cycle_minutes between 5 and 240),
  out_of_order boolean not null default false,
  created_at timestamptz not null default now(),
  constraint machines_label_unique unique (building_id, label)
);

create table public.cycles (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references public.machines (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  released_at timestamptz,
  release_reason public.release_reason,
  notified_at timestamptz,
  -- Maintained by trigger (timestamptz + interval is not immutable, so it can't be a generated column).
  occupied tstzrange not null,
  constraint cycles_ends_after_start check (ends_at > started_at),
  constraint cycles_release_consistent check ((released_at is null) = (release_reason is null)),
  constraint cycles_released_after_start check (released_at is null or released_at >= started_at),
  constraint cycles_no_overlap exclude using gist (machine_id with =, occupied with &&)
);
create index cycles_user_id_idx on public.cycles (user_id);
create index cycles_notify_idx on public.cycles (ends_at) where notified_at is null and released_at is null;

-- ---------------------------------------------------------------------------
-- Private helpers
-- ---------------------------------------------------------------------------

-- How long a finished cycle keeps the machine marked for its owner.
create function private.collection_grace()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '15 minutes' $$;

create function private.my_building_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.building_id from public.profiles p where p.id = (select auth.uid())
$$;

create function private.is_admin_of(target_building uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.building_id = target_building and p.role = 'admin'
  )
$$;

create function private.set_cycle_occupied()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.occupied := tstzrange(
    new.started_at,
    least(coalesce(new.released_at, 'infinity'::timestamptz), new.ends_at + private.collection_grace()),
    '[)'
  );
  return new;
end;
$$;

create trigger cycles_set_occupied
  before insert or update of started_at, ends_at, released_at on public.cycles
  for each row execute function private.set_cycle_occupied();

-- Create a profile for every new auth user.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 50));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

revoke all on all functions in schema private from public, anon;
grant execute on function private.my_building_id(), private.is_admin_of(uuid), private.collection_grace()
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.buildings enable row level security;
alter table public.profiles enable row level security;
alter table public.machines enable row level security;
alter table public.cycles enable row level security;

revoke all on public.buildings, public.profiles, public.machines, public.cycles from anon;

-- buildings: members read their own building; changes only via service role / dashboard.
revoke insert, update, delete on public.buildings from authenticated;
create policy "members read own building" on public.buildings
  for select to authenticated
  using (id = (select private.my_building_id()));

-- profiles: read self + neighbours; users may only change their display name.
create policy "read self and building members" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or building_id = (select private.my_building_id()));
create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
revoke insert, update, delete on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

-- machines: members read; building admins manage.
create policy "members read building machines" on public.machines
  for select to authenticated
  using (building_id = (select private.my_building_id()));
create policy "admins insert machines" on public.machines
  for insert to authenticated
  with check ((select private.is_admin_of(building_id)));
create policy "admins update machines" on public.machines
  for update to authenticated
  using ((select private.is_admin_of(building_id)))
  with check ((select private.is_admin_of(building_id)));
create policy "admins delete machines" on public.machines
  for delete to authenticated
  using ((select private.is_admin_of(building_id)));

-- cycles: members read; all writes go through RPCs (security definer).
create policy "members read building cycles" on public.cycles
  for select to authenticated
  using (exists (
    select 1 from public.machines m
    where m.id = cycles.machine_id and m.building_id = (select private.my_building_id())
  ));
revoke insert, update, delete on public.cycles from authenticated;

-- ---------------------------------------------------------------------------
-- RPC: join a building with its code
-- ---------------------------------------------------------------------------
create function public.join_building(code text)
returns public.buildings
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  b public.buildings;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into b from public.buildings where join_code = upper(trim(code));
  if not found then
    raise exception 'invalid building code' using errcode = 'P0002';
  end if;

  update public.profiles p
  set role = case when p.building_id = b.id then p.role else 'resident' end,
      building_id = b.id
  where p.id = uid;

  return b;
end;
$$;

revoke execute on function public.join_building(text) from public, anon;
grant execute on function public.join_building(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Live overview
-- ---------------------------------------------------------------------------
create view public.machine_status
with (security_invoker = true)
as
select
  m.id as machine_id,
  m.building_id,
  m.label,
  m.type,
  m.default_cycle_minutes,
  case
    when m.out_of_order then 'out_of_order'::public.machine_state
    when c.id is not null and now() < c.ends_at then 'in_use'::public.machine_state
    when c.id is not null then 'awaiting_collection'::public.machine_state
    else 'free'::public.machine_state
  end as state,
  c.id as current_cycle_id,
  c.user_id as current_user_id,
  c.started_at as cycle_started_at,
  c.ends_at as estimated_finish_at
from public.machines m
left join lateral (
  select c.id, c.user_id, c.started_at, c.ends_at
  from public.cycles c
  where c.machine_id = m.id and c.occupied @> now()
  limit 1
) c on true;

revoke all on public.machine_status from anon;
grant select on public.machine_status to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.machines, public.cycles;

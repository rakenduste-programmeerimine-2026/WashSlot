-- Time-slot bookings and the rules that keep bookings and running cycles from colliding.
-- Design: docs/database/schema-design.md §4

create type public.booking_status as enum ('booked', 'cancelled', 'used');

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references public.machines (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.booking_status not null default 'booked',
  created_at timestamptz not null default now(),
  constraint bookings_valid_length
    check (ends_at - starts_at between interval '15 minutes' and interval '4 hours'),
  constraint bookings_no_overlap
    exclude using gist (machine_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
    where (status = 'booked')
);
create index bookings_user_id_idx on public.bookings (user_id);

alter table public.bookings enable row level security;
revoke all on public.bookings from anon;
revoke insert, update, delete on public.bookings from authenticated;

create policy "members read building bookings" on public.bookings
  for select to authenticated
  using (exists (
    select 1 from public.machines m
    where m.id = bookings.machine_id and m.building_id = (select private.my_building_id())
  ));

-- ---------------------------------------------------------------------------
-- RPC: book a slot
-- ---------------------------------------------------------------------------
create function public.create_booking(machine_id uuid, starts_at timestamptz, ends_at timestamptz)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  slot tstzrange;
  m public.machines;
  b public.bookings;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into m from public.machines mm
  where mm.id = create_booking.machine_id and mm.building_id = private.my_building_id();
  if not found then
    raise exception 'machine not found' using errcode = 'P0002';
  end if;
  if m.out_of_order then
    raise exception 'machine is out of order' using errcode = 'P0001';
  end if;

  if create_booking.starts_at < now() then
    raise exception 'booking must start in the future' using errcode = '22023';
  end if;
  if create_booking.starts_at > now() + interval '24 hours' then
    raise exception 'bookings can be made at most 24 hours ahead' using errcode = '22023';
  end if;
  if create_booking.ends_at - create_booking.starts_at not between interval '15 minutes' and interval '4 hours' then
    raise exception 'booking must last between 15 minutes and 4 hours' using errcode = '22023';
  end if;
  if (
    select count(*) from public.bookings bb
    where bb.user_id = uid and bb.status = 'booked' and bb.ends_at > now()
  ) >= 2 then
    raise exception 'you can have at most 2 upcoming bookings' using errcode = 'P0001';
  end if;

  slot := tstzrange(create_booking.starts_at, create_booking.ends_at, '[)');
  if exists (select 1 from public.cycles c where c.machine_id = m.id and c.occupied && slot) then
    raise exception 'machine is in use during this slot' using errcode = '23P01';
  end if;

  begin
    insert into public.bookings (machine_id, user_id, starts_at, ends_at)
    values (m.id, uid, create_booking.starts_at, create_booking.ends_at)
    returning * into b;
  exception
    when exclusion_violation then
      raise exception 'slot is already booked' using errcode = '23P01';
  end;

  return b;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: cancel own booking
-- ---------------------------------------------------------------------------
create function public.cancel_booking(booking_id uuid)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  update public.bookings bb
  set status = 'cancelled'
  where bb.id = booking_id and bb.user_id = auth.uid() and bb.status = 'booked' and bb.ends_at > now()
  returning * into b;

  if not found then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;

  return b;
end;
$$;

-- ---------------------------------------------------------------------------
-- start_cycle now respects bookings: blocked by others' bookings, consumes your own.
-- ---------------------------------------------------------------------------
create or replace function public.start_cycle(machine_id uuid, minutes integer default null)
returns public.cycles
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  m public.machines;
  c public.cycles;
  run tstzrange;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into m from public.machines mm
  where mm.id = start_cycle.machine_id and mm.building_id = private.my_building_id();
  if not found then
    raise exception 'machine not found' using errcode = 'P0002';
  end if;
  if m.out_of_order then
    raise exception 'machine is out of order' using errcode = 'P0001';
  end if;
  if minutes is not null and minutes not between 5 and 240 then
    raise exception 'minutes must be between 5 and 240' using errcode = '22023';
  end if;

  run := tstzrange(
    now(),
    now() + make_interval(mins => coalesce(minutes, m.default_cycle_minutes)) + private.collection_grace(),
    '[)'
  );

  if exists (
    select 1 from public.bookings b
    where b.machine_id = m.id and b.status = 'booked' and b.user_id <> uid
      and tstzrange(b.starts_at, b.ends_at, '[)') && run
  ) then
    raise exception 'machine is booked by another resident' using errcode = '23P01';
  end if;

  update public.bookings b
  set status = 'used'
  where b.machine_id = m.id and b.status = 'booked' and b.user_id = uid
    and tstzrange(b.starts_at, b.ends_at, '[)') && run;

  begin
    insert into public.cycles (machine_id, user_id, started_at, ends_at)
    values (m.id, uid, now(), now() + make_interval(mins => coalesce(minutes, m.default_cycle_minutes)))
    returning * into c;
  exception
    when exclusion_violation then
      raise exception 'machine is already in use' using errcode = '23P01';
  end;

  return c;
end;
$$;

revoke execute on function
  public.create_booking(uuid, timestamptz, timestamptz),
  public.cancel_booking(uuid)
  from public, anon;
grant execute on function
  public.create_booking(uuid, timestamptz, timestamptz),
  public.cancel_booking(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Overview now also shows reservations and the next upcoming booking.
-- ---------------------------------------------------------------------------
create or replace view public.machine_status
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
    when nb.starts_at <= now() then 'reserved'::public.machine_state
    else 'free'::public.machine_state
  end as state,
  c.id as current_cycle_id,
  c.user_id as current_user_id,
  c.started_at as cycle_started_at,
  c.ends_at as estimated_finish_at,
  nb.id as next_booking_id,
  nb.user_id as next_booking_user_id,
  nb.starts_at as next_booking_starts_at,
  nb.ends_at as next_booking_ends_at
from public.machines m
left join lateral (
  select c.id, c.user_id, c.started_at, c.ends_at
  from public.cycles c
  where c.machine_id = m.id and c.occupied @> now()
  limit 1
) c on true
left join lateral (
  select b.id, b.user_id, b.starts_at, b.ends_at
  from public.bookings b
  where b.machine_id = m.id and b.status = 'booked' and b.ends_at > now()
  order by b.starts_at
  limit 1
) nb on true;

alter publication supabase_realtime add table public.bookings;

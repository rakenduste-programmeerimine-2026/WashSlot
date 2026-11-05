-- One-tap start, release (collected / cancelled) and push notification subscriptions.
-- Design: docs/database/schema-design.md §5–6

-- ---------------------------------------------------------------------------
-- RPC: start a machine with one tap
-- ---------------------------------------------------------------------------
create function public.start_cycle(machine_id uuid, minutes integer default null)
returns public.cycles
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  m public.machines;
  c public.cycles;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into m from public.machines
  where id = start_cycle.machine_id and building_id = private.my_building_id();
  if not found then
    raise exception 'machine not found' using errcode = 'P0002';
  end if;
  if m.out_of_order then
    raise exception 'machine is out of order' using errcode = 'P0001';
  end if;
  if minutes is not null and minutes not between 5 and 240 then
    raise exception 'minutes must be between 5 and 240' using errcode = '22023';
  end if;

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

-- ---------------------------------------------------------------------------
-- RPC: mark own laundry collected, or cancel a cycle
-- ---------------------------------------------------------------------------
create function public.release_cycle(cycle_id uuid, reason public.release_reason default 'collected')
returns public.cycles
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.cycles;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  update public.cycles
  set released_at = now(), release_reason = reason
  where id = cycle_id and user_id = auth.uid() and released_at is null
  returning * into c;

  if not found then
    raise exception 'active cycle not found' using errcode = 'P0002';
  end if;

  return c;
end;
$$;

revoke execute on function public.start_cycle(uuid, integer), public.release_cycle(uuid, public.release_reason)
  from public, anon;
grant execute on function public.start_cycle(uuid, integer), public.release_cycle(uuid, public.release_reason)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Web push subscriptions (one row per device)
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;
revoke update on public.push_subscriptions from authenticated;

create policy "read own subscriptions" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "add own subscriptions" on public.push_subscriptions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "remove own subscriptions" on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

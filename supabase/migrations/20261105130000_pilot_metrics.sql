-- Pilot success-criterion metrics: "collects laundry within 10 minutes of the cycle ending".
-- One row per finished, non-cancelled cycle. `collected_at` is null if the owner never tapped "collected".

create view public.cycle_collection_stats
with (security_invoker = true)
as
select
  c.id as cycle_id,
  c.user_id,
  m.building_id,
  c.machine_id,
  c.ends_at,
  c.released_at as collected_at,
  round((extract(epoch from (c.released_at - c.ends_at)) / 60.0)::numeric, 1) as minutes_after_end,
  c.released_at <= c.ends_at + interval '10 minutes' as collected_within_10_min
from public.cycles c
join public.machines m on m.id = c.machine_id
where c.ends_at <= now()
  and c.release_reason is distinct from 'cancelled';

revoke all on public.cycle_collection_stats from anon;
grant select on public.cycle_collection_stats to authenticated;

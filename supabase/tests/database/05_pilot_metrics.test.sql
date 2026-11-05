-- Pilot success-criterion metrics.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into public.buildings (id, name, join_code) values
  ('11111111-1111-1111-1111-111111111111', 'Building One', 'ONE111');
insert into auth.users (id, email) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'alice@test.local');
update public.profiles set building_id = '11111111-1111-1111-1111-111111111111';
insert into public.machines (id, building_id, label, type) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Washer 1', 'washer');

insert into public.cycles (id, machine_id, user_id, started_at, ends_at, released_at, release_reason) values
  -- collected 5 min after the end
  ('c0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   now() - interval '10 hours', now() - interval '9 hours', now() - interval '8 hours 55 minutes', 'collected'),
  -- collected 25 min after the end
  ('c0000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   now() - interval '8 hours', now() - interval '7 hours', now() - interval '6 hours 35 minutes', 'collected'),
  -- cancelled: excluded
  ('c0000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   now() - interval '5 hours', now() - interval '4 hours', now() - interval '5 hours', 'cancelled'),
  -- never marked collected
  ('c0000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   now() - interval '3 hours', now() - interval '2 hours', null, null);
-- still running: excluded
insert into public.cycles (machine_id, user_id, started_at, ends_at) values
  ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now() - interval '10 minutes', now() + interval '50 minutes');

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

select results_eq(
  $$ select cycle_id from public.cycle_collection_stats order by ends_at $$,
  $$ values ('c0000000-0000-0000-0000-000000000001'::uuid), ('c0000000-0000-0000-0000-000000000002'::uuid), ('c0000000-0000-0000-0000-000000000004'::uuid) $$,
  'only finished, non-cancelled cycles are reported'
);
select results_eq(
  $$ select minutes_after_end, collected_within_10_min from public.cycle_collection_stats
     where cycle_id in ('c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002') order by ends_at $$,
  $$ values (5.0::numeric, true), (25.0::numeric, false) $$,
  'minutes after end and the 10-minute target are computed'
);
select is(
  (select collected_within_10_min from public.cycle_collection_stats where cycle_id = 'c0000000-0000-0000-0000-000000000004'),
  null::boolean,
  'uncollected cycles have an unknown outcome'
);
reset role;

set local role anon;
select throws_ok($$ select * from public.cycle_collection_stats $$, '42501', null, 'anon cannot read pilot metrics');
reset role;

select * from finish();
rollback;

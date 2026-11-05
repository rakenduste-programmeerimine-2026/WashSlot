-- One-tap start, release, and the live machine overview states.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Fixtures ------------------------------------------------------------------
insert into public.buildings (id, name, join_code) values
  ('11111111-1111-1111-1111-111111111111', 'Building One', 'ONE111'),
  ('22222222-2222-2222-2222-222222222222', 'Building Two', 'TWO222');
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'alice@test.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bob@test.local');
update public.profiles set building_id = '11111111-1111-1111-1111-111111111111';
insert into public.machines (id, building_id, label, type, default_cycle_minutes, out_of_order) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Washer 1', 'washer', 60, false),
  ('a1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Washer 2', 'washer', 45, false),
  ('a1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Washer 3', 'washer', 60, true),
  ('a1000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Dryer 1', 'dryer', 50, false),
  ('a1000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'Dryer 2', 'dryer', 50, false),
  ('b2000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Washer 1', 'washer', 60, false);

-- Bob's earlier cycles (inserted as postgres to control time):
-- Dryer 1 finished 10 min ago and is still within the collection grace period.
-- Dryer 2 finished 20 min ago, so the grace period is over.
insert into public.cycles (machine_id, user_id, started_at, ends_at) values
  ('a1000000-0000-0000-0000-000000000004', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now() - interval '60 minutes', now() - interval '10 minutes'),
  ('a1000000-0000-0000-0000-000000000005', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now() - interval '70 minutes', now() - interval '20 minutes');

-- Alice ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

select is(
  (select state from public.machine_status where machine_id = 'a1000000-0000-0000-0000-000000000001'),
  'free'::public.machine_state,
  'an unused machine is free'
);
select is(
  (select ends_at - started_at from public.start_cycle('a1000000-0000-0000-0000-000000000001')),
  interval '60 minutes',
  'start_cycle uses the machine default duration'
);
select results_eq(
  $$ select state, estimated_finish_at from public.machine_status where machine_id = 'a1000000-0000-0000-0000-000000000001' $$,
  $$ values ('in_use'::public.machine_state, now() + interval '60 minutes') $$,
  'a started machine is in use with an estimated finish time'
);
select throws_ok(
  $$ select public.start_cycle('a1000000-0000-0000-0000-000000000001') $$,
  '23P01', 'machine is already in use', 'a running machine cannot be started again'
);
select is(
  (select ends_at - started_at from public.start_cycle('a1000000-0000-0000-0000-000000000002', 30)),
  interval '30 minutes',
  'start_cycle accepts a custom duration'
);
select throws_ok(
  $$ select public.start_cycle('a1000000-0000-0000-0000-000000000003') $$,
  'P0001', 'machine is out of order', 'an out-of-order machine cannot be started'
);
select throws_ok(
  $$ select public.start_cycle('b2000000-0000-0000-0000-000000000001') $$,
  'P0002', 'machine not found', 'machines in other buildings cannot be started'
);
select throws_ok(
  $$ select public.start_cycle('a1000000-0000-0000-0000-000000000004', 1) $$,
  '22023', null, 'durations outside 5..240 minutes are rejected'
);
select is(
  (select state from public.machine_status where machine_id = 'a1000000-0000-0000-0000-000000000004'),
  'awaiting_collection'::public.machine_state,
  'a finished cycle within the grace period is awaiting collection'
);
select is(
  (select state from public.machine_status where machine_id = 'a1000000-0000-0000-0000-000000000005'),
  'free'::public.machine_state,
  'after the grace period the machine is free again'
);
select lives_ok(
  $$ select public.start_cycle('a1000000-0000-0000-0000-000000000005') $$,
  'a machine whose grace period has passed can be started'
);
select throws_ok(
  $$ select public.release_cycle((select id from public.cycles where machine_id = 'a1000000-0000-0000-0000-000000000004')) $$,
  'P0002', 'active cycle not found', 'residents cannot release someone else''s cycle'
);
select is(
  (select release_reason from public.release_cycle(
    (select id from public.cycles where machine_id = 'a1000000-0000-0000-0000-000000000001'), 'cancelled')),
  'cancelled'::public.release_reason,
  'owners can cancel their cycle'
);
select is(
  (select state from public.machine_status where machine_id = 'a1000000-0000-0000-0000-000000000001'),
  'free'::public.machine_state,
  'a cancelled machine is free immediately'
);
reset role;

-- Bob collects his laundry --------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select is(
  (select release_reason from public.release_cycle(
    (select id from public.cycles where machine_id = 'a1000000-0000-0000-0000-000000000004'))),
  'collected'::public.release_reason,
  'release_cycle defaults to collected'
);
select is(
  (select state from public.machine_status where machine_id = 'a1000000-0000-0000-0000-000000000004'),
  'free'::public.machine_state,
  'a collected machine is free'
);
reset role;

select * from finish();
rollback;

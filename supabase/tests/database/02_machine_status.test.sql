-- Live overview: machine states and estimated finish time derived from cycles.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into public.buildings (id, name, join_code) values
  ('11111111-1111-1111-1111-111111111111', 'Building One', 'ONE111');
insert into auth.users (id, email) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'alice@test.local');
update public.profiles set building_id = '11111111-1111-1111-1111-111111111111';
insert into public.machines (id, building_id, label, type, out_of_order) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Washer 1', 'washer', false),
  ('a1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Washer 2', 'washer', false),
  ('a1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Washer 3', 'washer', false),
  ('a1000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Washer 4', 'washer', false),
  ('a1000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'Washer 5', 'washer', true);

insert into public.cycles (machine_id, user_id, started_at, ends_at) values
  -- Washer 2: running, 20 minutes left
  ('a1000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now() - interval '40 minutes', now() + interval '20 minutes'),
  -- Washer 3: finished 5 minutes ago, laundry not collected yet
  ('a1000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now() - interval '65 minutes', now() - interval '5 minutes'),
  -- Washer 4: finished 30 minutes ago, grace period over
  ('a1000000-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now() - interval '90 minutes', now() - interval '30 minutes');

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

select is((select state from public.machine_status where machine_id = 'a1000000-0000-0000-0000-000000000001'),
  'free'::public.machine_state, 'a machine without cycles is free');
select is((select state from public.machine_status where machine_id = 'a1000000-0000-0000-0000-000000000002'),
  'in_use'::public.machine_state, 'a running machine is in use');
select is((select estimated_finish_at from public.machine_status where machine_id = 'a1000000-0000-0000-0000-000000000002'),
  now() + interval '20 minutes', 'the overview shows the estimated finish time');
select is((select state from public.machine_status where machine_id = 'a1000000-0000-0000-0000-000000000003'),
  'awaiting_collection'::public.machine_state, 'a just-finished machine is awaiting collection');
select is((select state from public.machine_status where machine_id = 'a1000000-0000-0000-0000-000000000004'),
  'free'::public.machine_state, 'after the grace period the machine is free');
select is((select state from public.machine_status where machine_id = 'a1000000-0000-0000-0000-000000000005'),
  'out_of_order'::public.machine_state, 'a broken machine is out of order');
reset role;

select throws_ok(
  $$ insert into public.cycles (machine_id, user_id, started_at, ends_at)
     values ('a1000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), now() + interval '1 hour') $$,
  '23P01', null, 'a machine cannot have two overlapping cycles'
);

select * from finish();
rollback;

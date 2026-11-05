-- Booking time slots and how bookings interact with running cycles.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- Fixtures ------------------------------------------------------------------
insert into public.buildings (id, name, join_code) values
  ('11111111-1111-1111-1111-111111111111', 'Building One', 'ONE111');
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'alice@test.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bob@test.local');
update public.profiles set building_id = '11111111-1111-1111-1111-111111111111';
insert into public.machines (id, building_id, label, type, default_cycle_minutes) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Washer 1', 'washer', 60),
  ('a1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Washer 2', 'washer', 60),
  ('a1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Washer 3', 'washer', 60),
  ('a1000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Washer 4', 'washer', 60);

-- Bob is running Washer 3 for another 30 minutes.
insert into public.cycles (machine_id, user_id, started_at, ends_at) values
  ('a1000000-0000-0000-0000-000000000003', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now() - interval '30 minutes', now() + interval '30 minutes');
-- Bob's booking on Washer 4 covers the current moment.
insert into public.bookings (machine_id, user_id, starts_at, ends_at) values
  ('a1000000-0000-0000-0000-000000000004', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now() - interval '5 minutes', now() + interval '55 minutes');

-- Alice ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

select is(
  (select status from public.create_booking('a1000000-0000-0000-0000-000000000001', now() + interval '2 hours', now() + interval '3 hours')),
  'booked'::public.booking_status,
  'a resident can book a slot later in the day'
);
select results_eq(
  $$ select state, next_booking_starts_at from public.machine_status where machine_id = 'a1000000-0000-0000-0000-000000000001' $$,
  $$ values ('free'::public.machine_state, now() + interval '2 hours') $$,
  'the overview shows the next booking while the machine is still free'
);
select throws_ok(
  $$ select public.create_booking('a1000000-0000-0000-0000-000000000001', now() - interval '1 hour', now()) $$,
  '22023', 'booking must start in the future', 'bookings in the past are rejected'
);
select throws_ok(
  $$ select public.create_booking('a1000000-0000-0000-0000-000000000001', now() + interval '25 hours', now() + interval '26 hours') $$,
  '22023', 'bookings can be made at most 24 hours ahead', 'bookings more than 24 h ahead are rejected'
);
select throws_ok(
  $$ select public.create_booking('a1000000-0000-0000-0000-000000000001', now() + interval '5 hours', now() + interval '5 hours 10 minutes') $$,
  '22023', null, 'bookings shorter than 15 minutes are rejected'
);
select throws_ok(
  $$ select public.create_booking('a1000000-0000-0000-0000-000000000003', now() + interval '10 minutes', now() + interval '70 minutes') $$,
  '23P01', 'machine is in use during this slot', 'a slot overlapping a running cycle cannot be booked'
);
select throws_ok(
  $$ select public.start_cycle('a1000000-0000-0000-0000-000000000004') $$,
  '23P01', 'machine is booked by another resident', 'a machine reserved by someone else cannot be started'
);
select is(
  (select state from public.machine_status where machine_id = 'a1000000-0000-0000-0000-000000000004'),
  'reserved'::public.machine_state,
  'a machine is reserved while a booking covers the current time'
);
-- Alice books Washer 2 in 30 minutes, then starts it now: the cycle overlaps her own booking.
select lives_ok(
  $$ select public.create_booking('a1000000-0000-0000-0000-000000000002', now() + interval '30 minutes', now() + interval '90 minutes') $$,
  'a second upcoming booking is allowed'
);
select throws_ok(
  $$ select public.create_booking('a1000000-0000-0000-0000-000000000001', now() + interval '6 hours', now() + interval '7 hours') $$,
  'P0001', 'you can have at most 2 upcoming bookings', 'a third upcoming booking is rejected'
);
select lives_ok(
  $$ select public.start_cycle('a1000000-0000-0000-0000-000000000002') $$,
  'a resident can start a machine during their own booking'
);
select is(
  (select status from public.bookings where machine_id = 'a1000000-0000-0000-0000-000000000002'),
  'used'::public.booking_status,
  'starting a cycle during your own booking marks the booking used'
);
reset role;

-- Bob -----------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select throws_ok(
  $$ select public.create_booking('a1000000-0000-0000-0000-000000000001', now() + interval '150 minutes', now() + interval '210 minutes') $$,
  '23P01', 'slot is already booked', 'overlapping bookings are rejected'
);
select throws_ok(
  $$ select public.start_cycle('a1000000-0000-0000-0000-000000000001', 120) $$,
  '23P01', 'machine is booked by another resident', 'a cycle that would run into someone''s booking is rejected'
);
select throws_ok(
  $$ select public.cancel_booking((select id from public.bookings where machine_id = 'a1000000-0000-0000-0000-000000000001')) $$,
  'P0002', 'booking not found', 'residents cannot cancel someone else''s booking'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
select is(
  (select status from public.cancel_booking((select id from public.bookings where machine_id = 'a1000000-0000-0000-0000-000000000001'))),
  'cancelled'::public.booking_status,
  'owners can cancel their booking'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
select lives_ok(
  $$ select public.create_booking('a1000000-0000-0000-0000-000000000001', now() + interval '150 minutes', now() + interval '210 minutes') $$,
  'a cancelled slot can be booked by someone else'
);
reset role;

select * from finish();
rollback;

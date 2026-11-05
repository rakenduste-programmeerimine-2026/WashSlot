-- Access control: RLS isolation between buildings, revoked direct writes, profiles, join_building.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- Fixtures ------------------------------------------------------------------
insert into public.buildings (id, name, join_code) values
  ('11111111-1111-1111-1111-111111111111', 'Building One', 'ONE111'),
  ('22222222-2222-2222-2222-222222222222', 'Building Two', 'TWO222');
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'alice@test.local', '{"display_name":"Alice"}'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'carol@test.local', '{"display_name":"Carol"}'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'dave@test.local', '{"display_name":"Dave"}');
update public.profiles set building_id = '11111111-1111-1111-1111-111111111111'
  where id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'dddddddd-dddd-dddd-dddd-dddddddddddd');
update public.profiles set role = 'admin' where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
insert into public.machines (id, building_id, label, type) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Washer 1', 'washer'),
  ('b2000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Washer 1', 'washer');

-- Schema-level guarantees ---------------------------------------------------
select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity $$,
  'every public table has RLS enabled'
);

select is(
  (select display_name from public.profiles where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'Alice',
  'a profile is created automatically for a new auth user'
);

-- Anonymous users -----------------------------------------------------------
set local role anon;
select throws_ok($$ select * from public.machines $$, '42501', null, 'anon cannot read machines');
select throws_ok($$ select public.join_building('ONE111') $$, '42501', null, 'anon cannot call RPCs');
reset role;

-- Alice (building one) ------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

select results_eq(
  $$ select id from public.machines $$,
  $$ values ('a1000000-0000-0000-0000-000000000001'::uuid) $$,
  'residents only see machines in their own building'
);
select results_eq(
  $$ select name from public.buildings $$,
  $$ values ('Building One'::text) $$,
  'residents only see their own building'
);
select is_empty(
  $$ select 1 from public.profiles where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' $$,
  'residents cannot see profiles from other buildings'
);
select throws_ok(
  $$ insert into public.cycles (machine_id, user_id, ends_at)
     values ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now() + interval '1 hour') $$,
  '42501', null, 'cycles cannot be inserted directly'
);
select throws_ok(
  $$ update public.profiles set role = 'admin' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '42501', null, 'residents cannot promote themselves'
);
select lives_ok(
  $$ update public.profiles set display_name = 'Alice B' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'residents can change their display name'
);
select throws_ok(
  $$ insert into public.machines (building_id, label, type) values ('11111111-1111-1111-1111-111111111111', 'Washer 9', 'washer') $$,
  '42501', null, 'residents cannot add machines'
);
reset role;

-- Dave (admin of building one) ----------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
select lives_ok(
  $$ insert into public.machines (building_id, label, type) values ('11111111-1111-1111-1111-111111111111', 'Dryer 1', 'dryer') $$,
  'admins can add machines to their building'
);
select throws_ok(
  $$ insert into public.machines (building_id, label, type) values ('22222222-2222-2222-2222-222222222222', 'Dryer 1', 'dryer') $$,
  '42501', null, 'admins cannot add machines to other buildings'
);
select lives_ok(
  $$ update public.machines set out_of_order = true where id = 'a1000000-0000-0000-0000-000000000001' $$,
  'admins can mark a machine out of order'
);
reset role;

-- Carol (no building yet) joins building two --------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
select throws_ok($$ select public.join_building('NOPE00') $$, 'P0002', null, 'an unknown building code is rejected');
select is(
  (select name from public.join_building(' two222 ')),
  'Building Two',
  'join_building accepts a code case- and whitespace-insensitively'
);
select results_eq(
  $$ select id from public.machines $$,
  $$ values ('b2000000-0000-0000-0000-000000000001'::uuid) $$,
  'after joining, the resident sees the new building''s machines'
);
reset role;

select * from finish();
rollback;

-- Push subscriptions: each user manages only their own devices.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'alice@test.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bob@test.local');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'https://push.example/bob', 'key', 'secret');

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

select lives_ok(
  $$ insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://push.example/alice', 'key', 'secret') $$,
  'a user can register a device (user_id defaults to themselves)'
);
select results_eq(
  $$ select endpoint from public.push_subscriptions $$,
  $$ values ('https://push.example/alice'::text) $$,
  'a user only sees their own subscriptions'
);
select throws_ok(
  $$ insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'https://push.example/fake', 'key', 'secret') $$,
  '42501', null, 'a user cannot register a device for someone else'
);
delete from public.push_subscriptions where endpoint = 'https://push.example/bob';
reset role;
select is(
  (select count(*)::int from public.push_subscriptions where endpoint = 'https://push.example/bob'),
  1, 'a user cannot delete someone else''s subscription'
);

select * from finish();
rollback;

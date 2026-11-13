-- Local development seed. Sign up in the app, then join with code DEMO2026.

insert into public.buildings (id, name, join_code)
values ('00000000-0000-0000-0000-0000000000b1', 'Demo Dormitory', 'DEMO2026')
on conflict (id) do nothing;

insert into public.machines (building_id, label, type, default_cycle_minutes)
values
  ('00000000-0000-0000-0000-0000000000b1', 'Washer 1', 'washer', 60),
  ('00000000-0000-0000-0000-0000000000b1', 'Dryer 1', 'dryer', 50)
on conflict (building_id, label) do nothing;

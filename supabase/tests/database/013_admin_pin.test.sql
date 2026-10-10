begin;
select * from no_plan();

insert into events (id, name, event_date) values ('00000000-0000-4000-8000-0000000000ad', 'Test', '2026-12-10');

select is(set_station_pin('00000000-0000-4000-8000-0000000000ad', 'admin', '555555', 'setup')->>'status', 'OK', 'the admin PIN can be set');
select is(set_station_pin('00000000-0000-4000-8000-0000000000ad', 'draw', '555555', 'setup')->>'status', 'PIN_IN_USE', 'it is unique across roles');
select is(verify_pin('00000000-0000-4000-8000-0000000000ad', '555555', 'dev1', 'ip1')->>'role', 'admin', 'verify_pin logs the admin in');
select is(set_station_pin('00000000-0000-4000-8000-0000000000ad', 'janitor', '666666', 'setup')->>'status', 'INVALID_ROLE', 'other roles are still refused');
select is(actor_type_of('admin'), 'admin', 'the admin session is audited as an admin');
select is(actor_type_of('draw'), 'station', 'a station role is not');
select is(to_regclass('public.admins'), null, 'the allowlist table is gone');
select is((select count(*)::int from pg_proc where proname = 'is_admin' and pronamespace = 'public'::regnamespace), 0, 'is_admin is gone');

select * from finish();
rollback;

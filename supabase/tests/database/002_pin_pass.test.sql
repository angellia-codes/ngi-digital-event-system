begin;
select * from no_plan();

insert into events (id, name, event_date, venue)
values ('00000000-0000-4000-8000-0000000000aa', 'Test', '2026-12-10', 'Venue');
insert into guests (id, event_id, employee_id, full_name, outlet, phone) values
 ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', 'E1', 'Kadek Ayu', 'Outlet A', '+6281234567890'),
 ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000aa', 'E2', 'Made Putra', 'Outlet B', null);
insert into station_pins (event_id, role, pin_hash) values
 ('00000000-0000-4000-8000-0000000000aa', 'checkin', extensions.crypt('123456', extensions.gen_salt('bf'))),
 ('00000000-0000-4000-8000-0000000000aa', 'draw', extensions.crypt('654321', extensions.gen_salt('bf')));

-- verify_pin
select is(verify_pin('00000000-0000-4000-8000-0000000000aa', '123456', 'dev1', 'ip1')->>'status', 'OK', 'correct PIN');
select is(verify_pin('00000000-0000-4000-8000-0000000000aa', '123456', 'dev1', 'ip1')->>'role', 'checkin', 'PIN identifies the role');
select is(verify_pin('00000000-0000-4000-8000-0000000000aa', '000000', 'dev2', 'ip2')->>'status', 'INVALID', 'wrong PIN');
select is(verify_pin('00000000-0000-4000-8000-0000000000aa', '12345', 'dev2', 'ip2')->>'status', 'INVALID', 'PIN must be 6 digits');
select is(verify_pin('00000000-0000-4000-8000-0000000000aa', 'abcdef', 'dev2', 'ip2')->>'status', 'INVALID', 'PIN must be numeric');

-- per-device lockout: 5 failures
do $$ begin for i in 1..5 loop perform verify_pin('00000000-0000-4000-8000-0000000000aa', '000000', 'devL', 'ipL1'); end loop; end $$;
select is(verify_pin('00000000-0000-4000-8000-0000000000aa', '123456', 'devL', 'ipL2')->>'status', 'LOCKED',
          'a device with 5 failures is locked even with the right PIN');
select is(verify_pin('00000000-0000-4000-8000-0000000000aa', '123456', 'devOther', 'ipL3')->>'status', 'OK',
          'other devices are not locked');

-- success clears the device failure count
do $$ begin
  for i in 1..4 loop perform verify_pin('00000000-0000-4000-8000-0000000000aa', '000000', 'devC', 'ipC'); end loop;
  perform verify_pin('00000000-0000-4000-8000-0000000000aa', '123456', 'devC', 'ipC');
  perform verify_pin('00000000-0000-4000-8000-0000000000aa', '000000', 'devC', 'ipC');
end $$;
select is(verify_pin('00000000-0000-4000-8000-0000000000aa', '123456', 'devC', 'ipC')->>'status', 'OK',
          'a success resets the device counter');

-- per-IP cap: 30 failures
do $$ begin for i in 1..30 loop perform verify_pin('00000000-0000-4000-8000-0000000000aa', '000000', 'devI' || i, 'ipBusy'); end loop; end $$;
select is(verify_pin('00000000-0000-4000-8000-0000000000aa', '123456', 'devFresh', 'ipBusy')->>'status', 'LOCKED',
          'an IP with 30 failures is locked');

-- inactive PIN
update station_pins set active = false where role = 'draw';
select is(verify_pin('00000000-0000-4000-8000-0000000000aa', '654321', 'devX', 'ipX')->>'status', 'INVALID', 'inactive PIN is refused');

-- station_session_valid
select is(station_session_valid('00000000-0000-4000-8000-0000000000aa', 'checkin', 1), true, 'session version matches');
select is(station_session_valid('00000000-0000-4000-8000-0000000000aa', 'checkin', 2), false, 'old/new version is refused');
update station_pins set active = false where role = 'checkin';
select is(station_session_valid('00000000-0000-4000-8000-0000000000aa', 'checkin', 1), false, 'disabled role is logged out');

-- get_pass
select is(get_pass('does-not-exist')->>'status', 'INVALID', 'unknown token is INVALID');
select is((select first_opened_at is null from guests where employee_id = 'E1'), true, 'not opened yet');
select is(get_pass((select invite_token from guests where employee_id = 'E1'))->>'status', 'OK', 'valid token');
select is((select first_opened_at is not null from guests where employee_id = 'E1'), true, 'first_opened_at is recorded');
select is(get_pass((select invite_token from guests where employee_id = 'E1'))->'guest'->>'full_name', 'Kadek Ayu', 'guest name returned');
select is(jsonb_typeof(get_pass((select invite_token from guests where employee_id = 'E1'))->'merchandise'), 'null',
          'merchandise token is NOT returned before check-in');
select is(get_pass((select merch_token from guests where employee_id = 'E1'))->>'status', 'INVALID',
          'the merchandise token does not open the pass');
select is(jsonb_exists(get_pass((select invite_token from guests where employee_id = 'E1')) -> 'guest', 'phone'), false, 'phone is never returned');
update guests set active = false where employee_id = 'E2';
select is(get_pass((select invite_token from guests where employee_id = 'E2'))->>'status', 'INVALID', 'inactive guest is INVALID');

-- set_rsvp
select is(set_rsvp((select invite_token from guests where employee_id = 'E1'), 'yes')->>'status', 'OK', 'rsvp yes');
select is((select rsvp_status from guests where employee_id = 'E1'), 'yes', 'rsvp stored');
select is(set_rsvp((select invite_token from guests where employee_id = 'E1'), 'no')->>'status', 'OK', 'rsvp can change');
select is(set_rsvp((select invite_token from guests where employee_id = 'E1'), 'maybe')->>'status', 'INVALID', 'bad status refused');
select is(set_rsvp('nope', 'yes')->>'status', 'INVALID', 'bad token refused');

-- find_guests
update guests set active = true where employee_id = 'E2';
select is(jsonb_array_length(find_guests('00000000-0000-4000-8000-0000000000aa', 'k')->'guests'), 0, 'one-character query returns nothing');
select is(jsonb_array_length(find_guests('00000000-0000-4000-8000-0000000000aa', 'kadek')->'guests'), 1, 'matches by name (case-insensitive)');
select is(jsonb_array_length(find_guests('00000000-0000-4000-8000-0000000000aa', 'e2')->'guests'), 1, 'matches by employee id');
select is(jsonb_exists(find_guests('00000000-0000-4000-8000-0000000000aa', 'kadek')->'guests'->0, 'phone'), false, 'no phone in search results');
select is(jsonb_array_length(find_guests('00000000-0000-4000-8000-0000000000aa', '%%')->'guests'), 0, 'wildcards are literal');

select * from finish();
rollback;

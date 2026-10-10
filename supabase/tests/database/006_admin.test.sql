begin;
select * from no_plan();

insert into events (id, name, event_date) values ('00000000-0000-4000-8000-0000000000aa', 'Test', '2026-12-10');
insert into guests (id, event_id, employee_id, full_name, outlet, phone) values
 ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', 'E1', 'Guest One', 'Outlet A', '+6281234567890'),
 ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000aa', 'E2', 'Guest Two', 'Outlet B', null);

-- PINs
select is(set_station_pin('00000000-0000-4000-8000-0000000000aa', 'checkin', '111111', 'admin@example.com')->>'status', 'OK', 'set a PIN');
select is(verify_pin('00000000-0000-4000-8000-0000000000aa', '111111', 'd1', 'i1')->>'role', 'checkin', 'the new PIN works');
select is(set_station_pin('00000000-0000-4000-8000-0000000000aa', 'merchandise', '111111', 'admin@example.com')->>'status', 'PIN_IN_USE', 'PINs are unique across roles');
select is(set_station_pin('00000000-0000-4000-8000-0000000000aa', 'merchandise', '12345', 'admin@example.com')->>'status', 'INVALID_PIN', 'PIN must be 6 digits');
select is(set_station_pin('00000000-0000-4000-8000-0000000000aa', 'janitor', '222222', 'admin@example.com')->>'status', 'INVALID_ROLE', 'unknown role');
select is(set_station_pin('00000000-0000-4000-8000-0000000000aa', 'checkin', '111111', 'admin@example.com')->>'status', 'OK', 'a role may re-set its own PIN');
select is((select session_version from station_pins where role = 'checkin'), 2, 'rotating bumps session_version');
select is(station_session_valid('00000000-0000-4000-8000-0000000000aa', 'checkin', 1), false, 'old sessions are logged out');
select is((select count(*)::int from audit_log where action = 'set_pin' and details::text like '%111111%'), 0, 'the PIN is never written to the audit log');
select is(set_station_active('00000000-0000-4000-8000-0000000000aa', 'checkin', false, 'admin@example.com')->>'status', 'OK', 'disable a role');
select is(verify_pin('00000000-0000-4000-8000-0000000000aa', '111111', 'd9', 'i9')->>'status', 'INVALID', 'disabled role cannot log in');
select is(set_station_active('00000000-0000-4000-8000-0000000000aa', 'prizes', false, 'admin@example.com')->>'status', 'NOT_FOUND', 'role without a PIN');

-- station labels
select is(set_station_labels('00000000-0000-4000-8000-0000000000aa', '["Meja 1","Meja 2"]'::jsonb, 'admin@example.com')->>'status', 'OK', 'set labels');
select is((select config->'station_labels'->>1 from events where id = '00000000-0000-4000-8000-0000000000aa'), 'Meja 2', 'labels stored');
select is(set_station_labels('00000000-0000-4000-8000-0000000000aa', '[]'::jsonb, 'admin@example.com')->>'status', 'INVALID', 'empty list refused');
select is(set_station_labels('00000000-0000-4000-8000-0000000000aa', '["A","A"]'::jsonb, 'admin@example.com')->>'status', 'INVALID', 'duplicates refused');
select is(set_station_labels('00000000-0000-4000-8000-0000000000aa', '"not an array"'::jsonb, 'admin@example.com')->>'status', 'INVALID', 'non-array refused');

-- walk-ins
select is(add_walk_in('00000000-0000-4000-8000-0000000000aa', 'Walk One', 'Outlet A', null, null, 'admin@example.com')->>'employee_id', 'WALKIN-1', 'first walk-in id');
select is(add_walk_in('00000000-0000-4000-8000-0000000000aa', 'Walk Two', 'Outlet A', 'FOH', 'Server', 'admin@example.com')->>'employee_id', 'WALKIN-2', 'second walk-in id');
select is(add_walk_in('00000000-0000-4000-8000-0000000000aa', ' ', 'Outlet A', null, null, 'admin@example.com')->>'status', 'INVALID', 'name required');
select is((select is_walk_in from guests where employee_id = 'WALKIN-2'), true, 'walk-in flag set');

-- update guest
select is(admin_update_guest('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000001', '{"full_name":"Guest Uno","active":false}'::jsonb, 'admin@example.com')->>'status', 'OK', 'update');
select is((select full_name from guests where employee_id = 'E1'), 'Guest Uno', 'name changed');
select is((select active from guests where employee_id = 'E1'), false, 'deactivated');
select is((select phone from guests where employee_id = 'E1'), '+6281234567890', 'untouched fields stay');
select is(admin_update_guest('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000001', '{"phone":null}'::jsonb, 'admin@example.com')->>'status', 'OK', 'clear phone');
select is((select phone from guests where employee_id = 'E1'), null, 'phone cleared');
select is(admin_update_guest('00000000-0000-4000-8000-0000000000aa', gen_random_uuid(), '{"full_name":"X"}'::jsonb, 'admin@example.com')->>'status', 'NOT_FOUND', 'unknown guest');
select is((select count(*)::int from audit_log where action = 'guest_updated' and details::text like '%Guest Uno%'), 0, 'personal data is not copied into the audit log');
update guests set active = true where employee_id = 'E1';

-- counts and list
select check_in('00000000-0000-4000-8000-0000000000aa', null, '00000000-0000-4000-8000-000000000001', 'manual', 'Meja 1', 'checkin');
select redeem_merchandise('00000000-0000-4000-8000-0000000000aa', (select merch_token from guests where employee_id = 'E1'), null, 'Booth 1', 'merchandise');
select is(event_counts('00000000-0000-4000-8000-0000000000aa')->>'checked_in', '1', 'counts: checked in');
select is(event_counts('00000000-0000-4000-8000-0000000000aa')->>'redeemed', '1', 'counts: redeemed');
select is(event_counts('00000000-0000-4000-8000-0000000000aa')->>'total', '4', 'counts: active guests');
select is(event_counts('00000000-0000-4000-8000-0000000000aa')->>'mode', 'rehearsal', 'counts: mode');
select is(jsonb_array_length(admin_guest_list('00000000-0000-4000-8000-0000000000aa', null, null)->'guests'), 4, 'list: all guests');
select is(jsonb_array_length(admin_guest_list('00000000-0000-4000-8000-0000000000aa', 'walk', null)->'guests'), 2, 'list: search');
select is(jsonb_array_length(admin_guest_list('00000000-0000-4000-8000-0000000000aa', null, 'Outlet B')->'guests'), 1, 'list: outlet filter');
select is(admin_guest_list('00000000-0000-4000-8000-0000000000aa', 'E1', null)->'guests'->0->>'merch', 'redeemed', 'list: merchandise state');
select is(admin_guest_list('00000000-0000-4000-8000-0000000000aa', 'E1', null)->'guests'->0->>'prize_number', '1', 'list: prize number');

-- rehearsal reset keeps people, clears activity
create temp table tok as select employee_id, invite_token, merch_token from guests;
update guests set rsvp_status = 'yes' where employee_id = 'E1';
select is(reset_rehearsal_data('00000000-0000-4000-8000-0000000000aa', 'admin@example.com')->>'status', 'OK', 'reset in rehearsal');
select is((select count(*)::int from check_ins), 0, 'check-ins cleared');
select is((select count(*)::int from merchandise_redemptions), 0, 'redemptions cleared');
select is((select next_prize_number from events where id = '00000000-0000-4000-8000-0000000000aa'), 1, 'counter reset');
select is((select count(*)::int from guests g join tok t using (employee_id, invite_token, merch_token)), 4, 'guests and tokens kept');
select is((select rsvp_status from guests where employee_id = 'E1'), 'yes', 'RSVPs kept');
select is((select count(*)::int from station_pins), 1, 'PINs kept');
select is((select count(*)::int from audit_log), 1, 'audit log holds only the reset entry');

-- go live is one-way and locks the reset
select is(go_live('00000000-0000-4000-8000-0000000000aa', 'admin@example.com')->>'status', 'OK', 'go live');
select is((select mode from events where id = '00000000-0000-4000-8000-0000000000aa'), 'live', 'mode is live');
select is(go_live('00000000-0000-4000-8000-0000000000aa', 'admin@example.com')->>'status', 'NOT_REHEARSAL', 'go live twice is refused');
select is(reset_rehearsal_data('00000000-0000-4000-8000-0000000000aa', 'admin@example.com')->>'status', 'NOT_REHEARSAL', 'reset is refused when live');

select * from finish();
rollback;

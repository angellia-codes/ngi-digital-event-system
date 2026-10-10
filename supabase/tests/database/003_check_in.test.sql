begin;
select * from no_plan();

insert into events (id, name, event_date) values ('00000000-0000-4000-8000-0000000000aa', 'Test', '2026-12-10');
insert into guests (id, event_id, employee_id, full_name, outlet) values
 ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', 'E1', 'Guest One', 'Outlet A'),
 ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000aa', 'E2', 'Guest Two', 'Outlet A'),
 ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000aa', 'E3', 'Guest Three', 'Outlet B');
update guests set active = false where employee_id = 'E3';

-- first check-in by invite token
select is(check_in('00000000-0000-4000-8000-0000000000aa', (select invite_token from guests where employee_id = 'E1'), null, 'scan', 'Meja 1', 'checkin')->>'status',
          'CHECKED_IN', 'first scan checks in');
select is((select prize_number from check_ins where guest_id = '00000000-0000-4000-8000-000000000001'), 1, 'first number is 1');

-- duplicate returns the original, writes nothing new
select is(check_in('00000000-0000-4000-8000-0000000000aa', (select invite_token from guests where employee_id = 'E1'), null, 'scan', 'Meja 2', 'checkin')->>'status',
          'ALREADY_CHECKED_IN', 'second scan is a duplicate');
select is(check_in('00000000-0000-4000-8000-0000000000aa', (select invite_token from guests where employee_id = 'E1'), null, 'scan', 'Meja 2', 'checkin')->>'station_label',
          'Meja 1', 'duplicate reports the original station');
select is((select count(*)::int from check_ins), 1, 'still one check-in row');
select is((select next_prize_number from events where id = '00000000-0000-4000-8000-0000000000aa'), 2, 'counter did not move on a duplicate');

-- manual check-in by guest id gets the next number
select is(check_in('00000000-0000-4000-8000-0000000000aa', null, '00000000-0000-4000-8000-000000000002', 'manual', 'Meja 1', 'checkin')->>'prize_number',
          '2', 'second guest gets number 2');
select is((select method from check_ins where guest_id = '00000000-0000-4000-8000-000000000002'), 'manual', 'method recorded');

-- invalid and ineligible
select is(check_in('00000000-0000-4000-8000-0000000000aa', 'not-a-real-token-0000', null, 'scan', 'Meja 1', 'checkin')->>'status', 'INVALID', 'unknown token');
select is((select count(*)::int from attempt_log where result = 'INVALID' and kind = 'checkin'), 1, 'rejected scan is logged');
select is((select token_prefix from attempt_log limit 1), 'not-a-', 'only a 6-character token prefix is stored');
select is(check_in('00000000-0000-4000-8000-0000000000aa', (select merch_token from guests where employee_id = 'E2'), null, 'scan', 'Meja 1', 'checkin')->>'status',
          'INVALID', 'a merchandise token cannot check in');
select is(check_in('00000000-0000-4000-8000-0000000000aa', null, null, 'manual', 'Meja 1', 'checkin')->>'status', 'INVALID', 'no token and no id');
select is(check_in('00000000-0000-4000-8000-0000000000aa', (select invite_token from guests where employee_id = 'E3'), null, 'scan', 'Meja 1', 'checkin')->>'status',
          'NOT_ELIGIBLE', 'inactive guest');
select is((select count(*)::int from check_ins), 2, 'only the two valid check-ins exist');

-- audit and pass
select is((select count(*)::int from audit_log where action = 'check_in'), 2, 'each real check-in is audited');
select is(get_pass((select invite_token from guests where employee_id = 'E1'))->>'prize_number', '1', 'pass shows the prize number');
select is(get_pass((select invite_token from guests where employee_id = 'E1'))->'merchandise'->>'token',
          (select merch_token from guests where employee_id = 'E1'), 'merchandise token appears after check-in');

select * from finish();
rollback;

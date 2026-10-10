begin;
select * from no_plan();

insert into events (id, name, event_date) values ('00000000-0000-4000-8000-0000000000aa', 'Test', '2026-12-10');
insert into guests (id, event_id, employee_id, full_name, outlet) values
 ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', 'E1', 'Guest One', 'Outlet A'),
 ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000aa', 'E2', 'Guest Two', 'Outlet A'),
 ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000aa', 'E3', 'Guest Three', 'Outlet A');
update guests set active = false where employee_id = 'E3';
select check_in('00000000-0000-4000-8000-0000000000aa', null, '00000000-0000-4000-8000-000000000001', 'manual', 'Meja 1', 'checkin');

-- lookup
select is(redeem_lookup('00000000-0000-4000-8000-0000000000aa', (select merch_token from guests where employee_id = 'E1'), null)->>'status', 'READY', 'checked-in guest is READY');
select is((select count(*)::int from merchandise_redemptions), 0, 'lookup writes no redemption');
select is(redeem_lookup('00000000-0000-4000-8000-0000000000aa', (select merch_token from guests where employee_id = 'E2'), null)->>'status', 'NOT_CHECKED_IN', 'not checked in');
select is(redeem_lookup('00000000-0000-4000-8000-0000000000aa', 'nope-nope-nope-nope-00', null)->>'status', 'INVALID', 'unknown token');
select is(redeem_lookup('00000000-0000-4000-8000-0000000000aa', (select invite_token from guests where employee_id = 'E1'), null)->>'status', 'INVALID', 'check-in token is not a merchandise token');
select is(redeem_lookup('00000000-0000-4000-8000-0000000000aa', (select merch_token from guests where employee_id = 'E3'), null)->>'status', 'NOT_ELIGIBLE', 'inactive guest');
select is((select count(*)::int from attempt_log where kind = 'merchandise'), 4, 'rejections are logged');

-- redeem
select is(redeem_merchandise('00000000-0000-4000-8000-0000000000aa', (select merch_token from guests where employee_id = 'E2'), null, 'Booth 1', 'merchandise')->>'status',
          'NOT_CHECKED_IN', 'cannot redeem without check-in');
select is(redeem_merchandise('00000000-0000-4000-8000-0000000000aa', (select merch_token from guests where employee_id = 'E1'), null, 'Booth 1', 'merchandise')->>'status',
          'REDEEMED', 'first redemption');
select is((select count(*)::int from merchandise_redemptions where status = 'redeemed'), 1, 'one redemption row');
select is(redeem_merchandise('00000000-0000-4000-8000-0000000000aa', (select merch_token from guests where employee_id = 'E1'), null, 'Booth 2', 'merchandise')->>'status',
          'ALREADY_REDEEMED', 'a second station is refused');
select is(redeem_merchandise('00000000-0000-4000-8000-0000000000aa', (select merch_token from guests where employee_id = 'E1'), null, 'Booth 1', 'merchandise')->>'status',
          'REDEEMED', 'same-station replay within 10 seconds is treated as the same tap');
select is((redeem_merchandise('00000000-0000-4000-8000-0000000000aa', (select merch_token from guests where employee_id = 'E1'), null, 'Booth 1', 'merchandise')->>'replay')::boolean,
          true, 'replay flag is set');
select is((select count(*)::int from merchandise_redemptions where status = 'redeemed'), 1, 'replay did not add a row');
update merchandise_redemptions set redeemed_at = now() - interval '1 minute';
select is(redeem_merchandise('00000000-0000-4000-8000-0000000000aa', (select merch_token from guests where employee_id = 'E1'), null, 'Booth 1', 'merchandise')->>'status',
          'ALREADY_REDEEMED', 'same station after 10 seconds is refused');
select is(redeem_lookup('00000000-0000-4000-8000-0000000000aa', (select merch_token from guests where employee_id = 'E1'), null)->>'status', 'ALREADY_REDEEMED', 'lookup now blocked');
select is(get_pass((select invite_token from guests where employee_id = 'E1'))->'merchandise'->>'claimed', 'true', 'pass shows merchandise claimed');

-- void
select is(void_redemption('00000000-0000-4000-8000-0000000000aa', (select id from merchandise_redemptions limit 1), 'abc', 'admin@example.com')->>'status', 'REASON_REQUIRED', 'reason of 3 characters is refused');
select is(void_redemption('00000000-0000-4000-8000-0000000000aa', (select id from merchandise_redemptions limit 1), '  wrong person  ', 'admin@example.com')->>'status', 'OK', 'void with reason');
select is((select void_reason from merchandise_redemptions limit 1), 'wrong person', 'reason is trimmed and stored');
select is(void_redemption('00000000-0000-4000-8000-0000000000aa', (select id from merchandise_redemptions limit 1), 'again please', 'admin@example.com')->>'status', 'NOT_FOUND', 'cannot void twice');
select is(redeem_merchandise('00000000-0000-4000-8000-0000000000aa', (select merch_token from guests where employee_id = 'E1'), null, 'Booth 2', 'merchandise')->>'status',
          'REDEEMED', 'after a void the guest can redeem again');
select is((select count(*)::int from audit_log where action in ('merchandise_redeemed', 'merchandise_voided')), 3, 'redemptions and the void are audited');

select * from finish();
rollback;

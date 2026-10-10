begin;
select * from no_plan();

-- tables exist
select has_table('public', t, t || ' exists')
from unnest(array['events','admins','station_pins','auth_attempts','import_batches','guests',
                  'check_ins','merchandise_redemptions','attempt_log','audit_log']) as t;

-- lockdown
select is((select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
          0, 'RLS is enabled on every public table');
select is((select count(*)::int from pg_tables
           where schemaname = 'public' and tablename <> 'stage_state'
             and (has_table_privilege('anon', format('public.%I', tablename), 'select')
               or has_table_privilege('authenticated', format('public.%I', tablename), 'select'))),
          0, 'anon and authenticated cannot select any public table (stage_state excepted in Plan 2)');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and (has_function_privilege('anon', p.oid, 'execute')
               or has_function_privilege('authenticated', p.oid, 'execute'))),
          0, 'anon and authenticated cannot execute any public function');

-- fixtures
insert into events (id, name, event_date)
values ('00000000-0000-4000-8000-0000000000aa', 'Test', '2026-12-10');
insert into guests (id, event_id, employee_id, full_name, outlet) values
 ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', 'E1', 'Guest One', 'Outlet A'),
 ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000aa', 'E2', 'Guest Two', 'Outlet A');

-- guests
select throws_ok($$ insert into guests (event_id, employee_id, full_name, outlet)
                    values ('00000000-0000-4000-8000-0000000000aa', 'E1', 'Dup', 'X') $$,
                 '23505', null, 'employee id is unique per event');
select is((select length(invite_token) from guests where employee_id = 'E1'), 22, 'invite token is 22 URL-safe chars');
select isnt((select invite_token from guests where employee_id = 'E1'),
            (select merch_token from guests where employee_id = 'E1'), 'the two tokens differ');
select matches((select invite_token from guests where employee_id = 'E1'), '^[A-Za-z0-9_-]{22}$', 'token alphabet is URL-safe');

-- check-ins
select lives_ok($$ insert into check_ins (event_id, guest_id, method, station_label, actor, prize_number)
                   values ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000001', 'scan', 'Meja 1', 'checkin', 1) $$,
                'first check-in inserts');
select throws_ok($$ insert into check_ins (event_id, guest_id, method, station_label, actor, prize_number)
                    values ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000001', 'scan', 'Meja 1', 'checkin', 2) $$,
                 '23505', null, 'a guest cannot check in twice');
select throws_ok($$ insert into check_ins (event_id, guest_id, method, station_label, actor, prize_number)
                    values ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000002', 'scan', 'Meja 1', 'checkin', 1) $$,
                 '23505', null, 'a prize number cannot be reused');
select throws_ok($$ insert into check_ins (event_id, guest_id, method, station_label, actor, prize_number)
                    values ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000002', 'scan', 'Meja 1', 'checkin', null) $$,
                 '23502', null, 'a check-in cannot exist without a prize number');

-- merchandise
select throws_ok($$ insert into merchandise_redemptions (event_id, guest_id, status, station_label, actor)
                    values ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000002', 'redeemed', 'Booth 1', 'merchandise') $$,
                 '23503', null, 'merchandise requires a check-in');
select lives_ok($$ insert into merchandise_redemptions (event_id, guest_id, status, station_label, actor)
                   values ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000001', 'redeemed', 'Booth 1', 'merchandise') $$,
                'a checked-in guest can redeem');
select throws_ok($$ insert into merchandise_redemptions (event_id, guest_id, status, station_label, actor)
                    values ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000001', 'redeemed', 'Booth 2', 'merchandise') $$,
                 '23505', null, 'only one active redemption per guest');
select lives_ok($$ insert into merchandise_redemptions (event_id, guest_id, status, station_label, actor, void_reason)
                   values ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000001', 'voided', 'Booth 2', 'merchandise', 'test') $$,
                'voided rows do not count as active');

-- audit log
insert into audit_log (event_id, actor_type, actor, action)
values ('00000000-0000-4000-8000-0000000000aa', 'system', 'test', 'seed');
select throws_ok($$ update audit_log set action = 'x' $$, 'P0001', null, 'audit log rejects UPDATE');
update events set mode = 'live' where id = '00000000-0000-4000-8000-0000000000aa';
select throws_ok($$ delete from audit_log $$, 'P0001', null, 'audit log rejects DELETE in live mode');
update events set mode = 'rehearsal' where id = '00000000-0000-4000-8000-0000000000aa';
select lives_ok($$ delete from audit_log $$, 'audit log allows DELETE in rehearsal mode');

select * from finish();
rollback;

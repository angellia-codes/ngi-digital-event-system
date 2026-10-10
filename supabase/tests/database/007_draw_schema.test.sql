begin;
select * from no_plan();

select has_table('public', t, t || ' exists')
from unnest(array['prizes', 'draws', 'stage_state', 'stage_heartbeat']) as t;

-- lockdown: stage_state is the only readable table
select is((select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
          0, 'RLS is still enabled on every public table');
select is(has_table_privilege('anon', 'public.stage_state', 'select'), true, 'anon can read stage_state');
select is(has_table_privilege('anon', 'public.stage_state', 'insert'), false, 'anon cannot write stage_state');
select is(has_table_privilege('anon', 'public.stage_state', 'update'), false, 'anon cannot update stage_state');
select is(has_table_privilege('authenticated', 'public.stage_state', 'delete'), false, 'authenticated cannot delete stage_state');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' and c.relname not in ('stage_state')
              and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'))),
          0, 'no other public table is readable by browsers');
select is((select count(*)::int from pg_policies where schemaname = 'public'), 1, 'the only policy is the stage_state read policy');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
          0, 'anon and authenticated still cannot execute any function');

-- fixtures
insert into events (id, name, event_date) values ('00000000-0000-4000-8000-0000000000bb', 'Test', '2026-12-10');
insert into guests (id, event_id, employee_id, full_name, outlet) values
 ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000bb', 'E1', 'Guest One', 'Outlet A'),
 ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000bb', 'E2', 'Guest Two', 'Outlet A'),
 ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000bb', 'E3', 'Guest Three', 'Outlet A');
insert into check_ins (event_id, guest_id, method, prize_number) values
 ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000b1', 'manual', 1),
 ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000b2', 'manual', 2);
insert into prizes (id, event_id, name, quantity) values
 ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000bb', 'Prize A', 2),
 ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000bb', 'Prize B', 1);

-- prizes
select throws_ok($$ insert into prizes (event_id, name) values ('00000000-0000-4000-8000-0000000000bb', 'Prize A') $$,
                 '23505', null, 'prize names are unique per event');
select throws_ok($$ insert into prizes (event_id, name, quantity) values ('00000000-0000-4000-8000-0000000000bb', 'Zero', 0) $$,
                 '23514', null, 'quantity must be at least 1');

-- draws
select throws_ok($$ insert into draws (event_id, prize_id, slot, winner_guest_id, request_id, request_group, round_id)
                    values ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000c1', 1,
                            '00000000-0000-4000-8000-0000000000b3', gen_random_uuid(), gen_random_uuid(), gen_random_uuid()) $$,
                 '23503', null, 'a guest without a check-in cannot win');
insert into draws (id, event_id, prize_id, slot, winner_guest_id, request_id, request_group, round_id)
values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000c1', 1,
        '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000e1', gen_random_uuid());
select throws_ok($$ insert into draws (event_id, prize_id, slot, winner_guest_id, request_id, request_group, round_id)
                    values ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000c2', 1,
                            '00000000-0000-4000-8000-0000000000b1', gen_random_uuid(), gen_random_uuid(), gen_random_uuid()) $$,
                 '23505', null, 'one prize per person');
select throws_ok($$ insert into draws (event_id, prize_id, slot, winner_guest_id, request_id, request_group, round_id)
                    values ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000c1', 1,
                            '00000000-0000-4000-8000-0000000000b2', gen_random_uuid(), gen_random_uuid(), gen_random_uuid()) $$,
                 '23505', null, 'a slot holds one live winner');
select throws_ok($$ insert into draws (event_id, prize_id, slot, winner_guest_id, request_id, request_group, round_id)
                    values ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000c1', 2,
                            '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000e1', gen_random_uuid(), gen_random_uuid()) $$,
                 '23505', null, 'a request id cannot be reused');
update draws set status = 'void_no_show' where id = '00000000-0000-4000-8000-0000000000d1';
select lives_ok($$ insert into draws (event_id, prize_id, slot, winner_guest_id, request_id, request_group, round_id)
                   values ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000c2', 1,
                           '00000000-0000-4000-8000-0000000000b1', gen_random_uuid(), gen_random_uuid(), gen_random_uuid()) $$,
                'a no-show is eligible again');
select lives_ok($$ insert into draws (event_id, prize_id, slot, winner_guest_id, request_id, request_group, round_id)
                   values ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000c1', 1,
                           '00000000-0000-4000-8000-0000000000b2', gen_random_uuid(), gen_random_uuid(), gen_random_uuid()) $$,
                'a voided slot can be drawn again');
select throws_ok($$ insert into draws (event_id, prize_id, slot, winner_guest_id, request_id, request_group, round_id, status)
                    values ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000c1', 2,
                            '00000000-0000-4000-8000-0000000000b2', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'won') $$,
                 '23514', null, 'unknown status refused');

-- stage state
select is((select phase from stage_state where event_id = '00000000-0000-4000-8000-0000000000bb'), 'idle', 'a new event gets an idle stage row');
select is((select options->>'language' from stage_state where event_id = '00000000-0000-4000-8000-0000000000bb'), 'en', 'default stage language is English');
select is((select rev from stage_state where event_id = '00000000-0000-4000-8000-0000000000bb'), 0::bigint, 'revision starts at 0');
select throws_ok($$ insert into stage_state (event_id, phase) values ('00000000-0000-4000-8000-0000000000bb', 'party') $$,
                 '23514', null, 'unknown phase refused');

select * from finish();
rollback;

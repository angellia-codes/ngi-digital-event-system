begin;
select * from no_plan();

insert into events (id, name, event_date) values
 ('00000000-0000-4000-8000-0000000000a2', 'T', '2026-12-10'), ('00000000-0000-4000-8000-0000000000a3', 'Other', '2026-12-10');
insert into guests (id, event_id, employee_id, full_name, outlet, department)
select ('00000000-0000-4000-8000-a2' || lpad(i::text, 10, '0'))::uuid, '00000000-0000-4000-8000-0000000000a2', 'R' || i, 'Rguest ' || i, 'Outlet R', 'Dept R'
  from generate_series(1, 12) i;
insert into check_ins (event_id, guest_id, method, prize_number)
select '00000000-0000-4000-8000-0000000000a2', ('00000000-0000-4000-8000-a2' || lpad(i::text, 10, '0'))::uuid, 'manual', i from generate_series(1, 12) i;
insert into prizes (id, event_id, name, tier, quantity, draw_as_batch) values
 ('00000000-0000-4000-8000-00000000a201', '00000000-0000-4000-8000-0000000000a2', 'Single', 'major', 3, false),
 ('00000000-0000-4000-8000-00000000a202', '00000000-0000-4000-8000-0000000000a2', 'Batch', 'minor', 3, true);

-- confirm
create temp table d1 as select draw_prize('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000a201', gen_random_uuid(), 'draw') as j;
create temp table id1 as select (j->'draws'->0->>'id')::uuid as id, j->'draws'->0->>'name' as name from d1;
select is(resolve_draw('00000000-0000-4000-8000-0000000000a2', (select id from id1), 'maybe', 'draw')->>'status', 'INVALID', 'bad outcome');
select is(resolve_draw('00000000-0000-4000-8000-0000000000a2', gen_random_uuid(), 'confirm', 'draw')->>'status', 'NOT_FOUND', 'unknown draw');
select is(resolve_draw('00000000-0000-4000-8000-0000000000a3', (select id from id1), 'confirm', 'draw')->>'status', 'NOT_FOUND', 'a draw of another event');
select is(get_stage('00000000-0000-4000-8000-0000000000a2')::text ~* 'Rguest', false, 'no name before confirmation');
select is(resolve_draw('00000000-0000-4000-8000-0000000000a2', (select id from id1), 'confirm', 'draw')->>'status', 'CONFIRMED', 'confirm');
select is((select status from draws where id = (select id from id1)), 'confirmed', 'row confirmed');
select isnt((select resolved_at from draws where id = (select id from id1)), null, 'resolved_at set');
select is((select resolved_by from draws where id = (select id from id1)), 'draw', 'resolved_by set');
select is(get_stage('00000000-0000-4000-8000-0000000000a2')->>'phase', 'revealed', 'the stage is revealed');
select is(get_stage('00000000-0000-4000-8000-0000000000a2')->'payload'->'slots'->0->>'name', (select name from id1), 'the stage now shows the name');
select is(get_stage('00000000-0000-4000-8000-0000000000a2')->'payload'->'slots'->0->>'outlet', 'Outlet R', 'and the outlet');
select is(get_stage('00000000-0000-4000-8000-0000000000a2')->'payload'->'slots'->0->>'department', 'Dept R', 'and the department');
select is(resolve_draw('00000000-0000-4000-8000-0000000000a2', (select id from id1), 'confirm', 'draw')->>'status', 'ALREADY_CONFIRMED', 'a repeat is harmless');
select is(resolve_draw('00000000-0000-4000-8000-0000000000a2', (select id from id1), 'no_show', 'draw')->>'status', 'ALREADY_CONFIRMED', 'the MC cannot void a confirmed draw');
select is((select status from draws where id = (select id from id1)), 'confirmed', 'it stays confirmed');
select is((select rev from stage_state where event_id = '00000000-0000-4000-8000-0000000000a2')::text,
          (select rev from stage_state where event_id = '00000000-0000-4000-8000-0000000000a2')::text, 'rev stable');

-- no-show
create temp table d2 as select draw_prize('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000a201', gen_random_uuid(), 'draw') as j;
create temp table id2 as select (j->'draws'->0->>'id')::uuid as id, j->'draws'->0->>'name' as name from d2;
select is(resolve_draw('00000000-0000-4000-8000-0000000000a2', (select id from id2), 'no_show', 'draw')->>'status', 'VOIDED', 'no-show');
select is((select status from draws where id = (select id from id2)), 'void_no_show', 'row voided');
select is((select void_reason from draws where id = (select id from id2)), 'no_show', 'reason recorded');
select is(get_stage('00000000-0000-4000-8000-0000000000a2')->>'phase', 'void', 'the stage shows the void message');
select is(get_stage('00000000-0000-4000-8000-0000000000a2')::text ~* (select name from id2), false, 'a no-show is never named');
select is(resolve_draw('00000000-0000-4000-8000-0000000000a2', (select id from id2), 'no_show', 'draw')->>'status', 'VOIDED', 'repeat no-show is harmless');
select is(resolve_draw('00000000-0000-4000-8000-0000000000a2', (select id from id2), 'confirm', 'draw')->>'status', 'DRAW_VOID', 'cannot confirm a void draw');
select is(set_stage('00000000-0000-4000-8000-0000000000a2', 'intro', '00000000-0000-4000-8000-00000000a201', 'draw')->>'status', 'OK', 'the MC can move on after a void');

-- redraw replaces it in the same round
create temp table d3 as select draw_prize('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000a201', gen_random_uuid(), 'draw') as j;
select is((select j->>'round_id' from d3), (select j->>'round_id' from d2), 'the redraw is in the same round');
select resolve_draw('00000000-0000-4000-8000-0000000000a2', ((select j->'draws'->0->>'id' from d3))::uuid, 'confirm', 'draw');
select is(get_stage('00000000-0000-4000-8000-0000000000a2')->>'phase', 'revealed', 'revealed after the redraw is confirmed');
select is(get_stage('00000000-0000-4000-8000-0000000000a2')->'payload'->'slots'->0->>'name', (select j->'draws'->0->>'name' from d3), 'the stage shows the replacement');

-- batch: confirm one tile, then the rest
create temp table db as select draw_prize('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000a202', gen_random_uuid(), 'draw') as j;
select resolve_draw('00000000-0000-4000-8000-0000000000a2', ((select j->'draws'->0->>'id' from db))::uuid, 'confirm', 'draw');
select is(get_stage('00000000-0000-4000-8000-0000000000a2')->>'phase', 'rolling', 'a batch keeps rolling while tiles are open');
select is(get_stage('00000000-0000-4000-8000-0000000000a2')->'payload'->'slots'->0->>'state', 'revealed', 'tile 1 flipped');
select is(get_stage('00000000-0000-4000-8000-0000000000a2')->'payload'->'slots'->1->>'name', null, 'tile 2 still has no name');
select is(set_stage('00000000-0000-4000-8000-0000000000a2', 'idle', null, 'draw')->>'status', 'DRAW_IN_PROGRESS', 'the stage cannot be blanked mid-batch');
select is(resolve_round('00000000-0000-4000-8000-0000000000a2', ((select j->>'round_id' from db))::uuid, 'draw')->>'confirmed', '2', 'confirm all remaining tiles');
select is(get_stage('00000000-0000-4000-8000-0000000000a2')->>'phase', 'revealed', 'the batch is revealed');
select is((select count(*)::int from jsonb_array_elements(get_stage('00000000-0000-4000-8000-0000000000a2')->'payload'->'slots') s where s->>'name' is not null), 3, 'three names');
select is(resolve_round('00000000-0000-4000-8000-0000000000a2', ((select j->>'round_id' from db))::uuid, 'draw')->>'status', 'NOTHING_TO_CONFIRM', 'nothing left to confirm');

-- admin void
select is(admin_void_draw('00000000-0000-4000-8000-0000000000a2', (select id from id1), '', 'hr@example.com')->>'status', 'REASON_REQUIRED', 'reason required');
select is(admin_void_draw('00000000-0000-4000-8000-0000000000a2', (select id from id1), '  x ', 'hr@example.com')->>'status', 'REASON_REQUIRED', 'a blank reason is refused');
select is(admin_void_draw('00000000-0000-4000-8000-0000000000a2', gen_random_uuid(), 'wrong person', 'hr@example.com')->>'status', 'NOT_FOUND', 'unknown draw');
select is(admin_void_draw('00000000-0000-4000-8000-0000000000a3', (select id from id1), 'wrong person', 'hr@example.com')->>'status', 'NOT_FOUND', 'other event');
-- the stage shows the batch round; voiding an older single draw leaves it alone
select is(admin_void_draw('00000000-0000-4000-8000-0000000000a2', (select id from id1), 'Winner was a contractor', 'hr@example.com')->>'status', 'OK', 'admin void of a confirmed draw');
select is((select status from draws where id = (select id from id1)), 'void_admin', 'row void_admin');
select is((select void_reason from draws where id = (select id from id1)), 'Winner was a contractor', 'reason saved');
select is(get_stage('00000000-0000-4000-8000-0000000000a2')->>'phase', 'revealed', 'an older round on no screen does not touch the stage');
select is(admin_void_draw('00000000-0000-4000-8000-0000000000a2', (select id from id1), 'again', 'hr@example.com')->>'status', 'NOT_VOIDABLE', 'already void');
-- voiding a draw that is on the projector blanks it
select is(admin_void_draw('00000000-0000-4000-8000-0000000000a2', ((select j->'draws'->2->>'id' from db))::uuid, 'Tile 3 was a mistake', 'hr@example.com')->>'status', 'OK', 'void a tile that is on screen');
select is(get_stage('00000000-0000-4000-8000-0000000000a2')->>'phase', 'idle', 'the stage returns to idle');
-- the freed slot can be drawn again and the voided guest is skipped for it
create temp table d4 as select draw_prize('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000a202', gen_random_uuid(), 'draw') as j;
select is((select j->'draws'->2->>'slot' from d4), '3', 'the freed slot is redrawn');
select is((select j->'draws'->2->>'redraw_of' from d4), (select j->'draws'->2->>'id' from db), 'linked to the voided draw');
select isnt((select j->'draws'->2->>'number' from d4), (select j->'draws'->2->>'number' from db), 'not the same guest');
select is((select count(*)::int from draws where status in ('drawn', 'confirmed') and event_id = '00000000-0000-4000-8000-0000000000a2'), 4, 'four live draws: one single, three batch tiles');
select is((select count(*)::int from (select winner_guest_id from draws where status in ('drawn', 'confirmed') group by 1 having count(*) > 1) x), 0, 'one prize per person holds');
-- voiding a pending draw
select is(admin_void_draw('00000000-0000-4000-8000-0000000000a2', ((select j->'draws'->2->>'id' from d4))::uuid, 'Operator error', 'hr@example.com')->>'status', 'OK', 'void a pending draw');
select is(set_stage('00000000-0000-4000-8000-0000000000a2', 'idle', null, 'draw')->>'status', 'OK', 'nothing pending, the stage is free again');

-- audit trail
select is((select count(*)::int from audit_log where action = 'draw_confirm'), 3, 'confirms audited');
select is((select count(*)::int from audit_log where action = 'draw_no_show'), 1, 'no-show audited');
select is((select count(*)::int from audit_log where action = 'draw_void_admin' and actor_type = 'admin' and actor = 'hr@example.com'), 3, 'admin voids audited with the admin as actor');
select is((select count(*)::int from audit_log where action = 'draw_void_admin' and details->>'reason' is not null), 3, 'with reasons');
select is((select count(*)::int from audit_log where action = 'draw_confirm_round'), 1, 'confirm-all audited');

select * from finish();
rollback;

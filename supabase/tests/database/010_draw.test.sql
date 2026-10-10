begin;
select * from no_plan();

-- Fixtures: events a (single prizes), b (eligibility), c (batch), d (redraw), e (no-show stays eligible), f (empty)
insert into events (id, name, event_date)
select ('00000000-0000-4000-8000-0000000000' || x)::uuid, 'T' || x, '2026-12-10' from unnest(array['a1','b1','c1','d1','e1','f1']) x;

create function pg_temp.mk_guests(p_event text, p_n int, p_start int default 1) returns void language sql as $f$
  insert into guests (id, event_id, employee_id, full_name, outlet, department)
  select ('00000000-0000-4000-8000-' || substr(p_event,1,2) || lpad(i::text, 10, '0'))::uuid,
         ('00000000-0000-4000-8000-0000000000' || p_event)::uuid, p_event || i, 'Guest ' || p_event || i, 'Outlet ' || p_event, 'Dept'
    from generate_series(p_start, p_start + p_n - 1) i;
  insert into check_ins (event_id, guest_id, method, prize_number)
  select ('00000000-0000-4000-8000-0000000000' || p_event)::uuid,
         ('00000000-0000-4000-8000-' || substr(p_event,1,2) || lpad(i::text, 10, '0'))::uuid, 'manual', i
    from generate_series(p_start, p_start + p_n - 1) i;
$f$;
select pg_temp.mk_guests('a1', 6);
select pg_temp.mk_guests('c1', 5);
select pg_temp.mk_guests('d1', 3);
select pg_temp.mk_guests('e1', 1);

insert into prizes (id, event_id, name, tier, quantity, draw_as_batch) values
 ('00000000-0000-4000-8000-00000000a101', '00000000-0000-4000-8000-0000000000a1', 'Grand', 'grand', 1, false),
 ('00000000-0000-4000-8000-00000000a102', '00000000-0000-4000-8000-0000000000a1', 'Second', 'major', 2, false),
 ('00000000-0000-4000-8000-00000000c101', '00000000-0000-4000-8000-0000000000c1', 'Voucher', 'minor', 3, true),
 ('00000000-0000-4000-8000-00000000c102', '00000000-0000-4000-8000-0000000000c1', 'Mug', 'minor', 4, true),
 ('00000000-0000-4000-8000-00000000d101', '00000000-0000-4000-8000-0000000000d1', 'Speaker', 'major', 2, false),
 ('00000000-0000-4000-8000-00000000e101', '00000000-0000-4000-8000-0000000000e1', 'P1', 'major', 1, false),
 ('00000000-0000-4000-8000-00000000e102', '00000000-0000-4000-8000-0000000000e1', 'P2', 'major', 1, false),
 ('00000000-0000-4000-8000-00000000f101', '00000000-0000-4000-8000-0000000000f1', 'Empty', 'major', 1, false);

-- b: 3 guests; one not checked in, one checked in but inactive, one eligible
insert into guests (id, event_id, employee_id, full_name, outlet, active) values
 ('00000000-0000-4000-8000-b100000000b1', '00000000-0000-4000-8000-0000000000b1', 'B1', 'Absent', 'O', true),
 ('00000000-0000-4000-8000-b100000000b2', '00000000-0000-4000-8000-0000000000b1', 'B2', 'Inactive', 'O', false),
 ('00000000-0000-4000-8000-b100000000b3', '00000000-0000-4000-8000-0000000000b1', 'B3', 'Eligible', 'O', true);
insert into check_ins (event_id, guest_id, method, prize_number) values
 ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-b100000000b2', 'manual', 1),
 ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-b100000000b3', 'manual', 2);
insert into prizes (id, event_id, name, tier, quantity, draw_as_batch) values
 ('00000000-0000-4000-8000-00000000b101', '00000000-0000-4000-8000-0000000000b1', 'PB', 'major', 1, false);

-- unknown prize, invalid request
select is(draw_prize('00000000-0000-4000-8000-0000000000a1', gen_random_uuid(), gen_random_uuid(), 'draw')->>'status', 'PRIZE_NOT_FOUND', 'unknown prize');
select is(draw_prize('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000a101', null, 'draw')->>'status', 'INVALID', 'request id required');
select is(draw_prize('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c101', gen_random_uuid(), 'draw')->>'status', 'PRIZE_NOT_FOUND', 'a prize of another event is not found');
select is(draw_prize('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-00000000f101', gen_random_uuid(), 'draw')->>'status', 'NO_ELIGIBLE_GUESTS', 'nobody checked in');

-- eligibility
select is(draw_prize('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000b101', gen_random_uuid(), 'draw')->'draws'->0->>'name', 'Eligible', 'only checked-in active guests are drawn');

-- single draw
create temp table r1 as select draw_prize('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000a101', '00000000-0000-4000-8000-00000000aa01', 'draw') as j;
select is((select j->>'status' from r1), 'DRAWN', 'a single draw');
select is((select j->>'short_by' from r1), '0', 'not short');
select is(jsonb_array_length((select j->'draws' from r1)), 1, 'one winner');
select is((select j->'draws'->0->>'slot' from r1), '1', 'slot 1');
select is((select j->'draws'->0->>'status' from r1), 'drawn', 'status drawn');
select ok((select j->'draws'->0->>'name' from r1) like 'Guest a1%', 'the operator gets the name');
select is((select j->>'pending' from r1), '1', 'one pending');
select is(get_stage('00000000-0000-4000-8000-0000000000a1')->>'phase', 'rolling', 'the stage is rolling');
select is(get_stage('00000000-0000-4000-8000-0000000000a1')::text ~* 'Guest a1', false, 'the stage payload has no name');
select is(get_stage('00000000-0000-4000-8000-0000000000a1')->'payload'->'slots'->0->>'number', (select j->'draws'->0->>'number' from r1), 'the stage shows the number');

-- retry, and a second draw while one is open
select is(draw_prize('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000a101', '00000000-0000-4000-8000-00000000aa01', 'draw')->>'idempotent', 'true', 'the same request id replays');
select is(draw_prize('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000a101', '00000000-0000-4000-8000-00000000aa01', 'draw')->'draws'->0->>'id', (select j->'draws'->0->>'id' from r1), 'and returns the same draw');
select is((select count(*)::int from draws where event_id = '00000000-0000-4000-8000-0000000000a1'), 1, 'a replay creates no rows');
select is(draw_prize('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000a102', gen_random_uuid(), 'draw')->>'status', 'DRAW_IN_PROGRESS', 'another prize while one is open');
select is(draw_prize('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000a101', gen_random_uuid(), 'draw')->>'status', 'DRAW_IN_PROGRESS', 'the same prize while one is open');

-- draw_current
select is(draw_current('00000000-0000-4000-8000-0000000000a1')->>'status', 'OK', 'draw_current ok');
select is(draw_current('00000000-0000-4000-8000-0000000000a1')->'round'->>'pending', '1', 'draw_current shows the pending draw');
select is(draw_current('00000000-0000-4000-8000-0000000000a1')->'stage'->>'phase', 'rolling', 'and the stage phase');
select isnt(draw_current('00000000-0000-4000-8000-0000000000a1')->>'oldest_pending_at', null, 'and when it was drawn');
select is(draw_current('00000000-0000-4000-8000-0000000000f1')->'round', 'null'::jsonb, 'no round yet on an empty event');

-- complete prize; one prize per person
update draws set status = 'confirmed' where event_id = '00000000-0000-4000-8000-0000000000a1';
select is(draw_prize('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000a101', gen_random_uuid(), 'draw')->>'status', 'PRIZE_COMPLETE', 'a one-slot prize is complete after confirmation');
create temp table r2 as select draw_prize('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000a102', gen_random_uuid(), 'draw') as j;
select is((select j->>'status' from r2), 'DRAWN', 'second prize, slot 1');
select is((select j->'draws'->0->>'slot' from r2), '1', 'slot 1 of Second');
select isnt((select j->'draws'->0->>'id' from r2), (select j->'draws'->0->>'id' from r1), 'a different draw');
select is((select count(distinct winner_guest_id)::int from draws where event_id = '00000000-0000-4000-8000-0000000000a1'), 2, 'the Grand winner cannot win again');
update draws set status = 'confirmed' where status = 'drawn' and event_id = '00000000-0000-4000-8000-0000000000a1';
create temp table r3 as select draw_prize('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000a102', gen_random_uuid(), 'draw') as j;
select is((select j->'draws'->0->>'slot' from r3), '2', 'the next draw takes slot 2');
select is((select j->'draws'->0->>'name' from r3) = any (select full_name from guests g join draws d on d.winner_guest_id = g.id where d.status = 'confirmed'), false, 'a confirmed winner is out of the pool');
select is((select j->>'pending' from r3), '1', 'a new round with one pending (the round of slot 2)');
select isnt((select j->>'round_id' from r3), (select j->>'round_id' from r2), 'single draws of one prize are separate rounds');

-- batch
create temp table rb as select draw_prize('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000c101', gen_random_uuid(), 'draw') as j;
select is(jsonb_array_length((select j->'draws' from rb)), 3, 'a batch draws all remaining slots at once');
select is((select count(distinct d->>'number')::int from jsonb_array_elements((select j->'draws' from rb)) d), 3, 'three different winners');
select is((select string_agg(d->>'slot', ',' order by (d->>'slot')::int) from jsonb_array_elements((select j->'draws' from rb)) d), '1,2,3', 'slots 1 to 3');
select is(jsonb_array_length(get_stage('00000000-0000-4000-8000-0000000000c1')->'payload'->'slots'), 3, 'the stage has three tiles');
select is(get_stage('00000000-0000-4000-8000-0000000000c1')::text ~* 'Guest c1', false, 'and no names');
update draws set status = 'confirmed' where event_id = '00000000-0000-4000-8000-0000000000c1';

-- short batch: pool 2, needs 4
create temp table rs as select draw_prize('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000c102', gen_random_uuid(), 'draw') as j;
select is((select j->>'status' from rs), 'DRAWN', 'short batch still draws');
select is((select j->>'short_by' from rs), '2', 'short_by reports the missing winners');
select is(jsonb_array_length((select j->'draws' from rs)), 2, 'everyone left is drawn');
update draws set status = 'confirmed' where event_id = '00000000-0000-4000-8000-0000000000c1';
select is(draw_prize('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000c102', gen_random_uuid(), 'draw')->>'status', 'NO_ELIGIBLE_GUESTS', 'the pool is empty');

-- redraw after a no-show stays in the round, takes the same slot, skips that guest
create temp table rd1 as select draw_prize('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000d101', gen_random_uuid(), 'draw') as j;
update draws set status = 'void_no_show' where id = ((select j->'draws'->0->>'id' from rd1))::uuid;
create temp table rd2 as select draw_prize('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000d101', gen_random_uuid(), 'draw') as j;
select is((select j->'draws'->0->>'slot' from rd2), '1', 'the redraw takes the lowest free slot');
select is((select j->>'round_id' from rd2), (select j->>'round_id' from rd1), 'in the same round');
select is((select j->'draws'->0->>'redraw_of' from rd2), (select j->'draws'->0->>'id' from rd1), 'redraw_of points at the void draw');
select isnt((select j->'draws'->0->>'number' from rd2), (select j->'draws'->0->>'number' from rd1), 'the no-show is skipped for that slot');
select is(jsonb_array_length((select j->'draws' from rd2)), 1, 'the round shows the latest row per slot');
select is(get_stage('00000000-0000-4000-8000-0000000000d1')->>'phase', 'rolling', 'the stage rolls again');

-- a no-show stays eligible for other prizes
create temp table re1 as select draw_prize('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-00000000e101', gen_random_uuid(), 'draw') as j;
update draws set status = 'void_no_show' where event_id = '00000000-0000-4000-8000-0000000000e1';
select is(draw_prize('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-00000000e102', gen_random_uuid(), 'draw')->>'status', 'DRAWN', 'a no-show can win a different prize');
update draws set status = 'void_no_show' where event_id = '00000000-0000-4000-8000-0000000000e1' and status = 'drawn';
select is(draw_prize('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-00000000e101', gen_random_uuid(), 'draw')->>'status', 'NO_ELIGIBLE_GUESTS', 'but not the same slot again');

-- lookup_prize_number (event a: slot-2 draw of Second is pending, others confirmed)
select is(lookup_prize_number('00000000-0000-4000-8000-0000000000a1', 999)->>'status', 'NO_SUCH_NUMBER', 'unknown number');
select is(lookup_prize_number('00000000-0000-4000-8000-0000000000a1', (select (j->'draws'->0->>'number')::int from r1))->>'status', 'WINNER', 'a confirmed winner');
select is(lookup_prize_number('00000000-0000-4000-8000-0000000000a1', (select (j->'draws'->0->>'number')::int from r1))->'prize'->>'name', 'Grand', 'with the prize');
select is(lookup_prize_number('00000000-0000-4000-8000-0000000000a1', (select (j->'draws'->0->>'number')::int from r3))->>'status', 'PENDING', 'a pending winner');
select isnt(lookup_prize_number('00000000-0000-4000-8000-0000000000a1', (select (j->'draws'->0->>'number')::int from r3))->>'draw_id', null, 'carries the draw id');
select is(lookup_prize_number('00000000-0000-4000-8000-0000000000e1', 1)->>'status', 'NOT_A_WINNER', 'a voided draw is not a win');
select is(lookup_prize_number('00000000-0000-4000-8000-0000000000e1', 1)->>'name', 'Guest e11', 'the name is still shown');

-- audit
select ok((select count(*) from audit_log where action = 'draw') >= 8, 'draws are audited');
select is((select count(*)::int from audit_log where action = 'draw' and details::text ~* 'Guest'), 0, 'the audit log never holds a name');

select * from finish();
rollback;

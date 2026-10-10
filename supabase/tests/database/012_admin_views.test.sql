begin;
select * from no_plan();

insert into events (id, name, event_date) values ('00000000-0000-4000-8000-0000000000a4', 'T', '2026-12-10');
insert into guests (id, event_id, employee_id, full_name, outlet, department, phone, rsvp_status, first_opened_at)
select ('00000000-0000-4000-8000-a4' || lpad(i::text, 10, '0'))::uuid, '00000000-0000-4000-8000-0000000000a4', 'S' || i, 'Sguest ' || i,
       case when i <= 4 then 'Outlet A' else 'Outlet B' end, 'Dept', '+62811' || i,
       case when i <= 3 then 'yes' when i = 4 then 'no' else 'pending' end,
       case when i <= 5 then now() else null end
  from generate_series(1, 6) i;
insert into check_ins (event_id, guest_id, method, prize_number, station_label, actor)
select '00000000-0000-4000-8000-0000000000a4', ('00000000-0000-4000-8000-a4' || lpad(i::text, 10, '0'))::uuid, 'scan', i, 'Meja 1', 'checkin' from generate_series(1, 4) i;
insert into merchandise_redemptions (event_id, guest_id, station_label, actor)
values ('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-a40000000001', 'Booth', 'merchandise');
insert into prizes (id, event_id, name, tier, quantity, draw_as_batch) values
 ('00000000-0000-4000-8000-00000000a401', '00000000-0000-4000-8000-0000000000a4', 'Grand', 'grand', 1, false),
 ('00000000-0000-4000-8000-00000000a402', '00000000-0000-4000-8000-0000000000a4', 'Mugs', 'minor', 2, true);
select set_stage_options('00000000-0000-4000-8000-0000000000a4', '{"safe_mode":true}'::jsonb, 'hr@example.com');
select touch_stage_heartbeat('00000000-0000-4000-8000-0000000000a4');

create temp table g1 as select draw_prize('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-00000000a401', gen_random_uuid(), 'draw') as j;
select resolve_draw('00000000-0000-4000-8000-0000000000a4', ((select j->'draws'->0->>'id' from g1))::uuid, 'confirm', 'draw');
create temp table g2 as select draw_prize('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-00000000a402', gen_random_uuid(), 'draw') as j;
select resolve_draw('00000000-0000-4000-8000-0000000000a4', ((select j->'draws'->0->>'id' from g2))::uuid, 'no_show', 'draw');

-- dashboard
create temp table dash as select admin_dashboard('00000000-0000-4000-8000-0000000000a4') as j;
select is((select j->'counts'->>'total' from dash), '6', 'counts: total');
select is((select j->'counts'->>'checked_in' from dash), '4', 'counts: checked in');
select is((select j->'counts'->>'redeemed' from dash), '1', 'counts: merchandise');
select is((select jsonb_array_length(j->'outlets') from dash), 2, 'two outlets');
select is((select j->'outlets'->0->>'outlet' from dash), 'Outlet A', 'sorted by outlet');
select is((select j->'outlets'->0->>'total' from dash), '4', 'outlet A total');
select is((select j->'outlets'->0->>'checked_in' from dash), '4', 'outlet A checked in');
select is((select j->'outlets'->0->>'redeemed' from dash), '1', 'outlet A merchandise');
select is((select j->'outlets'->0->>'rsvp_yes' from dash), '3', 'outlet A rsvp yes');
select is((select j->'outlets'->1->>'checked_in' from dash), '0', 'outlet B checked in');
select is((select jsonb_array_length(j->'prizes') from dash), 2, 'prize status for both prizes');
select is((select j->'draw'->>'confirmed' from dash), '1', 'draw: confirmed');
select is((select j->'draw'->>'pending' from dash), '1', 'draw: pending');
select is((select j->'draw'->>'no_shows' from dash), '1', 'draw: no-shows');
select is((select j->'draw'->>'admin_voids' from dash), '0', 'draw: admin voids');
select is((select j->'draw'->>'eligible' from dash), '2', 'draw: still eligible (4 present, 2 live wins)');
select is((select j->'stage'->>'phase' from dash), 'rolling', 'stage phase');
select ok((select (j->'stage'->>'heartbeat_age')::int between 0 and 3 from dash), 'heartbeat age');
select ok((select jsonb_array_length(j->'recent') from dash) between 1 and 10, 'recent activity capped at 10');
select is((select j->'recent'->0->>'action' from dash), 'draw_no_show', 'newest first');

-- draw list
select is(jsonb_array_length(admin_draw_list('00000000-0000-4000-8000-0000000000a4')->'draws'), 3, 'three draws listed');
select is(admin_draw_list('00000000-0000-4000-8000-0000000000a4')->'draws'->0->>'status', 'drawn', 'newest first');
select ok(admin_draw_list('00000000-0000-4000-8000-0000000000a4')->'draws'->0 ? 'name', 'admin sees names');
select is(jsonb_array_length(admin_draw_list(gen_random_uuid())->'draws'), 0, 'another event lists nothing');

-- audit list
select ok(jsonb_array_length(admin_audit_list('00000000-0000-4000-8000-0000000000a4', null, 100)->'rows') >= 4, 'audit rows');
select is(jsonb_array_length(admin_audit_list('00000000-0000-4000-8000-0000000000a4', null, 2)->'rows'), 2, 'limit honoured');
select is(jsonb_array_length(admin_audit_list('00000000-0000-4000-8000-0000000000a4', null, 100000)->'rows') <= 200, true, 'limit capped at 200');
select is((select max((r->>'id')::bigint) from jsonb_array_elements(admin_audit_list('00000000-0000-4000-8000-0000000000a4', (select max(id) from audit_log), 100)->'rows') r) < (select max(id) from audit_log), true, 'paging by before-id');

-- reports
select is(report_rows('00000000-0000-4000-8000-0000000000a4', 'nope')->>'status', 'UNKNOWN_REPORT', 'unknown report');
select is(jsonb_array_length(report_rows('00000000-0000-4000-8000-0000000000a4', 'guests')->'rows'), 6, 'guests report');
select is(report_rows('00000000-0000-4000-8000-0000000000a4', 'guests')->'rows'->0->>'merchandise', 'redeemed', 'guests report shows merchandise');
select is(jsonb_array_length(report_rows('00000000-0000-4000-8000-0000000000a4', 'check_ins')->'rows'), 4, 'check-ins report');
select is(report_rows('00000000-0000-4000-8000-0000000000a4', 'check_ins')->'rows'->0->>'station', 'Meja 1', 'with the station');
select is(jsonb_array_length(report_rows('00000000-0000-4000-8000-0000000000a4', 'merchandise')->'rows'), 1, 'merchandise report');
select is(jsonb_array_length(report_rows('00000000-0000-4000-8000-0000000000a4', 'draws')->'rows'), 3, 'draw history includes voided draws');
select is(report_rows('00000000-0000-4000-8000-0000000000a4', 'draws')->'rows'->0->>'status', 'confirmed', 'oldest first');
select ok(jsonb_array_length(report_rows('00000000-0000-4000-8000-0000000000a4', 'audit')->'rows') >= 4, 'audit report');
select is(jsonb_array_length(report_rows('00000000-0000-4000-8000-0000000000a4', 'rsvp_pending')->'rows'), 2, 'two guests have not answered');
select ok(report_rows('00000000-0000-4000-8000-0000000000a4', 'rsvp_pending')->'rows'->0->>'phone' like '+62811%', 'with their phone');
select is(report_rows('00000000-0000-4000-8000-0000000000a4', 'guests')::text ~* 'phone', false, 'the guests report has no phone');

-- reset
select is(reset_rehearsal_data('00000000-0000-4000-8000-0000000000a4', 'hr@example.com')->>'status', 'OK', 'reset in rehearsal');
select is((select count(*)::int from draws where event_id = '00000000-0000-4000-8000-0000000000a4'), 0, 'draws gone');
select is((select count(*)::int from check_ins where event_id = '00000000-0000-4000-8000-0000000000a4'), 0, 'check-ins gone');
select is((select count(*)::int from merchandise_redemptions where event_id = '00000000-0000-4000-8000-0000000000a4'), 0, 'redemptions gone');
select is((select count(*)::int from stage_heartbeat where event_id = '00000000-0000-4000-8000-0000000000a4'), 0, 'heartbeat gone');
select is(get_stage('00000000-0000-4000-8000-0000000000a4')->>'phase', 'idle', 'stage idle');
select is(get_stage('00000000-0000-4000-8000-0000000000a4')->'payload', '{}'::jsonb, 'stage payload empty');
select ok((get_stage('00000000-0000-4000-8000-0000000000a4')->>'rev')::int > 0, 'rev moved on so open displays update');
select is(get_stage('00000000-0000-4000-8000-0000000000a4')->'options'->>'safe_mode', 'true', 'stage options kept');
select is((select count(*)::int from guests where event_id = '00000000-0000-4000-8000-0000000000a4'), 6, 'guests kept');
select is((select count(*)::int from guests where event_id = '00000000-0000-4000-8000-0000000000a4' and rsvp_status = 'yes'), 3, 'RSVPs kept');
select is((select count(*)::int from prizes where event_id = '00000000-0000-4000-8000-0000000000a4'), 2, 'prizes kept');
select is((select next_prize_number from events where id = '00000000-0000-4000-8000-0000000000a4'), 1, 'counter back to 1');
select is((select count(*)::int from audit_log where event_id = '00000000-0000-4000-8000-0000000000a4'), 1, 'only the reset entry remains');
-- everyone is drawable again and the prize can be drawn from scratch
select is(draw_prize('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-00000000a401', gen_random_uuid(), 'draw')->>'status', 'NO_ELIGIBLE_GUESTS', 'nobody is checked in after the reset');

-- live events cannot be reset
update events set mode = 'live' where id = '00000000-0000-4000-8000-0000000000a4';
insert into check_ins (event_id, guest_id, method, prize_number) values ('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-a40000000001', 'manual', 1);
select is(reset_rehearsal_data('00000000-0000-4000-8000-0000000000a4', 'hr@example.com')->>'status', 'NOT_REHEARSAL', 'a live event cannot be reset');
select is((select count(*)::int from check_ins where event_id = '00000000-0000-4000-8000-0000000000a4'), 1, 'and nothing was deleted');

select * from finish();
rollback;

-- pgTAP: MC cue card, part 3 (rundown editor, report, reset). Run with `supabase test db`.
begin;
select plan(33);

insert into public.events (id, name, event_date, mode, doors_at)
values ('00000000-0000-0000-0000-0000000000ff', 'T', '2026-12-08', 'rehearsal', now() + interval '30 days');
insert into public.prizes (id, event_id, name, sort_order) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000ff', 'Voucher', 10),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000ff', 'TV', 20);

create temp table ids (k text primary key, id uuid);

-- create
select is(public.admin_save_segment('00000000-0000-0000-0000-0000000000ff', null, '{"title":"Opening"}', 'admin') ->> 'status',
          'INVALID', 'title, time and duration required');
select is(public.admin_save_segment('00000000-0000-0000-0000-0000000000ff', null,
          '{"title":"Opening","planned_time":"25:00","duration_min":10}', 'admin') ->> 'status', 'INVALID', 'bad time');
select is(public.admin_save_segment('00000000-0000-0000-0000-0000000000ff', null,
          '{"title":"Opening","planned_time":"17:00","duration_min":0}', 'admin') ->> 'status', 'INVALID', 'zero duration');
insert into ids select 'open', (public.admin_save_segment('00000000-0000-0000-0000-0000000000ff', null,
  '{"title":"Opening","planned_time":"17:00","duration_min":10,"pic":"Komang","script":"Selamat sore"}', 'admin') ->> 'id')::uuid;
select isnt((select id from ids where k = 'open'), null, 'segment created');
select is((select planned_start from public.rundown_segments where id = (select id from ids where k = 'open')),
          '2026-12-08 17:00+08'::timestamptz, 'time is WITA on the event date');
select is((select sort_order from public.rundown_segments where id = (select id from ids where k = 'open')), 10, 'first sort order 10');
select is((select kind from public.rundown_segments where id = (select id from ids where k = 'open')), 'normal', 'kind defaults to normal');

select is(public.admin_save_segment('00000000-0000-0000-0000-0000000000ff', null,
  '{"title":"Draw","planned_time":"17:10","duration_min":15,"prize_ids":["00000000-0000-0000-0000-0000000000a1"]}', 'admin') ->> 'status',
  'INVALID', 'prizes need a door_prize segment');
select is(public.admin_save_segment('00000000-0000-0000-0000-0000000000ff', null,
  '{"title":"Draw","planned_time":"17:10","duration_min":15,"kind":"door_prize","prize_ids":["nope"]}', 'admin') ->> 'status',
  'INVALID', 'bad prize id');
select is(public.admin_save_segment('00000000-0000-0000-0000-0000000000ff', null,
  jsonb_build_object('title', 'Draw', 'planned_time', '17:10', 'duration_min', 15, 'kind', 'door_prize', 'prize_ids', jsonb_build_array(gen_random_uuid())), 'admin') ->> 'status',
  'INVALID', 'prize of another event refused');
insert into ids select 'draw', (public.admin_save_segment('00000000-0000-0000-0000-0000000000ff', null,
  '{"title":"Draw 1","planned_time":"17:10","duration_min":15,"kind":"door_prize","prize_ids":["00000000-0000-0000-0000-0000000000a1"]}', 'admin') ->> 'id')::uuid;
select is((select count(*)::int from public.segment_prizes where segment_id = (select id from ids where k = 'draw')), 1, 'prize assigned');
select is((select sort_order from public.rundown_segments where id = (select id from ids where k = 'draw')), 20, 'next sort order +10');

select is(public.admin_save_segment('00000000-0000-0000-0000-0000000000ff', null,
  '{"title":"Draw 2","planned_time":"18:00","duration_min":15,"kind":"door_prize","prize_ids":["00000000-0000-0000-0000-0000000000a1"]}', 'admin') ->> 'status',
  'PRIZE_TAKEN', 'a prize belongs to one segment');
insert into ids select 'close', (public.admin_save_segment('00000000-0000-0000-0000-0000000000ff', null,
  '{"title":"Closing","planned_time":"18:30","duration_min":5}', 'admin') ->> 'id')::uuid;

-- update
select is(public.admin_save_segment('00000000-0000-0000-0000-0000000000ff', (select id from ids where k = 'draw'),
  '{"prize_ids":["00000000-0000-0000-0000-0000000000a1","00000000-0000-0000-0000-0000000000a2"]}', 'admin') ->> 'status', 'OK', 'prizes replaced');
select is((select count(*)::int from public.segment_prizes where segment_id = (select id from ids where k = 'draw')), 2, 'two prizes now');
select is(public.admin_save_segment('00000000-0000-0000-0000-0000000000ff', (select id from ids where k = 'open'),
  '{"pic":""}', 'admin') ->> 'status', 'OK', 'pic cleared');
select is((select pic from public.rundown_segments where id = (select id from ids where k = 'open')), null, 'pic is null');
select is((select script from public.rundown_segments where id = (select id from ids where k = 'open')), 'Selamat sore', 'untouched keys stay');
select is(public.admin_save_segment('00000000-0000-0000-0000-0000000000ff', gen_random_uuid(), '{"title":"X"}', 'admin') ->> 'status',
          'NOT_FOUND', 'unknown segment');

-- run the show: finished segments lock, the current one stays editable
select is(public.mc_next('00000000-0000-0000-0000-0000000000ff', null, 'mc') ->> 'status', 'OK', 'show started');
select is(public.admin_save_segment('00000000-0000-0000-0000-0000000000ff', (select id from ids where k = 'open'),
  '{"script":"Halo"}', 'admin') ->> 'status', 'OK', 'current segment editable');
select is(public.mc_next('00000000-0000-0000-0000-0000000000ff', (select id from ids where k = 'open'), 'mc') ->> 'status', 'OK', 'next');
select is(public.admin_save_segment('00000000-0000-0000-0000-0000000000ff', (select id from ids where k = 'open'),
  '{"script":"Later"}', 'admin') ->> 'status', 'LOCKED', 'finished segment locked');
select is(public.admin_delete_segment('00000000-0000-0000-0000-0000000000ff', (select id from ids where k = 'open'), 'admin') ->> 'status',
          'HAS_RUNS', 'finished segment cannot be deleted');
select is(public.admin_delete_segment('00000000-0000-0000-0000-0000000000ff', (select id from ids where k = 'draw'), 'admin') ->> 'status',
          'HAS_RUNS', 'current segment cannot be deleted');

-- switching the current door-prize segment to normal drops its prizes
select is(public.admin_save_segment('00000000-0000-0000-0000-0000000000ff', (select id from ids where k = 'draw'),
  '{"kind":"normal"}', 'admin') ->> 'status', 'OK', 'kind changed');
select is((select count(*)::int from public.segment_prizes where segment_id = (select id from ids where k = 'draw')), 0, 'prizes dropped');

-- delete an upcoming segment; deleting a prize removes its assignment
select is(public.admin_delete_segment('00000000-0000-0000-0000-0000000000ff', (select id from ids where k = 'close'), 'admin') ->> 'status',
          'OK', 'upcoming segment deleted');

-- report
select is(jsonb_array_length(public.report_rows('00000000-0000-0000-0000-0000000000ff', 'rundown') -> 'rows'), 2, 'one row per run');
select is(public.report_rows('00000000-0000-0000-0000-0000000000ff', 'rundown') #>> '{rows,0,segment}', 'Opening', 'show order');
select is(public.report_rows('00000000-0000-0000-0000-0000000000ff', 'draws') ->> 'status', 'OK', 'older reports still work');

-- reset keeps the rundown, clears the runs
select is(public.reset_rehearsal_data('00000000-0000-0000-0000-0000000000ff', 'admin') ->> 'status', 'OK', 'reset');
select ok((select count(*) from public.rundown_runs where event_id = '00000000-0000-0000-0000-0000000000ff') = 0
      and (select count(*) from public.rundown_segments where event_id = '00000000-0000-0000-0000-0000000000ff') = 2,
  'runs cleared, segments kept');

select * from finish();
rollback;

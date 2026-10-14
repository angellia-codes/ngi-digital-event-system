-- pgTAP: invitation event details. Run with `supabase test db` against a database that has all migrations applied.
begin;
select plan(11);

insert into public.events (id, name, event_date) values ('00000000-0000-0000-0000-0000000000aa', 'T', '2026-12-10');

select is(public.set_event_details('00000000-0000-0000-0000-0000000000aa',
  '{"doors_at":"2026-12-10T17:00:00+08:00","venue":"Hall"}', 'a@b.c') ->> 'status', 'OK', 'partial update ok');
select is((select venue from public.events where id = '00000000-0000-0000-0000-0000000000aa'), 'Hall', 'venue saved');
select is((select doors_at from public.events where id = '00000000-0000-0000-0000-0000000000aa'),
  '2026-12-10T09:00:00Z'::timestamptz, 'doors_at stored as UTC');

select is(public.set_event_details('00000000-0000-0000-0000-0000000000aa', '{"starts_at":"2026-12-10T18:00:00+08:00"}', 'a@b.c') ->> 'status', 'OK', 'absent keys unchanged');
select is((select venue from public.events where id = '00000000-0000-0000-0000-0000000000aa'), 'Hall', 'venue still there');

select is(public.set_event_details('00000000-0000-0000-0000-0000000000aa', '{"venue":null}', 'a@b.c') ->> 'status', 'OK', 'null clears');
select is((select venue from public.events where id = '00000000-0000-0000-0000-0000000000aa'), null, 'venue cleared');

select is(public.set_event_details('00000000-0000-0000-0000-0000000000aa', '{"maps_url":"https://evil.com/maps"}', 'a@b.c') ->> 'status', 'INVALID_MAPS_URL', 'bad maps link');
select is(public.set_event_details('00000000-0000-0000-0000-0000000000aa', '{"ends_at":"2026-12-10T16:00:00+08:00"}', 'a@b.c') ->> 'status', 'INVALID_TIMES', 'end before gate');
select is(public.set_event_details('00000000-0000-0000-0000-0000000000ff', '{}', 'a@b.c') ->> 'status', 'NOT_FOUND', 'unknown event');

select ok(not has_function_privilege('anon', 'public.set_event_details(uuid,jsonb,text)', 'execute'), 'anon cannot execute');

select * from finish();
rollback;

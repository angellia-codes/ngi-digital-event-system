-- pgTAP: merchandise T-shirt size, part 1 (guest choice, pass, event settings). Run with `supabase test db`.
-- now() is fixed for the whole transaction, so deadlines are set relative to it.
begin;
select plan(34);

insert into public.events (id, name, event_date, mode, doors_at)
values ('00000000-0000-0000-0000-0000000000cc', 'T', '2026-12-08', 'rehearsal', now() + interval '30 days');

insert into public.guests (id, event_id, employee_id, full_name, outlet, invite_token) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000cc', 'E1', 'Ayu', 'A', 'inviteAAAAAAAAAAAAAAAA'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000cc', 'E2', 'Budi', 'A', 'inviteBBBBBBBBBBBBBBBB');

-- get_pass before any choice
select is(public.get_pass('inviteAAAAAAAAAAAAAAAA') #>> '{merch_size,size}', null, 'no size yet');
select is(public.get_pass('inviteAAAAAAAAAAAAAAAA') #>> '{event,merch_fit_note}', 'true', 'fit note on by default');
select is(public.get_pass('inviteAAAAAAAAAAAAAAAA') #>> '{event,merch_size_chart,L,chest}', '63', 'vendor chart seeded');

-- valid_size_chart
select ok(public.valid_size_chart((select merch_size_chart from public.events where id = '00000000-0000-0000-0000-0000000000cc')), 'seeded chart is valid');
select ok(public.valid_size_chart('{}'::jsonb), 'empty chart allowed');
select ok(not public.valid_size_chart('[]'::jsonb), 'array refused');
select ok(not public.valid_size_chart('{"S":{"chest":59,"bottom":56,"length":68,"sleeve":20}}'::jsonb), 'partial chart refused');
select ok(not public.valid_size_chart(jsonb_set((select merch_size_chart from public.events where id = '00000000-0000-0000-0000-0000000000cc'), '{L,chest}', '63.5')), 'decimal refused');
select ok(not public.valid_size_chart(jsonb_set((select merch_size_chart from public.events where id = '00000000-0000-0000-0000-0000000000cc'), '{L,chest}', '0')), 'zero refused');
select ok(not public.valid_size_chart(jsonb_set((select merch_size_chart from public.events where id = '00000000-0000-0000-0000-0000000000cc'), '{L,chest}', '"63"')), 'string refused');

-- set_merch_size
select is(public.set_merch_size('inviteAAAAAAAAAAAAAAAA', 'XS') ->> 'status', 'INVALID', 'bad size');
select is(public.set_merch_size('nope', 'L') ->> 'status', 'INVALID', 'bad token');
select is(public.set_merch_size('inviteAAAAAAAAAAAAAAAA', 'L') ->> 'status', 'OK', 'first size saved');
select is(public.set_merch_size('inviteAAAAAAAAAAAAAAAA', 'L') ->> 'status', 'OK', 'identical repeat is OK');
select is(public.set_merch_size('inviteAAAAAAAAAAAAAAAA', 'XL') ->> 'status', 'ALREADY_CHOSEN', 'different size refused');
select is(public.set_merch_size('inviteAAAAAAAAAAAAAAAA', 'XL') ->> 'size', 'L', 'returns the saved size');
select is((select merch_size_source from public.guests where employee_id = 'E1'), 'guest', 'source guest');
select is(public.get_pass('inviteAAAAAAAAAAAAAAAA') #>> '{merch_size,size}', 'L', 'pass shows the size');

-- effective_merch_size
select is(public.effective_merch_size(null, null, null, null) ->> 'size', null, 'no deadline, no size');
select is(public.effective_merch_size(null, null, now() + interval '1 day', 'M') ->> 'size', null, 'deadline ahead, no size');
select is(public.effective_merch_size(null, null, now() - interval '1 second', 'M') ->> 'size', 'M', 'default after the deadline');
select is(public.effective_merch_size(null, null, now() - interval '1 second', 'M') ->> 'source', 'auto', 'source auto');
select is(public.effective_merch_size('XL', 'guest', now() - interval '1 second', 'M') ->> 'size', 'XL', 'stored size wins');

-- set_event_details
select is(public.set_event_details('00000000-0000-0000-0000-0000000000cc',
  jsonb_build_object('merch_size_deadline', now() + interval '1 day'), 'admin') ->> 'status', 'DEFAULT_SIZE_REQUIRED', 'deadline needs a default');
select is(public.set_event_details('00000000-0000-0000-0000-0000000000cc',
  jsonb_build_object('merch_default_size', 'XS'), 'admin') ->> 'status', 'INVALID_SIZE', 'bad default size');
select is(public.set_event_details('00000000-0000-0000-0000-0000000000cc',
  jsonb_build_object('merch_default_size', 'M', 'merch_size_deadline', now() + interval '31 days'), 'admin') ->> 'status',
  'INVALID_TIMES', 'deadline after doors refused');
select is(public.set_event_details('00000000-0000-0000-0000-0000000000cc',
  jsonb_build_object('merch_size_chart', '{"S":{"chest":59}}'::jsonb), 'admin') ->> 'status', 'INVALID_SIZE_CHART', 'partial chart refused');
select is(public.set_event_details('00000000-0000-0000-0000-0000000000cc',
  jsonb_build_object('merch_fit_note', 'yes'), 'admin') ->> 'status', 'INVALID', 'fit note must be a boolean');
select is(public.set_event_details('00000000-0000-0000-0000-0000000000cc',
  jsonb_build_object('merch_size_chart', '{}'::jsonb, 'merch_fit_note', false), 'admin') ->> 'status', 'OK', 'chart cleared, note off');
select is(public.get_pass('inviteAAAAAAAAAAAAAAAA') #>> '{event,merch_size_chart}', '{}', 'cleared chart on the pass');

-- deadline passed: Budi gets the default, Ayu keeps her size
select is(public.set_event_details('00000000-0000-0000-0000-0000000000cc',
  jsonb_build_object('merch_default_size', 'M', 'merch_size_deadline', now() - interval '1 minute'), 'admin') ->> 'status', 'OK', 'deadline and default saved');
select is(public.set_merch_size('inviteBBBBBBBBBBBBBBBB', 'S') ->> 'status', 'CLOSED', 'closed after the deadline');
select is(public.get_pass('inviteBBBBBBBBBBBBBBBB') -> 'merch_size', '{"size": "M", "source": "auto", "given_size": null}'::jsonb, 'default size on the pass');

select ok(not has_function_privilege('anon', 'public.set_merch_size(text,text)', 'execute')
      and not has_function_privilege('authenticated', 'public.set_merch_size(text,text)', 'execute'),
  'anon and authenticated cannot execute');

select * from finish();
rollback;

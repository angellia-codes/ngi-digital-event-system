-- pgTAP: MC cue card, part 2 (VIP list, pax, prize MC lines, admin guest list). Run with `supabase test db`.
begin;
select plan(30);

insert into public.events (id, name, event_date, mode, doors_at)
values ('00000000-0000-0000-0000-0000000000ee', 'T', '2026-12-08', 'rehearsal', now() + interval '30 days');

insert into public.guests (id, event_id, employee_id, full_name, outlet, department, position, active, is_walk_in) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000ee', 'E1', 'Ayu',   'Ungasan', 'FOH',     'GM',        true,  false),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000ee', 'E2', 'Budi',  'Ungasan', 'Kitchen', 'Chef',      true,  false),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000ee', 'E3', 'Citra', 'Ungasan', 'FOH',     'Server',    true,  true),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000ee', 'E4', 'Dewi',  'Berawa',  null,      'Director',  true,  false),
  ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000ee', 'E5', 'Eka',   'Berawa',  'FOH',     'Director',  false, false),
  ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000ee', 'E6', 'Fajar', 'Berawa',  '  ',      'Owner',     true,  false);
insert into public.check_ins (event_id, guest_id, method, prize_number) values
  ('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000001', 'scan', 1),
  ('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000003', 'scan', 2),
  ('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000006', 'scan', 3);
insert into public.prizes (id, event_id, name) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000ee', 'Voucher');

-- admin_set_guest_vip
select is(public.admin_set_guest_vip('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000004',
  '{"vip_tier":"BOD","vip_title":"Ibu","protocol_order":"2","phonetic":"DEH-wee"}', 'admin') ->> 'status', 'OK', 'BOD tagged');
select is(public.admin_set_guest_vip('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000006',
  '{"vip_tier":"BOD","vip_title":"Bapak","protocol_order":"1"}', 'admin') ->> 'status', 'OK', 'second BOD');
select is(public.admin_set_guest_vip('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000001',
  '{"vip_tier":"HOD","vip_title":"Ibu"}', 'admin') ->> 'status', 'OK', 'HOD without order');
select is(public.admin_set_guest_vip('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000002',
  '{"vip_tier":"HOD","protocol_order":"1"}', 'admin') ->> 'status', 'OK', 'HOD with order');
select is(public.admin_set_guest_vip('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000005',
  '{"vip_tier":"BOD"}', 'admin') ->> 'status', 'OK', 'inactive guest can be tagged');
select is(public.admin_set_guest_vip('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000003',
  '{"vip_tier":"CEO"}', 'admin') ->> 'status', 'INVALID', 'unknown tier');
select is(public.admin_set_guest_vip('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000003',
  '{"vip_tier":"HOD","protocol_order":"-1"}', 'admin') ->> 'status', 'INVALID', 'bad order');
select is(public.admin_set_guest_vip('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000003',
  jsonb_build_object('vip_tier', 'HOD', 'vip_title', repeat('x', 31)), 'admin') ->> 'status', 'INVALID', 'title too long');
select is(public.admin_set_guest_vip('00000000-0000-0000-0000-0000000000ee', gen_random_uuid(),
  '{"vip_tier":"HOD"}', 'admin') ->> 'status', 'NOT_FOUND', 'unknown guest');
select is(public.admin_set_guest_vip('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000003',
  '[]', 'admin') ->> 'status', 'INVALID', 'array refused');

-- mc_vip
select is(jsonb_array_length(public.mc_vip('00000000-0000-0000-0000-0000000000ee') -> 'vips'), 4, 'active VIPs only');
select is(public.mc_vip('00000000-0000-0000-0000-0000000000ee') #>> '{vips,0,full_name}', 'Fajar', 'BOD order 1 first');
select is(public.mc_vip('00000000-0000-0000-0000-0000000000ee') #>> '{vips,1,full_name}', 'Dewi', 'BOD order 2 second');
select is(public.mc_vip('00000000-0000-0000-0000-0000000000ee') #>> '{vips,2,full_name}', 'Budi', 'HOD with order before HOD without');
select is(public.mc_vip('00000000-0000-0000-0000-0000000000ee') #>> '{vips,3,full_name}', 'Ayu', 'HOD without order last');
select is(public.mc_vip('00000000-0000-0000-0000-0000000000ee') #>> '{vips,0,arrived}', 'true', 'arrived flag');
select is(public.mc_vip('00000000-0000-0000-0000-0000000000ee') #>> '{vips,1,arrived}', 'false', 'not arrived');
select is(public.mc_vip('00000000-0000-0000-0000-0000000000ee') #>> '{vips,1,phonetic}', 'DEH-wee', 'phonetic note');

-- clearing the tier clears the rest
select is(public.admin_set_guest_vip('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000004',
  '{"vip_tier":null,"vip_title":"Ibu"}', 'admin') ->> 'status', 'OK', 'tier cleared');
select is((select vip_title from public.guests where employee_id = 'E4'), null, 'title cleared with the tier');
select is(jsonb_array_length(public.mc_vip('00000000-0000-0000-0000-0000000000ee') -> 'vips'), 3, 'removed from the list');

-- mc_pax: Ungasan FOH 2 invited (one walk-in) 2 in; Kitchen 1/0; Berawa no department 2 invited (blank counts as none) 1 in
select is(jsonb_array_length(public.mc_pax('00000000-0000-0000-0000-0000000000ee') -> 'rows'), 3, 'three outlet/department rows');
select is(public.mc_pax('00000000-0000-0000-0000-0000000000ee') #>> '{rows,0,outlet}', 'Berawa', 'ordered by outlet');
select is(public.mc_pax('00000000-0000-0000-0000-0000000000ee') #>> '{rows,0,department}', null, 'blank department is none');
select is((public.mc_pax('00000000-0000-0000-0000-0000000000ee') #>> '{rows,0,invited}')::int, 2, 'inactive guest not invited');
select is((public.mc_pax('00000000-0000-0000-0000-0000000000ee') #>> '{rows,0,checked_in}')::int, 1, 'Berawa checked in');
select is((public.mc_pax('00000000-0000-0000-0000-0000000000ee') #>> '{rows,1,checked_in}')::int, 2, 'Ungasan FOH incl. walk-in');

-- prize script
select is(public.admin_set_prize_script('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-0000000000a1', '  Sponsored by X ', 'admin') ->> 'status', 'OK', 'script saved');
select is(public.prize_list('00000000-0000-0000-0000-0000000000ee') #>> '{prizes,0,mc_script}', 'Sponsored by X', 'prize_list carries the trimmed script');

-- admin guest list carries VIP fields
select is((select x ->> 'vip_tier' from jsonb_array_elements(public.admin_guest_list('00000000-0000-0000-0000-0000000000ee', '', '') -> 'guests') x
            where x ->> 'employee_id' = 'E6'), 'BOD', 'guest list shows the tier');

select * from finish();
rollback;

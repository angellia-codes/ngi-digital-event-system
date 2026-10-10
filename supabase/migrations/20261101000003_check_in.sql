create function public.guest_brief(g public.guests) returns jsonb
language sql immutable
as $$
  select jsonb_build_object('id', g.id, 'full_name', g.full_name, 'outlet', g.outlet,
                            'department', g.department, 'position', g.position)
$$;

create function public.log_attempt(p_event uuid, p_kind text, p_token text, p_result text, p_actor text)
returns void
language sql security definer set search_path = public, extensions
as $$
  insert into public.attempt_log (event_id, kind, token_prefix, result, actor)
  values (p_event, p_kind, left(coalesce(p_token, ''), 6), p_result, p_actor);
$$;

create function public.check_in(
  p_event uuid, p_token text, p_guest_id uuid, p_method text, p_station_label text, p_actor text
) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  g public.guests%rowtype;
  ci public.check_ins%rowtype;
  v_num int;
begin
  if p_token is not null then
    select * into g from public.guests where event_id = p_event and invite_token = p_token;
  else
    select * into g from public.guests where event_id = p_event and id = p_guest_id;
  end if;

  if not found then
    perform public.log_attempt(p_event, 'checkin', coalesce(p_token, p_guest_id::text), 'INVALID', p_actor);
    return jsonb_build_object('status', 'INVALID');
  end if;
  if not g.active then
    return jsonb_build_object('status', 'NOT_ELIGIBLE');
  end if;

  -- lock order: guest advisory lock, then events row
  perform pg_advisory_xact_lock(hashtextextended(g.id::text, 0));

  select * into ci from public.check_ins where guest_id = g.id;
  if found then
    return jsonb_build_object('status', 'ALREADY_CHECKED_IN', 'guest', public.guest_brief(g),
                              'prize_number', ci.prize_number, 'checked_in_at', ci.checked_in_at,
                              'station_label', ci.station_label);
  end if;

  update public.events set next_prize_number = next_prize_number + 1
   where id = p_event
  returning next_prize_number - 1 into v_num;

  insert into public.check_ins (event_id, guest_id, method, station_label, actor, prize_number)
  values (p_event, g.id, p_method, p_station_label, p_actor, v_num)
  returning * into ci;

  perform public.audit(p_event, 'station', coalesce(p_actor, 'unknown'), 'check_in', 'guest', g.id::text,
                       jsonb_build_object('prize_number', v_num, 'method', p_method, 'station', p_station_label));

  return jsonb_build_object('status', 'CHECKED_IN', 'guest', public.guest_brief(g),
                            'prize_number', ci.prize_number, 'checked_in_at', ci.checked_in_at,
                            'station_label', ci.station_label);
end $$;

select public.lock_down_public();

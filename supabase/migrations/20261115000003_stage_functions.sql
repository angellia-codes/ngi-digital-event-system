-- Writes the single stage_state row (creating it if missing) and bumps rev. Internal: no authorization here.
create function public.stage_write(p_event uuid, p_phase text, p_payload jsonb) returns void
language sql security definer set search_path = public, extensions
as $$
  insert into public.stage_state (event_id, rev, phase, payload)
  values (p_event, 1, p_phase, coalesce(p_payload, '{}'::jsonb))
  on conflict (event_id) do update
    set rev = public.stage_state.rev + 1, phase = excluded.phase, payload = excluded.payload, updated_at = now()
$$;

-- What the projector may know about one round. A winner's name, outlet and department appear ONLY for confirmed draws.
create function public.stage_payload(p_event uuid, p_round uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object(
    'round_id', p_round,
    'batch', pr.draw_as_batch,
    'prize', jsonb_build_object('id', pr.id, 'name', pr.name, 'tier', pr.tier, 'quantity', pr.quantity),
    'slots', (
      select coalesce(jsonb_agg(x.s order by x.slot), '[]'::jsonb)
      from (
        select distinct on (d.slot) d.slot,
               jsonb_build_object('slot', d.slot, 'number', c.prize_number,
                                  'state', case d.status when 'drawn' then 'rolling' when 'confirmed' then 'revealed' else 'void' end)
               || case when d.status = 'confirmed'
                       then jsonb_build_object('name', g.full_name, 'outlet', g.outlet, 'department', g.department)
                       else '{}'::jsonb end as s
          from public.draws d
          join public.check_ins c on c.guest_id = d.winner_guest_id
          join public.guests g on g.id = d.winner_guest_id
         where d.event_id = p_event and d.round_id = p_round
         order by d.slot, d.sequence desc
      ) x)
  )
  from public.prizes pr
  where pr.id = (select d.prize_id from public.draws d where d.event_id = p_event and d.round_id = p_round limit 1)
$$;

-- Recomputes the stage from the draws of one round and publishes it (rev + 1).
create function public.stage_publish(p_event uuid, p_round uuid) returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_payload jsonb;
  v_phase text;
begin
  v_payload := public.stage_payload(p_event, p_round);
  if v_payload is null then
    perform public.stage_write(p_event, 'idle', '{}'::jsonb);
    return;
  end if;
  v_phase := case
    when exists (select 1 from jsonb_array_elements(v_payload->'slots') s where s->>'state' = 'rolling') then 'rolling'
    when exists (select 1 from jsonb_array_elements(v_payload->'slots') s where s->>'state' = 'void') then 'void'
    else 'revealed' end;
  perform public.stage_write(p_event, v_phase, v_payload);
end $$;

create function public.get_stage(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object(
    'status', 'OK',
    'rev', coalesce(s.rev, 0),
    'phase', coalesce(s.phase, 'idle'),
    'payload', coalesce(s.payload, '{}'::jsonb),
    'options', coalesce(s.options, '{"safe_mode": false, "reduce_effects": false, "language": "en"}'::jsonb),
    'updated_at', s.updated_at)
  from (select 1) one
  left join public.stage_state s on s.event_id = p_event
$$;

-- The MC may blank the screen or show a prize banner. The payload is built here, never supplied by the caller.
create function public.set_stage(p_event uuid, p_phase text, p_prize_id uuid, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  pr public.prizes%rowtype;
begin
  if p_phase not in ('idle', 'intro') then
    return jsonb_build_object('status', 'INVALID_PHASE');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('draw:' || p_event::text, 0));
  if exists (select 1 from public.draws where event_id = p_event and status = 'drawn') then
    return jsonb_build_object('status', 'DRAW_IN_PROGRESS');
  end if;
  if p_phase = 'idle' then
    perform public.stage_write(p_event, 'idle', '{}'::jsonb);
  else
    select * into pr from public.prizes where id = p_prize_id and event_id = p_event;
    if not found then
      return jsonb_build_object('status', 'PRIZE_NOT_FOUND');
    end if;
    perform public.stage_write(p_event, 'intro', jsonb_build_object(
      'round_id', null, 'batch', pr.draw_as_batch, 'slots', '[]'::jsonb,
      'prize', jsonb_build_object('id', pr.id, 'name', pr.name, 'tier', pr.tier, 'quantity', pr.quantity)));
  end if;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'stage_' || p_phase, 'stage', p_event::text,
                       case when p_phase = 'intro' then jsonb_build_object('prize_id', p_prize_id) else '{}'::jsonb end);
  return jsonb_build_object('status', 'OK');
end $$;

create function public.set_stage_options(p_event uuid, p_options jsonb, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if jsonb_typeof(p_options) is distinct from 'object' or p_options = '{}'::jsonb then
    return jsonb_build_object('status', 'INVALID');
  end if;
  if exists (select 1 from jsonb_object_keys(p_options) k where k not in ('safe_mode', 'reduce_effects', 'language')) then
    return jsonb_build_object('status', 'INVALID');
  end if;
  if (jsonb_exists(p_options, 'safe_mode') and jsonb_typeof(p_options->'safe_mode') <> 'boolean')
     or (jsonb_exists(p_options, 'reduce_effects') and jsonb_typeof(p_options->'reduce_effects') <> 'boolean')
     or (jsonb_exists(p_options, 'language') and (p_options->>'language') not in ('id', 'en')) then
    return jsonb_build_object('status', 'INVALID');
  end if;
  insert into public.stage_state (event_id) values (p_event) on conflict do nothing;
  update public.stage_state
     set options = options || p_options, rev = rev + 1, updated_at = now()
   where event_id = p_event;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'stage_options', 'stage', p_event::text, p_options);
  return jsonb_build_object('status', 'OK');
end $$;

create function public.touch_stage_heartbeat(p_event uuid) returns void
language sql security definer set search_path = public, extensions
as $$
  insert into public.stage_heartbeat (event_id, seen_at) values (p_event, now())
  on conflict (event_id) do update set seen_at = now()
$$;

-- Seconds since the display last checked in; null if it never has.
create function public.stage_heartbeat_age(p_event uuid) returns int
language sql stable security definer set search_path = public, extensions
as $$
  select extract(epoch from (now() - seen_at))::int from public.stage_heartbeat where event_id = p_event
$$;

-- Stage display key: stored as a bcrypt hash; the clear key is shown once in the admin console.
create function public.set_stage_key(p_event uuid, p_key text, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if p_key is null or p_key !~ '^[A-Za-z0-9_-]{16,64}$' then
    return jsonb_build_object('status', 'INVALID_KEY');
  end if;
  update public.events set display_key_hash = crypt(p_key, gen_salt('bf')) where id = p_event;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'set_stage_key', 'event', p_event::text, '{}'::jsonb);
  return jsonb_build_object('status', 'OK');
end $$;

-- Short fingerprint of the current key. The stage cookie carries it, so rotating the key signs displays out.
create function public.stage_key_tag(p_event uuid) returns text
language sql stable security definer set search_path = public, extensions
as $$
  select left(md5(display_key_hash), 12) from public.events where id = p_event and display_key_hash is not null
$$;

create function public.verify_stage_key(p_event uuid, p_key text, p_ip_key text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  if (select count(*) from public.auth_attempts
       where scope = 'stage_ip' and key = p_ip_key and not success and at > now() - interval '5 minutes') >= 20 then
    return jsonb_build_object('status', 'LOCKED');
  end if;
  select display_key_hash into v_hash from public.events where id = p_event;
  if v_hash is null then
    return jsonb_build_object('status', 'NOT_SET');
  end if;
  if p_key is null or crypt(p_key, v_hash) <> v_hash then
    insert into public.auth_attempts (scope, key, success) values ('stage_ip', p_ip_key, false);
    return jsonb_build_object('status', 'INVALID');
  end if;
  return jsonb_build_object('status', 'OK', 'tag', public.stage_key_tag(p_event));
end $$;

select public.lock_down_public();

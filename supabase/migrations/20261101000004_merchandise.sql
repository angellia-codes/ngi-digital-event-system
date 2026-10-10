create function public.redeem_lookup(p_event uuid, p_token text, p_guest_id uuid, p_actor text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  g public.guests%rowtype;
  mr public.merchandise_redemptions%rowtype;
begin
  if p_token is not null then
    select * into g from public.guests where event_id = p_event and merch_token = p_token;
  else
    select * into g from public.guests where event_id = p_event and id = p_guest_id;
  end if;

  if not found then
    perform public.log_attempt(p_event, 'merchandise', coalesce(p_token, p_guest_id::text), 'INVALID', p_actor);
    return jsonb_build_object('status', 'INVALID');
  end if;
  if not g.active then
    perform public.log_attempt(p_event, 'merchandise', p_token, 'NOT_ELIGIBLE', p_actor);
    return jsonb_build_object('status', 'NOT_ELIGIBLE');
  end if;
  if not exists (select 1 from public.check_ins where guest_id = g.id) then
    perform public.log_attempt(p_event, 'merchandise', p_token, 'NOT_CHECKED_IN', p_actor);
    return jsonb_build_object('status', 'NOT_CHECKED_IN', 'guest', public.guest_brief(g));
  end if;

  select * into mr from public.merchandise_redemptions where guest_id = g.id and status = 'redeemed';
  if found then
    perform public.log_attempt(p_event, 'merchandise', p_token, 'ALREADY_REDEEMED', p_actor);
    return jsonb_build_object('status', 'ALREADY_REDEEMED', 'guest', public.guest_brief(g),
                              'redeemed_at', mr.redeemed_at, 'station_label', mr.station_label);
  end if;
  return jsonb_build_object('status', 'READY', 'guest', public.guest_brief(g));
end $$;

create function public.redeem_merchandise(
  p_event uuid, p_token text, p_guest_id uuid, p_station_label text, p_actor text
) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  g public.guests%rowtype;
  mr public.merchandise_redemptions%rowtype;
begin
  if p_token is not null then
    select * into g from public.guests where event_id = p_event and merch_token = p_token;
  else
    select * into g from public.guests where event_id = p_event and id = p_guest_id;
  end if;

  if not found then
    perform public.log_attempt(p_event, 'merchandise', coalesce(p_token, p_guest_id::text), 'INVALID', p_actor);
    return jsonb_build_object('status', 'INVALID');
  end if;
  if not g.active then
    return jsonb_build_object('status', 'NOT_ELIGIBLE');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(g.id::text, 0));

  if not exists (select 1 from public.check_ins where guest_id = g.id) then
    perform public.log_attempt(p_event, 'merchandise', p_token, 'NOT_CHECKED_IN', p_actor);
    return jsonb_build_object('status', 'NOT_CHECKED_IN', 'guest', public.guest_brief(g));
  end if;

  select * into mr from public.merchandise_redemptions where guest_id = g.id and status = 'redeemed';
  if found then
    -- double-tap guard: same station within 10 seconds is the same hand-over
    if mr.station_label is not distinct from p_station_label and mr.redeemed_at > now() - interval '10 seconds' then
      return jsonb_build_object('status', 'REDEEMED', 'guest', public.guest_brief(g),
                                'redeemed_at', mr.redeemed_at, 'replay', true);
    end if;
    perform public.log_attempt(p_event, 'merchandise', p_token, 'ALREADY_REDEEMED', p_actor);
    return jsonb_build_object('status', 'ALREADY_REDEEMED', 'guest', public.guest_brief(g),
                              'redeemed_at', mr.redeemed_at, 'station_label', mr.station_label);
  end if;

  insert into public.merchandise_redemptions (event_id, guest_id, status, station_label, actor)
  values (p_event, g.id, 'redeemed', p_station_label, p_actor)
  returning * into mr;

  perform public.audit(p_event, 'station', coalesce(p_actor, 'unknown'), 'merchandise_redeemed', 'guest', g.id::text,
                       jsonb_build_object('station', p_station_label));

  return jsonb_build_object('status', 'REDEEMED', 'guest', public.guest_brief(g),
                            'redeemed_at', mr.redeemed_at, 'replay', false);
end $$;

create function public.void_redemption(p_event uuid, p_redemption_id uuid, p_reason text, p_actor text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_reason text := trim(coalesce(p_reason, ''));
  mr public.merchandise_redemptions%rowtype;
begin
  if length(v_reason) < 5 then
    return jsonb_build_object('status', 'REASON_REQUIRED');
  end if;
  select * into mr from public.merchandise_redemptions
   where id = p_redemption_id and event_id = p_event and status = 'redeemed'
   for update;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  update public.merchandise_redemptions set status = 'voided', void_reason = v_reason where id = mr.id;
  perform public.audit(p_event, 'admin', p_actor, 'merchandise_voided', 'guest', mr.guest_id::text,
                       jsonb_build_object('reason', v_reason));
  return jsonb_build_object('status', 'OK');
end $$;

select public.lock_down_public();

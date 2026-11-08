-- Merchandise T-shirt size (spec 2026-11-08), part 2: the booth. Lookup shows the reserved size, redeem records
-- reserved and given size, and merch_size_summary() gives counts per size for the booth strip, admin and dashboard.

-- Scan or manual search. Records nothing except rejected attempts.
create or replace function public.redeem_lookup(p_event uuid, p_token text, p_guest_id uuid, p_actor text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  g public.guests%rowtype;
  e public.events%rowtype;
  mr public.merchandise_redemptions%rowtype;
  v_eff jsonb;
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
                              'redeemed_at', mr.redeemed_at, 'station_label', mr.station_label,
                              'size', mr.reserved_size, 'given_size', mr.given_size);
  end if;

  select * into e from public.events where id = p_event;
  v_eff := public.effective_merch_size(g.merch_size, g.merch_size_source, e.merch_size_deadline, e.merch_default_size);
  return jsonb_build_object('status', 'READY', 'guest', public.guest_brief(g),
                            'size', v_eff ->> 'size', 'size_source', v_eff ->> 'source');
end $$;

-- The booth always says which size it handed over (spec §4.4), so the old five-argument version goes.
drop function public.redeem_merchandise(uuid, text, uuid, text, text);

create function public.redeem_merchandise(
  p_event uuid, p_token text, p_guest_id uuid, p_station_label text, p_actor text, p_given_size text
) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  g public.guests%rowtype;
  e public.events%rowtype;
  mr public.merchandise_redemptions%rowtype;
  v_eff jsonb;
begin
  if p_given_size is null or p_given_size not in ('S', 'M', 'L', 'XL', 'XXL') then
    return jsonb_build_object('status', 'INVALID_SIZE');
  end if;
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
      return jsonb_build_object('status', 'REDEEMED', 'guest', public.guest_brief(g), 'redeemed_at', mr.redeemed_at,
                                'size', mr.reserved_size, 'given_size', mr.given_size, 'replay', true);
    end if;
    perform public.log_attempt(p_event, 'merchandise', p_token, 'ALREADY_REDEEMED', p_actor);
    return jsonb_build_object('status', 'ALREADY_REDEEMED', 'guest', public.guest_brief(g),
                              'redeemed_at', mr.redeemed_at, 'station_label', mr.station_label,
                              'size', mr.reserved_size, 'given_size', mr.given_size);
  end if;

  -- Re-read under the lock so a size saved a moment ago counts.
  select * into g from public.guests where id = g.id;
  select * into e from public.events where id = p_event;
  v_eff := public.effective_merch_size(g.merch_size, g.merch_size_source, e.merch_size_deadline, e.merch_default_size);

  insert into public.merchandise_redemptions (event_id, guest_id, status, station_label, actor, reserved_size, reserved_source, given_size)
  values (p_event, g.id, 'redeemed', p_station_label, p_actor, v_eff ->> 'size', v_eff ->> 'source', p_given_size)
  returning * into mr;

  perform public.audit(p_event, 'station', coalesce(p_actor, 'unknown'), 'merchandise_redeemed', 'guest', g.id::text,
                       jsonb_build_object('station', p_station_label, 'reserved_size', mr.reserved_size, 'given_size', mr.given_size));

  return jsonb_build_object('status', 'REDEEMED', 'guest', public.guest_brief(g), 'redeemed_at', mr.redeemed_at,
                            'size', mr.reserved_size, 'given_size', mr.given_size, 'replay', false);
end $$;

-- Counts per size for active guests. A redeemed guest counts as what was reserved at the booth.
-- received comes from merch_stock; given counts active redemptions by given_size, so a void returns the shirt to stock.
create function public.merch_size_summary(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  with ev as (
    select merch_size_deadline as d, merch_default_size as def from public.events where id = p_event),
  x as (
    select case when m.id is not null then m.reserved_size
                else public.effective_merch_size(g.merch_size, g.merch_size_source, (select d from ev), (select def from ev)) ->> 'size'
           end as size,
           m.id is not null as redeemed
      from public.guests g
      left join public.merchandise_redemptions m on m.guest_id = g.id and m.status = 'redeemed'
     where g.event_id = p_event and g.active),
  given as (
    select given_size as size, count(*) as n
      from public.merchandise_redemptions
     where event_id = p_event and status = 'redeemed' and given_size is not null
     group by given_size),
  sz as (select u.s, u.ord from unnest(array['S', 'M', 'L', 'XL', 'XXL']) with ordinality as u(s, ord))
  select jsonb_build_object(
    'status', 'OK',
    'sizes', (
      select jsonb_agg(jsonb_build_object(
          'size', sz.s,
          'reserved', (select count(*) from x where x.size = sz.s),
          'received', coalesce(st.received, 0),
          'given', coalesce(gv.n, 0),
          'left', coalesce(st.received, 0) - coalesce(gv.n, 0),
          'to_claim', (select count(*) from x where x.size = sz.s and not x.redeemed)) order by sz.ord)
        from sz
        left join public.merch_stock st on st.event_id = p_event and st.size = sz.s
        left join given gv on gv.size = sz.s),
    'no_size', (select count(*) from x where x.size is null),
    'total', (select count(*) from x),
    'deadline', (select d from ev),
    'default_size', (select def from ev),
    'final', coalesce((select d from ev) <= now(), false),
    'stock_set', exists (select 1 from public.merch_stock where event_id = p_event))
$$;

select public.lock_down_public();

-- Interactive invitation: editable event details + wider pass payload.
alter table public.events
  add column doors_at timestamptz,
  add column ends_at  timestamptz,
  add column maps_url text;

create or replace function public.get_pass(p_token text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  g public.guests%rowtype; e public.events%rowtype; ci public.check_ins%rowtype;
  mr public.merchandise_redemptions%rowtype; v_merch jsonb;
begin
  select * into g from public.guests where invite_token = p_token and active;
  if not found then return jsonb_build_object('status', 'INVALID'); end if;
  if g.first_opened_at is null then update public.guests set first_opened_at = now() where id = g.id; end if;
  select * into e from public.events where id = g.event_id;
  select * into ci from public.check_ins where guest_id = g.id;
  if ci.id is not null then
    select * into mr from public.merchandise_redemptions where guest_id = g.id and status = 'redeemed';
    v_merch := jsonb_build_object('token', g.merch_token, 'claimed', mr.id is not null, 'redeemed_at', mr.redeemed_at);
  end if;
  return jsonb_build_object(
    'status', 'OK',
    'server_now', now(),
    'event', jsonb_build_object('name', e.name, 'date', e.event_date, 'doors_at', e.doors_at,
      'starts_at', e.starts_at, 'ends_at', e.ends_at, 'venue', e.venue, 'maps_url', e.maps_url),
    'guest', jsonb_build_object('full_name', g.full_name, 'outlet', g.outlet, 'department', g.department, 'position', g.position),
    'invite_token', g.invite_token, 'checked_in', ci.id is not null, 'checked_in_at', ci.checked_in_at,
    'prize_number', ci.prize_number, 'merchandise', v_merch);
end $$;

-- Partial update: absent key = unchanged, JSON null = clear (event_date cannot be cleared).
create or replace function public.set_event_details(p_event uuid, p_details jsonb, p_actor text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  e public.events%rowtype;
  v_date date; v_doors timestamptz; v_starts timestamptz; v_ends timestamptz; v_venue text; v_maps text;
begin
  select * into e from public.events where id = p_event;
  if not found then return jsonb_build_object('status', 'NOT_FOUND'); end if;
  if jsonb_typeof(p_details) is distinct from 'object' then return jsonb_build_object('status', 'INVALID'); end if;

  v_date   := e.event_date; v_doors := e.doors_at; v_starts := e.starts_at;
  v_ends   := e.ends_at;    v_venue := e.venue;    v_maps   := e.maps_url;

  if p_details ? 'event_date' then
    if jsonb_typeof(p_details -> 'event_date') <> 'string' then return jsonb_build_object('status', 'INVALID'); end if;
    v_date := (p_details ->> 'event_date')::date;
  end if;
  if p_details ? 'doors_at'  then v_doors  := (p_details ->> 'doors_at')::timestamptz;  end if;
  if p_details ? 'starts_at' then v_starts := (p_details ->> 'starts_at')::timestamptz; end if;
  if p_details ? 'ends_at'   then v_ends   := (p_details ->> 'ends_at')::timestamptz;   end if;
  if p_details ? 'venue'     then v_venue  := nullif(trim(p_details ->> 'venue'), '');   end if;
  if p_details ? 'maps_url'  then v_maps   := nullif(trim(p_details ->> 'maps_url'), ''); end if;

  if v_maps is not null and v_maps !~* '^https://(www\.google\.com/maps|google\.com/maps|maps\.google\.com|maps\.app\.goo\.gl|goo\.gl/maps)([/?#].*)?$' then
    return jsonb_build_object('status', 'INVALID_MAPS_URL');
  end if;
  if v_doors is not null and ((v_starts is not null and v_starts < v_doors) or (v_ends is not null and v_ends <= v_doors)) then
    return jsonb_build_object('status', 'INVALID_TIMES');
  end if;

  update public.events
     set event_date = v_date, doors_at = v_doors, starts_at = v_starts, ends_at = v_ends, venue = v_venue, maps_url = v_maps
   where id = p_event;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'event_details_updated', 'event', p_event::text,
    jsonb_build_object('keys', (select coalesce(jsonb_agg(k order by k), '[]'::jsonb) from jsonb_object_keys(p_details) k)));
  return jsonb_build_object('status', 'OK');
end $$;

select public.lock_down_public();

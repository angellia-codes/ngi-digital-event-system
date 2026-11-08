-- Merchandise T-shirt size (spec 2026-11-08), part 1: schema, the guest's choice, the pass and event settings.
-- No job runs at the deadline: effective_merch_size() works the size out on every read, like effective_beverage().

alter table public.guests
  add column merch_size text check (merch_size in ('S', 'M', 'L', 'XL', 'XXL')),
  add column merch_size_chosen_at timestamptz,
  add column merch_size_source text check (merch_size_source in ('guest', 'admin'));

alter table public.events
  add column merch_size_deadline timestamptz,
  add column merch_default_size text check (merch_default_size in ('S', 'M', 'L', 'XL', 'XXL')),
  add column merch_size_chart jsonb not null default '{
    "S":   {"chest": 59, "bottom": 56, "length": 68, "sleeve": 20},
    "M":   {"chest": 61, "bottom": 58, "length": 70, "sleeve": 21},
    "L":   {"chest": 63, "bottom": 60, "length": 72, "sleeve": 22},
    "XL":  {"chest": 65, "bottom": 62, "length": 74, "sleeve": 23},
    "XXL": {"chest": 67, "bottom": 64, "length": 76, "sleeve": 24}
  }'::jsonb,
  add column merch_fit_note boolean not null default true,
  add constraint merch_deadline_needs_default check (merch_size_deadline is null or merch_default_size is not null);

create table public.merch_stock (
  event_id uuid not null references public.events (id),
  size text not null check (size in ('S', 'M', 'L', 'XL', 'XXL')),
  received integer not null default 0 check (received >= 0),
  updated_at timestamptz not null default now(),
  primary key (event_id, size)
);

-- given_size stays nullable for redemptions recorded before this migration (rehearsal data).
-- redeem_merchandise() requires it for every new redemption.
alter table public.merchandise_redemptions
  add column reserved_size text check (reserved_size in ('S', 'M', 'L', 'XL', 'XXL')),
  add column reserved_source text check (reserved_source in ('guest', 'admin', 'auto')),
  add column given_size text check (given_size in ('S', 'M', 'L', 'XL', 'XXL'));

-- All five sizes with four positive whole-number measurements (cm), or {} to hide the guide.
-- CASE keeps the checks in order, so a non-object never reaches jsonb_object_keys and a string never reaches ::numeric.
create function public.valid_size_chart(p jsonb) returns boolean
language sql immutable set search_path = public
as $$
  select case
    when p is null or jsonb_typeof(p) <> 'object' then false
    when p = '{}'::jsonb then true
    when (select array_agg(k order by k collate "C") from jsonb_object_keys(p) k) <> array['L', 'M', 'S', 'XL', 'XXL']::text[] then false
    else not exists (
      select 1
        from jsonb_each(p) s, unnest(array['chest', 'bottom', 'length', 'sleeve']) f
       where case
         when jsonb_typeof(s.value) <> 'object' then true
         when jsonb_typeof(s.value -> f) is distinct from 'number' then true
         else (s.value ->> f)::numeric <= 0 or (s.value ->> f)::numeric <> trunc((s.value ->> f)::numeric)
       end)
  end
$$;

-- Stored size, else the admin default once the deadline has passed, else none.
create function public.effective_merch_size(p_size text, p_source text, p_deadline timestamptz, p_default text) returns jsonb
language sql stable set search_path = public
as $$
  select case
    when p_size is not null then jsonb_build_object('size', p_size, 'source', coalesce(p_source, 'guest'))
    when p_deadline is not null and now() >= p_deadline and p_default is not null
      then jsonb_build_object('size', p_default, 'source', 'auto')
    else jsonb_build_object('size', null, 'source', null)
  end
$$;

-- Guest picks a size. First saved size wins; identical repeat is OK.
create function public.set_merch_size(p_token text, p_size text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  g public.guests%rowtype;
  e public.events%rowtype;
  mr public.merchandise_redemptions%rowtype;
  v_saved text;
begin
  if p_size is null or p_size not in ('S', 'M', 'L', 'XL', 'XXL') then
    return jsonb_build_object('status', 'INVALID');
  end if;
  select * into g from public.guests where invite_token = p_token and active;
  if not found then
    return jsonb_build_object('status', 'INVALID');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(g.id::text, 0));

  select * into mr from public.merchandise_redemptions where guest_id = g.id and status = 'redeemed';
  if found then
    return jsonb_build_object('status', 'ALREADY_CHOSEN', 'size', coalesce(mr.reserved_size, mr.given_size));
  end if;

  select * into e from public.events where id = g.event_id;
  update public.guests
     set merch_size = p_size, merch_size_chosen_at = now(), merch_size_source = 'guest'
   where id = g.id and merch_size is null
     and (e.merch_size_deadline is null or now() < e.merch_size_deadline);
  if found then
    perform public.audit(g.event_id, 'guest', g.employee_id, 'merch_size_chosen', 'guest', g.id::text,
                         jsonb_build_object('size', p_size));
    return jsonb_build_object('status', 'OK', 'size', p_size);
  end if;

  select merch_size into v_saved from public.guests where id = g.id;
  if v_saved is null then
    return jsonb_build_object('status', 'CLOSED');
  end if;
  if v_saved = p_size then
    return jsonb_build_object('status', 'OK', 'size', v_saved);
  end if;
  return jsonb_build_object('status', 'ALREADY_CHOSEN', 'size', v_saved);
end $$;

-- Pass payload gains event.merch_size_deadline / merch_size_chart / merch_fit_note and a top-level merch_size object.
-- After a redemption, merch_size shows what was reserved at the booth and what was handed over.
create or replace function public.get_pass(p_token text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  g public.guests%rowtype; e public.events%rowtype; ci public.check_ins%rowtype;
  mr public.merchandise_redemptions%rowtype; br public.beverage_redemptions%rowtype;
  v_merch jsonb; v_eff jsonb; v_size jsonb;
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
  select * into br from public.beverage_redemptions where guest_id = g.id and status = 'redeemed';
  v_eff := public.effective_beverage(g.beverage_choice, g.beverage_source, e.beverage_deadline);
  v_size := public.effective_merch_size(g.merch_size, g.merch_size_source, e.merch_size_deadline, e.merch_default_size);
  return jsonb_build_object(
    'status', 'OK',
    'server_now', now(),
    'event', jsonb_build_object('name', e.name, 'date', e.event_date, 'doors_at', e.doors_at,
      'starts_at', e.starts_at, 'ends_at', e.ends_at, 'venue', e.venue, 'maps_url', e.maps_url,
      'beverage_deadline', e.beverage_deadline, 'merch_size_deadline', e.merch_size_deadline,
      'merch_size_chart', e.merch_size_chart, 'merch_fit_note', e.merch_fit_note),
    'guest', jsonb_build_object('full_name', g.full_name, 'nickname', g.nickname, 'outlet', g.outlet,
      'department', g.department, 'position', g.position),
    'invite_token', g.invite_token, 'checked_in', ci.id is not null, 'checked_in_at', ci.checked_in_at,
    'prize_number', ci.prize_number, 'merchandise', v_merch,
    'beverage', jsonb_build_object(
      'choice', coalesce(br.beverage, v_eff ->> 'choice'),
      'source', coalesce(br.source, v_eff ->> 'source'),
      'token', case when br.id is not null or v_eff ->> 'choice' is not null then g.beverage_token end,
      'redeemed', br.id is not null,
      'redeemed_at', br.redeemed_at),
    'merch_size', jsonb_build_object(
      'size', case when mr.id is not null then mr.reserved_size else v_size ->> 'size' end,
      'source', case when mr.id is not null then mr.reserved_source else v_size ->> 'source' end,
      'given_size', mr.given_size));
end $$;

-- Partial update: absent key = unchanged, JSON null = clear (event_date cannot be cleared; a null chart becomes {}).
create or replace function public.set_event_details(p_event uuid, p_details jsonb, p_actor text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  e public.events%rowtype;
  v_date date; v_doors timestamptz; v_starts timestamptz; v_ends timestamptz; v_venue text; v_maps text; v_bev timestamptz;
  v_msd timestamptz; v_mdef text; v_chart jsonb; v_fit boolean;
begin
  select * into e from public.events where id = p_event;
  if not found then return jsonb_build_object('status', 'NOT_FOUND'); end if;
  if jsonb_typeof(p_details) is distinct from 'object' then return jsonb_build_object('status', 'INVALID'); end if;

  v_date   := e.event_date; v_doors := e.doors_at; v_starts := e.starts_at;
  v_ends   := e.ends_at;    v_venue := e.venue;    v_maps   := e.maps_url;
  v_bev    := e.beverage_deadline;
  v_msd    := e.merch_size_deadline; v_mdef := e.merch_default_size; v_chart := e.merch_size_chart; v_fit := e.merch_fit_note;

  if p_details ? 'event_date' then
    if jsonb_typeof(p_details -> 'event_date') <> 'string' then return jsonb_build_object('status', 'INVALID'); end if;
    v_date := (p_details ->> 'event_date')::date;
  end if;
  if p_details ? 'doors_at'  then v_doors  := (p_details ->> 'doors_at')::timestamptz;  end if;
  if p_details ? 'starts_at' then v_starts := (p_details ->> 'starts_at')::timestamptz; end if;
  if p_details ? 'ends_at'   then v_ends   := (p_details ->> 'ends_at')::timestamptz;   end if;
  if p_details ? 'venue'     then v_venue  := nullif(trim(p_details ->> 'venue'), '');   end if;
  if p_details ? 'maps_url'  then v_maps   := nullif(trim(p_details ->> 'maps_url'), ''); end if;
  if p_details ? 'beverage_deadline' then v_bev := (p_details ->> 'beverage_deadline')::timestamptz; end if;
  if p_details ? 'merch_size_deadline' then v_msd := (p_details ->> 'merch_size_deadline')::timestamptz; end if;
  if p_details ? 'merch_default_size' then v_mdef := nullif(p_details ->> 'merch_default_size', ''); end if;
  if p_details ? 'merch_size_chart' then
    v_chart := case when jsonb_typeof(p_details -> 'merch_size_chart') = 'null' then '{}'::jsonb else p_details -> 'merch_size_chart' end;
  end if;
  if p_details ? 'merch_fit_note' then
    if jsonb_typeof(p_details -> 'merch_fit_note') <> 'boolean' then return jsonb_build_object('status', 'INVALID'); end if;
    v_fit := (p_details ->> 'merch_fit_note')::boolean;
  end if;

  if v_maps is not null and v_maps !~* '^https://(www\.google\.com/maps|google\.com/maps|maps\.google\.com|maps\.app\.goo\.gl|goo\.gl/maps)([/?#].*)?$' then
    return jsonb_build_object('status', 'INVALID_MAPS_URL');
  end if;
  if v_mdef is not null and v_mdef not in ('S', 'M', 'L', 'XL', 'XXL') then
    return jsonb_build_object('status', 'INVALID_SIZE');
  end if;
  if not public.valid_size_chart(v_chart) then
    return jsonb_build_object('status', 'INVALID_SIZE_CHART');
  end if;
  if v_msd is not null and v_mdef is null then
    return jsonb_build_object('status', 'DEFAULT_SIZE_REQUIRED');
  end if;
  if v_doors is not null and ((v_starts is not null and v_starts < v_doors) or (v_ends is not null and v_ends <= v_doors)
                              or (v_bev is not null and v_bev >= v_doors) or (v_msd is not null and v_msd >= v_doors)) then
    return jsonb_build_object('status', 'INVALID_TIMES');
  end if;

  update public.events
     set event_date = v_date, doors_at = v_doors, starts_at = v_starts, ends_at = v_ends, venue = v_venue, maps_url = v_maps,
         beverage_deadline = v_bev, merch_size_deadline = v_msd, merch_default_size = v_mdef,
         merch_size_chart = v_chart, merch_fit_note = v_fit
   where id = p_event;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'event_details_updated', 'event', p_event::text,
    jsonb_build_object('keys', (select coalesce(jsonb_agg(k order by k), '[]'::jsonb) from jsonb_object_keys(p_details) k)));
  return jsonb_build_object('status', 'OK');
end $$;

select public.lock_down_public();

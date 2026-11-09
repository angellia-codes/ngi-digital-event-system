-- MC cue card (spec 2026-11-09), part 2: BOD/HOD list, attendance by outlet and department, prize MC lines.

-- Active BOD and HOD guests in protocol order (BOD first), with arrival from check_ins.
create function public.mc_vip(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object('status', 'OK', 'vips', coalesce(jsonb_agg(jsonb_build_object(
      'id', g.id, 'tier', g.vip_tier, 'title', g.vip_title, 'full_name', g.full_name, 'phonetic', g.phonetic,
      'position', g.position, 'outlet', g.outlet, 'protocol_order', g.protocol_order,
      'arrived', c.guest_id is not null, 'arrived_at', c.checked_in_at)
      order by case g.vip_tier when 'BOD' then 0 else 1 end, g.protocol_order nulls last, g.full_name), '[]'::jsonb))
  from public.guests g
  left join public.check_ins c on c.guest_id = g.id
  where g.event_id = p_event and g.active and g.vip_tier is not null
$$;

-- Invited (active guests, walk-ins included) and checked in, per outlet and department.
create function public.mc_pax(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object('status', 'OK', 'rows', coalesce(jsonb_agg(jsonb_build_object(
      'outlet', x.outlet, 'department', x.department, 'invited', x.invited, 'checked_in', x.checked_in)
      order by x.outlet, x.department nulls last), '[]'::jsonb))
  from (
    select g.outlet, nullif(trim(g.department), '') as department,
           count(*) as invited, count(c.guest_id) as checked_in
      from public.guests g
      left join public.check_ins c on c.guest_id = g.id
     where g.event_id = p_event and g.active
     group by g.outlet, nullif(trim(g.department), '')
  ) x
$$;

-- Admin tags a guest as BOD or HOD. All four fields are replaced together; tier null clears the others.
create function public.admin_set_guest_vip(p_event uuid, p_guest_id uuid, p_data jsonb, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_tier text;
  v_title text;
  v_order int;
  v_phonetic text;
begin
  if jsonb_typeof(p_data) is distinct from 'object' then
    return jsonb_build_object('status', 'INVALID');
  end if;
  v_tier := nullif(trim(coalesce(p_data ->> 'vip_tier', '')), '');
  if v_tier is not null and v_tier not in ('BOD', 'HOD') then
    return jsonb_build_object('status', 'INVALID');
  end if;
  if v_tier is not null then
    v_title := nullif(trim(coalesce(p_data ->> 'vip_title', '')), '');
    v_phonetic := nullif(trim(coalesce(p_data ->> 'phonetic', '')), '');
    if length(coalesce(v_title, '')) > 30 or length(coalesce(v_phonetic, '')) > 80 then
      return jsonb_build_object('status', 'INVALID');
    end if;
    if p_data ->> 'protocol_order' is not null then
      if (p_data ->> 'protocol_order') !~ '^[0-9]{1,3}$' then
        return jsonb_build_object('status', 'INVALID');
      end if;
      v_order := (p_data ->> 'protocol_order')::int;
    end if;
  end if;

  update public.guests
     set vip_tier = v_tier, vip_title = v_title, protocol_order = v_order, phonetic = v_phonetic
   where id = p_guest_id and event_id = p_event;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'guest_vip_set', 'guest', p_guest_id::text,
                       jsonb_build_object('tier', v_tier));
  return jsonb_build_object('status', 'OK');
end $$;

-- Optional line the MC reads for a prize (sponsor mention). Empty clears it.
create function public.admin_set_prize_script(p_event uuid, p_prize_id uuid, p_script text, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_script text := nullif(trim(coalesce(p_script, '')), '');
begin
  if length(coalesce(v_script, '')) > 500 then
    return jsonb_build_object('status', 'INVALID');
  end if;
  update public.prizes set mc_script = v_script where id = p_prize_id and event_id = p_event;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'prize_script_set', 'prize', p_prize_id::text,
                       jsonb_build_object('cleared', v_script is null));
  return jsonb_build_object('status', 'OK');
end $$;

-- prize_list gains mc_script (same body as 20261115000002 otherwise).
create or replace function public.prize_list(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object('status', 'OK', 'prizes', coalesce(jsonb_agg(s.x order by s.sort_order, s.name), '[]'::jsonb))
  from (
    select p.sort_order, p.name, jsonb_build_object(
      'id', p.id, 'name', p.name, 'tier', p.tier, 'sort_order', p.sort_order, 'quantity', p.quantity,
      'draw_as_batch', p.draw_as_batch, 'mc_script', p.mc_script,
      'confirmed',    count(d.id) filter (where d.status = 'confirmed'),
      'pending',      count(d.id) filter (where d.status = 'drawn'),
      'no_shows',     count(d.id) filter (where d.status = 'void_no_show'),
      'admin_voids',  count(d.id) filter (where d.status = 'void_admin'),
      'remaining',    p.quantity - count(d.id) filter (where d.status in ('drawn', 'confirmed')),
      'has_draws',    count(d.id) > 0) as x
    from public.prizes p
    left join public.draws d on d.prize_id = p.id
    where p.event_id = p_event
    group by p.id
  ) s
$$;

-- The admin guest list keeps its body under admin_guest_list_core and gains the VIP fields here.
-- A later migration that redefines admin_guest_list must keep calling the _core function (or fold it in).
alter function public.admin_guest_list(uuid, text, text) rename to admin_guest_list_core;

create function public.admin_guest_list(p_event uuid, p_q text, p_outlet text) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object('status', 'OK', 'guests', coalesce((
    select jsonb_agg(t.x || jsonb_build_object(
             'vip_tier', g.vip_tier, 'vip_title', g.vip_title, 'protocol_order', g.protocol_order, 'phonetic', g.phonetic)
             order by t.ord)
      from jsonb_array_elements(public.admin_guest_list_core(p_event, p_q, p_outlet) -> 'guests') with ordinality as t(x, ord)
      join public.guests g on g.id = (t.x ->> 'id')::uuid), '[]'::jsonb))
$$;

select public.lock_down_public();

-- 'admin' when the actor is an email address (an admin using a station screen), otherwise 'station'.
create function public.actor_type_of(p_actor text) returns text
language sql immutable
as $$ select case when position('@' in coalesce(p_actor, '')) > 0 then 'admin' else 'station' end $$;

create function public.prize_list(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object('status', 'OK', 'prizes', coalesce(jsonb_agg(s.x order by s.sort_order, s.name), '[]'::jsonb))
  from (
    select p.sort_order, p.name, jsonb_build_object(
      'id', p.id, 'name', p.name, 'tier', p.tier, 'sort_order', p.sort_order, 'quantity', p.quantity,
      'draw_as_batch', p.draw_as_batch,
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

-- Creates (p_id null) or updates a prize. Only the keys present in p_data change on update.
create function public.admin_save_prize(p_event uuid, p_id uuid, p_data jsonb, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  pr public.prizes%rowtype;
  v_name text;
  v_tier text;
  v_qty int;
  v_sort int;
  v_batch boolean;
  v_max_slot int;
  v_has_draws boolean;
begin
  if jsonb_typeof(p_data) is distinct from 'object' then
    return jsonb_build_object('status', 'INVALID');
  end if;

  if jsonb_exists(p_data, 'quantity') then
    if coalesce(p_data->>'quantity', '') !~ '^[0-9]{1,3}$' or (p_data->>'quantity')::int not between 1 and 500 then
      return jsonb_build_object('status', 'INVALID');
    end if;
    v_qty := (p_data->>'quantity')::int;
  end if;
  if jsonb_exists(p_data, 'sort_order') then
    if coalesce(p_data->>'sort_order', '') !~ '^[0-9]{1,6}$' then
      return jsonb_build_object('status', 'INVALID');
    end if;
    v_sort := (p_data->>'sort_order')::int;
  end if;
  if jsonb_exists(p_data, 'draw_as_batch') then
    if jsonb_typeof(p_data->'draw_as_batch') is distinct from 'boolean' then
      return jsonb_build_object('status', 'INVALID');
    end if;
    v_batch := (p_data->>'draw_as_batch')::boolean;
  end if;
  if jsonb_exists(p_data, 'name') then
    v_name := nullif(trim(coalesce(p_data->>'name', '')), '');
    if v_name is null or length(v_name) > 80 then
      return jsonb_build_object('status', 'INVALID');
    end if;
  end if;
  if jsonb_exists(p_data, 'tier') then
    v_tier := nullif(trim(coalesce(p_data->>'tier', '')), '');
    if length(coalesce(v_tier, '')) > 30 then
      return jsonb_build_object('status', 'INVALID');
    end if;
  end if;

  if p_id is null then
    if v_name is null then
      return jsonb_build_object('status', 'INVALID');
    end if;
    insert into public.prizes (event_id, name, tier, sort_order, quantity, draw_as_batch)
    values (p_event, v_name, v_tier,
            coalesce(v_sort, (select coalesce(max(sort_order), 0) + 10 from public.prizes where event_id = p_event)),
            coalesce(v_qty, 1), coalesce(v_batch, false))
    returning * into pr;
    perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'prize_created', 'prize', pr.id::text,
                         jsonb_build_object('name', pr.name, 'quantity', pr.quantity));
    return jsonb_build_object('status', 'OK', 'id', pr.id);
  end if;

  select * into pr from public.prizes where id = p_id and event_id = p_event for update;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  select coalesce(max(slot), 0), count(*) > 0 into v_max_slot, v_has_draws
    from public.draws where prize_id = pr.id and status in ('drawn', 'confirmed');
  if v_qty is not null and v_qty < v_max_slot then
    return jsonb_build_object('status', 'QUANTITY_TOO_LOW');
  end if;
  if v_batch is not null and v_batch is distinct from pr.draw_as_batch
     and exists (select 1 from public.draws where prize_id = pr.id) then
    return jsonb_build_object('status', 'LOCKED_BY_DRAWS');
  end if;

  update public.prizes set
    name          = coalesce(v_name, name),
    tier          = case when jsonb_exists(p_data, 'tier') then v_tier else tier end,
    sort_order    = coalesce(v_sort, sort_order),
    quantity      = coalesce(v_qty, quantity),
    draw_as_batch = coalesce(v_batch, draw_as_batch)
   where id = pr.id;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'prize_updated', 'prize', pr.id::text,
                       jsonb_build_object('fields', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(p_data) k)));
  return jsonb_build_object('status', 'OK', 'id', pr.id);
exception when unique_violation then
  return jsonb_build_object('status', 'NAME_IN_USE');
end $$;

create function public.admin_delete_prize(p_event uuid, p_id uuid, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  pr public.prizes%rowtype;
begin
  select * into pr from public.prizes where id = p_id and event_id = p_event for update;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  if exists (select 1 from public.draws where prize_id = pr.id) then
    return jsonb_build_object('status', 'HAS_DRAWS');
  end if;
  delete from public.prizes where id = pr.id;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'prize_deleted', 'prize', pr.id::text,
                       jsonb_build_object('name', pr.name));
  return jsonb_build_object('status', 'OK');
end $$;

select public.lock_down_public();

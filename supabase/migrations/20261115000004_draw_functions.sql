-- Operator view of one round: latest row per slot, WITH names. Never sent to the projector.
create function public.round_json(p_event uuid, p_round uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object(
    'round_id', p_round,
    'prize', jsonb_build_object('id', pr.id, 'name', pr.name, 'tier', pr.tier, 'quantity', pr.quantity, 'batch', pr.draw_as_batch),
    'pending', (select count(*) from public.draws d where d.event_id = p_event and d.round_id = p_round and d.status = 'drawn'),
    'draws', (
      select coalesce(jsonb_agg(x.j order by x.slot), '[]'::jsonb)
      from (
        select distinct on (d.slot) d.slot,
               jsonb_build_object('id', d.id, 'slot', d.slot, 'status', d.status, 'number', c.prize_number,
                                  'name', g.full_name, 'outlet', g.outlet, 'department', g.department,
                                  'drawn_at', d.drawn_at, 'redraw_of', d.redraw_of) as j
          from public.draws d
          join public.check_ins c on c.guest_id = d.winner_guest_id
          join public.guests g on g.id = d.winner_guest_id
         where d.event_id = p_event and d.round_id = p_round
         order by d.slot, d.sequence desc
      ) x))
  from public.prizes pr
  where pr.id = (select d.prize_id from public.draws d where d.event_id = p_event and d.round_id = p_round limit 1)
$$;

create function public.draw_prize(p_event uuid, p_prize_id uuid, p_request_id uuid, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  pr public.prizes%rowtype;
  v_prev public.draws%rowtype;
  v_round uuid;
  v_free int[];
  v_slots int[];
  v_picked uuid[];
  v_need int;
  v_short int;
  i int;
begin
  if p_request_id is null then
    return jsonb_build_object('status', 'INVALID');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('draw:' || p_event::text, 0));

  -- 1. A retry of the same request returns the same draw.
  select d.round_id into v_round from public.draws d where d.event_id = p_event and d.request_group = p_request_id limit 1;
  if found then
    return jsonb_build_object('status', 'DRAWN', 'idempotent', true, 'short_by', 0) || public.round_json(p_event, v_round);
  end if;

  -- 2. One unresolved draw at a time, for the whole event.
  select d.round_id into v_round from public.draws d where d.event_id = p_event and d.status = 'drawn' limit 1;
  if found then
    return jsonb_build_object('status', 'DRAW_IN_PROGRESS', 'round_id', v_round);
  end if;

  select * into pr from public.prizes where id = p_prize_id and event_id = p_event for update;
  if not found then
    return jsonb_build_object('status', 'PRIZE_NOT_FOUND');
  end if;

  select coalesce(array_agg(s order by s), '{}') into v_free
    from generate_series(1, pr.quantity) s
   where not exists (select 1 from public.draws d where d.prize_id = pr.id and d.slot = s and d.status in ('drawn', 'confirmed'));
  if cardinality(v_free) = 0 then
    return jsonb_build_object('status', 'PRIZE_COMPLETE');
  end if;
  v_need := case when pr.draw_as_batch then cardinality(v_free) else 1 end;
  v_slots := v_free[1:v_need];

  -- 3. Pool: checked in, active, no live win. Someone who was a no-show for this very slot is skipped for that slot.
  select coalesce(array_agg(guest_id order by rn), '{}') into v_picked
    from (
      select c.guest_id, row_number() over (order by gen_random_uuid()) as rn
        from public.check_ins c
        join public.guests gu on gu.id = c.guest_id
       where c.event_id = p_event and gu.active
         and not exists (select 1 from public.draws d
                          where d.winner_guest_id = c.guest_id and d.status in ('drawn', 'confirmed'))
         and not exists (select 1 from public.draws d
                          where d.winner_guest_id = c.guest_id and d.prize_id = pr.id
                            and d.slot = any (v_slots) and d.status in ('void_no_show', 'void_admin'))
    ) pool
   where rn <= v_need;
  if cardinality(v_picked) = 0 then
    return jsonb_build_object('status', 'NO_ELIGIBLE_GUESTS');
  end if;
  v_short := v_need - cardinality(v_picked);

  -- 4. A redraw stays in the round of the slot it replaces.
  select d.round_id into v_round from public.draws d
   where d.prize_id = pr.id and d.slot = any (v_slots[1:cardinality(v_picked)]) and d.status in ('void_no_show', 'void_admin')
   order by d.sequence desc limit 1;
  v_round := coalesce(v_round, gen_random_uuid());

  for i in 1 .. cardinality(v_picked) loop
    select * into v_prev from public.draws d where d.prize_id = pr.id and d.slot = v_slots[i] order by d.sequence desc limit 1;
    insert into public.draws (event_id, prize_id, slot, winner_guest_id, status, request_id, request_group, round_id, redraw_of, drawn_by)
    values (p_event, pr.id, v_slots[i], v_picked[i], 'drawn', gen_random_uuid(), p_request_id, v_round,
            case when found then v_prev.id end, p_actor);
  end loop;

  perform public.stage_publish(p_event, v_round);
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'draw', 'prize', pr.id::text,
                       jsonb_build_object('round_id', v_round, 'slots', to_jsonb(v_slots[1:cardinality(v_picked)]), 'short_by', v_short));
  return jsonb_build_object('status', 'DRAWN', 'idempotent', false, 'short_by', v_short) || public.round_json(p_event, v_round);
end $$;

-- What the operator phone polls every 2 seconds.
create function public.draw_current(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  v_round uuid;
  v_stage jsonb := public.get_stage(p_event);
begin
  select d.round_id into v_round from public.draws d where d.event_id = p_event order by d.sequence desc limit 1;
  return jsonb_build_object(
    'status', 'OK',
    'round', case when v_round is null then null else public.round_json(p_event, v_round) end,
    'oldest_pending_at', (select min(d.drawn_at) from public.draws d where d.event_id = p_event and d.status = 'drawn'),
    'stage', jsonb_build_object('rev', v_stage->'rev', 'phase', v_stage->'phase', 'options', v_stage->'options'),
    'heartbeat_age', public.stage_heartbeat_age(p_event));
end $$;

-- Prize verification: who holds this Door Prize number, and did they win?
create function public.lookup_prize_number(p_event uuid, p_number int) returns jsonb
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  c record;
  w record;
begin
  select ci.guest_id, ci.prize_number, g.full_name, g.outlet, g.department into c
    from public.check_ins ci join public.guests g on g.id = ci.guest_id
   where ci.event_id = p_event and ci.prize_number = p_number;
  if not found then
    return jsonb_build_object('status', 'NO_SUCH_NUMBER');
  end if;
  select d.id, d.status, d.slot, pr.id as prize_id, pr.name as prize_name, pr.tier, pr.quantity into w
    from public.draws d join public.prizes pr on pr.id = d.prize_id
   where d.winner_guest_id = c.guest_id and d.status in ('drawn', 'confirmed')
   limit 1;
  if not found then
    return jsonb_build_object('status', 'NOT_A_WINNER', 'number', c.prize_number, 'name', c.full_name,
                              'outlet', c.outlet, 'department', c.department);
  end if;
  return jsonb_build_object(
    'status', case when w.status = 'confirmed' then 'WINNER' else 'PENDING' end,
    'number', c.prize_number, 'name', c.full_name, 'outlet', c.outlet, 'department', c.department,
    'draw_id', w.id, 'slot', w.slot,
    'prize', jsonb_build_object('id', w.prize_id, 'name', w.prize_name, 'tier', w.tier, 'quantity', w.quantity));
end $$;

select public.lock_down_public();

create function public.resolve_draw(p_event uuid, p_draw_id uuid, p_outcome text, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  d public.draws%rowtype;
  v_status text;
begin
  if p_outcome not in ('confirm', 'no_show') then
    return jsonb_build_object('status', 'INVALID');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('draw:' || p_event::text, 0));
  select * into d from public.draws where id = p_draw_id and event_id = p_event for update;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;

  if d.status = 'confirmed' then
    return jsonb_build_object('status', 'ALREADY_CONFIRMED', 'draw_id', d.id) || public.round_json(p_event, d.round_id);
  elsif d.status = 'void_admin' or (d.status = 'void_no_show' and p_outcome = 'confirm') then
    return jsonb_build_object('status', 'DRAW_VOID', 'draw_id', d.id) || public.round_json(p_event, d.round_id);
  elsif d.status = 'void_no_show' then
    return jsonb_build_object('status', 'VOIDED', 'draw_id', d.id) || public.round_json(p_event, d.round_id);
  end if;

  if p_outcome = 'confirm' then
    update public.draws set status = 'confirmed', resolved_at = now(), resolved_by = p_actor where id = d.id;
    v_status := 'CONFIRMED';
  else
    update public.draws set status = 'void_no_show', resolved_at = now(), resolved_by = p_actor, void_reason = 'no_show' where id = d.id;
    v_status := 'VOIDED';
  end if;
  perform public.stage_publish(p_event, d.round_id);
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor,
                       case when p_outcome = 'confirm' then 'draw_confirm' else 'draw_no_show' end,
                       'draw', d.id::text, jsonb_build_object('prize_id', d.prize_id, 'slot', d.slot));
  return jsonb_build_object('status', v_status, 'draw_id', d.id) || public.round_json(p_event, d.round_id);
end $$;

-- "Konfirmasi semua": confirm every unresolved tile of a batch round in one tap.
create function public.resolve_round(p_event uuid, p_round uuid, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_n int;
begin
  perform pg_advisory_xact_lock(hashtextextended('draw:' || p_event::text, 0));
  update public.draws set status = 'confirmed', resolved_at = now(), resolved_by = p_actor
   where event_id = p_event and round_id = p_round and status = 'drawn';
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return jsonb_build_object('status', 'NOTHING_TO_CONFIRM');
  end if;
  perform public.stage_publish(p_event, p_round);
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'draw_confirm_round', 'round', p_round::text,
                       jsonb_build_object('confirmed', v_n));
  return jsonb_build_object('status', 'CONFIRMED', 'confirmed', v_n) || public.round_json(p_event, p_round);
end $$;

-- Reverses a draw (confirmed or not). Admin only; the reason is mandatory. The stage returns to idle if it was showing that round.
create function public.admin_void_draw(p_event uuid, p_draw_id uuid, p_reason text, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  d public.draws%rowtype;
begin
  if p_reason is null or length(btrim(p_reason)) < 5 then
    return jsonb_build_object('status', 'REASON_REQUIRED');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('draw:' || p_event::text, 0));
  select * into d from public.draws where id = p_draw_id and event_id = p_event for update;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  if d.status in ('void_no_show', 'void_admin') then
    return jsonb_build_object('status', 'NOT_VOIDABLE');
  end if;
  update public.draws
     set status = 'void_admin', void_reason = btrim(p_reason), resolved_at = now(), resolved_by = p_actor
   where id = d.id;
  if (select s.payload->>'round_id' from public.stage_state s where s.event_id = p_event) = d.round_id::text then
    perform public.stage_write(p_event, 'idle', '{}'::jsonb);
  end if;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'draw_void_admin', 'draw', d.id::text,
                       jsonb_build_object('prize_id', d.prize_id, 'slot', d.slot, 'was', d.status, 'reason', btrim(p_reason)));
  return jsonb_build_object('status', 'OK', 'draw_id', d.id);
end $$;

select public.lock_down_public();

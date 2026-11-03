-- Expose the guest's nickname on the pass so the invitation can greet them by it.
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
    'guest', jsonb_build_object('full_name', g.full_name, 'nickname', g.nickname, 'outlet', g.outlet,
      'department', g.department, 'position', g.position),
    'invite_token', g.invite_token, 'checked_in', ci.id is not null, 'checked_in_at', ci.checked_in_at,
    'prize_number', ci.prize_number, 'merchandise', v_merch);
end $$;

select public.lock_down_public();

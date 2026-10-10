import { db, RetryableError, rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { buildInvitationsCsv, type InviteRow } from '@/lib/invitations';
import { actorId, adminGet } from '@/lib/routes';

export const GET = adminGet(async ({ req, actor }) => {
  const outlet = (new URL(req.url).searchParams.get('outlet') ?? '').slice(0, 120);
  let query = db()
    .from('guests')
    .select('employee_id, full_name, outlet, phone, invite_token')
    .eq('event_id', env().EVENT_ID).eq('active', true).eq('is_walk_in', false);
  if (outlet) query = query.eq('outlet', outlet);
  const { data, error } = await query.order('full_name');
  if (error) throw new RetryableError('invitations');
  await rpc('audit', {
    p_event: env().EVENT_ID, p_actor_type: 'admin', p_actor: actorId(actor), p_action: 'invitations_exported',
    p_entity: 'event', p_entity_id: env().EVENT_ID, p_details: { rows: data.length, outlet: outlet || null },
  });
  return new Response(buildInvitationsCsv(data as InviteRow[], env().APP_URL), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="nourishfest-invitations.csv"',
      'Cache-Control': 'no-store',
    },
  });
});

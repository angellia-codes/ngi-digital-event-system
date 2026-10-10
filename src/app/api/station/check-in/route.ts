import { ok } from '@/lib/api';
import { codeInput, resolveCode } from '@/lib/code-input';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, actorLabel, stationPost } from '@/lib/routes';

export const POST = stationPost(['checkin'], codeInput, async ({ actor, body }) => {
  const c = await resolveCode(body, 'checkin', 'checkin', actorId(actor));
  if ('response' in c) return c.response;
  const r = await rpc<{ status: string }>('check_in', {
    p_event: env().EVENT_ID, p_token: c.token, p_guest_id: body.guest_id ?? null,
    p_method: body.code ? 'scan' : 'manual', p_station_label: actorLabel(actor), p_actor: actorId(actor),
  });
  return ok(r.status, r);
});

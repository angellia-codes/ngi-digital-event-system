import { ok } from '@/lib/api';
import { codeInput, resolveCode } from '@/lib/code-input';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, stationPost } from '@/lib/routes';

export const POST = stationPost(['bar'], codeInput, async ({ actor, body }) => {
  const c = await resolveCode(body, 'beverage', 'beverage', actorId(actor));
  if ('response' in c) return c.response;
  const r = await rpc<{ status: string }>('beverage_lookup', {
    p_event: env().EVENT_ID, p_token: c.token, p_guest_id: body.guest_id ?? null, p_actor: actorId(actor),
  });
  return ok(r.status, r);
});

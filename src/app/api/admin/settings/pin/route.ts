import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { ROLES } from '@/lib/session';
import { actorId, adminPost } from '@/lib/routes';

export const POST = adminPost(z.object({ role: z.enum(ROLES), pin: z.string().max(20) }), async ({ actor, body }) => {
  const r = await rpc<{ status: string }>('set_station_pin', {
    p_event: env().EVENT_ID, p_role: body.role, p_pin: body.pin, p_actor: actorId(actor),
  });
  return ok(r.status);
});

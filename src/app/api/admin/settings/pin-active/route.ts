import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { ROLES } from '@/lib/session';
import { actorId, adminPost } from '@/lib/routes';

export const POST = adminPost(z.object({ role: z.enum(ROLES), active: z.boolean() }), async ({ actor, body }) => {
  const r = await rpc<{ status: string }>('set_station_active', {
    p_event: env().EVENT_ID, p_role: body.role, p_active: body.active, p_actor: actorId(actor),
  });
  return ok(r.status);
});

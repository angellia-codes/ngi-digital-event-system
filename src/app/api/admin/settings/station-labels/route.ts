import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminPost } from '@/lib/routes';

export const POST = adminPost(z.object({ labels: z.array(z.string().max(60)).max(40) }), async ({ actor, body }) => {
  const r = await rpc<{ status: string }>('set_station_labels', {
    p_event: env().EVENT_ID, p_labels: body.labels, p_actor: actorId(actor),
  });
  return ok(r.status);
});

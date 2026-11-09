import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminPost } from '@/lib/routes';

const schema = z.object({ segment_id: z.string().uuid(), reason: z.string().max(200) });

/** Admin correction after a mistaken NEXT, or a jump. Reason required (at least 5 characters, checked in SQL). */
export const POST = adminPost(schema, async ({ actor, body }) => {
  const r = await rpc<{ status: string }>('mc_set_current', {
    p_event: env().EVENT_ID, p_segment: body.segment_id, p_reason: body.reason, p_actor: actorId(actor),
  });
  return ok(r.status, r);
});

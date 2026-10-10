import { z } from 'zod';
import { fail, ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminPost } from '@/lib/routes';

export const POST = adminPost(z.object({ reason: z.string().max(200) }), async ({ actor, body, params }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return fail(400, 'BAD_INPUT');
  const r = await rpc<{ status: string }>('void_redemption', {
    p_event: env().EVENT_ID, p_redemption_id: id.data, p_reason: body.reason, p_actor: actorId(actor),
  });
  return ok(r.status);
});

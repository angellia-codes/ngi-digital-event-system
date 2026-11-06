import { z } from 'zod';
import { fail, ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminPost } from '@/lib/routes';

const Body = z.object({ choice: z.enum(['beer', 'soft_drink']), reason: z.string().max(200) });

export const POST = adminPost(Body, async ({ actor, body, params }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return fail(400, 'BAD_INPUT');
  const r = await rpc<{ status: string }>('admin_set_beverage', {
    p_event: env().EVENT_ID, p_guest_id: id.data, p_choice: body.choice, p_reason: body.reason, p_actor: actorId(actor),
  });
  return ok(r.status);
});

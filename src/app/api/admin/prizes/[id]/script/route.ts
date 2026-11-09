import { z } from 'zod';
import { fail, ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminPost } from '@/lib/routes';

export const POST = adminPost(z.object({ mc_script: z.string().max(500).nullable() }), async ({ actor, body, params }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return fail(400, 'BAD_INPUT');
  const r = await rpc<{ status: string }>('admin_set_prize_script', {
    p_event: env().EVENT_ID, p_prize_id: id.data, p_script: body.mc_script, p_actor: actorId(actor),
  });
  return ok(r.status);
});

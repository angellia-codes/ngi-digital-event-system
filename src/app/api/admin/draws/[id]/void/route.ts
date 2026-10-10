import { z } from 'zod';
import { fail, ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminPost } from '@/lib/routes';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = adminPost(z.object({ reason: z.string().max(200) }), async ({ actor, body, params }) => {
  if (!UUID.test(params.id ?? '')) return fail(400, 'BAD_INPUT');
  const r = await rpc<{ status: string }>('admin_void_draw', {
    p_event: env().EVENT_ID, p_draw_id: params.id, p_reason: body.reason, p_actor: actorId(actor),
  });
  return ok(r.status, r);
});

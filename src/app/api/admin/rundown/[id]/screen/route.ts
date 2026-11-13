import { z } from 'zod';
import { fail, ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminPost } from '@/lib/routes';
import { SCREEN_KEYS } from '@/lib/screens';

/** The suggested screen of one rundown segment (null clears it): "Up next" on the Screen Control panel. */
export const POST = adminPost(z.object({ screen: z.enum(SCREEN_KEYS).nullable() }), async ({ actor, body, params }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return fail(400, 'BAD_INPUT');
  const r = await rpc<{ status: string }>('admin_set_segment_screen', {
    p_event: env().EVENT_ID, p_segment: id.data, p_screen: body.screen, p_actor: actorId(actor),
  });
  return ok(r.status);
});

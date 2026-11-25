import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminPost } from '@/lib/routes';
import { STAGE_VIDEO_KEYS } from '@/lib/stage-videos';

// { video: 'neon_city' } plays that loop; { video: null } stops it.
const schema = z.object({ video: z.enum(STAGE_VIDEO_KEYS).nullable() }).strict();

export const POST = adminPost(schema, async ({ actor, body }) => {
  const r = await rpc<{ status: string }>('set_stage_video', { p_event: env().EVENT_ID, p_key: body.video, p_actor: actorId(actor) });
  return ok(r.status, r);
});

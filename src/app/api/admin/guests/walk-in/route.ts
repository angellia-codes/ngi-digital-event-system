import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { passUrl } from '@/lib/invitations';
import { actorId, adminPost } from '@/lib/routes';

const Body = z.object({
  full_name: z.string().max(120), outlet: z.string().max(120),
  department: z.string().max(120).optional(), position: z.string().max(120).optional(),
});

export const POST = adminPost(Body, async ({ actor, body }) => {
  const r = await rpc<{ status: string; invite_token?: string }>('add_walk_in', {
    p_event: env().EVENT_ID, p_full_name: body.full_name, p_outlet: body.outlet,
    p_department: body.department ?? null, p_position: body.position ?? null, p_actor: actorId(actor),
  });
  if (r.status !== 'OK' || !r.invite_token) return ok(r.status);
  return ok('OK', { ...r, pass_url: passUrl(env().APP_URL, r.invite_token) });
});

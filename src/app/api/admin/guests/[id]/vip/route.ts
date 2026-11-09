import { z } from 'zod';
import { fail, ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminPost } from '@/lib/routes';

const Body = z.object({
  vip_tier: z.enum(['BOD', 'HOD']).nullable(),
  vip_title: z.string().max(30).nullable(),
  protocol_order: z.number().int().min(0).max(999).nullable(),
  phonetic: z.string().max(80).nullable(),
});

export const POST = adminPost(Body, async ({ actor, body, params }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return fail(400, 'BAD_INPUT');
  const r = await rpc<{ status: string }>('admin_set_guest_vip', {
    p_event: env().EVENT_ID, p_guest_id: id.data,
    p_data: { ...body, protocol_order: body.protocol_order === null ? null : String(body.protocol_order) },
    p_actor: actorId(actor),
  });
  return ok(r.status);
});

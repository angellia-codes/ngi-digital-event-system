import { z } from 'zod';
import { fail, ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminPost } from '@/lib/routes';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = adminPost(z.object({}), async ({ actor, params }) => {
  if (!UUID.test(params.id ?? '')) return fail(400, 'BAD_INPUT');
  const r = await rpc<{ status: string }>('admin_delete_prize', { p_event: env().EVENT_ID, p_id: params.id, p_actor: actorId(actor) });
  return ok(r.status, r);
});

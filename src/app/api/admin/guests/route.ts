import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { normalisePhone } from '@/lib/phone';
import { actorId, adminGet, adminPost } from '@/lib/routes';

export const GET = adminGet(async ({ req }) => {
  const u = new URL(req.url);
  const r = await rpc<{ guests: unknown[] }>('admin_guest_list', {
    p_event: env().EVENT_ID, p_q: (u.searchParams.get('q') ?? '').slice(0, 80), p_outlet: (u.searchParams.get('outlet') ?? '').slice(0, 120),
  });
  return ok('OK', r);
});

const Update = z.object({
  guest_id: z.string().uuid(),
  changes: z
    .object({
      full_name: z.string().max(120).optional(),
      outlet: z.string().max(120).optional(),
      department: z.string().max(120).nullable().optional(),
      position: z.string().max(120).nullable().optional(),
      phone: z.string().max(40).nullable().optional(),
      active: z.boolean().optional(),
    })
    .strict(),
});

export const POST = adminPost(Update, async ({ actor, body }) => {
  const changes: Record<string, unknown> = { ...body.changes };
  if ('phone' in changes) {
    const p = normalisePhone(changes.phone as string | null);
    if (!p.ok) return ok('INVALID_PHONE');
    changes.phone = p.value;
  }
  const r = await rpc<{ status: string }>('admin_update_guest', {
    p_event: env().EVENT_ID, p_guest_id: body.guest_id, p_changes: changes, p_actor: actorId(actor),
  });
  return ok(r.status);
});

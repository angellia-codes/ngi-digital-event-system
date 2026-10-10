import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { adminGet } from '@/lib/routes';

export const GET = adminGet(async ({ req }) => {
  const q = new URL(req.url).searchParams;
  const before = Number(q.get('before'));
  const limit = Number(q.get('limit'));
  const r = await rpc<{ rows: unknown[] }>('admin_audit_list', {
    p_event: env().EVENT_ID,
    p_before: Number.isInteger(before) && before > 0 ? before : null,
    p_limit: Number.isInteger(limit) && limit > 0 ? limit : 100,
  });
  return ok('OK', { rows: r.rows });
});

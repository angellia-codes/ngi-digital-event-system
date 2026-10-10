import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { adminGet } from '@/lib/routes';

export const GET = adminGet(async () => {
  const r = await rpc<{ draws: unknown[] }>('admin_draw_list', { p_event: env().EVENT_ID });
  return ok('OK', { draws: r.draws });
});

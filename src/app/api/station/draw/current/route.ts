import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { stationGet } from '@/lib/routes';

export const GET = stationGet(['draw', 'prizes'], async () => {
  const r = await rpc<Record<string, unknown>>('draw_current', { p_event: env().EVENT_ID });
  return ok('OK', r);
});

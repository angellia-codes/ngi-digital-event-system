import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { stationGet } from '@/lib/routes';

export const GET = stationGet(['checkin', 'merchandise'], async ({ req }) => {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  const r = await rpc<{ status: string; guests: unknown[] }>('find_guests', { p_event: env().EVENT_ID, p_q: q.slice(0, 60) });
  return ok('OK', { guests: r.guests });
});

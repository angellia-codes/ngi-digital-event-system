import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { stationGet } from '@/lib/routes';

export const GET = stationGet(['merchandise'], async () => {
  const c = await rpc<{ redeemed: number; checked_in: number }>('event_counts', { p_event: env().EVENT_ID });
  return ok('OK', { redeemed: c.redeemed, checked_in: c.checked_in });
});

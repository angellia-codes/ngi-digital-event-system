import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { stationGet } from '@/lib/routes';

/** Counts per size for the booth's stock strip (merch size spec §4.2). */
export const GET = stationGet(['merchandise'], async () =>
  ok('OK', await rpc<Record<string, unknown>>('merch_size_summary', { p_event: env().EVENT_ID })));

import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { stationGet } from '@/lib/routes';

export const GET = stationGet(['bar'], async () =>
  ok('OK', await rpc<Record<string, unknown>>('beverage_summary', { p_event: env().EVENT_ID })));

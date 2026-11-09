import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { stationGet } from '@/lib/routes';

export const GET = stationGet(['mc'], async () => ok('OK', await rpc('mc_state', { p_event: env().EVENT_ID })));

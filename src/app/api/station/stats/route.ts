import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { stationGet } from '@/lib/routes';
import { ROLES } from '@/lib/session';

export const GET = stationGet(ROLES, async () => ok('OK', await rpc('event_counts', { p_event: env().EVENT_ID })));

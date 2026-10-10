import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { adminGet } from '@/lib/routes';

export const GET = adminGet(async () => ok('OK', await rpc<Record<string, unknown>>('admin_dashboard', { p_event: env().EVENT_ID })));

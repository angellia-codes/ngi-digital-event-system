import { ok } from '@/lib/api';
import { stationLabels } from '@/lib/labels';
import { stationGet } from '@/lib/routes';
import { ROLES } from '@/lib/session';

export const GET = stationGet(ROLES, async ({ actor }) => {
  const labels = await stationLabels();
  return ok('OK', actor.type === 'station'
    ? { role: actor.role, label: actor.label, labels }
    : { role: 'admin', label: 'admin', labels });
});

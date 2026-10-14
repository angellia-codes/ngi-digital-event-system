import { ok } from '@/lib/api';
import { db, RetryableError } from '@/lib/db';
import { env } from '@/lib/env';
import { stationLabels } from '@/lib/labels';
import { ROLES } from '@/lib/session';
import { adminGet } from '@/lib/routes';

export const GET = adminGet(async () => {
  const [{ data: ev, error: e1 }, { data: pins, error: e2 }, labels] = await Promise.all([
    db().from('events').select('name, event_date, mode, doors_at, starts_at, ends_at, venue, maps_url').eq('id', env().EVENT_ID).single(),
    db().from('station_pins').select('role, active, updated_at').eq('event_id', env().EVENT_ID),
    stationLabels(),
  ]);
  if (e1 || e2 || !ev) throw new RetryableError('settings');
  const byRole = new Map((pins ?? []).map((p) => [p.role, p]));
  return ok('OK', {
    event: {
      name: ev.name, event_date: ev.event_date, doors_at: ev.doors_at, starts_at: ev.starts_at,
      ends_at: ev.ends_at, venue: ev.venue, maps_url: ev.maps_url,
    },
    mode: ev.mode,
    station_labels: labels,
    pins: ROLES.map((role) => ({
      role, is_set: byRole.has(role), active: byRole.get(role)?.active ?? false, updated_at: byRole.get(role)?.updated_at ?? null,
    })),
  });
});

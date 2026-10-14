import { z } from 'zod';
import { fail, ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { isMapsUrl } from '@/lib/invite/maps';
import { actorId, adminPost } from '@/lib/routes';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable();

const Body = z.object({
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  doors_at: hhmm,
  starts_at: hhmm,
  ends_at: hhmm,
  venue: z.string().max(120).nullable(),
  maps_url: z.string().max(500).nullable(),
}).partial();

/** Times arrive as HH:mm in WITA; combine with the event date and store with +08:00. */
export const POST = adminPost(Body, async ({ actor, body }) => {
  if (body.maps_url && !isMapsUrl(body.maps_url)) return fail(400, 'INVALID_MAPS_URL');
  const { event_date, doors_at, starts_at, ends_at, ...rest } = body;
  const times = { doors_at, starts_at, ends_at };
  const needsDate = Object.values(times).some((v) => v);
  if (needsDate && !event_date) return fail(400, 'BAD_INPUT'); // client always sends the date with times
  const details: Record<string, unknown> = { ...rest };
  if (event_date) details.event_date = event_date;
  for (const [k, v] of Object.entries(times)) {
    if (v !== undefined) details[k] = v === null ? null : `${event_date}T${v}:00+08:00`;
  }
  const r = await rpc<{ status: string }>('set_event_details', {
    p_event: env().EVENT_ID, p_details: details, p_actor: actorId(actor),
  });
  return ok(r.status);
});

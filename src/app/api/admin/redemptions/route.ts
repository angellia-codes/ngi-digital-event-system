import { ok } from '@/lib/api';
import { db, RetryableError } from '@/lib/db';
import { env } from '@/lib/env';
import { adminGet } from '@/lib/routes';

export const GET = adminGet(async () => {
  const { data: reds, error } = await db()
    .from('merchandise_redemptions')
    .select('id, guest_id, status, redeemed_at, station_label, void_reason')
    .eq('event_id', env().EVENT_ID)
    .order('redeemed_at', { ascending: false })
    .limit(500);
  if (error) throw new RetryableError('redemptions');
  const ids = [...new Set(reds.map((r) => r.guest_id))];
  const { data: guests, error: e2 } = ids.length
    ? await db().from('guests').select('id, employee_id, full_name, outlet').in('id', ids)
    : { data: [], error: null };
  if (e2) throw new RetryableError('redemptions');
  const byId = new Map((guests ?? []).map((g) => [g.id, g]));
  return ok('OK', { redemptions: reds.map(({ guest_id, ...r }) => ({ ...r, guest: byId.get(guest_id) ?? null })) });
});

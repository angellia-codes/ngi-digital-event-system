import { checkInViaDb, EVENT, prepare, svc, type E2eGuest } from './helpers';

export const STAGE_KEY = 'e2e-stage-key-0123456789abcdef';
export type PrizeSpec = { name: string; tier?: string; quantity?: number; draw_as_batch?: boolean };
export type StageOpts = { safe_mode: boolean; reduce_effects: boolean; language: 'id' | 'en' };

/**
 * An empty rehearsal event with `guestCount` guests already checked in (prize numbers 1..n), the given prizes,
 * a known stage key and default stage options. Returns the guests.
 */
export async function prepareDraw(guestCount: number, prizes: PrizeSpec[], options: Partial<StageOpts> = {}): Promise<E2eGuest[]> {
  const guests = await prepare(guestCount); // resets the event: no draws, no check-ins, stage back to idle
  const s = svc();
  const del = await s.from('prizes').delete().eq('event_id', EVENT);
  if (del.error) throw del.error;
  for (const g of guests) await checkInViaDb(g);
  for (const p of prizes) {
    const r = await s.rpc('admin_save_prize', { p_event: EVENT, p_id: null, p_data: p, p_actor: 'e2e' });
    if (r.error || r.data?.status !== 'OK') throw new Error(`prize setup failed: ${p.name}`);
  }
  const key = await s.rpc('set_stage_key', { p_event: EVENT, p_key: STAGE_KEY, p_actor: 'e2e' });
  if (key.error || key.data?.status !== 'OK') throw new Error('stage key setup failed');
  const opts: StageOpts = { safe_mode: false, reduce_effects: false, language: 'en', ...options };
  const set = await s.rpc('set_stage_options', { p_event: EVENT, p_options: opts, p_actor: 'e2e' });
  if (set.error || set.data?.status !== 'OK') throw new Error('stage options setup failed');
  return guests;
}

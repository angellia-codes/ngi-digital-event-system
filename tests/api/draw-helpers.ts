import { expect } from 'vitest';
import { EVENT, svc, type TestGuest } from './helpers';

/** Checks every guest in through the real function, so each gets a Door Prize number. */
export async function arrive(guests: TestGuest[]) {
  for (const g of guests) {
    const { data, error } = await svc().rpc('check_in', {
      p_event: EVENT, p_token: g.invite_token, p_guest_id: null, p_method: 'scan', p_station_label: 'Meja 1', p_actor: 'test',
    });
    expect(error).toBeNull();
    expect(data.status).toBe('CHECKED_IN');
  }
}

export async function newPrize(data: Record<string, unknown>): Promise<string> {
  const { data: r, error } = await svc().rpc('admin_save_prize', { p_event: EVENT, p_id: null, p_data: data, p_actor: 'test' });
  expect(error).toBeNull();
  expect(r.status).toBe('OK');
  return r.id as string;
}

/** Call after `resetEvent()` (which already removes draws). */
export async function clearPrizes() {
  await svc().from('draws').delete().eq('event_id', EVENT);
  await svc().from('prizes').delete().eq('event_id', EVENT);
}

export const stageRow = async () => (await svc().from('stage_state').select('*').eq('event_id', EVENT).single()).data!;

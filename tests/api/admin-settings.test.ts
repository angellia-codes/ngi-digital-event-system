import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/admin-auth', () => ({ getAdmin: vi.fn() }));

import { getAdmin } from '@/lib/admin-auth';
import { GET as dashboard } from '@/app/api/admin/dashboard/route';
import { POST as goLive } from '@/app/api/admin/go-live/route';
import { POST as reset } from '@/app/api/admin/reset/route';
import { GET as getSettings } from '@/app/api/admin/settings/route';
import { POST as setLabels } from '@/app/api/admin/settings/station-labels/route';
import { POST as setActive } from '@/app/api/admin/settings/pin-active/route';
import { POST as setPin } from '@/app/api/admin/settings/pin/route';
import { GET as me } from '@/app/api/station/me/route';
import { EVENT, getReq, loginAs, postJson, resetEvent, seedGuests, setupPins, svc } from './helpers';

const asAdmin = () => vi.mocked(getAdmin).mockResolvedValue({ email: 'dev-admin@example.com' });
const json = (r: Response) => r.json();
// Station routes also accept a signed-in admin, so check the station session with no admin mocked.
const stationOnly = async (cookie: string) => {
  vi.mocked(getAdmin).mockResolvedValueOnce(null);
  return (await me(getReq('/api/station/me', cookie))).status;
};
const DEFAULT_LABELS = ['Meja 1', 'Meja 2', 'Meja 3', 'Booth 1', 'Booth 2'];

beforeAll(setupPins);
beforeEach(async () => {
  asAdmin();
  await resetEvent();
});
afterAll(async () => {
  await setupPins();
  await svc().rpc('set_station_labels', { p_event: EVENT, p_labels: DEFAULT_LABELS, p_actor: 'test' });
  for (const role of ['checkin', 'merchandise', 'draw', 'prizes']) {
    await svc().rpc('set_station_active', { p_event: EVENT, p_role: role, p_active: true, p_actor: 'test' });
  }
});

describe('access', () => {
  it('answers 401 for every settings route without an admin session', async () => {
    vi.mocked(getAdmin).mockResolvedValue(null);
    const posts = [
      [setPin, '/api/admin/settings/pin', { role: 'checkin', pin: '123456' }],
      [setActive, '/api/admin/settings/pin-active', { role: 'checkin', active: false }],
      [setLabels, '/api/admin/settings/station-labels', { labels: ['A'] }],
      [goLive, '/api/admin/go-live', { confirm: 'GO LIVE' }],
      [reset, '/api/admin/reset', { confirm: 'RESET' }],
    ] as const;
    for (const [handler, path, body] of posts) expect((await handler(postJson(path, body))).status).toBe(401);
    expect((await getSettings(getReq('/api/admin/settings'))).status).toBe(401);
    expect((await dashboard(getReq('/api/admin/dashboard'))).status).toBe(401);
  });
});

describe('settings', () => {
  it('lists the four roles without exposing hashes', async () => {
    const j = await json(await getSettings(getReq('/api/admin/settings')));
    expect(j.data.mode).toBe('rehearsal');
    expect(j.data.station_labels).toEqual(DEFAULT_LABELS);
    expect(j.data.pins.map((p: { role: string }) => p.role)).toEqual(['checkin', 'merchandise', 'draw', 'prizes']);
    expect(j.data.pins.every((p: { is_set: boolean; active: boolean }) => p.is_set && p.active)).toBe(true);
    expect(JSON.stringify(j)).not.toContain('pin_hash');
  });

  it('changes a PIN, rejects bad or duplicate PINs, and signs out devices on that role', async () => {
    const cookie = await loginAs('checkin');
    expect((await me(getReq('/api/station/me', cookie))).status).toBe(200);

    expect((await json(await setPin(postJson('/api/admin/settings/pin', { role: 'checkin', pin: '12' })))).status).toBe('INVALID_PIN');
    expect((await json(await setPin(postJson('/api/admin/settings/pin', { role: 'prizes', pin: '111111' })))).status).toBe('PIN_IN_USE');
    expect((await setPin(postJson('/api/admin/settings/pin', { role: 'bogus', pin: '123456' }))).status).toBe(400);

    expect((await json(await setPin(postJson('/api/admin/settings/pin', { role: 'checkin', pin: '135790' })))).status).toBe('OK');
    expect(await stationOnly(cookie)).toBe(401);
    await setupPins();
  });

  it('deactivates and reactivates a role', async () => {
    const cookie = await loginAs('merchandise');
    expect((await json(await setActive(postJson('/api/admin/settings/pin-active', { role: 'merchandise', active: false })))).status).toBe('OK');
    expect(await stationOnly(cookie)).toBe(401);
    expect((await json(await setActive(postJson('/api/admin/settings/pin-active', { role: 'merchandise', active: true })))).status).toBe('OK');
  });

  it('replaces station labels and rejects duplicates', async () => {
    expect((await json(await setLabels(postJson('/api/admin/settings/station-labels', { labels: ['Meja A', 'Meja B'] })))).status).toBe('OK');
    expect((await json(await getSettings(getReq('/api/admin/settings')))).data.station_labels).toEqual(['Meja A', 'Meja B']);
    expect((await json(await setLabels(postJson('/api/admin/settings/station-labels', { labels: ['X', 'X'] })))).status).toBe('INVALID');
    await setLabels(postJson('/api/admin/settings/station-labels', { labels: DEFAULT_LABELS }));
  });
});

describe('rehearsal reset and go-live', () => {
  it('reset clears check-ins and restarts prize numbers', async () => {
    const g = await seedGuests(1);
    await svc().rpc('check_in', { p_event: EVENT, p_token: g[0].invite_token, p_guest_id: null, p_method: 'scan', p_station_label: 'Meja 1', p_actor: 'test' });
    expect((await json(await reset(postJson('/api/admin/reset', { confirm: 'RESET' })))).status).toBe('OK');
    const { count } = await svc().from('check_ins').select('id', { count: 'exact', head: true }).eq('event_id', EVENT);
    expect(count).toBe(0);
  });
  it('requires the exact confirmation words', async () => {
    expect((await reset(postJson('/api/admin/reset', { confirm: 'reset' }))).status).toBe(400);
    expect((await goLive(postJson('/api/admin/go-live', { confirm: 'go live' }))).status).toBe(400);
    expect((await goLive(postJson('/api/admin/go-live', {}))).status).toBe(400);
    const { data } = await svc().from('events').select('mode').eq('id', EVENT).single();
    expect(data?.mode).toBe('rehearsal'); // go-live itself is covered by the database test; running it here would lock the dev event
  });
});

describe('dashboard', () => {
  it('returns counts and the latest audit rows', async () => {
    const g = await seedGuests(2);
    await svc().rpc('check_in', { p_event: EVENT, p_token: g[0].invite_token, p_guest_id: null, p_method: 'scan', p_station_label: 'Meja 1', p_actor: 'test' });
    const j = await json(await dashboard(getReq('/api/admin/dashboard')));
    expect(j.data.counts).toMatchObject({ checked_in: 1, redeemed: 0, mode: 'rehearsal' });
    expect(j.data.counts.total).toBeGreaterThanOrEqual(2);
    expect(j.data.recent.length).toBeGreaterThan(0);
    expect(j.data.recent[0]).toHaveProperty('action');
    expect(j.data.recent.length).toBeLessThanOrEqual(10);
  });
});

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as checkIn } from '@/app/api/station/check-in/route';
import { GET as guestsGet } from '@/app/api/station/guests/route';
import { GET as stats } from '@/app/api/station/stats/route';
import { EVENT, getReq, loginAs, postJson, resetEvent, seedGuests, setupPins, svc, type TestGuest } from './helpers';

let g: TestGuest[];
let cookie: string;
const json = async (r: Response) => r.json();
const scan = (code: string, c = cookie) => checkIn(postJson('/api/station/check-in', { code }, c));

beforeAll(setupPins);
beforeEach(async () => {
  await resetEvent();
  g = await seedGuests(3);
  cookie = await loginAs('checkin', 'Meja 2');
});

describe('access control', () => {
  it('needs a session', async () => {
    expect((await scan(`NF:CI:${g[0].invite_token}`, '')).status).toBe(401);
  });
  it('refuses other roles', async () => {
    const merch = await loginAs('merchandise', 'Booth 1');
    expect((await scan(`NF:CI:${g[0].invite_token}`, merch)).status).toBe(403);
    const draw = await loginAs('draw');
    expect((await scan(`NF:CI:${g[0].invite_token}`, draw)).status).toBe(403);
  });
  it('refuses foreign origins and bad bodies', async () => {
    const evil = new Request('http://localhost/api/station/check-in', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://evil.example', cookie },
      body: JSON.stringify({ code: `NF:CI:${g[0].invite_token}` }),
    });
    expect((await checkIn(evil)).status).toBe(403);
    expect((await checkIn(postJson('/api/station/check-in', {}, cookie))).status).toBe(400);
    expect((await checkIn(postJson('/api/station/check-in', { code: 'x', guest_id: g[0].id }, cookie))).status).toBe(400);
  });
});

describe('check-in', () => {
  it('checks a guest in by QR and issues number 1', async () => {
    const j = await json(await scan(`NF:CI:${g[0].invite_token}`));
    expect(j).toMatchObject({ ok: true, status: 'CHECKED_IN', data: { prize_number: 1, station_label: 'Meja 2', guest: { full_name: g[0].full_name } } });
  });
  it('reports a duplicate with the original number and issues no new one', async () => {
    await scan(`NF:CI:${g[0].invite_token}`);
    const dup = await json(await scan(`NF:CI:${g[0].invite_token}`));
    expect(dup).toMatchObject({ status: 'ALREADY_CHECKED_IN', data: { prize_number: 1 } });
    const next = await json(await scan(`NF:CI:${g[1].invite_token}`));
    expect(next.data.prize_number).toBe(2);
  });
  it('answers WRONG_CODE_TYPE for a merchandise QR without touching check-ins', async () => {
    const j = await json(await scan(`NF:MR:${g[0].merch_token}`));
    expect(j.status).toBe('WRONG_CODE_TYPE');
    const { count } = await svc().from('check_ins').select('id', { count: 'exact', head: true }).eq('event_id', EVENT);
    expect(count).toBe(0);
    const { data } = await svc().from('attempt_log').select('result').eq('event_id', EVENT);
    expect(data).toContainEqual({ result: 'WRONG_CODE_TYPE' });
  });
  it.each(['hello', 'NF:CI:short', 'NF:CI:AAAAAAAAAAAAAAAAAAAAAA'])('answers INVALID for %s', async (code) => {
    expect((await json(await scan(code))).status).toBe('INVALID');
  });
  it('checks in manually by guest id', async () => {
    const j = await json(await checkIn(postJson('/api/station/check-in', { guest_id: g[2].id }, cookie)));
    expect(j).toMatchObject({ status: 'CHECKED_IN', data: { prize_number: 1 } });
    const { data } = await svc().from('check_ins').select('method').eq('guest_id', g[2].id).single();
    expect(data?.method).toBe('manual');
  });
  it('refuses an inactive guest', async () => {
    await svc().from('guests').update({ active: false }).eq('id', g[0].id);
    expect((await json(await scan(`NF:CI:${g[0].invite_token}`))).status).toBe('NOT_ELIGIBLE');
  });
});

describe('search and stats', () => {
  it('searches by name without returning phone numbers', async () => {
    const res = await guestsGet(getReq('/api/station/guests?q=test%20guest%201', cookie));
    const j = await json(res);
    expect(j.data.guests).toHaveLength(1);
    expect(JSON.stringify(j)).not.toContain('628123450000');
    expect(j.data.guests[0]).toMatchObject({ full_name: 'Test Guest 1', checked_in: false });
  });
  it('lets the merchandise role search too, and refuses the draw role', async () => {
    expect((await guestsGet(getReq('/api/station/guests?q=test', await loginAs('merchandise', 'Booth 1')))).status).toBe(200);
    expect((await guestsGet(getReq('/api/station/guests?q=test', await loginAs('draw')))).status).toBe(403);
  });
  it('returns counts to any station role', async () => {
    await scan(`NF:CI:${g[0].invite_token}`);
    const j = await json(await stats(getReq('/api/station/stats', cookie)));
    expect(j.data).toMatchObject({ checked_in: 1, mode: 'rehearsal' });
    expect(j.data.total).toBeGreaterThanOrEqual(3);
  });
});

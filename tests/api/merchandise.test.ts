import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GET as count } from '@/app/api/station/merchandise/count/route';
import { POST as lookup } from '@/app/api/station/merchandise/lookup/route';
import { POST as redeem } from '@/app/api/station/merchandise/redeem/route';
import { EVENT, getReq, loginAs, postJson, resetEvent, seedGuests, setupPins, svc, type TestGuest } from './helpers';

let g: TestGuest[];
let booth1: string;
let booth2: string;
const json = (r: Response) => r.json();
const look = (code: string, c = booth1) => lookup(postJson('/api/station/merchandise/lookup', { code }, c));
const give = (body: object, c = booth1) => redeem(postJson('/api/station/merchandise/redeem', body, c));
const checkIn = (i: number) =>
  svc().rpc('check_in', { p_event: EVENT, p_token: g[i].invite_token, p_guest_id: null, p_method: 'scan', p_station_label: 'Meja 1', p_actor: 'test' });

beforeAll(setupPins);
beforeEach(async () => {
  await resetEvent();
  g = await seedGuests(3);
  booth1 = await loginAs('merchandise', 'Booth 1');
  booth2 = await loginAs('merchandise', 'Booth 2');
});

describe('access control', () => {
  it('needs the merchandise role', async () => {
    expect((await look(`NF:MR:${g[0].merch_token}`, '')).status).toBe(401);
    expect((await look(`NF:MR:${g[0].merch_token}`, await loginAs('checkin'))).status).toBe(403);
    expect((await give({ guest_id: g[0].id }, await loginAs('draw'))).status).toBe(403);
  });
});

describe('lookup', () => {
  it('is READY for a checked-in guest and writes nothing', async () => {
    await checkIn(0);
    const j = await json(await look(`NF:MR:${g[0].merch_token}`));
    expect(j).toMatchObject({ status: 'READY', data: { guest: { id: g[0].id, full_name: g[0].full_name } } });
    const { count: n } = await svc().from('merchandise_redemptions').select('id', { count: 'exact', head: true }).eq('event_id', EVENT);
    expect(n).toBe(0);
  });
  it('is NOT_CHECKED_IN before check-in', async () => {
    expect((await json(await look(`NF:MR:${g[1].merch_token}`))).status).toBe('NOT_CHECKED_IN');
  });
  it('rejects a check-in QR with WRONG_CODE_TYPE', async () => {
    await checkIn(0);
    expect((await json(await look(`NF:CI:${g[0].invite_token}`))).status).toBe('WRONG_CODE_TYPE');
  });
  it.each(['junk', 'NF:MR:AAAAAAAAAAAAAAAAAAAAAA'])('is INVALID for %s', async (code) => {
    expect((await json(await look(code))).status).toBe('INVALID');
  });
});

describe('hand over', () => {
  it('records one redemption and blocks the second station', async () => {
    await checkIn(0);
    expect((await json(await give({ guest_id: g[0].id }))).status).toBe('REDEEMED');
    const second = await json(await give({ guest_id: g[0].id }, booth2));
    expect(second).toMatchObject({ status: 'ALREADY_REDEEMED', data: { station_label: 'Booth 1' } });
    const { count: n } = await svc().from('merchandise_redemptions').select('id', { count: 'exact', head: true }).eq('status', 'redeemed');
    expect(n).toBe(1);
  });
  it('treats a quick repeat from the same station as the same tap', async () => {
    await checkIn(0);
    await give({ guest_id: g[0].id });
    const again = await json(await give({ guest_id: g[0].id }));
    expect(again).toMatchObject({ status: 'REDEEMED', data: { replay: true } });
  });
  it('refuses a guest who has not checked in', async () => {
    expect((await json(await give({ guest_id: g[1].id }))).status).toBe('NOT_CHECKED_IN');
  });
  it('also works straight from a QR scan', async () => {
    await checkIn(2);
    expect((await json(await give({ code: `NF:MR:${g[2].merch_token}` }))).status).toBe('REDEEMED');
  });
  it('shows the claim on the guest pass', async () => {
    await checkIn(0);
    await give({ guest_id: g[0].id });
    const { data } = await svc().rpc('get_pass', { p_token: g[0].invite_token });
    expect(data.merchandise.claimed).toBe(true);
  });
  it('counts redemptions', async () => {
    await checkIn(0);
    await checkIn(1);
    await give({ guest_id: g[0].id });
    expect((await json(await count(getReq('/api/station/merchandise/count', booth1)))).data).toMatchObject({ redeemed: 1, checked_in: 2 });
  });
});

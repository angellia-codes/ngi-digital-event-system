import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GET as current } from '@/app/api/station/draw/current/route';
import { POST as drawRoute } from '@/app/api/station/draw/route';
import { POST as resolveRoute } from '@/app/api/station/draw/resolve/route';
import { POST as stageRoute } from '@/app/api/station/draw/stage/route';
import { GET as prizesRoute } from '@/app/api/station/prizes/route';
import { POST as lookup } from '@/app/api/station/prizes/lookup-number/route';
import { arrive, clearPrizes, newPrize, stageRow } from './draw-helpers';
import { getReq, loginAs, postJson, resetEvent, seedGuests, setupPins, type TestGuest } from './helpers';

let g: TestGuest[];
let mc: string;
let desk: string;
let single: string;
let batch: string;
const json = (r: Response) => r.json();
const draw = (prize_id: string, request_id = randomUUID(), c = mc) => drawRoute(postJson('/api/station/draw', { prize_id, request_id }, c));
const resolve = (body: object, c = mc) => resolveRoute(postJson('/api/station/draw/resolve', body, c));
const stage = (body: object, c = mc) => stageRoute(postJson('/api/station/draw/stage', body, c));

beforeAll(setupPins);
beforeEach(async () => {
  await resetEvent();
  await clearPrizes();
  g = await seedGuests(4);
  await arrive(g);
  single = await newPrize({ name: 'T-Single', tier: 'Hadiah Utama', quantity: 2 });
  batch = await newPrize({ name: 'T-Batch', tier: 'Hiburan', quantity: 3, draw_as_batch: true });
  mc = await loginAs('draw', 'Meja 1');
  desk = await loginAs('prizes', 'Meja 2');
});
afterAll(async () => {
  await resetEvent();
  await clearPrizes();
});

describe('access', () => {
  it('needs a session, and the draw or prizes role', async () => {
    expect((await drawRoute(postJson('/api/station/draw', { prize_id: single, request_id: randomUUID() }))).status).toBe(401);
    expect((await draw(single, randomUUID(), await loginAs('checkin'))).status).toBe(403);
    expect((await draw(single, randomUUID(), await loginAs('merchandise'))).status).toBe(403);
    expect((await current(getReq('/api/station/draw/current', await loginAs('checkin')))).status).toBe(403);
  });
  it('lets the prizes desk read and confirm, but not draw or change the stage', async () => {
    expect((await draw(single, randomUUID(), desk)).status).toBe(403);
    expect((await stage({ phase: 'idle' }, desk)).status).toBe(403);
    expect((await current(getReq('/api/station/draw/current', desk))).status).toBe(200);
    expect((await prizesRoute(getReq('/api/station/prizes', desk))).status).toBe(200);
  });
  it('rejects a foreign Origin', async () => {
    const req = new Request('http://localhost/api/station/draw', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example', cookie: mc },
      body: JSON.stringify({ prize_id: single, request_id: randomUUID() }),
    });
    expect((await drawRoute(req)).status).toBe(403);
  });
  it.each([{}, { prize_id: 'nope', request_id: randomUUID() }, { prize_id: randomUUID() }])('400 on bad input %j', async (body) => {
    expect((await drawRoute(postJson('/api/station/draw', body, mc))).status).toBe(400);
  });
});

describe('prize list', () => {
  it('returns the prizes with what is left', async () => {
    const j = await json(await prizesRoute(getReq('/api/station/prizes', mc)));
    expect(j.status).toBe('OK');
    const s = j.data.prizes.find((p: { name: string }) => p.name === 'T-Single');
    expect(s).toMatchObject({ quantity: 2, remaining: 2, confirmed: 0, pending: 0 });
  });
});

describe('drawing', () => {
  it('draws one winner, shows the operator the name and the stage only the number', async () => {
    const j = await json(await draw(single));
    expect(j.status).toBe('DRAWN');
    expect(j.data.draws).toHaveLength(1);
    const d = j.data.draws[0];
    expect(d).toMatchObject({ slot: 1, status: 'drawn' });
    expect(g.map((x) => x.full_name)).toContain(d.name);

    const row = await stageRow();
    expect(row.phase).toBe('rolling');
    expect(row.payload.prize.name).toBe('T-Single');
    expect(row.payload.slots).toEqual([{ slot: 1, number: d.number, state: 'rolling' }]);
    expect(JSON.stringify(row)).not.toContain(d.name);
  });

  it('repeats the same answer for the same request id and refuses a second draw while one is open', async () => {
    const rid = randomUUID();
    const a = await json(await draw(single, rid));
    const b = await json(await draw(single, rid));
    expect(b.status).toBe('DRAWN');
    expect(b.data.idempotent).toBe(true);
    expect(b.data.draws[0].id).toBe(a.data.draws[0].id);
    expect((await json(await draw(single))).status).toBe('DRAW_IN_PROGRESS');
    expect((await json(await draw(batch))).status).toBe('DRAW_IN_PROGRESS');
  });

  it('confirms: the name reaches the stage only now', async () => {
    const a = await json(await draw(single));
    const d = a.data.draws[0];
    const r = await json(await resolve({ draw_id: d.id, outcome: 'confirm' }));
    expect(r.status).toBe('CONFIRMED');
    const row = await stageRow();
    expect(row.phase).toBe('revealed');
    expect(row.payload.slots[0]).toMatchObject({ state: 'revealed', name: d.name, outlet: 'Outlet A' });
    expect((await json(await resolve({ draw_id: d.id, outcome: 'confirm' }, desk))).status).toBe('ALREADY_CONFIRMED');
    expect((await json(await resolve({ draw_id: d.id, outcome: 'no_show' }))).status).toBe('ALREADY_CONFIRMED');
  });

  it('lets the prizes desk confirm as the backup', async () => {
    const a = await json(await draw(single));
    expect((await json(await resolve({ draw_id: a.data.draws[0].id, outcome: 'confirm' }, desk))).status).toBe('CONFIRMED');
  });

  it('voids a no-show, shows the void state without a name, and redraws the same slot in the same round', async () => {
    const a = await json(await draw(single));
    const d = a.data.draws[0];
    expect((await json(await resolve({ draw_id: d.id, outcome: 'no_show' }))).status).toBe('VOIDED');
    const row = await stageRow();
    expect(row.phase).toBe('void');
    expect(JSON.stringify(row)).not.toContain(d.name);
    const b = await json(await draw(single));
    expect(b.status).toBe('DRAWN');
    expect(b.data.round_id).toBe(a.data.round_id);
    expect(b.data.draws[0]).toMatchObject({ slot: 1, redraw_of: d.id });
    expect(b.data.draws[0].number).not.toBe(d.number);
  });

  it('draws a batch together and confirms it with one tap', async () => {
    const a = await json(await draw(batch));
    expect(a.data.draws).toHaveLength(3);
    expect((await json(await resolve({ draw_id: a.data.draws[0].id, outcome: 'confirm' }))).status).toBe('CONFIRMED');
    expect((await stageRow()).phase).toBe('rolling'); // two tiles still open
    const all = await json(await resolve({ round_id: a.data.round_id, outcome: 'confirm_all' }));
    expect(all).toMatchObject({ status: 'CONFIRMED', data: { confirmed: 2 } });
    expect((await stageRow()).phase).toBe('revealed');
    expect((await json(await resolve({ round_id: a.data.round_id, outcome: 'confirm_all' }))).status).toBe('NOTHING_TO_CONFIRM');
  });

  it('reports a finished prize and an unknown prize', async () => {
    const a = await json(await draw(single));
    await resolve({ draw_id: a.data.draws[0].id, outcome: 'confirm' });
    const b = await json(await draw(single));
    await resolve({ draw_id: b.data.draws[0].id, outcome: 'confirm' });
    expect((await json(await draw(single))).status).toBe('PRIZE_COMPLETE');
    expect((await json(await draw(randomUUID()))).status).toBe('PRIZE_NOT_FOUND');
  });

  it('draws everyone available when the batch is bigger than the pool', async () => {
    const big = await newPrize({ name: 'T-Big', quantity: 10, draw_as_batch: true });
    const a = await json(await draw(big));
    expect(a.data.draws).toHaveLength(4);
    expect(a.data.short_by).toBe(6);
    await resolve({ round_id: a.data.round_id, outcome: 'confirm_all' });
    expect((await json(await draw(single))).status).toBe('NO_ELIGIBLE_GUESTS');
  });
});

describe('current', () => {
  it('shows nothing before the first draw, then the open round and the stage', async () => {
    const empty = await json(await current(getReq('/api/station/draw/current', mc)));
    expect(empty).toMatchObject({ status: 'OK', data: { round: null, heartbeat_age: null } });
    await draw(single);
    const j = await json(await current(getReq('/api/station/draw/current', desk)));
    expect(j.data.round.pending).toBe(1);
    expect(j.data.round.draws[0].name).toBeTruthy();
    expect(j.data.stage.phase).toBe('rolling');
    expect(j.data.oldest_pending_at).toBeTruthy();
  });
});

describe('stage banner', () => {
  it('shows a prize banner and blanks the screen', async () => {
    expect((await json(await stage({ phase: 'intro', prize_id: single }))).status).toBe('OK');
    expect(await stageRow()).toMatchObject({ phase: 'intro', payload: { prize: { name: 'T-Single' } } });
    expect((await json(await stage({ phase: 'idle' }))).status).toBe('OK');
    expect((await stageRow()).phase).toBe('idle');
  });
  it('needs a prize for the banner, refuses unknown prizes, and cannot overwrite an open draw', async () => {
    expect((await stage({ phase: 'intro' })).status).toBe(400);
    expect((await stage({ phase: 'rolling' })).status).toBe(400);
    expect((await json(await stage({ phase: 'intro', prize_id: randomUUID() }))).status).toBe('PRIZE_NOT_FOUND');
    await draw(single);
    expect((await json(await stage({ phase: 'idle' }))).status).toBe('DRAW_IN_PROGRESS');
  });
});

describe('number lookup', () => {
  it('finds a pending and a confirmed winner, and a guest who did not win', async () => {
    const a = await json(await draw(single));
    const d = a.data.draws[0];
    const look = async (number: number) => json(await lookup(postJson('/api/station/prizes/lookup-number', { number }, desk)));
    expect(await look(d.number)).toMatchObject({ status: 'PENDING', data: { name: d.name, prize: { name: 'T-Single' } } });
    await resolve({ draw_id: d.id, outcome: 'confirm' });
    expect(await look(d.number)).toMatchObject({ status: 'WINNER', data: { slot: 1 } });
    const other = [1, 2, 3, 4].find((n) => n !== d.number)!;
    expect((await look(other)).status).toBe('NOT_A_WINNER');
    expect((await look(999)).status).toBe('NO_SUCH_NUMBER');
  });
  it('rejects a non-integer number', async () => {
    for (const number of [0, -1, 1.5, '3', null]) {
      expect((await lookup(postJson('/api/station/prizes/lookup-number', { number }, desk))).status).toBe(400);
    }
  });
});

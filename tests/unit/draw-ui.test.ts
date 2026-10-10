import { describe, it, expect } from 'vitest';
import { WINNER_SECONDS, heartbeatState, pendingDraws, requestIds, secondsLeft, type Round } from '@/lib/draw-ui';

describe('secondsLeft', () => {
  const t0 = Date.parse('2026-12-10T10:00:00Z');
  it('counts down from 60', () => {
    expect(secondsLeft('2026-12-10T10:00:00Z', t0)).toBe(WINNER_SECONDS);
    expect(secondsLeft('2026-12-10T10:00:00Z', t0 + 1_500)).toBe(59);
    expect(secondsLeft('2026-12-10T10:00:00Z', t0 + 59_000)).toBe(1);
  });
  it('stops at zero and never goes negative', () => {
    expect(secondsLeft('2026-12-10T10:00:00Z', t0 + 60_000)).toBe(0);
    expect(secondsLeft('2026-12-10T10:00:00Z', t0 + 600_000)).toBe(0);
  });
  it('never exceeds 60 when the phone clock is behind the server', () => {
    expect(secondsLeft('2026-12-10T10:00:00Z', t0 - 20_000)).toBe(WINNER_SECONDS);
  });
  it('is 60 when there is nothing pending', () => expect(secondsLeft(null, t0)).toBe(WINNER_SECONDS));
});

describe('heartbeatState', () => {
  it.each([[0, 'ok'], [14, 'ok'], [15, 'down'], [300, 'down'], [null, 'never'], [undefined, 'never']] as const)('%s s is %s', (age, want) => {
    expect(heartbeatState(age)).toBe(want);
  });
});

describe('requestIds', () => {
  it('returns the same id for the same prize until it is marked done', () => {
    let n = 0;
    const ids = requestIds(() => `id-${++n}`);
    expect(ids.idFor('a')).toBe('id-1');
    expect(ids.idFor('a')).toBe('id-1'); // a retry after a dropped connection reuses the id
    expect(ids.idFor('b')).toBe('id-2');
    ids.done('a');
    expect(ids.idFor('a')).toBe('id-3');
    expect(ids.idFor('b')).toBe('id-2');
  });
});

describe('pendingDraws', () => {
  const round = {
    round_id: 'r', pending: 1, prize: { id: 'p', name: 'Mug', tier: null, quantity: 2, batch: true },
    draws: [
      { id: '1', slot: 1, status: 'confirmed', number: 5, name: 'A', outlet: 'O', department: null, drawn_at: 'x', redraw_of: null },
      { id: '2', slot: 2, status: 'drawn', number: 6, name: 'B', outlet: 'O', department: null, drawn_at: 'x', redraw_of: null },
    ],
  } satisfies Round;
  it('keeps only the unresolved draws', () => expect(pendingDraws(round).map((d) => d.id)).toEqual(['2']));
  it('handles no round', () => expect(pendingDraws(null)).toEqual([]));
});

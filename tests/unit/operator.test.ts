import { describe, expect, it } from 'vitest';
import type { DrawRow, Round } from '@/lib/draw-ui';
import { drawProblem, roundKey, screenFor } from '@/lib/operator';
import { firstOpenPrize, prizeLabel, type PrizeRow } from '@/lib/prizes';

const draw = (slot: number, status: DrawRow['status']): DrawRow => ({
  id: `d${slot}`, slot, status, number: 10 + slot, name: `Guest ${slot}`, outlet: 'Outlet A', department: null,
  drawn_at: '2026-12-10T10:00:00Z', redraw_of: null,
});
const round = (draws: DrawRow[], batch = false): Round => ({
  round_id: 'r1',
  prize: { id: 'p1', name: 'Smart TV', tier: 'HADIAH UTAMA', quantity: Math.max(1, draws.length), batch },
  pending: draws.filter((d) => d.status === 'drawn').length,
  draws,
});

describe('screenFor', () => {
  it('shows the prize picker when nothing has been drawn yet', () => {
    expect(screenFor(null, null)).toBe('pick');
  });
  it('shows the winner and the two buttons while any draw is unresolved', () => {
    expect(screenFor(round([draw(1, 'drawn')]), null)).toBe('active');
    expect(screenFor(round([draw(1, 'confirmed'), draw(2, 'drawn')], true), null)).toBe('active');
  });
  it('shows TERCATAT after a confirm, until the operator taps UNDIAN BERIKUTNYA', () => {
    const r = round([draw(1, 'confirmed')]);
    expect(screenFor(r, null)).toBe('recorded');
    expect(screenFor(r, roundKey(r))).toBe('pick');
  });
  it('goes back to the picker for a redraw after a no-show, and dismissing a confirmed round does not hide it', () => {
    expect(screenFor(round([draw(1, 'void_no_show')]), null)).toBe('redraw');
    expect(screenFor(round([draw(1, 'confirmed'), draw(2, 'void_no_show')], true), null)).toBe('redraw');
    const before = round([draw(1, 'confirmed')]);
    const after = round([draw(1, 'void_admin')]); // an admin reversed it later
    expect(roundKey(after)).not.toBe(roundKey(before));
    expect(screenFor(after, roundKey(before))).toBe('redraw');
  });
});

describe('roundKey', () => {
  it('changes when a draw changes status, so an old "next" tap never hides a new result', () => {
    expect(roundKey(round([draw(1, 'drawn')]))).not.toBe(roundKey(round([draw(1, 'confirmed')])));
    expect(roundKey(round([draw(1, 'confirmed')]))).toBe(roundKey(round([draw(1, 'confirmed')])));
  });
});

describe('drawProblem', () => {
  it('explains each refusal and stays silent on success', () => {
    expect(drawProblem('DRAWN')).toBeNull();
    expect(drawProblem('DRAW_IN_PROGRESS')).toBe('draw.in_progress');
    expect(drawProblem('NO_ELIGIBLE_GUESTS')).toBe('draw.no_eligible');
    expect(drawProblem('PRIZE_COMPLETE')).toBe('draw.prize_complete');
    expect(drawProblem('RETRYABLE_ERROR')).toBe('draw.error');
    expect(drawProblem('SOMETHING_NEW')).toBe('draw.error');
  });
});

describe('prizes', () => {
  const p = (id: string, remaining: number): PrizeRow => ({
    id, name: id, tier: null, sort_order: 0, quantity: 3, draw_as_batch: false, confirmed: 3 - remaining, pending: 0,
    no_shows: 0, admin_voids: 0, remaining, has_draws: remaining < 3,
  });
  it('picks the first prize that still has a free slot', () => {
    expect(firstOpenPrize([p('a', 0), p('b', 2), p('c', 3)])).toBe('b');
    expect(firstOpenPrize([p('a', 0)])).toBeNull();
    expect(firstOpenPrize([])).toBeNull();
  });
  it('labels a prize with its tier when it has one', () => {
    expect(prizeLabel({ tier: 'HADIAH UTAMA', name: 'Smart TV' })).toBe('HADIAH UTAMA · Smart TV');
    expect(prizeLabel({ tier: null, name: 'Voucher' })).toBe('Voucher');
  });
});

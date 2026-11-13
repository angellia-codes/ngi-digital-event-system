import { describe, it, expect } from 'vitest';
import {
  DEFAULT_OPTIONS, REVEAL_STEP_MS, ROLL_MS, acceptRow, bannerText, noteRolls, parseRow, revealDelays, slotViews,
  type StageRow, type StageSlot,
} from '@/lib/stage';

const prize = { id: 'p1', name: 'Smart TV', tier: 'Hadiah Utama', quantity: 3 };
const row = (rev: number, slots: StageSlot[], over: Partial<StageRow> = {}): StageRow => ({
  rev, phase: 'rolling', options: DEFAULT_OPTIONS, payload: { round_id: 'r1', batch: false, prize, slots }, ...over,
});
const rolling = (slot: number, number: number): StageSlot => ({ slot, number, state: 'rolling' });
const revealed = (slot: number, number: number, name: string): StageSlot =>
  ({ slot, number, state: 'revealed', name, outlet: 'Outlet A', department: 'FOH' });

describe('parseRow', () => {
  it('accepts the database shape and fills default options', () => {
    const r = parseRow({ rev: 4, phase: 'idle', payload: {}, options: {} });
    expect(r).toEqual({ rev: 4, phase: 'idle', payload: {}, options: DEFAULT_OPTIONS });
  });
  it('accepts a Realtime row with extra columns and a string revision', () => {
    const r = parseRow({ event_id: 'e', rev: '7', phase: 'rolling', payload: { slots: [] }, options: { safe_mode: true, language: 'en' }, updated_at: 'x' });
    expect(r?.rev).toBe(7);
    expect(r?.options).toEqual({ safe_mode: true, reduce_effects: false, language: 'en' });
  });
  it.each([null, undefined, 'x', 3, { phase: 'idle' }, { rev: 1, phase: 'dancing' }, { rev: 'abc', phase: 'idle' }])('rejects %j', (bad) => {
    expect(parseRow(bad)).toBeNull();
  });
  it('falls back to English for an unknown language', () => {
    expect(parseRow({ rev: 1, phase: 'idle', options: { language: 'fr' } })?.options.language).toBe('en');
  });
});

describe('acceptRow', () => {
  it('takes the first row, a higher revision, and ignores equal or lower ones', () => {
    const a = row(5, []);
    expect(acceptRow(null, a)).toBe(a);
    const b = row(6, []);
    expect(acceptRow(a, b)).toBe(b);
    expect(acceptRow(b, a)).toBe(b);
    expect(acceptRow(b, row(6, [rolling(1, 9)]))).toBe(b);
  });
});

describe('roll bookkeeping', () => {
  it('rolls for ROLL_MS after a live update, then lands', () => {
    const starts = new Map<string, number>();
    const r = row(1, [rolling(1, 42)]);
    noteRolls(starts, r, 10_000, true);
    expect(slotViews(r, starts, 10_000)[0].kind).toBe('rolling');
    expect(slotViews(r, starts, 10_000 + ROLL_MS - 1)[0].kind).toBe('rolling');
    expect(slotViews(r, starts, 10_000 + ROLL_MS)[0].kind).toBe('landed');
  });
  it('goes straight to landed when the display loads mid-roll', () => {
    const starts = new Map<string, number>();
    const r = row(1, [rolling(1, 42)]);
    noteRolls(starts, r, 10_000, false);
    expect(slotViews(r, starts, 10_000)[0].kind).toBe('landed');
  });
  it('does not restart the roll on a repeated row, but rolls again for a redraw with a new number', () => {
    const starts = new Map<string, number>();
    noteRolls(starts, row(1, [rolling(1, 42)]), 10_000, true);
    noteRolls(starts, row(2, [rolling(1, 42)]), 14_000, true);
    expect(slotViews(row(2, [rolling(1, 42)]), starts, 15_000)[0].kind).toBe('landed');
    const redraw = row(3, [rolling(1, 77)]);
    noteRolls(starts, redraw, 16_000, true);
    expect(slotViews(redraw, starts, 16_100)[0].kind).toBe('rolling');
  });
  it('skips the roll when effects are reduced', () => {
    const starts = new Map<string, number>();
    const r = row(1, [rolling(1, 42)], { options: { ...DEFAULT_OPTIONS, reduce_effects: true } });
    noteRolls(starts, r, 10_000, true);
    expect(slotViews(r, starts, 10_000)[0].kind).toBe('landed');
  });
  it('shows the name only for a revealed slot, even if the payload carries one', () => {
    const sneaky: StageSlot = { slot: 1, number: 5, state: 'rolling', name: 'LEAK', outlet: 'LEAK', department: 'LEAK' };
    const v = slotViews(row(1, [sneaky, revealed(2, 6, 'Kadek Ayu')]), new Map(), 0);
    expect(JSON.stringify(v[0])).not.toContain('LEAK');
    expect(v[1]).toMatchObject({ kind: 'revealed', name: 'Kadek Ayu', outlet: 'Outlet A', department: 'FOH' });
  });
  it('marks a void slot', () => {
    expect(slotViews(row(1, [{ slot: 1, number: 5, state: 'void' }]), new Map(), 0)[0].kind).toBe('void');
  });
});

describe('revealDelays', () => {
  it('staggers tiles that were revealed together, lowest slot first', () => {
    const prev = row(1, [rolling(1, 1), rolling(2, 2), rolling(3, 3)]);
    const next = row(2, [revealed(1, 1, 'A'), revealed(2, 2, 'B'), revealed(3, 3, 'C')]);
    expect(revealDelays(prev, next)).toEqual({ 1: 0, 2: REVEAL_STEP_MS, 3: 2 * REVEAL_STEP_MS });
  });
  it('ignores tiles that were already revealed', () => {
    const prev = row(2, [revealed(1, 1, 'A'), rolling(2, 2)]);
    const next = row(3, [revealed(1, 1, 'A'), revealed(2, 2, 'B')]);
    expect(revealDelays(prev, next)).toEqual({ 2: 0 });
  });
  it('shows everything at once when effects are reduced', () => {
    const prev = row(1, [rolling(1, 1), rolling(2, 2)]);
    const next = row(2, [revealed(1, 1, 'A'), revealed(2, 2, 'B')], { options: { ...DEFAULT_OPTIONS, reduce_effects: true } });
    expect(revealDelays(prev, next)).toEqual({ 1: 0, 2: 0 });
  });
  it('treats a different round as all new', () => {
    const prev = row(1, [revealed(1, 1, 'A')]);
    const next = row(2, [revealed(1, 9, 'Z')], { payload: { round_id: 'r2', prize, slots: [revealed(1, 9, 'Z')] } });
    expect(revealDelays(prev, next)).toEqual({ 1: 0 });
  });
});

describe('bannerText', () => {
  it('joins tier and name in capitals', () => expect(bannerText(prize)).toBe('HADIAH UTAMA · SMART TV'));
  it('uses only the name when there is no tier', () => expect(bannerText({ ...prize, tier: null })).toBe('SMART TV'));
  it('is empty without a prize', () => expect(bannerText(undefined)).toBe(''));
});

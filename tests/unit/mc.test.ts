import { describe, expect, it } from 'vitest';
import {
  clockOffset, currentSegment, driftMinutes, elapsedSeconds, formatClock, formatDrift, groupPax, nextSegment, pct,
  segmentStatus, undrawnCount, vipGroups, vipName, type McState, type Segment, type VipRow,
} from '@/lib/mc';

const seg = (id: string, extra: Partial<Segment> = {}): Segment => ({
  id, sort_order: 0, title: id, planned_start: '2026-12-08T09:00:00Z', duration_min: 10, pic: null, script: null,
  kind: 'normal', started_at: null, ended_at: null, prizes: [], ...extra,
});
const state = (extra: Partial<McState>): McState => ({
  server_now: '2026-12-08T09:00:00Z', phase: 'running', current_segment_id: 'b', current_started_at: null,
  segments: [seg('a', { started_at: 'x', ended_at: 'y' }), seg('b', { started_at: 'z' }), seg('c')], ...extra,
});

describe('segments', () => {
  it('labels done, current and upcoming', () => {
    const s = state({});
    expect(s.segments.map((x) => segmentStatus(x, s.current_segment_id))).toEqual(['done', 'current', 'upcoming']);
  });
  it('finds the current and next segment', () => {
    expect(currentSegment(state({}))?.id).toBe('b');
    expect(nextSegment(state({}))?.id).toBe('c');
    expect(nextSegment(state({ current_segment_id: 'c' }))).toBeNull();
    expect(nextSegment(state({ phase: 'not_started', current_segment_id: null }))?.id).toBe('a');
    expect(nextSegment(state({ phase: 'ended', current_segment_id: null }))).toBeNull();
    expect(currentSegment(state({ phase: 'not_started', current_segment_id: null }))).toBeNull();
  });
  it('counts undrawn prize slots and ignores negatives', () => {
    const s = seg('d', { kind: 'door_prize', prizes: [
      { id: 'p1', name: 'V', tier: null, quantity: 3, mc_script: null, confirmed: 1, remaining: 2, winners: ['Ayu'] },
      { id: 'p2', name: 'T', tier: null, quantity: 1, mc_script: null, confirmed: 1, remaining: 0, winners: ['Budi'] },
      { id: 'p3', name: 'X', tier: null, quantity: 1, mc_script: null, confirmed: 2, remaining: -1, winners: [] },
    ] });
    expect(undrawnCount(s)).toBe(2);
  });
});

describe('timing', () => {
  it('works out drift in whole minutes', () => {
    expect(driftMinutes('2026-12-08T09:00:00Z', '2026-12-08T09:07:20Z')).toBe(7);
    expect(driftMinutes('2026-12-08T09:00:00Z', '2026-12-08T08:57:00Z')).toBe(-3);
    expect(formatDrift(7)).toBe('+7');
    expect(formatDrift(-3)).toBe('-3');
    expect(formatDrift(0)).toBe('0');
  });
  it('follows the server clock', () => {
    const offset = clockOffset('2026-12-08T09:00:00Z', Date.parse('2026-12-08T08:59:00Z')); // phone 60 s slow
    expect(offset).toBe(60_000);
    expect(elapsedSeconds('2026-12-08T08:58:00Z', Date.parse('2026-12-08T08:59:00Z'), offset)).toBe(120);
    expect(elapsedSeconds('2026-12-08T09:30:00Z', Date.parse('2026-12-08T08:59:00Z'), offset)).toBe(0);
  });
  it('formats the clock', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(187)).toBe('3:07');
    expect(formatClock(4530)).toBe('75:30');
  });
});

describe('pax', () => {
  it('groups by outlet, sorted by most present', () => {
    const g = groupPax([
      { outlet: 'Berawa', department: null, invited: 2, checked_in: 1 },
      { outlet: 'Ungasan', department: 'FOH', invited: 2, checked_in: 2 },
      { outlet: 'Ungasan', department: 'Kitchen', invited: 4, checked_in: 3 },
    ]);
    expect(g.total).toEqual({ invited: 8, checked_in: 6 });
    expect(g.outlets.map((o) => o.outlet)).toEqual(['Ungasan', 'Berawa']);
    expect(g.outlets[0]).toMatchObject({ invited: 6, checked_in: 5 });
    expect(g.outlets[0].departments.map((d) => d.department)).toEqual(['Kitchen', 'FOH']);
    expect(g.outlets[0].departments[0]).toEqual({ outlet: 'Ungasan', department: 'Kitchen', invited: 4, checked_in: 3 });
  });
  it('breaks ties by name and handles zero', () => {
    const g = groupPax([
      { outlet: 'B', department: null, invited: 1, checked_in: 0 },
      { outlet: 'A', department: null, invited: 1, checked_in: 0 },
    ]);
    expect(g.outlets.map((o) => o.outlet)).toEqual(['A', 'B']);
    expect(groupPax([])).toEqual({ total: { invited: 0, checked_in: 0 }, outlets: [] });
  });
  it('rounds percentages and never divides by zero', () => {
    expect(pct(2, 3)).toBe(67);
    expect(pct(0, 0)).toBe(0);
  });
});

describe('vip', () => {
  const v = (id: string, tier: 'BOD' | 'HOD', arrived: boolean): VipRow => ({
    id, tier, title: 'Ibu', full_name: id, phonetic: null, position: null, outlet: 'A', protocol_order: null, arrived, arrived_at: null,
  });
  it('splits BOD and HOD and filters to those present', () => {
    const rows = [v('a', 'BOD', true), v('b', 'BOD', false), v('c', 'HOD', true)];
    expect(vipGroups(rows, false).BOD.map((r) => r.id)).toEqual(['a', 'b']);
    expect(vipGroups(rows, true).BOD.map((r) => r.id)).toEqual(['a']);
    expect(vipGroups(rows, true).HOD.map((r) => r.id)).toEqual(['c']);
  });
  it('joins title and name', () => {
    expect(vipName({ title: 'Ibu', full_name: 'Dewi' })).toBe('Ibu Dewi');
    expect(vipName({ title: null, full_name: 'Dewi' })).toBe('Dewi');
  });
});

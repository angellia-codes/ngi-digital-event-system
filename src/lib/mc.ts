/** MC cue card: types for `mc_state`, `mc_vip`, `mc_pax` (SQL) and the pure logic the MC screen runs on them. */
import type { ScreenKey } from './screens';

export type SegmentPrize = {
  id: string; name: string; tier: string | null; quantity: number; mc_script: string | null;
  confirmed: number; remaining: number; winners: string[];
};
export type Segment = {
  id: string; sort_order: number; title: string; planned_start: string; duration_min: number;
  pic: string | null; script: string | null; kind: 'normal' | 'door_prize';
  /** The screen the Screen Control panel offers as "Up next" while this segment runs (spec 2026-11-13). */
  suggested_screen?: ScreenKey | null;
  started_at: string | null; ended_at: string | null; prizes: SegmentPrize[];
};
export type McPhase = 'not_started' | 'running' | 'ended';
export type McState = {
  server_now: string; phase: McPhase; current_segment_id: string | null; current_started_at: string | null; segments: Segment[];
};
export type SegmentStatus = 'done' | 'current' | 'upcoming';

export type VipRow = {
  id: string; tier: 'BOD' | 'HOD'; title: string | null; full_name: string; phonetic: string | null;
  position: string | null; outlet: string; protocol_order: number | null; arrived: boolean; arrived_at: string | null;
};
export type PaxRow = { outlet: string; department: string | null; invited: number; checked_in: number };
export type PaxCount = { invited: number; checked_in: number };
export type PaxOutlet = PaxCount & { outlet: string; departments: PaxRow[] };

export function segmentStatus(seg: Segment, currentId: string | null): SegmentStatus {
  if (seg.id === currentId) return 'current';
  return seg.ended_at ? 'done' : 'upcoming';
}

export const currentSegment = (s: McState): Segment | null => s.segments.find((x) => x.id === s.current_segment_id) ?? null;

/** The segment NEXT will open: the first one before the show, the one after the current one while it runs. */
export function nextSegment(s: McState): Segment | null {
  if (s.phase === 'ended') return null;
  if (s.phase === 'not_started') return s.segments[0] ?? null;
  const i = s.segments.findIndex((x) => x.id === s.current_segment_id);
  return i >= 0 ? (s.segments[i + 1] ?? null) : null;
}

/** Whole minutes a segment started after (positive) or before (negative) its planned time. */
export const driftMinutes = (plannedIso: string, startedIso: string): number =>
  Math.round((Date.parse(startedIso) - Date.parse(plannedIso)) / 60_000);

/** "+7", "-3", "0". */
export const formatDrift = (min: number): string => (min > 0 ? `+${min}` : String(min));

/** Server clock minus phone clock, so timers follow the server even when a phone's clock is wrong. */
export const clockOffset = (serverNowIso: string, clientNowMs: number): number => Date.parse(serverNowIso) - clientNowMs;

export const elapsedSeconds = (startedIso: string, clientNowMs: number, offsetMs: number): number =>
  Math.max(0, Math.floor((clientNowMs + offsetMs - Date.parse(startedIso)) / 1000));

/** "3:07", "12:00", "75:30". */
export const formatClock = (sec: number): string => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

export const pct = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Prize slots in a segment that are not yet drawn or waiting (no-shows free their slot again). */
export const undrawnCount = (seg: Segment): number => seg.prizes.reduce((n, p) => n + Math.max(0, p.remaining), 0);

/** Most checked in first, then by name. */
const mostPresent = (name: (x: PaxCount) => string) => (a: PaxCount, b: PaxCount) =>
  b.checked_in - a.checked_in || name(a).localeCompare(name(b));

/** Total, then outlets by most checked in (then name), each with its departments in the same order. */
export function groupPax(rows: PaxRow[]): { total: PaxCount; outlets: PaxOutlet[] } {
  const map = new Map<string, PaxOutlet>();
  for (const r of rows) {
    const o = map.get(r.outlet) ?? { outlet: r.outlet, invited: 0, checked_in: 0, departments: [] };
    o.invited += r.invited;
    o.checked_in += r.checked_in;
    o.departments.push(r);
    map.set(r.outlet, o);
  }
  const outlets = [...map.values()].sort(mostPresent((x) => (x as PaxOutlet).outlet));
  for (const o of outlets) o.departments.sort(mostPresent((x) => (x as PaxRow).department ?? ''));
  const total = outlets.reduce((t, o) => ({ invited: t.invited + o.invited, checked_in: t.checked_in + o.checked_in }), { invited: 0, checked_in: 0 });
  return { total, outlets };
}

/** BOD and HOD in the order the server sent (protocol order), optionally only those who have arrived. */
export function vipGroups(rows: VipRow[], presentOnly: boolean): { BOD: VipRow[]; HOD: VipRow[] } {
  const shown = presentOnly ? rows.filter((r) => r.arrived) : rows;
  return { BOD: shown.filter((r) => r.tier === 'BOD'), HOD: shown.filter((r) => r.tier === 'HOD') };
}

/** "Ibu Dewi" — title and name as the MC says them. */
export const vipName = (r: Pick<VipRow, 'title' | 'full_name'>): string => [r.title, r.full_name].filter(Boolean).join(' ');

import type { Lang } from './i18n/strings';

export type StagePhase = 'idle' | 'intro' | 'rolling' | 'revealed' | 'void';
export type StageSlot = {
  slot: number;
  number: number;
  state: 'rolling' | 'revealed' | 'void';
  name?: string;
  outlet?: string;
  department?: string;
};
export type StagePrize = { id: string; name: string; tier: string | null; quantity: number };
export type StagePayload = { round_id?: string | null; batch?: boolean; prize?: StagePrize; slots?: StageSlot[] };
export type StageOptions = { safe_mode: boolean; reduce_effects: boolean; language: Lang };
export type StageRow = { rev: number; phase: StagePhase; payload: StagePayload; options: StageOptions };

export type SlotKind = 'rolling' | 'landed' | 'revealed' | 'void';
export type SlotView = { slot: number; number: number; kind: SlotKind; name?: string; outlet?: string; department?: string };

export const ROLL_MS = 5000; // cosmetic; the outcome is already saved before the roll starts
export const REVEAL_STEP_MS = 1700; // one winner every 1.5–2 seconds when a batch is confirmed together
export const DEFAULT_OPTIONS: StageOptions = { safe_mode: false, reduce_effects: false, language: 'en' };
const PHASES: readonly string[] = ['idle', 'intro', 'rolling', 'revealed', 'void'];

/** Normalises a row from `/api/stage/state` or from Realtime. Returns null if it is not a stage row. */
export function parseRow(raw: unknown): StageRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const rev = Number(r.rev);
  if (!Number.isFinite(rev) || typeof r.phase !== 'string' || !PHASES.includes(r.phase)) return null;
  const payload = r.payload && typeof r.payload === 'object' ? (r.payload as StagePayload) : {};
  const o = (r.options && typeof r.options === 'object' ? r.options : {}) as Partial<StageOptions>;
  return {
    rev,
    phase: r.phase as StagePhase,
    payload,
    options: { ...DEFAULT_OPTIONS, ...o, language: o.language === 'id' ? 'id' : 'en' },
  };
}

/** The newest revision wins. A stale or repeated row (a late poll, a duplicate event) changes nothing. */
export function acceptRow(current: StageRow | null, incoming: StageRow): StageRow {
  return !current || incoming.rev > current.rev ? incoming : current;
}

const slotKey = (p: StagePayload, s: StageSlot) => `${p.round_id ?? 'none'}:${s.slot}:${s.number}`;

/**
 * Remembers when each rolling slot first appeared. `live` is false for the very first row after a load or reload:
 * those slots count as already landed, so a display that joins mid-roll shows the number straight away.
 * A redraw has a new number, so it gets a new key and rolls again.
 */
export function noteRolls(starts: Map<string, number>, row: StageRow, now: number, live: boolean): void {
  for (const s of row.payload.slots ?? []) {
    if (s.state !== 'rolling') continue;
    const k = slotKey(row.payload, s);
    if (!starts.has(k)) starts.set(k, live ? now : now - ROLL_MS);
  }
}

/** What to draw for each slot at time `now`. A name is copied only for a revealed slot. */
export function slotViews(row: StageRow, starts: Map<string, number>, now: number): SlotView[] {
  return (row.payload.slots ?? []).map((s): SlotView => {
    if (s.state === 'revealed') return { slot: s.slot, number: s.number, kind: 'revealed', name: s.name, outlet: s.outlet, department: s.department };
    if (s.state === 'void') return { slot: s.slot, number: s.number, kind: 'void' };
    const t = starts.get(slotKey(row.payload, s));
    const rolling = !row.options.reduce_effects && t !== undefined && now - t < ROLL_MS;
    return { slot: s.slot, number: s.number, kind: rolling ? 'rolling' : 'landed' };
  });
}

/** Delay (ms) before each newly revealed tile flips, so a batch confirmed in one tap reveals one by one. */
export function revealDelays(prev: StageRow | null, next: StageRow): Record<number, number> {
  const sameRound = prev?.payload.round_id === next.payload.round_id;
  const was = new Set((sameRound ? prev?.payload.slots ?? [] : []).filter((s) => s.state === 'revealed').map((s) => s.slot));
  const fresh = (next.payload.slots ?? [])
    .filter((s) => s.state === 'revealed' && !was.has(s.slot))
    .map((s) => s.slot)
    .sort((a, b) => a - b);
  const out: Record<number, number> = {};
  fresh.forEach((slot, i) => { out[slot] = next.options.reduce_effects ? 0 : i * REVEAL_STEP_MS; });
  return out;
}

/** "HADIAH UTAMA · SMART TV" */
export function bannerText(prize: StagePrize | undefined): string {
  if (!prize) return '';
  return [prize.tier, prize.name].filter(Boolean).join(' · ').toUpperCase();
}

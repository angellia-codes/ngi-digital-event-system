/**
 * Videotron screens (spec 2026-11-13): the fixed catalogue and the pure logic the panel and the stage run on.
 * SCREENS must list the same 12 keys, in the same order, as `screen_keys()` in migration 20.
 */
import type { StringKey } from './i18n/strings';

export const SCREEN_KEYS = [
  'ambient_arrival', 'ambient_dinner', 'ambient_afterparty', 'candid_cam', 'welcome', 'director_gm',
  'award_intro', 'nominees', 'doorprize_intro', 'draw', 'closing', 'blackout',
] as const;
export type ScreenKey = (typeof SCREEN_KEYS)[number];
export type ScreenKind = 'loop' | 'once' | 'draw' | 'card' | 'black';
export type ScreenGroup = 'ambient' | 'video' | 'live' | 'card';
export type ScreenDef = { key: ScreenKey; kind: ScreenKind; group: ScreenGroup; audio: boolean };

export const SCREENS: readonly ScreenDef[] = [
  { key: 'ambient_arrival', kind: 'loop', group: 'ambient', audio: false },
  { key: 'ambient_dinner', kind: 'loop', group: 'ambient', audio: false },
  { key: 'ambient_afterparty', kind: 'loop', group: 'ambient', audio: false },
  { key: 'candid_cam', kind: 'loop', group: 'video', audio: false },
  { key: 'welcome', kind: 'once', group: 'video', audio: true },
  { key: 'director_gm', kind: 'once', group: 'video', audio: true },
  { key: 'award_intro', kind: 'once', group: 'video', audio: true },
  { key: 'nominees', kind: 'once', group: 'video', audio: true },
  { key: 'doorprize_intro', kind: 'once', group: 'video', audio: true },
  { key: 'draw', kind: 'draw', group: 'live', audio: false },
  { key: 'closing', kind: 'card', group: 'card', audio: false },
  { key: 'blackout', kind: 'black', group: 'card', audio: false },
];
export const SCREEN_GROUPS: readonly ScreenGroup[] = ['ambient', 'video', 'live', 'card'];

const BY_KEY = new Map(SCREENS.map((s) => [s.key, s]));
export const isScreenKey = (k: unknown): k is ScreenKey => typeof k === 'string' && BY_KEY.has(k as ScreenKey);
export const screenDef = (k: ScreenKey): ScreenDef => BY_KEY.get(k)!;
export const hasVideo = (k: ScreenKey): boolean => ['loop', 'once'].includes(screenDef(k).kind);
export const screenLabel = (k: ScreenKey): StringKey => `screen.k.${k}` as StringKey;

/** The live screen as stored on stage_state.screen. */
export type LiveScreen = { key: ScreenKey; started_at: string | null; by: string | null; auto: boolean };
export const DEFAULT_SCREEN: LiveScreen = { key: 'ambient_arrival', started_at: null, by: null, auto: false };

/** Normalises stage_state.screen from any source (state route, Realtime). Anything unreadable is the arrival loop. */
export function parseScreen(raw: unknown): LiveScreen {
  if (!raw || typeof raw !== 'object') return DEFAULT_SCREEN;
  const r = raw as Record<string, unknown>;
  if (!isScreenKey(r.key)) return DEFAULT_SCREEN;
  return {
    key: r.key,
    started_at: typeof r.started_at === 'string' ? r.started_at : null,
    by: typeof r.by === 'string' ? r.by : null,
    auto: r.auto === true,
  };
}

/**
 * Where a video should start. A screen that changed while the stage was watching starts at 0. On the first row after
 * a load or reload (`live` false) it resumes at server-now minus started_at. Past the end of a one-off video → ended.
 */
export function startPosition(
  screen: LiveScreen, durationS: number | null, live: boolean, clientNowMs: number, offsetMs: number,
): { at: number; ended: boolean } {
  if (live || !screen.started_at) return { at: 0, ended: false };
  const elapsed = Math.max(0, (clientNowMs + offsetMs - Date.parse(screen.started_at)) / 1000);
  if (!durationS || !(durationS > 0)) return { at: 0, ended: false };
  if (screenDef(screen.key).kind === 'loop') return { at: elapsed % durationS, ended: false };
  return elapsed >= durationS ? { at: Math.max(0, durationS - 0.05), ended: true } : { at: elapsed, ended: false };
}

/** What the Screen Control panel reads (`screen_state`). */
export type ScreenInfo = { key: ScreenKey; has_video: boolean; duration_s: number | null; version: number };
export type CacheReport = { ready: number; total: number; failed: ScreenKey[]; sound_on: boolean };
export type ScreenState = {
  server_now: string;
  screen: LiveScreen;
  screen_rev: number;
  draw_phase: string;
  draw_pending: boolean;
  heartbeat_age: number | null;
  cache: Partial<CacheReport>;
  screens: ScreenInfo[];
  up_next: { segment_id: string; title: string; screen: ScreenKey } | null;
};

/** The draw is mid-way: a prize is on screen, a number is rolling or void, or a winner is not yet confirmed. */
export const drawUnfinished = (s: Pick<ScreenState, 'draw_phase' | 'draw_pending'>): boolean =>
  s.draw_pending || ['intro', 'rolling', 'void'].includes(s.draw_phase);

/** The confirmation a switch needs before it is sent, or null when it can go straight away. */
export function switchConfirm(s: ScreenState, target: ScreenKey): 'replay' | 'leave_draw' | null {
  if (target === s.screen.key) return 'replay';
  if (s.screen.key === 'draw' && drawUnfinished(s)) return 'leave_draw';
  return null;
}

/** Seconds into the live screen by the server clock (offset = server minus phone). */
export const secondsSince = (startedIso: string | null, clientNowMs: number, offsetMs: number): number =>
  startedIso ? Math.max(0, Math.floor((clientNowMs + offsetMs - Date.parse(startedIso)) / 1000)) : 0;

/** True when the stage laptop is missing videos, so the panel shows the count in red. */
export const cacheIncomplete = (c: Partial<CacheReport>): boolean =>
  typeof c.ready !== 'number' || typeof c.total !== 'number' || c.ready < c.total || (c.failed?.length ?? 0) > 0;

/** Video files under this name in storage: '<key>/v<version>.mp4'. */
export const videoPath = (key: ScreenKey, version: number): string => `${key}/v${version}.mp4`;

/** USB fallback file name in show order: '05_welcome.mp4'. */
export const usbName = (key: ScreenKey): string =>
  `${String(SCREEN_KEYS.indexOf(key) + 1).padStart(2, '0')}_${key}.mp4`;

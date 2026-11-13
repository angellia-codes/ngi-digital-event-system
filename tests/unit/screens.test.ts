import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { STRINGS } from '@/lib/i18n/strings';
import {
  cacheIncomplete, drawUnfinished, hasVideo, parseScreen, SCREEN_KEYS, SCREENS, screenLabel, secondsSince, startPosition,
  switchConfirm, usbName, videoPath, type ScreenState,
} from '@/lib/screens';

const state = (extra: Partial<ScreenState>): ScreenState => ({
  server_now: '2026-12-08T10:00:00Z', screen: { key: 'ambient_dinner', started_at: '2026-12-08T09:59:00Z', by: 'screen', auto: false },
  screen_rev: 3, draw_phase: 'idle', draw_pending: false, heartbeat_age: 2, cache: {}, screens: [], up_next: null, ...extra,
});

describe('catalogue', () => {
  it('lists the same 12 keys, in order, as screen_keys() in migration 20', () => {
    const sql = readFileSync(path.resolve(__dirname, '../../supabase/migrations/20261115000020_screen_switcher.sql'), 'utf8');
    const body = /screen_keys\(\) returns text\[\][\s\S]*?array\[([\s\S]*?)\]/.exec(sql)![1];
    expect([...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])).toEqual([...SCREEN_KEYS]);
    expect(SCREENS.map((s) => s.key)).toEqual([...SCREEN_KEYS]);
  });
  it('has a label in both languages for every screen', () => {
    for (const k of SCREEN_KEYS) {
      expect(STRINGS.id[screenLabel(k)], k).toBeTruthy();
      expect(STRINGS.en[screenLabel(k)], k).toBeTruthy();
    }
  });
  it('marks which screens need a video and which carry sound', () => {
    expect(SCREEN_KEYS.filter(hasVideo)).toHaveLength(9);
    expect(SCREENS.filter((s) => s.audio).map((s) => s.key)).toEqual(['welcome', 'director_gm', 'award_intro', 'nominees', 'doorprize_intro']);
  });
  it('names files', () => {
    expect(videoPath('welcome', 3)).toBe('welcome/v3.mp4');
    expect(usbName('welcome')).toBe('05_welcome.mp4');
    expect(usbName('ambient_arrival')).toBe('01_ambient_arrival.mp4');
  });
});

describe('parseScreen', () => {
  it('reads a stored screen', () => {
    expect(parseScreen({ key: 'draw', started_at: 'x', by: 'draw', auto: true })).toEqual({ key: 'draw', started_at: 'x', by: 'draw', auto: true });
  });
  it('falls back to the arrival loop', () => {
    expect(parseScreen(null).key).toBe('ambient_arrival');
    expect(parseScreen({ key: 'karaoke' }).key).toBe('ambient_arrival');
    expect(parseScreen({ key: 'closing', started_at: 5, auto: 'yes' })).toEqual({ key: 'closing', started_at: null, by: null, auto: false });
  });
});

describe('startPosition', () => {
  const now = Date.parse('2026-12-08T10:00:30Z');
  const once = { key: 'welcome' as const, started_at: '2026-12-08T10:00:00Z', by: 'screen', auto: false };
  it('starts at 0 when the switch happened while watching', () => {
    expect(startPosition(once, 60, true, now, 0)).toEqual({ at: 0, ended: false });
  });
  it('resumes on reload using the server clock', () => {
    expect(startPosition(once, 60, false, now, 0)).toEqual({ at: 30, ended: false });
    expect(startPosition(once, 60, false, now, 10_000)).toEqual({ at: 40, ended: false });
  });
  it('shows the end state when the one-off video is over', () => {
    expect(startPosition(once, 20, false, now, 0)).toEqual({ at: 19.95, ended: true });
  });
  it('wraps loops', () => {
    expect(startPosition({ ...once, key: 'ambient_dinner' }, 20, false, now, 0)).toEqual({ at: 10, ended: false });
  });
  it('starts at 0 without a start time or duration', () => {
    expect(startPosition({ ...once, started_at: null }, 60, false, now, 0)).toEqual({ at: 0, ended: false });
    expect(startPosition(once, null, false, now, 0)).toEqual({ at: 0, ended: false });
  });
});

describe('panel logic', () => {
  it('asks before a replay', () => {
    expect(switchConfirm(state({}), 'ambient_dinner')).toBe('replay');
  });
  it('asks before leaving an unfinished draw', () => {
    const onDraw = { key: 'draw' as const, started_at: null, by: 'draw', auto: true };
    expect(switchConfirm(state({ screen: onDraw, draw_phase: 'rolling' }), 'ambient_dinner')).toBe('leave_draw');
    expect(switchConfirm(state({ screen: onDraw, draw_phase: 'revealed', draw_pending: true }), 'ambient_dinner')).toBe('leave_draw');
    expect(switchConfirm(state({ screen: onDraw, draw_phase: 'revealed' }), 'ambient_dinner')).toBeNull();
    expect(switchConfirm(state({ screen: onDraw, draw_phase: 'idle' }), 'closing')).toBeNull();
  });
  it('switches straight away otherwise', () => {
    expect(switchConfirm(state({}), 'closing')).toBeNull();
    expect(drawUnfinished({ draw_phase: 'intro', draw_pending: false })).toBe(true);
  });
  it('counts seconds by the server clock', () => {
    expect(secondsSince('2026-12-08T10:00:00Z', Date.parse('2026-12-08T10:01:05Z'), 0)).toBe(65);
    expect(secondsSince('2026-12-08T10:00:00Z', Date.parse('2026-12-08T10:00:00Z'), -5_000)).toBe(0);
    expect(secondsSince(null, 0, 0)).toBe(0);
  });
  it('flags a missing or failed cache', () => {
    expect(cacheIncomplete({})).toBe(true);
    expect(cacheIncomplete({ ready: 8, total: 9, failed: [], sound_on: true })).toBe(true);
    expect(cacheIncomplete({ ready: 9, total: 9, failed: ['welcome'], sound_on: true })).toBe(true);
    expect(cacheIncomplete({ ready: 9, total: 9, failed: [], sound_on: false })).toBe(false);
  });
});

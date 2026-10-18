# NourishFest Invitation Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild all invitation motion on one 105 BPM beat grid, as specified in `engineering/2026-10-19-nourishfest-invitation-motion-design.md`.

**Architecture:** Pure timing helpers live in `src/lib/invite/motion.ts` and are unit-tested. The gate and the 12-beat opening become one `Stage` component drawn on a fixed 360 × 640 set; the scroll scenes move into a `Scenes` component; `Invitation` becomes a small controller for phase, music and the exit. All motion is CSS keyframes in `src/styles/invite.css`, driven by one `--beat` variable, with every element's resting style equal to its final state.

**Tech Stack:** Next.js 15 (app router, React 19, TypeScript), plain CSS, Vitest 5 (node environment, no DOM).

## Global Constraints

- Tempo: **105 BPM**, `--beat: 571ms` in CSS and `BEAT_MS = 571` in TS. They must match.
- Animate **`transform` and `opacity` only**. No animation of `filter`, `text-shadow`, `box-shadow`, colour or layout properties.
- Every keyframe name starts with **`inv-`** (global CSS; `stage.css` and `pass.css` already own `nf-*` names).
- Resting styles describe the **final** state. Hidden "before" states exist only inside `@media (prefers-reduced-motion: no-preference)` or in a keyframe `from` reached through `animation-fill-mode: backwards`/`both`.
- `tokens.css` keeps its global `prefers-reduced-motion: reduce` rule (`animation: none !important`). Do not remove it.
- Glitch: at most 2 events in the whole invitation, never a white flash. Polaroid flash: one gold flash at 50% opacity.
- Allowed loops: gate cassette float, gate reels, PRESS PLAY pulse (scale only); opening reels, equalizer, speaker pump; countdown tick; outro reels and VIEW MY PASS pulse (scale only). No other `infinite`.
- Brand colours only (`--nf-black`, `--nf-gold`, `--nf-pink`, `--nf-green`, neutrals, new `--nf-paper`). Black text on gold, pink and green; never white on pink.
- All art is original inline SVG. No photos, real people, logos or brand marks.
- Touch targets ≥ 48 px. Minimum width 360 px.
- Invitation chunk stays ≤ 60 KB gzipped (it is lazy-loaded by `PassView`).

## Dry run

This plan was applied to a scratch copy of the repo at `c285110` on 19 Oct 2026: `npx tsc --noEmit` clean, `npm run test:unit` 197/197 passing (including the 20 new tests), `npm run lint` 0 errors (2 existing warnings in `Scanner.tsx`). `npm run build` could not be checked there because that sandbox cannot reach Google Fonts; Task 10 Step 1 covers the build.

## Before you start

- Branch: `git checkout -b invitation-motion` from `main` (repo at `c285110` or later).
- Install: `npm ci`.
- Baseline: `npm run test:unit` → all pass. `npx tsc --noEmit` → no errors.
- Keep the prototype open for reference: "NourishFest Invitation Prototype" artifact. Where it differs from this plan, this plan wins.

## File map

| File | Responsibility |
|:--|:--|
| `src/lib/invite/motion.ts` (new) | Tempo constants, `musicDropDelay`, `stageScale`, `tickVisible`, `splitLines` |
| `tests/unit/invite-motion.test.ts` (new) | Tests for `motion.ts` |
| `src/lib/i18n/invite-strings.ts` | Four new keys |
| `src/styles/tokens.css` | `--nf-paper` |
| `src/components/invite/useMusic.ts` | Start muted on the tap, drop on the click, iOS-safe mute |
| `src/components/invite/art.tsx` | Boombox window reels, reel classes, `Crowd`, `MapStreets`, `MapPin` props, remove `Equalizer` |
| `src/styles/invite.css` | Full rewrite: tokens, stage, scenes, glass, move library, keyframes |
| `tests/unit/invite-css.test.ts` (new) | Guards the CSS rules above |
| `src/components/invite/Stage.tsx` (new) | Gate + opening on the 360 × 640 set |
| `src/components/invite/Scenes.tsx` (new) | Scenes 2–10 and their triggers |
| `src/components/invite/Invitation.tsx` | Controller: phase, bar, music, exit |
| `src/components/pass/PassView.tsx`, `src/styles/pass.css` | Ticket settles in after the invitation exits |

The spec's §10 named the helper file `music.ts`; this plan uses `motion.ts` because it also holds the stage helpers.

---

### Task 1: Motion helpers

**Files:**
- Create: `src/lib/invite/motion.ts`
- Test: `tests/unit/invite-motion.test.ts`

**Interfaces:**
- Produces (used by Tasks 3, 6, 7, 8):
  - `BPM: 105`, `BEAT_MS: 571`, `DROP_BEATS: 2`, `SETTLE_BEATS: 3`, `OPENING_BACKUP_MS: 10000`, `STAGE_W: 360`, `STAGE_H: 640`
  - `musicDropDelay(nowMs: number, dropAtMs: number): number`
  - `stageScale(width: number, height: number): number`
  - `tickVisible(elapsedMs: number, stepMs: number, visible: boolean): number`
  - `splitLines(text: string): string[]`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/invite-motion.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { INVITE_EN, INVITE_ID } from '@/lib/i18n/invite-strings';
import {
  BEAT_MS, BPM, DROP_BEATS, OPENING_BACKUP_MS, SETTLE_BEATS, STAGE_H, STAGE_W,
  musicDropDelay, splitLines, stageScale, tickVisible,
} from '@/lib/invite/motion';

describe('tempo', () => {
  it('is 105 BPM and the beat is 60000 / BPM rounded', () => {
    expect(BPM).toBe(105);
    expect(BEAT_MS).toBe(Math.round(60000 / BPM));
    expect(BEAT_MS).toBe(571);
  });
  it('drops the music on beat 2 and settles glass after 3 beats', () => {
    expect(DROP_BEATS).toBe(2);
    expect(SETTLE_BEATS).toBe(3);
    expect(OPENING_BACKUP_MS).toBe(10_000);
  });
});

describe('musicDropDelay', () => {
  it('waits until the click when the song is ready early', () => expect(musicDropDelay(1000, 2142)).toBe(1142));
  it('starts now when the song is ready late', () => expect(musicDropDelay(5000, 2142)).toBe(0));
  it('starts now exactly on the click', () => expect(musicDropDelay(2142, 2142)).toBe(0));
});

describe('stageScale', () => {
  it('is 1 on the design size', () => expect(stageScale(STAGE_W, STAGE_H)).toBe(1));
  it('fits the narrower side', () => {
    expect(stageScale(390, 844)).toBeCloseTo(390 / 360, 5);
    expect(stageScale(720, 640)).toBe(1);
  });
  it('falls back to 1 for an unmeasured box', () => {
    expect(stageScale(0, 640)).toBe(1);
    expect(stageScale(360, Number.NaN)).toBe(1);
  });
});

describe('tickVisible', () => {
  it('counts only visible time', () => {
    expect(tickVisible(0, 250, true)).toBe(250);
    expect(tickVisible(250, 250, false)).toBe(250);
  });
});

describe('splitLines', () => {
  it('splits the about copy into three lines in English', () => {
    expect(splitLines(INVITE_EN['invite.about'])).toEqual([
      'One night for all of us.',
      'Every outlet, one stage, one beat:',
      'celebrating a year of hard work with the Nourish family.',
    ]);
  });
  it('splits the about copy into three lines in Indonesian', () => {
    expect(splitLines(INVITE_ID['invite.about'])).toHaveLength(3);
  });
  it('keeps text without a break whole', () => expect(splitLines('Just one line')).toEqual(['Just one line']));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/invite-motion.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/invite/motion"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/invite/motion.ts`:

```ts
/**
 * Invitation motion timing (motion spec 2026-10-19 §3–§4). Everything is counted in beats.
 * BEAT_MS must match `--beat` in src/styles/invite.css.
 */
export const BPM = 105;
export const BEAT_MS = 571; // Math.round(60000 / BPM)
/** The tape clicks into the boombox on beat 2 of the opening; the music drops there. */
export const DROP_BEATS = 2;
/** Glass blur switches on this many beats after a scene starts, once its cards have stopped moving. */
export const SETTLE_BEATS = 3;
/** Backup end of the opening if `animationend` never arrives, counted in visible time only. */
export const OPENING_BACKUP_MS = 10_000;
/** The opening is drawn on a fixed set and scaled to fit the screen. */
export const STAGE_W = 360;
export const STAGE_H = 640;

/** Milliseconds to wait before starting the song so it lands on the click. 0 means start now. */
export function musicDropDelay(nowMs: number, dropAtMs: number): number {
  return Math.max(0, dropAtMs - nowMs);
}

/** Scale that fits the 360 x 640 set inside a box. 1 when the box has not been measured. */
export function stageScale(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return 1;
  return Math.min(width / STAGE_W, height / STAGE_H);
}

/** Adds a timer step only while the page is visible, so a hidden tab never ends the opening early. */
export function tickVisible(elapsedMs: number, stepMs: number, visible: boolean): number {
  return visible ? elapsedMs + stepMs : elapsedMs;
}

/** Splits copy after each full stop or colon, so the About scene can settle it line by line. */
export function splitLines(text: string): string[] {
  return text.split(/(?<=[.:])\s+/).filter((s) => s.length > 0);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/invite-motion.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/invite/motion.ts tests/unit/invite-motion.test.ts
git commit -m "Add invitation motion timing helpers at 105 BPM"
```

---

### Task 2: New strings and the paper colour

**Files:**
- Modify: `src/lib/i18n/invite-strings.ts` (end of `INVITE_ID` and `INVITE_EN`)
- Modify: `src/styles/tokens.css` (after `--nf-white`)
- Test: `tests/unit/strings.test.ts` (existing parity test, unchanged)

**Interfaces:**
- Produces: string keys `invite.track` (`{n}`), `invite.side_end`, `invite.do_hd`, `invite.dont_hd`; CSS token `--nf-paper`.

- [ ] **Step 1: Add the Indonesian keys**

In `src/lib/i18n/invite-strings.ts`, add before the closing `} as const;` of `INVITE_ID`:

```ts
  'invite.track': 'TRACK {n}',
  'invite.side_end': 'SIDE A · END',
  'invite.do_hd': 'BOLEH',
  'invite.dont_hd': 'JANGAN',
```

- [ ] **Step 2: Run the type check to verify English is now missing keys**

Run: `npx tsc --noEmit`
Expected: FAIL, `INVITE_EN` is missing properties `'invite.track'`, `'invite.side_end'`, `'invite.do_hd'`, `'invite.dont_hd'`.

- [ ] **Step 3: Add the English keys**

Add before the closing `};` of `INVITE_EN`:

```ts
  'invite.track': 'TRACK {n}',
  'invite.side_end': 'SIDE A · END',
  'invite.do_hd': 'DO',
  'invite.dont_hd': "DON'T",
```

- [ ] **Step 4: Add the paper token**

In `src/styles/tokens.css`, after the `--nf-white` line:

```css
  --nf-paper:      #F4F1E8; /* Polaroid frame */
```

- [ ] **Step 5: Run checks**

Run: `npx tsc --noEmit && npx vitest run tests/unit/strings.test.ts`
Expected: no type errors; strings tests PASS (same keys, same `{n}` placeholder in both languages).

- [ ] **Step 6: Commit**

```bash
git add src/lib/i18n/invite-strings.ts src/styles/tokens.css
git commit -m "Add track chip and do/don't header strings, and the paper colour"
```

---

### Task 3: Music drops on the click

**Files:**
- Modify: `src/components/invite/useMusic.ts` (whole file)

**Interfaces:**
- Consumes: `musicDropDelay` from `@/lib/invite/motion` (Task 1).
- Produces: `useMusic()` returns `{ start(dropAtMs?: number): void, stop(): void, toggle(): void, ready: boolean, muted: boolean }`. `start` must still be called inside the PRESS PLAY tap.

The song is played **muted** inside the tap (that unlocks audio on iOS), then rewound and unmuted at the drop. Mute also sets `muted`, because iOS ignores `volume`.

- [ ] **Step 1: Replace `src/components/invite/useMusic.ts`**

```ts
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { musicDropDelay } from '@/lib/invite/motion';

export const THEME_SRC = '/audio/nourishfest-theme.mp3';

/**
 * Looping theme song. start() must run inside the PRESS PLAY tap: that tap unlocks audio, so the song
 * starts there muted and is rewound and unmuted at `dropAtMs` (the tape click, motion spec §4.3).
 * `ready` turns true only once the file can play, so a missing song just means no mute button.
 * iOS ignores `volume`, so mute and the drop also use the `muted` property.
 */
export function useMusic() {
  const el = useRef<HTMLAudioElement | null>(null);
  const fader = useRef<ReturnType<typeof setInterval> | null>(null);
  const dropTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mutedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(false);

  const fade = useCallback((to: number, ms: number, done?: () => void) => {
    const a = el.current;
    if (!a) return;
    if (fader.current) clearInterval(fader.current);
    const from = a.volume;
    const t0 = performance.now();
    fader.current = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      a.volume = from + (to - from) * k;
      if (k === 1) { if (fader.current) clearInterval(fader.current); done?.(); }
    }, 50);
  }, []);

  const start = useCallback((dropAtMs: number = Date.now()) => {
    if (el.current) return;
    const a = new Audio(THEME_SRC);
    a.loop = true;
    a.preload = 'none';
    a.volume = 0;
    a.muted = true;
    el.current = a;
    a.addEventListener('canplay', () => {
      setReady(true);
      const drop = () => {
        if (el.current !== a) return;
        a.currentTime = 0;
        a.muted = mutedRef.current;
        a.play().catch(() => { /* blocked: stay silent */ });
        if (!mutedRef.current) fade(1, 600);
      };
      const wait = musicDropDelay(Date.now(), dropAtMs);
      if (wait > 0) dropTimer.current = setTimeout(drop, wait);
      else drop();
    }, { once: true });
    a.addEventListener('error', () => setReady(false));
    a.play().catch(() => { /* blocked or missing file: stay silent */ });
  }, [fade]);

  const stop = useCallback(() => {
    const a = el.current;
    if (!a) return;
    el.current = null;
    if (fader.current) clearInterval(fader.current);
    if (dropTimer.current) clearTimeout(dropTimer.current);
    const from = a.volume;
    const t0 = performance.now();
    const id = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / 800);
      a.volume = from * (1 - k);
      if (k === 1) { clearInterval(id); a.pause(); a.removeAttribute('src'); a.load(); }
    }, 50);
    setReady(false);
  }, []);

  const toggle = useCallback(() => {
    const a = el.current;
    if (!a) return;
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (next) {
      fade(0, 300, () => { a.muted = true; });
    } else {
      a.muted = false;
      fade(1, 300);
    }
  }, [fade]);

  // Pause when the tab is hidden, resume from the same point when it comes back.
  useEffect(() => {
    const onVis = () => {
      const a = el.current;
      if (!a) return;
      if (document.visibilityState === 'hidden') a.pause();
      else if (!mutedRef.current) a.play().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Release on unmount.
  useEffect(() => () => {
    if (fader.current) clearInterval(fader.current);
    if (dropTimer.current) clearTimeout(dropTimer.current);
    el.current?.pause();
    el.current = null;
  }, []);

  return { start, stop, toggle, ready, muted };
}
```

- [ ] **Step 2: Run checks**

Run: `npx tsc --noEmit && npm run lint && npm run test:unit`
Expected: no errors. The old `Invitation.tsx` still calls `music.start()` with no argument, which is valid (it drops immediately).

- [ ] **Step 3: Commit**

```bash
git add src/components/invite/useMusic.ts
git commit -m "Start the theme muted on the tap and drop it on the tape click"
```

---

### Task 4: Art updates

**Files:**
- Modify: `src/components/invite/art.tsx` (whole file)

**Interfaces:**
- Produces (used by Tasks 6 and 7):
  - `Cassette({ label, spin? })`: reels carry class `art-reel` (`spin` is now ignored and kept only so the old `Invitation.tsx` compiles until Task 8).
  - `Boombox({ playing? })`: speaker cones carry `art-sp`, window reels carry `art-wr` (`playing` ignored, same reason).
  - `Equalizer()`: unchanged for now; deleted in Task 8.
  - `MapPin({ className?, style? })`: no built-in shadow, viewBox `0 0 80 100`.
  - `MapStreets()`: `<svg className="art-streets">`, viewBox `0 0 248 160`, `preserveAspectRatio="none"`.
  - `Crowd()`: `<svg className="art-crowd">`, viewBox `0 0 120 120`, `role="img"` with an aria-label.

- [ ] **Step 1: Replace `src/components/invite/art.tsx`**

```tsx
import type { CSSProperties } from 'react';

/** Original inline SVG art for the invitation. Brand colours only (see tokens.css). Motion lives in invite.css. */

export function Cassette({ label }: { label: string; spin?: boolean }) {
  const reel = (cx: number) => (
    <g transform={`translate(${cx} 74)`}>
      <g className="art-reel">
        <circle r="17" fill="#0D0D0D" />
        <circle r="7" fill="#D4AF37" />
        <path d="M0-17V-7M15-8.5L6-3.5M-15-8.5L-6-3.5" stroke="#D4AF37" strokeWidth="3" />
      </g>
    </g>
  );
  return (
    <svg viewBox="0 0 240 150" className="art-cassette" role="img" aria-label={label}>
      <rect x="4" y="4" width="232" height="142" rx="12" fill="#FF1B6B" stroke="#0D0D0D" strokeWidth="4" />
      <rect x="22" y="14" width="196" height="50" rx="6" fill="#D4AF37" />
      <text x="120" y="45" textAnchor="middle" fontFamily="var(--nf-font-heading)" fontSize={Math.min(20, 190 / (label.length * 0.52))} fill="#0D0D0D">{label}</text>
      <rect x="40" y="52" width="160" height="44" rx="22" fill="#0D0D0D" opacity="0.85" />
      {reel(80)}
      {reel(160)}
      <path d="M70 146 L84 124 H156 L170 146Z" fill="#0D0D0D" />
    </svg>
  );
}

export function Boombox(_: { playing?: boolean } = {}) {
  const speaker = (cx: number) => (
    <g transform={`translate(${cx} 92)`}>
      <circle r="34" fill="#0D0D0D" stroke="#D4AF37" strokeWidth="4" />
      <circle r="20" fill="#2a2a2a" className="art-sp" />
      <circle r="7" fill="#FF1B6B" />
    </g>
  );
  const windowReel = (cx: number) => (
    <g className="art-wr">
      <circle cx={cx} cy="68" r="8" fill="#0D0D0D" />
      <rect x={cx - 1} y="61" width="2" height="14" fill="#D4AF37" />
    </g>
  );
  return (
    <svg viewBox="0 0 320 170" className="art-boombox" aria-hidden="true">
      <path d="M90 28 Q160 -6 230 28" fill="none" stroke="#D4AF37" strokeWidth="8" strokeLinecap="round" />
      <rect x="6" y="28" width="308" height="136" rx="16" fill="#39FF14" stroke="#0D0D0D" strokeWidth="5" />
      {speaker(64)}
      {speaker(256)}
      <rect x="112" y="46" width="96" height="44" rx="6" fill="#0D0D0D" />
      <rect x="120" y="54" width="80" height="28" rx="4" fill="#D4AF37" />
      {windowReel(138)}
      {windowReel(182)}
      <rect x="116" y="104" width="88" height="10" rx="5" fill="#0D0D0D" />
      <circle cx="132" cy="136" r="9" fill="#FF1B6B" stroke="#0D0D0D" strokeWidth="3" />
      <circle cx="160" cy="136" r="9" fill="#D4AF37" stroke="#0D0D0D" strokeWidth="3" />
      <circle cx="188" cy="136" r="9" fill="#FF1B6B" stroke="#0D0D0D" strokeWidth="3" />
    </svg>
  );
}

/** Removed in Task 8 together with the old opening markup. */
export function Equalizer() {
  return (
    <div className="eq" aria-hidden="true">
      {Array.from({ length: 12 }, (_, i) => <i key={i} style={{ animationDelay: `${(i * 97) % 600}ms` }} />)}
    </div>
  );
}

export function MapPin({ className = 'art-pin', style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 80 100" className={className} style={style} aria-hidden="true">
      <path d="M40 4C21 4 8 18 8 36c0 24 32 62 32 62s32-38 32-62C72 18 59 4 40 4z" fill="#FF1B6B" stroke="#0D0D0D" strokeWidth="4" />
      <circle cx="40" cy="36" r="12" fill="#0D0D0D" />
    </svg>
  );
}

/** A generic street grid for the Where scene. Not a real map. */
export function MapStreets() {
  return (
    <svg viewBox="0 0 248 160" preserveAspectRatio="none" className="art-streets" aria-hidden="true">
      <rect x="150" y="14" width="70" height="50" fill="#39FF14" opacity="0.16" />
      <g stroke="#D4AF37" strokeOpacity="0.35" strokeWidth="7" fill="none">
        <path d="M0 92 H248" /><path d="M60 0 V160" /><path d="M182 0 L140 160" />
      </g>
      <g stroke="#4a4a4a" strokeWidth="2" fill="none">
        <path d="M0 40 H248" /><path d="M0 132 H248" /><path d="M112 0 V160" /><path d="M224 0 V160" />
      </g>
    </svg>
  );
}

/** The Polaroid photo: an illustrated crowd at the NourishFest stage (motion spec §5.2). */
export function Crowd() {
  return (
    <svg viewBox="0 0 120 120" className="art-crowd" role="img" aria-label="Crowd at the NourishFest stage">
      <rect width="120" height="120" fill="#1b0a13" />
      <polygon points="22,0 32,0 62,120 30,120" fill="#FF1B6B" opacity="0.5" />
      <polygon points="88,0 98,0 92,120 58,120" fill="#39FF14" opacity="0.38" />
      <polygon points="55,0 65,0 82,120 38,120" fill="#D4AF37" opacity="0.32" />
      <circle cx="27" cy="4" r="4" fill="#D4AF37" />
      <circle cx="60" cy="4" r="4" fill="#D4AF37" />
      <circle cx="93" cy="4" r="4" fill="#D4AF37" />
      <rect x="24" y="44" width="72" height="14" fill="#D4AF37" />
      <text x="60" y="54.5" textAnchor="middle" fontFamily="var(--nf-font-display)" fontSize="7.5" fill="#0D0D0D">NOURISHFEST</text>
      <rect x="0" y="78" width="120" height="42" fill="#FF1B6B" opacity="0.22" />
      <g fill="#0D0D0D" stroke="#0D0D0D" strokeLinecap="round">
        <path d="M14 100 L8 74" strokeWidth="5" /><circle cx="8" cy="72" r="3.5" />
        <path d="M50 98 L44 70" strokeWidth="5" /><path d="M58 98 L66 72" strokeWidth="5" />
        <circle cx="44" cy="68" r="3.5" /><circle cx="66" cy="70" r="3.5" />
        <path d="M100 98 L110 76" strokeWidth="5" /><circle cx="111" cy="74" r="3.5" />
        <circle cx="10" cy="98" r="9" /><circle cx="30" cy="102" r="9" /><circle cx="54" cy="96" r="9" />
        <circle cx="76" cy="101" r="9" /><circle cx="98" cy="97" r="9" /><circle cx="118" cy="102" r="9" />
        <rect x="0" y="104" width="120" height="16" stroke="none" />
      </g>
    </svg>
  );
}
```

- [ ] **Step 2: Run checks**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors (the old `Invitation.tsx` still compiles: `spin`, `playing` and `Equalizer` still exist). If lint flags the unused `_` parameter in `Boombox`, keep it: it exists only for the transition and goes away in Task 8.

- [ ] **Step 3: Commit**

```bash
git add src/components/invite/art.tsx
git commit -m "Add crowd, street grid and boombox window reels to the invitation art"
```

---

### Task 5: Rewrite invite.css and guard it with a test

**Files:**
- Modify: `src/styles/invite.css` (replace the whole file)
- Test: `tests/unit/invite-css.test.ts` (new)

**Interfaces:**
- Produces the class contract used by Tasks 6–8:
  - Root: `.inv`, `.inv--gate`, `.inv--opening`, `.inv--scroll`, `.inv--leave`, `.inv--leave-fast`; exit keyframe `inv-leave`.
  - Bar: `.inv-bar`, `.inv-ctl`, `.inv-progress`; buttons `.inv-btn`, `.inv-btn--pink|gold|green`, `.inv-hint`, `.inv-skip`.
  - Stage: `.stage`, `.stage__gatebar`, `.stage-set` (uses `--k`), `.stage-cast` (end keyframe `inv-stage-out`), `.stage-bb`, `.stage-tapew`, `.stage-tape`, `.stage-eq` (bars use `--i`), `.stage-wm`, `.stage-wm__a`, `.stage-wm__b` (letters use `--i`), `.stage-stk`, `.stage-band`, `.stage-cta`, `.stage-press`.
  - Scenes: `.scenes`, `.scene`, `.is-in`, `.is-settled`, `.scene--invited`, `.scene--outro`, `.chip-track`, `.scene__title`, `.scene__bar`, `.glass`.
  - Motion: `.m` plus one of `.m-stamp .m-slam .m-settle .m-bar .m-hinge .m-roll .m-flip .m-drop .m-shadow .m-ripple .m-unfold .m-slide-l .m-slide-r .m-play .m-deal .m-eject .m-print .m-develop`. Per element: `--d` (delay in beats), and where used `--r` (angle), `--i` (index), `--n` (digit), `--dur` (beats), `--accent` (colour).
  - Scene parts: `.yo .cam .cam__slot .cam__clip .cam__flash .polaroid .polaroid__photo .polaroid__dark .polaroid__amber .polaroid__strip .polaroid__name .polaroid__meta .mark .mark__w .about .about__line .sticker-inv .persp .calcard .calcard__month .calcard__grid .calcard__circle .is-day .lcd .lcd__group .lcd__digits .lcd__dg .lcd__strip .lcd__today .btns .flip .flip__colon .big .tba .mapcard .mapcard__pin .mapcard__shadow .mapcard__ripple .jcard-wrap .jcard__head .jcard .cards .outfit .outfit--skip .outfit__x .rules .rules__panel .rules__hd .rules__ic .outro-tape .outro-btn`.

- [ ] **Step 1: Write the failing guard test**

Create `tests/unit/invite-css.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BEAT_MS } from '@/lib/invite/motion';

const css = readFileSync(path.resolve(__dirname, '../../src/styles/invite.css'), 'utf8');
const keyframes = [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)].map((m) => ({ name: m[1], body: m[2] }));
const ALLOWED = new Set(['transform', 'opacity', 'animation-timing-function']);

describe('invite.css motion rules', () => {
  it('declares the same beat as motion.ts', () => {
    expect(css).toContain(`--beat: ${BEAT_MS}ms`);
  });
  it('has keyframes to check', () => expect(keyframes.length).toBeGreaterThan(20));
  it('prefixes every keyframe with inv-', () => {
    for (const k of keyframes) expect(k.name, k.name).toMatch(/^inv-/);
  });
  it('animates transform and opacity only', () => {
    for (const k of keyframes) {
      const props = [...k.body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
      for (const p of props) expect(ALLOWED.has(p), `${k.name} animates ${p}`).toBe(true);
    }
  });
  it('drops the removed loops', () => {
    for (const name of ['sway', 'wobble', 'hue', 'bob', 'lcd-glow']) {
      expect(css).not.toMatch(new RegExp(`@keyframes\\s+(inv-)?${name}\\b`));
    }
  });
  it('no longer pins scenes to a screen height', () => expect(css).not.toContain('88dvh'));
  it('hides before-states only for phones that allow motion', () => {
    const at = css.indexOf('.scene:not(.is-in) .m');
    expect(at).toBeGreaterThan(-1);
    expect(css.lastIndexOf('@media (prefers-reduced-motion: no-preference)', at)).toBeGreaterThan(-1);
    expect(css).not.toContain('transform: none !important');
  });
  it('defines the exit and stage-end keyframes the components listen for', () => {
    const names = keyframes.map((k) => k.name);
    expect(names).toContain('inv-leave');
    expect(names).toContain('inv-stage-out');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/invite-css.test.ts`
Expected: FAIL (old file: no `--beat: 571ms`, unprefixed keyframes such as `spin`, `88dvh` present).

- [ ] **Step 3: Replace `src/styles/invite.css`**

```css
/* Invitation layer (motion spec 2026-10-19). Brand tokens only; animate transform and opacity only.
   Resting styles are the final state. "Before" states live only inside
   @media (prefers-reduced-motion: no-preference) or in a keyframe `from` reached through backwards/both fill. */

/* ---------- Root, tokens, controls ---------- */
.inv {
  --beat: 571ms; /* 105 BPM. Keep in step with BEAT_MS in src/lib/invite/motion.ts */
  --half: calc(var(--beat) / 2);
  --qtr: calc(var(--beat) / 4);
  --ease-slam: cubic-bezier(.34, 1.56, .64, 1);
  --ease-out: cubic-bezier(.2, .8, .2, 1);
  --ease-in: cubic-bezier(.5, 0, .9, .4);
  --glass: rgba(255, 255, 255, 0.09);
  --glass-edge: rgba(255, 255, 255, 0.22);
  --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.28);
  position: fixed; inset: 0; z-index: 50; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain;
  background-color: var(--nf-black); color: var(--nf-text);
  background-image: radial-gradient(circle at 15% 0%, rgba(255,27,107,0.45), transparent 45%), radial-gradient(circle at 100% 40%, rgba(57,255,20,0.18), transparent 42%),
    radial-gradient(circle at 0% 75%, rgba(212,175,55,0.22), transparent 45%), radial-gradient(rgba(212,175,55,0.18) 1.2px, transparent 1.5px);
  background-size: auto, auto, auto, 14px 14px;
}
.inv--gate, .inv--opening { overflow: hidden; }
/* Slow colour glow behind everything; it drifts only during the gate and the opening. */
.inv::before { content: ""; position: fixed; inset: -20%; z-index: -1; pointer-events: none;
  background: radial-gradient(circle at 30% 30%, rgba(255,27,107,0.28), transparent 35%), radial-gradient(circle at 70% 65%, rgba(57,255,20,0.14), transparent 35%); }

.inv-bar { position: sticky; top: 0; z-index: 3; display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 8px var(--nf-gutter); background: linear-gradient(var(--nf-black), transparent); }
.inv-progress { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: linear-gradient(90deg, var(--nf-pink), var(--nf-gold), var(--nf-green)); transform: scaleX(0); transform-origin: left; }
@supports (animation-timeline: scroll()) { .inv--scroll .inv-progress { animation: inv-grow linear both; animation-timeline: scroll(); } }
.inv-ctl { min-height: 48px; padding: 0 12px; background: var(--nf-card); border: 1px solid var(--glass-edge); border-radius: var(--nf-radius-pill); box-shadow: var(--glass-shadow); color: var(--nf-text); font-family: var(--nf-font-label); font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; }

.inv-btn { display: inline-flex; align-items: center; justify-content: center; min-height: 52px; padding: 0 28px; border: 0; border-radius: var(--nf-radius-btn);
  font-family: var(--nf-font-heading); font-size: 20px; letter-spacing: 0.05em; color: var(--nf-black); text-decoration: none; cursor: pointer; transition: transform 0.15s ease-out; touch-action: manipulation; }
.inv-btn:hover { transform: translateY(-2px); }
.inv-btn:active { transform: scale(0.96); }
.inv-btn--pink { background: var(--nf-pink); box-shadow: 4px 4px 0 var(--nf-gold); }
.inv-btn--gold { background: var(--nf-gold); }
.inv-btn--green { background: var(--nf-green); }
.inv-hint { margin: 0; font-size: 13px; color: var(--nf-text-soft); }
.inv-skip { min-height: 48px; padding: 0 16px; background: none; border: 0; color: var(--nf-text-soft); font-family: var(--nf-font-label); font-size: 14px; letter-spacing: 0.14em; text-transform: uppercase; text-decoration: underline; }

/* ---------- Stage: gate + opening on a 360 x 640 set (spec §4.1) ---------- */
.stage { position: absolute; inset: 0; }
.stage__gatebar { position: absolute; top: 8px; right: var(--nf-gutter); z-index: 4; }
.stage-set { position: absolute; left: 50%; top: 50%; width: 360px; height: 640px; transform: translate(-50%, -50%) scale(var(--k, 1)); }
.stage-cast { position: absolute; inset: 0; }
.stage-bb { position: absolute; left: 50px; top: 140px; width: 260px; }
.stage-bb .art-boombox { display: block; width: 100%; transform-origin: 50% 100%; }
.stage-tapew { position: absolute; left: 40px; top: 170px; width: 280px; z-index: 2; }
.stage-tape { transform-origin: 50% 50%; }
.stage-tape .art-cassette { display: block; width: 100%; }
.stage-eq { position: absolute; left: 0; right: 0; top: 300px; display: flex; justify-content: center; align-items: flex-end; gap: 4px; height: 44px; }
.stage-eq i { width: 10px; height: 44px; background: var(--nf-green); transform-origin: bottom; transform: scaleY(0.5); }
.stage-eq i:nth-child(3n) { background: var(--nf-gold); }
.stage-wm { position: absolute; left: 0; right: 0; top: 362px; margin: 0; font-family: var(--nf-font-display); font-weight: 400; font-size: 50px; line-height: 0.98; text-align: center; }
.stage-wm__a { display: block; color: var(--nf-text); }
.stage-wm__b { display: block; color: var(--nf-gold); text-shadow: 4px 4px 0 var(--nf-pink); }
.stage-wm span span { display: inline-block; }
.stage-stk { position: absolute; left: 50%; top: 480px; margin: 0; padding: 4px 16px; background: var(--nf-pink); color: var(--nf-black); font-family: var(--nf-font-heading); font-size: 22px; white-space: nowrap; transform: translateX(-50%) rotate(-4deg); }
.stage-band { position: absolute; left: -20px; right: -20px; top: -40px; height: 26px; background: rgba(255,27,107,0.35); border-top: 2px solid rgba(57,255,20,0.6); opacity: 0; pointer-events: none; }
.stage-cta { position: absolute; left: 0; right: 0; top: 380px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.art-reel, .art-wr, .art-sp { transform-box: fill-box; transform-origin: center; }
/* Gate: only the cassette and the buttons show. */
.inv--gate .stage-bb { transform: translateY(560px); }
.inv--gate .stage-eq, .inv--gate .stage-wm, .inv--gate .stage-stk { opacity: 0; }
/* Opening: the buttons are gone and the tape ends hidden inside the boombox. */
.inv--opening .stage-cta { opacity: 0; pointer-events: none; }
.inv--opening .stage-tape { opacity: 0; }

/* ---------- Scenes (spec §6) ---------- */
.scenes { padding-bottom: 40px; }
.scene { position: relative; display: flex; flex-direction: column; align-items: center; gap: 14px; max-width: 480px; margin: 0 auto; padding: 44px var(--nf-gutter); text-align: center; }
.scene--invited { padding-top: 12px; }
.chip-track { padding: 3px 10px; border: 1.5px solid var(--nf-gold); color: var(--nf-gold); font-family: var(--nf-font-label); font-size: 12px; letter-spacing: 0.24em; }
.scene__title { margin: 0; font-family: var(--nf-font-heading); font-weight: 400; font-size: 32px; line-height: 1.05; letter-spacing: 0.04em; color: var(--nf-gold); text-transform: uppercase; text-wrap: balance; }
.scene__bar { display: block; width: 64px; height: 4px; margin-top: -6px; background: var(--nf-pink); }
.big { margin: 0; font-family: var(--nf-font-heading); font-size: 28px; text-transform: uppercase; overflow-wrap: anywhere; }
.tba { margin: 0; font-family: var(--nf-font-label); font-size: 18px; letter-spacing: 0.12em; color: var(--nf-text-soft); }
.btns { display: flex; flex-direction: column; align-items: center; gap: 10px; width: 100%; }
.btns .inv-btn { width: 100%; max-width: 320px; }

/* Glass surfaces: translucent fill always; the blur only once a scene has settled (spec §6.4). */
.glass { position: relative; background: var(--nf-card); border: 1px solid var(--glass-edge); box-shadow: var(--glass-shadow); }
@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
  .glass, .inv-ctl { background: var(--glass); }
  .is-settled .glass, .inv-ctl { -webkit-backdrop-filter: blur(16px) saturate(160%); backdrop-filter: blur(16px) saturate(160%); }
  .inv-bar { background: linear-gradient(rgba(13,13,13,0.7), transparent); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }
  .lcd.glass { background: rgba(11, 26, 7, 0.45); }
}
@media (prefers-reduced-transparency: reduce) {
  .glass, .lcd.glass, .inv-ctl, .inv-bar { background: var(--nf-card) !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
}

/* Scene 2: Polaroid */
.yo { margin: 0; font-family: var(--nf-font-heading); font-size: 32px; line-height: 1.1; text-transform: uppercase; text-wrap: balance; }
.cam { position: relative; width: 100%; height: 370px; }
.cam__slot { position: absolute; left: 50%; top: 0; z-index: 2; width: 260px; height: 30px; margin-left: -130px; background: var(--nf-surface); border: 2px solid var(--nf-gold); border-radius: 8px; opacity: 0; }
.cam__slot::after { content: ""; position: absolute; left: 14px; right: 14px; top: 10px; height: 6px; background: var(--nf-black); border-radius: 3px; }
.cam__clip { position: absolute; left: calc(-1 * var(--nf-gutter)); right: calc(-1 * var(--nf-gutter)); top: 30px; bottom: 0; overflow: hidden; }
.cam__flash { position: absolute; inset: 0; z-index: 3; background: var(--nf-gold); opacity: 0; pointer-events: none; }
.polaroid { width: 232px; margin: 10px auto 0; padding: 12px 12px 0; background: var(--nf-paper); color: var(--nf-black); box-shadow: 6px 6px 0 var(--nf-pink); transform-origin: 50% 0; transform: translateY(3px) rotate(-3deg); }
.polaroid__photo { position: relative; aspect-ratio: 1; overflow: hidden; }
.polaroid__photo .art-crowd { display: block; width: 100%; height: 100%; }
.polaroid__dark, .polaroid__amber { position: absolute; inset: 0; opacity: 0; }
.polaroid__dark { background: #1e1712; }
.polaroid__amber { background: #7a4a1c; }
.polaroid__strip { padding: 10px 0 14px; }
.polaroid__name { margin: 0; font-family: var(--nf-font-heading); font-size: 24px; text-transform: uppercase; overflow-wrap: anywhere; }
.polaroid__meta { margin: 0; font-family: var(--nf-font-label); font-size: 14px; letter-spacing: 0.1em; }

/* Scene 3: About */
.mark { margin: 0; font-family: var(--nf-font-display); font-weight: 400; font-size: 30px; color: var(--nf-gold); text-shadow: 3px 3px 0 var(--nf-pink); }
.mark__w { display: inline-block; white-space: nowrap; }
.mark__w span { display: inline-block; }
.about { margin: 0; max-width: 34ch; }
.about__line { display: block; font-size: 18px; line-height: 1.5; }
.sticker-inv { margin: 0; padding: 4px 16px; background: var(--nf-pink); color: var(--nf-black); font-family: var(--nf-font-heading); font-size: 22px; }

/* Scene 4: Save the date */
.persp { width: min(88vw, 320px); perspective: 800px; }
.calcard { padding: 16px; border-radius: 22px; transform-origin: 50% 0; }
.calcard__month { margin: 0 0 8px; font-family: var(--nf-font-heading); letter-spacing: 0.1em; color: var(--nf-gold); }
.calcard__grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; font-family: var(--nf-font-label); font-size: 15px; }
.calcard__grid b { color: var(--nf-text-muted); font-weight: 600; }
.calcard__grid span { position: relative; padding: 5px 0; }
.calcard__grid .is-day { z-index: 0; isolation: isolate; color: var(--nf-black); font-weight: 600; }
.calcard__circle { position: absolute; inset: -2px; z-index: -1; width: 100%; height: calc(100% + 4px); fill: var(--nf-pink); }
.lcd { display: flex; align-items: flex-start; justify-content: center; gap: 6px; padding: 10px 16px; border-radius: 16px; font-family: var(--nf-font-display); font-size: 40px; color: var(--nf-green); }
.lcd__group { display: flex; flex-direction: column; align-items: center; }
.lcd__group small { font-family: var(--nf-font-label); font-size: 12px; letter-spacing: 0.14em; color: var(--nf-text-soft); }
.lcd__digits { display: flex; }
.lcd__dg { display: block; width: 0.66em; height: 1em; overflow: hidden; line-height: 1; font-variant-numeric: tabular-nums; }
.lcd__strip { display: block; transform: translateY(calc(var(--n, 0) * -1em)); }
.lcd__strip i { display: block; height: 1em; font-style: normal; }
.lcd__today { font-size: 28px; }

/* Scene 5: What time */
.flip { display: flex; gap: 4px; margin: 0; perspective: 600px; font-family: var(--nf-font-display); font-size: 56px; color: var(--nf-gold); }
.flip b { padding: 2px 8px; border: 2px solid var(--nf-gold); border-radius: 8px; font-weight: 400; transform-origin: 50% 0; }
.flip__colon { align-self: center; font-style: normal; }

/* Scene 6: Where */
.mapcard { position: relative; width: 100%; height: 160px; overflow: hidden; background: var(--nf-surface); border: 2px solid var(--nf-line); border-radius: 14px; }
.mapcard .art-streets { display: block; width: 100%; height: 100%; }
.mapcard__pin { position: absolute; left: 50%; top: 30px; z-index: 2; width: 44px; margin-left: -22px; }
.mapcard__shadow { position: absolute; left: 50%; top: 80px; width: 32px; height: 9px; margin-left: -16px; border-radius: 50%; background: #000; opacity: 0.5; }
.mapcard__ripple { position: absolute; left: 50%; top: 67px; width: 52px; height: 34px; margin-left: -26px; border: 2px solid var(--nf-pink); border-radius: 50%; opacity: 0; }

/* Scene 7: Tracklist */
.jcard-wrap { position: relative; width: 100%; transform-origin: 50% 0; }
.jcard__head { position: absolute; left: 10px; top: 24px; z-index: 1; width: 0; height: 0; border-left: 11px solid var(--nf-pink); border-top: 7px solid transparent; border-bottom: 7px solid transparent; transform: translateY(170px); }
.jcard { margin: 0; padding: 14px 16px 14px 30px; list-style: none; width: 100%; text-align: left; background: var(--nf-gold); color: var(--nf-black); border-radius: 8px; font-family: var(--nf-font-body); font-weight: 600; }
.jcard li { height: 34px; line-height: 34px; font-size: 14px; border-bottom: 1px dashed var(--nf-black); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.jcard li:last-child { border-bottom: 0; }
.jcard b { font-family: var(--nf-font-display); font-weight: 400; margin-right: 8px; }

/* Scene 8: Dress code (glass) */
.cards { display: flex; flex-direction: column; gap: 10px; width: 100%; }
.outfit { height: 72px; padding: 9px 14px 9px 22px; overflow: hidden; border-radius: 14px; text-align: left; }
.outfit::before, .rules__panel::before { content: ""; position: absolute; left: 0; top: 12px; bottom: 12px; width: 5px; border-radius: 0 5px 5px 0; background: var(--accent); }
.outfit h3 { margin: 0; font-family: var(--nf-font-heading); font-weight: 400; font-size: 19px; color: var(--nf-text); text-transform: uppercase; }
.outfit p { margin: 2px 0 0; font-size: 13px; font-weight: 500; line-height: 1.3; color: rgba(245, 245, 240, 0.85); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.outfit--skip { padding-left: 14px; border: 1.5px dashed rgba(255, 255, 255, 0.4); }
.outfit--skip::before { display: none; }
.outfit--skip h3, .outfit--skip p { color: rgba(245, 245, 240, 0.7); }
.outfit__x { position: absolute; right: 14px; top: 14px; font-family: var(--nf-font-display); font-size: 26px; color: var(--nf-pink); }

/* Scene 9: Do's & Don'ts (glass) */
.rules { display: grid; gap: 14px; width: 100%; text-align: left; }
.rules__panel { padding: 12px 14px 14px 22px; overflow: hidden; border-radius: 14px; }
.rules__hd { margin: 0 0 8px; font-family: var(--nf-font-heading); font-size: 18px; letter-spacing: 0.08em; color: var(--accent); }
.rules ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 9px; }
.rules li { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 500; color: var(--nf-text); }
.rules__ic { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background: var(--accent); color: var(--nf-black); font-family: var(--nf-font-display); font-size: 12px; }

/* Scene 10: Outro */
.outro-tape { width: min(92vw, 360px); }
.outro-tape .art-cassette { display: block; width: 100%; }
.scene--outro .big { max-width: 14ch; }

/* Resting angle for stamped elements; the stamp keyframe lands here. */
.m-stamp { transform: rotate(var(--r, 0deg)); }

/* ---------- Motion: only for phones that allow it ---------- */
@media (prefers-reduced-motion: no-preference) {
  /* Gate and opening (spec §4.2) */
  .inv--gate::before, .inv--opening::before { animation: inv-drift 16s ease-in-out infinite alternate; }
  .inv--gate .stage-tapew { animation: inv-float 3.2s ease-in-out infinite; }
  .inv--opening .stage-tapew { animation: inv-float 3.2s ease-in-out infinite paused; }
  .inv--gate .art-reel { animation: inv-spin 4s linear infinite; }
  .inv--gate .stage-press { animation: inv-pulse var(--beat) ease-in-out infinite alternate; }
  .inv--opening .stage-cta { animation: inv-fade-out var(--qtr) var(--ease-in) backwards; }
  .inv--opening .stage-tape { animation: inv-tape calc(var(--beat) * 2) linear both; }
  .inv--opening .stage-tape .art-reel { animation: inv-spin var(--beat) linear infinite; }
  .inv--opening .stage-bb { animation: inv-rise var(--beat) var(--ease-slam) var(--half) backwards; }
  .inv--opening .stage-bb .art-boombox { animation: inv-squash var(--half) var(--ease-out) calc(var(--beat) * 2); }
  .inv--opening .art-wr { animation: inv-spin var(--beat) linear calc(var(--beat) * 2) infinite; }
  .inv--opening .art-sp { animation: inv-pump var(--half) ease-in-out calc(var(--beat) * 2) infinite alternate; }
  .inv--opening .stage-eq i { animation: inv-pop var(--half) var(--ease-slam) calc(var(--beat) * 2.25 + var(--i) * 40ms) both, inv-eq var(--half) ease-in-out calc(var(--beat) * 3 + var(--i) * 53ms) infinite alternate; }
  .inv--opening .stage-cast { animation: inv-glitch calc(var(--beat) * 0.4) steps(1) calc(var(--beat) * 4), inv-stage-out calc(var(--beat) * 1.25) var(--ease-in) calc(var(--beat) * 10.75) forwards; }
  .inv--opening .stage-band { animation: inv-band calc(var(--beat) * 0.6) linear calc(var(--beat) * 4); }
  .inv--opening .stage-wm__a span { animation: inv-slam var(--beat) var(--ease-slam) calc(var(--beat) * 5 + var(--i) * 55ms) backwards; }
  .inv--opening .stage-wm__b span { animation: inv-slam var(--beat) var(--ease-slam) calc(var(--beat) * 6 + var(--i) * 55ms) backwards; }
  .inv--opening .stage-wm { animation: inv-glitch calc(var(--beat) * 0.35) steps(1) calc(var(--beat) * 7.25); }
  .inv--opening .stage-stk { animation: inv-drop-x var(--beat) var(--ease-slam) calc(var(--beat) * 7.5) backwards; }

  /* Scenes: before-state, shared delay and fill */
  .scene:not(.is-in) .m { opacity: 0; }
  .is-in .m { animation-delay: calc(var(--beat) * var(--d, 0)); animation-fill-mode: backwards; }
  .is-in .m-stamp { animation-name: inv-stamp; animation-duration: var(--half); animation-timing-function: var(--ease-slam); }
  .is-in .m-slam { animation-name: inv-slam; animation-duration: var(--beat); animation-timing-function: var(--ease-slam); }
  .is-in .m-settle { animation-name: inv-settle; animation-duration: var(--half); animation-timing-function: var(--ease-out); }
  .is-in .m-bar { animation-name: inv-bar; animation-duration: var(--half); animation-timing-function: var(--ease-slam); }
  .is-in .m-hinge { animation-name: inv-hinge; animation-duration: var(--beat); animation-timing-function: var(--ease-out); }
  .is-in .m-roll { animation-name: inv-roll; animation-duration: var(--beat); animation-timing-function: var(--ease-out); }
  .is-in .m-flip { animation-name: inv-flip; animation-duration: var(--half); animation-timing-function: var(--ease-out); }
  .is-in .m-drop { animation-name: inv-drop; animation-duration: var(--beat); animation-timing-function: var(--ease-slam); }
  .is-in .m-shadow { animation-name: inv-shadow; animation-duration: var(--beat); animation-timing-function: var(--ease-out); }
  .is-in .m-ripple { animation-name: inv-ripple; animation-duration: var(--beat); animation-timing-function: var(--ease-out); }
  .is-in .m-unfold { animation-name: inv-unfold; animation-duration: calc(var(--beat) * 0.75); animation-timing-function: var(--ease-out); }
  .is-in .m-slide-l { animation-name: inv-slide-l; animation-duration: var(--half); animation-timing-function: var(--ease-out); }
  .is-in .m-slide-r { animation-name: inv-slide-r; animation-duration: var(--half); animation-timing-function: var(--ease-out); }
  .is-in .m-play { animation-name: inv-play; animation-duration: calc(var(--beat) * 0.85); animation-timing-function: steps(5, end); }
  .is-in .m-deal { animation-name: inv-deal; animation-duration: var(--half); animation-timing-function: var(--ease-slam); }
  .is-in .m-eject { animation-name: inv-eject; animation-duration: var(--beat); animation-timing-function: var(--ease-slam); }
  .is-in .m-print { animation-name: inv-print; animation-duration: calc(var(--beat) * 2); animation-timing-function: var(--ease-out); }
  .is-in .m-develop { animation-name: inv-develop; animation-duration: calc(var(--beat) * var(--dur, 3)); animation-timing-function: var(--ease-in); }
  .is-in .cam__slot { animation: inv-slot calc(var(--beat) * 4.75) linear var(--half) backwards; }
  .is-in .cam__flash { animation: inv-flash var(--half) ease-out calc(var(--beat) * 1.25); }
  .is-in.scene--outro .art-reel { animation: inv-spin var(--beat) linear calc(var(--beat) * 1.25) infinite; }
  .is-in .outro-btn { animation: inv-drop var(--beat) var(--ease-slam) calc(var(--beat) * 1.75) backwards, inv-pulse var(--beat) ease-in-out calc(var(--beat) * 2.75) infinite alternate; }

  /* Exit (spec §7) */
  .inv--leave { animation: inv-leave var(--beat) var(--ease-in) var(--half) forwards; }
  .inv--leave .outro-tape { animation: inv-eject-up var(--half) var(--ease-in) forwards; }
  .inv--leave-fast { animation: inv-leave var(--half) var(--ease-in) forwards; }
}

/* ---------- Keyframes ---------- */
@keyframes inv-drift { from { transform: translate(-6%, -4%) rotate(0deg); } to { transform: translate(6%, 5%) rotate(12deg); } }
@keyframes inv-float { 50% { transform: translateY(-8px) rotate(-1deg); } }
@keyframes inv-spin { to { transform: rotate(360deg); } }
@keyframes inv-pulse { to { transform: scale(1.05); } }
@keyframes inv-fade-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(10px); } }
@keyframes inv-tape {
  0% { transform: none; opacity: 1; animation-timing-function: cubic-bezier(.2, .8, .2, 1); }
  45% { transform: translateY(-162px) scale(0.6) rotate(-6deg); }
  60% { transform: translateY(-162px) scale(0.6) rotate(-6deg); animation-timing-function: cubic-bezier(.5, 0, .9, .4); }
  96% { transform: translateY(-62px) scale(0.25); opacity: 1; }
  100% { transform: translateY(-62px) scale(0.25); opacity: 0; }
}
@keyframes inv-rise { from { transform: translateY(560px); } }
@keyframes inv-squash { from { transform: scale(1.05, 0.9); } }
@keyframes inv-pump { to { transform: scale(1.18); } }
@keyframes inv-pop { from { transform: scaleY(0); } to { transform: scaleY(0.5); } }
@keyframes inv-eq { from { transform: scaleY(0.2); } to { transform: scaleY(1); } }
@keyframes inv-glitch { 0% { transform: translateX(-7px) skewX(-6deg); } 33% { transform: translateX(6px); } 66% { transform: translateX(-3px); } 100% { transform: none; } }
@keyframes inv-band { from { opacity: 1; transform: translateY(0); } to { opacity: 1; transform: translateY(720px); } }
@keyframes inv-stage-out { to { opacity: 0; transform: scale(0.94) translateY(20px); } }
@keyframes inv-drop-x { from { opacity: 0; transform: translateX(-50%) translateY(-60px) rotate(-4deg); } }
@keyframes inv-stamp { from { opacity: 0; transform: scale(1.8) rotate(var(--r, 0deg)); } }
@keyframes inv-slam { from { opacity: 0; transform: scale(2.2); } }
@keyframes inv-settle { from { opacity: 0; transform: translateY(16px); } }
@keyframes inv-bar { from { transform: scaleX(0); } }
@keyframes inv-hinge { from { opacity: 0; transform: rotateX(-80deg); } }
@keyframes inv-roll { from { transform: translateY(0); } }
@keyframes inv-flip { from { opacity: 0; transform: rotateX(90deg); } }
@keyframes inv-drop { from { opacity: 0; transform: translateY(-70px); } }
@keyframes inv-shadow { 0% { opacity: 0; transform: scaleX(0.3); } 60% { opacity: 0.6; transform: scaleX(1.3); } }
@keyframes inv-ripple { 0% { opacity: 0.9; transform: scale(0.3); } 100% { opacity: 0; transform: scale(2.4); } }
@keyframes inv-unfold { from { opacity: 0; transform: scaleY(0); } }
@keyframes inv-slide-l { from { opacity: 0; transform: translateX(-24px); } }
@keyframes inv-slide-r { from { opacity: 0; transform: translateX(24px); } }
@keyframes inv-play { from { transform: translateY(0); } }
@keyframes inv-deal { from { opacity: 1; transform: translateY(calc(var(--i, 0) * -82px)) rotate(var(--r, 0deg)); } }
@keyframes inv-eject { 0% { opacity: 0; transform: translateY(90px); } 60% { opacity: 1; transform: translateY(-10px); } }
@keyframes inv-eject-up { to { opacity: 0; transform: translateY(-60px); } }
@keyframes inv-print {
  0% { transform: translateY(-112%); }
  55% { transform: translateY(6px) rotate(0deg); }
  75% { transform: translateY(2px) rotate(-6deg); }
  90% { transform: translateY(3px) rotate(-1.5deg); }
  100% { transform: translateY(3px) rotate(-3deg); }
}
@keyframes inv-develop { from { opacity: 1; } to { opacity: 0; } }
@keyframes inv-slot {
  0% { opacity: 0; transform: translateY(-40px); animation-timing-function: cubic-bezier(.34, 1.56, .64, 1); }
  21% { opacity: 1; transform: none; }
  79% { opacity: 1; transform: none; animation-timing-function: cubic-bezier(.5, 0, .9, .4); }
  100% { opacity: 0; transform: translateY(-30px); }
}
@keyframes inv-flash { 0% { opacity: 0; } 30% { opacity: 0.5; } 100% { opacity: 0; } }
@keyframes inv-leave { to { opacity: 0; transform: translateY(-24px); } }
@keyframes inv-grow { to { transform: scaleX(1); } }
```

Notes for the implementer:
- Most keyframes have no `to`: the browser animates to the element's resting style, which is the final state. That is also why the countdown digits follow `--n` when it changes every 30 s.
- `inv-deal` uses 82 px per card: card height 72 px + 10 px gap. Cards are 72 px (not the spec's original 60 px) so the longer Indonesian descriptions fit on two lines instead of being cut off; the spec has been updated to match.
- `inv-slot` covers the slot's whole life (in at ½ beat, out at 4.25 beats) in one animation so backwards fill keeps it visible between.

- [ ] **Step 4: Run the guard test to verify it passes**

Run: `npx vitest run tests/unit/invite-css.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Run everything**

Run: `npm run test:unit && npx tsc --noEmit`
Expected: all PASS. The running app now looks broken (old markup, new CSS); Tasks 6–8 fix that.

- [ ] **Step 6: Commit**

```bash
git add src/styles/invite.css tests/unit/invite-css.test.ts
git commit -m "Rewrite invitation CSS on the 105 BPM move library"
```

---

### Task 6: Stage component (gate + opening)

**Files:**
- Create: `src/components/invite/Stage.tsx`

**Interfaces:**
- Consumes: `OPENING_BACKUP_MS`, `stageScale`, `tickVisible` (Task 1); `Boombox`, `Cassette` (Task 4); stage classes and keyframe `inv-stage-out` (Task 5).
- Produces: `Stage({ phase, label, onPlay, onSkip, onEnd })` with `phase: 'gate' | 'opening'`, `label: string` (already translated cassette label), `onPlay(): void` (called inside the PRESS PLAY tap), `onSkip(): void` (gate Skip), `onEnd(): void` (called once when the opening ends).

- [ ] **Step 1: Create `src/components/invite/Stage.tsx`**

```tsx
'use client';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { LangToggle } from '@/components/LangToggle';
import { useI18n } from '@/lib/i18n';
import { OPENING_BACKUP_MS, stageScale, tickVisible } from '@/lib/invite/motion';
import { Boombox, Cassette } from './art';

type Props = {
  phase: 'gate' | 'opening';
  /** Translated cassette label, e.g. "MIXTAPE UNTUK Kadek Ayu". */
  label: string;
  /** Called inside the PRESS PLAY tap, so audio can start there. */
  onPlay: () => void;
  onSkip: () => void;
  /** Called once when the opening has finished. */
  onEnd: () => void;
};

const letters = (word: string) =>
  word.split('').map((c, i) => <span key={i} style={{ '--i': i } as CSSProperties}>{c}</span>);

/**
 * Gate and opening on one fixed 360 x 640 set (motion spec §4). The cassette stays mounted across the tap,
 * so the gate hands over to the opening without a jump. The opening ends on the cast's `inv-stage-out`
 * animationend, with a backup after OPENING_BACKUP_MS of visible time.
 */
export function Stage({ phase, label, onPlay, onSkip, onEnd }: Props) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  const onEndRef = useRef(onEnd);
  const ended = useRef(false);

  useEffect(() => { onEndRef.current = onEnd; }, [onEnd]);

  const end = useCallback(() => {
    if (ended.current) return;
    ended.current = true;
    onEndRef.current();
  }, []);

  useEffect(() => {
    const fit = () => { const el = box.current; if (el) setK(stageScale(el.clientWidth, el.clientHeight)); };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  useEffect(() => {
    if (phase !== 'opening') return;
    let seen = 0;
    const id = setInterval(() => {
      seen = tickVisible(seen, 250, document.visibilityState === 'visible');
      if (seen >= OPENING_BACKUP_MS) end();
    }, 250);
    return () => clearInterval(id);
  }, [phase, end]);

  return (
    <div ref={box} className="stage">
      {phase === 'gate' && <div className="stage__gatebar"><LangToggle /></div>}
      <div className="stage-set" style={{ '--k': k } as CSSProperties}>
        <div
          className="stage-cast"
          onAnimationEnd={(e) => { if (e.target === e.currentTarget && e.animationName === 'inv-stage-out') end(); }}
        >
          <div className="stage-bb"><Boombox /></div>
          <div className="stage-tapew"><div className="stage-tape"><Cassette label={label} /></div></div>
          <div className="stage-eq" aria-hidden="true">
            {Array.from({ length: 12 }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties} />)}
          </div>
          <h1 className="stage-wm" aria-label="NourishFest">
            <span className="stage-wm__a" aria-hidden="true">{letters('NOURISH')}</span>
            <span className="stage-wm__b" aria-hidden="true">{letters('FEST')}</span>
          </h1>
          <p className="stage-stk">{t('brand.tagline')}</p>
          <i className="stage-band" aria-hidden="true" />
        </div>
        <div className="stage-cta">
          <button type="button" className="inv-btn inv-btn--pink stage-press" onClick={onPlay} disabled={phase !== 'gate'}>
            {t('invite.press_play')}
          </button>
          <p className="inv-hint">{t('invite.sound_hint')}</p>
          <button type="button" className="inv-skip" onClick={onSkip} disabled={phase !== 'gate'}>{t('invite.skip')}</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run checks**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors (the component is not used yet).

- [ ] **Step 3: Commit**

```bash
git add src/components/invite/Stage.tsx
git commit -m "Add the stage component for the invitation gate and opening"
```

---

### Task 7: Scenes component (scenes 2–10)

**Files:**
- Create: `src/components/invite/Scenes.tsx`

**Interfaces:**
- Consumes: `BEAT_MS`, `SETTLE_BEATS`, `splitLines` (Task 1); string keys from Task 2; `Cassette`, `Crowd`, `MapPin`, `MapStreets` (Task 4); scene classes (Task 5); `buildIcs`, `googleCalendarUrl`, `CalInput` (existing `src/lib/invite/calendar.ts`); `countdownParts`, `witaDate` (existing `src/lib/invite/time.ts`); `formatTimeWita` (existing `src/lib/time.ts`).
- Produces: `Scenes({ data, token, label, root, onViewPass })` with `data: PassData`, `token: string`, `label: string`, `root: HTMLElement | null` (the invitation scroller, for the IntersectionObserver), `onViewPass(): void`.

- [ ] **Step 1: Create `src/components/invite/Scenes.tsx`**

```tsx
'use client';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import type { StringKey } from '@/lib/i18n/strings';
import { buildIcs, googleCalendarUrl, type CalInput } from '@/lib/invite/calendar';
import { BEAT_MS, SETTLE_BEATS, splitLines } from '@/lib/invite/motion';
import { countdownParts, witaDate } from '@/lib/invite/time';
import type { PassData } from '@/lib/pass';
import { formatTimeWita } from '@/lib/time';
import { Cassette, Crowd, MapPin, MapStreets } from './art';

const k = (s: string) => s as StringKey;
const pad = (n: number) => String(n).padStart(2, '0');
/** Motion delay in beats plus any extra custom properties (`--r`, `--i`, `--n`, `--dur`, `--accent`). */
const d = (beats: number, extra: Record<string, string | number> = {}) => ({ '--d': beats, ...extra }) as CSSProperties;
const STEP = 0.17; // beats between list items
const TILTS = ['-8deg', '6deg', '-4deg', '8deg', '-6deg'];
const ACCENTS = ['var(--nf-pink)', 'var(--nf-gold)', 'var(--nf-pink)', 'var(--nf-gold)'];
const STRIP = Array.from({ length: 10 }, (_, i) => <i key={i}>{i}</i>);

/**
 * One scroll scene. Plays once when its top crosses 80% of the scroller's height (spec §6.1), then
 * gets `is-settled` SETTLE_BEATS later, which switches on glass blur once nothing is moving.
 */
function Scene({ root, className = '', children }: { root: HTMLElement | null; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState('');
  useEffect(() => {
    const el = ref.current;
    if (!el || !root) return;
    if (typeof IntersectionObserver === 'undefined') { setState('is-in is-settled'); return; }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      setState('is-in');
      timer = setTimeout(() => setState('is-in is-settled'), SETTLE_BEATS * BEAT_MS);
    }, { root, rootMargin: '0px 0px -20% 0px', threshold: 0 });
    io.observe(el);
    return () => { io.disconnect(); if (timer) clearTimeout(timer); };
  }, [root]);
  return <section ref={ref} className={`scene ${className} ${state}`.trim()}>{children}</section>;
}

function Chip({ n }: { n: number | 'end' }) {
  const { t } = useI18n();
  return <span className="chip-track m m-stamp">{n === 'end' ? t('invite.side_end') : t('invite.track', { n: pad(n) })}</span>;
}

function Title({ children }: { children: ReactNode }) {
  return (
    <>
      <h2 className="scene__title m m-slam" style={d(0.25)}>{children}</h2>
      <i className="scene__bar m m-bar" style={d(0.75)} aria-hidden="true" />
    </>
  );
}

function Digits({ value, label }: { value: string; label: string }) {
  return (
    <div className="lcd__group">
      <span className="sr-only">{value}</span>
      <span className="lcd__digits" aria-hidden="true">
        {value.split('').map((c, i) => (
          <span key={i} className="lcd__dg">
            <span className="lcd__strip m m-roll" style={d(1.75, { '--n': Number(c) })}>{STRIP}</span>
          </span>
        ))}
      </span>
      <small>{label}</small>
    </div>
  );
}

/** Letters of a word that slam in 0.06 beat apart, starting at beat 0.25 (About scene). */
function SlamWord({ word, start }: { word: string; start: number }) {
  return (
    <span className="mark__w">
      {word.split('').map((c, i) => <span key={i} className="m m-slam" style={d(0.25 + (start + i) * 0.06)}>{c}</span>)}
    </span>
  );
}

type Props = { data: PassData; token: string; label: string; root: HTMLElement | null; onViewPass: () => void };

export function Scenes({ data, token, label, root, onViewPass }: Props) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  const offset = useRef(Date.parse(data.server_now) - Date.now());
  const ev = data.event;

  // Countdown ticks every 30 s, but only while the tab is visible.
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible') setNow(Date.now()); }, 30_000);
    return () => clearInterval(id);
  }, []);

  const first = data.guest.full_name.trim().split(/\s+/)[0] ?? '';
  const doors = ev.doors_at ? formatTimeWita(ev.doors_at) : null;
  const starts = ev.starts_at ? formatTimeWita(ev.starts_at) : null;
  const serverNow = now + offset.current;
  const isToday = witaDate(serverNow) >= ev.date;
  const cd = ev.doors_at ? countdownParts(Date.parse(ev.doors_at), serverNow) : null;

  const cal = useMemo<CalInput | null>(() => {
    if (!ev.doors_at) return null;
    const startMs = Date.parse(ev.doors_at);
    const endMs = ev.ends_at ? Date.parse(ev.ends_at) : Date.parse(`${ev.date}T23:00:00+08:00`);
    const link = `${window.location.origin}/pass/${token}`;
    return {
      title: 'NourishFest 2026', startMs, endMs, location: ev.venue ?? '',
      details: `${t('invite.doors', { doors: formatTimeWita(ev.doors_at) })}\n${t('invite.dress_title')}\n${link}`,
      uid: `${token.slice(0, 8)}@nourishfest`,
    };
  }, [ev, token, t]);

  function saveIcs() {
    if (!cal) return;
    const url = URL.createObjectURL(new Blob([buildIcs(cal)], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'nourishfest-2026.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  const tba = (beats: number) => <p className="tba m m-settle" style={d(beats)}>{t('invite.tba')}</p>;
  const digitIndex = (s: string, i: number) => s.slice(0, i).replace(/\D/g, '').length;

  return (
    <div className="scenes">
      {/* 2 · Polaroid (spec §5) */}
      <Scene root={root} className="scene--invited">
        <p className="yo m m-settle">{t('invite.yo', { firstname: first })}</p>
        <div className="cam">
          <i className="cam__slot" aria-hidden="true" />
          <div className="cam__clip">
            <div className="polaroid m m-print" style={d(1.5)}>
              <div className="polaroid__photo">
                <Crowd />
                <i className="polaroid__amber m m-develop" style={d(5, { '--dur': 2.5 })} aria-hidden="true" />
                <i className="polaroid__dark m m-develop" style={d(3.5, { '--dur': 3 })} aria-hidden="true" />
              </div>
              <div className="polaroid__strip m m-settle" style={d(3.75)}>
                <p className="polaroid__name">{data.guest.full_name}</p>
                <p className="polaroid__meta">{data.guest.outlet}</p>
              </div>
            </div>
          </div>
        </div>
        <i className="cam__flash" aria-hidden="true" />
      </Scene>

      {/* 3 · About */}
      <Scene root={root}>
        <Chip n={2} />
        <h2 className="mark" aria-label="NourishFest 2026">
          <SlamWord word="NOURISHFEST" start={0} /> <SlamWord word="2026" start={11} />
        </h2>
        <p className="about">
          {splitLines(t('invite.about')).map((line, i) => (
            <span key={i} className="about__line m m-settle" style={d(1.25 + i * 0.25)}>{line} </span>
          ))}
        </p>
        <p className="sticker-inv m m-stamp" style={d(2, { '--r': '-3deg' })}>{t('brand.tagline')}</p>
      </Scene>

      {/* 4 · Save the date */}
      <Scene root={root}>
        <Chip n={3} />
        <Title>{t('invite.save_date')}</Title>
        <div className="persp">
          <div className="calcard glass m m-hinge" style={d(0.5)} aria-label="December 2026">
            <p className="calcard__month">DESEMBER 2026</p>
            <div className="calcard__grid">
              {['S', 'S', 'R', 'K', 'J', 'S', 'M'].map((day, i) => <b key={i}>{day}</b>)}
              <span />
              {Array.from({ length: 31 }, (_, i) => (
                <span key={i} className={i === 9 ? 'is-day' : undefined}>
                  {i + 1}
                  {i === 9 && (
                    <svg className="calcard__circle m m-stamp" style={d(1, { '--r': '-8deg' })} viewBox="0 0 40 40" aria-hidden="true">
                      <ellipse cx="20" cy="20" rx="17" ry="16" />
                    </svg>
                  )}
                </span>
              ))}
            </div>
          </div>
        </div>
        {cd ? (
          <div className="lcd glass m m-settle" style={d(1.5)} role="timer" aria-live="off">
            {cd.done || isToday ? <b className="lcd__today">{t('invite.today')}</b> : (
              <>
                <Digits value={pad(cd.days)} label={t('invite.cd_days')} />:
                <Digits value={pad(cd.hours)} label={t('invite.cd_hrs')} />:
                <Digits value={pad(cd.mins)} label={t('invite.cd_mins')} />
              </>
            )}
          </div>
        ) : tba(1.5)}
        {cal && (
          <div className="btns">
            <a className="inv-btn inv-btn--gold m m-settle" style={d(2.25)} href={googleCalendarUrl(cal)} target="_blank" rel="noopener noreferrer">{t('invite.add_google')}</a>
            <button type="button" className="inv-btn inv-btn--gold m m-settle" style={d(2.4)} onClick={saveIcs}>{t('invite.add_ics')}</button>
            <p className="inv-hint">{t('invite.ics_hint')}</p>
          </div>
        )}
      </Scene>

      {/* 5 · What time */}
      <Scene root={root}>
        <Chip n={4} />
        <Title>{t('invite.time_title')}</Title>
        {doors ? (
          <>
            <p className="flip" aria-label={doors}>
              {doors.split('').map((c, i) => (c === ':'
                ? <em key={i} className="flip__colon" aria-hidden="true">:</em>
                : <b key={i} className="glass m m-flip" style={d(0.75 + 0.25 * digitIndex(doors, i))} aria-hidden="true">{c}</b>))}
            </p>
            <p className="big m m-settle" style={d(2)}>{t('invite.doors', { doors })}</p>
            {starts && <p className="m m-settle" style={d(2)}>{t('invite.starts', { start: starts })}</p>}
            <p className="inv-hint m m-settle" style={d(2.25)}>{t('invite.early')}</p>
          </>
        ) : tba(0.75)}
      </Scene>

      {/* 6 · Where */}
      <Scene root={root}>
        <Chip n={5} />
        <Title>{t('invite.where_title')}</Title>
        <div className="mapcard m m-settle" style={d(0.5)}>
          <MapStreets />
          <i className="mapcard__ripple m m-ripple" style={d(1.6)} aria-hidden="true" />
          <i className="mapcard__shadow m m-shadow" style={d(1.15)} aria-hidden="true" />
          <MapPin className="mapcard__pin m m-drop" style={d(1)} />
        </div>
        {ev.venue ? <p className="big m m-settle" style={d(1.75)}>{ev.venue}</p> : tba(1.75)}
        {ev.maps_url && (
          <a className="inv-btn inv-btn--green m m-settle" style={d(2)} href={ev.maps_url} target="_blank" rel="noopener noreferrer">{t('invite.maps')}</a>
        )}
      </Scene>

      {/* 7 · Tracklist */}
      <Scene root={root}>
        <Chip n={6} />
        <Title>{t('invite.tracks_title')}</Title>
        <div className="jcard-wrap m m-unfold" style={d(0.5)}>
          <i className="jcard__head m m-play" style={d(1.25)} aria-hidden="true" />
          <ol className="jcard">
            {[1, 2, 3, 4, 5, 6].map((n, i) => (
              <li key={n} className="m m-slide-l" style={d(1.25 + i * STEP)}><b>0{n}</b>{t(k(`invite.track${n}`))}</li>
            ))}
          </ol>
        </div>
      </Scene>

      {/* 8 · Dress code (glass) */}
      <Scene root={root}>
        <Chip n={7} />
        <Title>{t('invite.dress_title')}</Title>
        <div className="cards m m-settle" style={d(0.5)}>
          {[1, 2, 3, 4].map((n, i) => (
            <div key={n} className="outfit glass m m-deal" style={{ ...d(1 + i * 0.25, { '--i': i, '--r': TILTS[i], '--accent': ACCENTS[i] }), zIndex: 5 - i }}>
              <h3>{t(k(`invite.dress${n}_t`))}</h3>
              <p>{t(k(`invite.dress${n}`))}</p>
            </div>
          ))}
          <div className="outfit outfit--skip glass m m-deal" style={{ ...d(2, { '--i': 4, '--r': TILTS[4] }), zIndex: 1 }}>
            <h3>{t('invite.dress_skip_t')}</h3>
            <p>{t('invite.dress_skip')}</p>
            <span className="outfit__x m m-stamp" style={d(2.5, { '--r': '-12deg' })} aria-hidden="true">✖</span>
          </div>
        </div>
      </Scene>

      {/* 9 · Do's & Don'ts (glass) */}
      <Scene root={root}>
        <Chip n={8} />
        <Title>{t('invite.dos_title')}</Title>
        <div className="rules">
          <div className="rules__panel glass m m-slide-l" style={d(0.5, { '--accent': 'var(--nf-gold)' })}>
            <p className="rules__hd">{t('invite.do_hd')}</p>
            <ul>
              {[1, 2, 3, 4, 5].map((n, i) => (
                <li key={n}>
                  <span className="rules__ic m m-stamp" style={d(1.25 + i * STEP)} aria-hidden="true">✔</span>
                  <span className="m m-settle" style={d(1.25 + i * STEP)}>{t(k(`invite.do${n}`), { doors: doors ?? '17:00' })}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rules__panel glass m m-slide-r" style={d(0.75, { '--accent': 'var(--nf-pink)' })}>
            <p className="rules__hd">{t('invite.dont_hd')}</p>
            <ul>
              {[1, 2, 3, 4, 5].map((n, i) => (
                <li key={n}>
                  <span className="rules__ic m m-stamp" style={d(1.5 + i * STEP)} aria-hidden="true">✖</span>
                  <span className="m m-settle" style={d(1.5 + i * STEP)}>{t(k(`invite.dont${n}`))}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Scene>

      {/* 10 · Outro */}
      <Scene root={root} className="scene--outro">
        <Chip n="end" />
        <div className="outro-tape m m-eject" style={d(0.25)}><Cassette label={label} /></div>
        <p className="big m m-slam" style={d(1)}>{t('invite.outro')}</p>
        <button type="button" className="inv-btn inv-btn--pink outro-btn" onClick={onViewPass}>{t('invite.view_pass')}</button>
      </Scene>
    </div>
  );
}
```

Notes for the implementer:
- `label` is the translated cassette label (same string the stage uses).
- The outro button has no `.m` class on purpose: `.is-in .outro-btn` gives it its own drop-then-pulse animation.
- Scene 2 has no chip (spec §6.2).

- [ ] **Step 2: Run checks**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors (the component is not used yet).

- [ ] **Step 3: Commit**

```bash
git add src/components/invite/Scenes.tsx
git commit -m "Add the scroll scenes with per-scene choreography"
```

---

### Task 8: Invitation controller

**Files:**
- Modify: `src/components/invite/Invitation.tsx` (replace the whole file)
- Modify: `src/components/invite/art.tsx` (remove the transition shims)

**Interfaces:**
- Consumes: `Stage` (Task 6), `Scenes` (Task 7), `useMusic` (Task 3), `BEAT_MS`, `DROP_BEATS` (Task 1), `markSeen` (existing `src/lib/invite/play.ts`), classes `inv--gate|opening|scroll|leave|leave-fast` and keyframe `inv-leave` (Task 5).
- Produces: unchanged public signature `Invitation({ data, token, replay, onDone })`. `onDone` now runs after the exit animation.

- [ ] **Step 1: Replace `src/components/invite/Invitation.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { LangToggle } from '@/components/LangToggle';
import { useI18n } from '@/lib/i18n';
import { BEAT_MS, DROP_BEATS } from '@/lib/invite/motion';
import { markSeen } from '@/lib/invite/play';
import type { PassData } from '@/lib/pass';
import { Scenes } from './Scenes';
import { Stage } from './Stage';
import { useMusic } from './useMusic';
import '@/styles/invite.css';

type Phase = 'gate' | 'opening' | 'scroll';
type Leaving = null | 'slow' | 'fast';

const prefersReduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Controller for the invitation layer (motion spec 2026-10-19): gate → opening → scroll scenes → exit to the pass.
 * The exit animates the whole layer and calls onDone on its `inv-leave` animationend.
 */
export function Invitation({ data, token, replay, onDone }: { data: PassData; token: string; replay: boolean; onDone: () => void }) {
  const { t } = useI18n();
  const music = useMusic();
  const [phase, setPhase] = useState<Phase>('gate');
  const [leaving, setLeaving] = useState<Leaving>(null);
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);

  const name = data.guest.full_name;
  const label = t('invite.gate_label', { name: name.length > 22 ? `${name.slice(0, 21)}…` : name });

  const play = () => {
    music.start(Date.now() + DROP_BEATS * BEAT_MS);
    setPhase(prefersReduced() ? 'scroll' : 'opening');
  };

  const leave = (speed: 'slow' | 'fast') => {
    if (leaving) return;
    if (!replay) markSeen(token);
    music.stop();
    if (prefersReduced()) { onDone(); return; }
    setLeaving(speed);
  };

  const skipFromGate = () => {
    if (!replay) markSeen(token);
    onDone();
  };

  const className = ['inv', `inv--${phase}`, leaving === 'slow' && 'inv--leave', leaving === 'fast' && 'inv--leave-fast']
    .filter(Boolean).join(' ');

  return (
    <div
      ref={setScroller}
      className={className}
      onAnimationEnd={(e) => { if (e.target === e.currentTarget && e.animationName === 'inv-leave') onDone(); }}
    >
      {phase !== 'gate' && (
        <div className="inv-bar">
          {music.ready && (
            <button type="button" className="inv-ctl" onClick={music.toggle} aria-pressed={music.muted}>
              {music.muted ? t('invite.unmute') : t('invite.mute')}
            </button>
          )}
          <LangToggle />
          <button type="button" className="inv-ctl" onClick={() => leave('fast')}>{t('invite.skip')}</button>
          <i className="inv-progress" aria-hidden="true" />
        </div>
      )}
      {phase === 'scroll'
        ? <Scenes data={data} token={token} label={label} root={scroller} onViewPass={() => leave('slow')} />
        : <Stage phase={phase} label={label} onPlay={play} onSkip={skipFromGate} onEnd={() => setPhase('scroll')} />}
    </div>
  );
}
```

- [ ] **Step 2: Remove the transition shims from `art.tsx`**

In `src/components/invite/art.tsx`:
- Change `export function Cassette({ label }: { label: string; spin?: boolean })` to `export function Cassette({ label }: { label: string })`.
- Change `export function Boombox(_: { playing?: boolean } = {})` to `export function Boombox()`.
- Delete the whole `Equalizer` function and its comment.

- [ ] **Step 3: Run checks**

Run: `npx tsc --noEmit && npm run lint && npm run test:unit`
Expected: no errors; all tests PASS. `grep -rn "Equalizer\|open__\|\.scene > \*" src` returns nothing.

- [ ] **Step 4: Smoke-test in the browser**

Run: `npm run dev`, open a test guest's pass link (from admin), then:
1. Gate: cassette floats, reels turn, PRESS PLAY pulses.
2. Tap PRESS PLAY: tape lifts and drops into the boombox, the boombox squashes on the click, EQ pops in, one glitch, NOURISH then FEST slam in, sticker drops, stage fades at about 6.9 s.
3. Polaroid: slot drops, one gold flash, print ejects and swings, develops dark → amber → colour.
4. Scroll: each scene plays when its top reaches about 80% of the screen; dress code and do's/don'ts are glass and pick up their blur after the cards stop.
5. VIEW MY PASS: cassette ejects up, layer lifts away, pass shows.
6. Replay invitation on the pass: starts from the gate again.

- [ ] **Step 5: Commit**

```bash
git add src/components/invite/Invitation.tsx src/components/invite/art.tsx
git commit -m "Wire the invitation controller to the new stage and scenes"
```

---

### Task 9: Pass hand-off

**Files:**
- Modify: `src/components/pass/PassView.tsx` (state declarations near line 31; the `view === 'invitation'` return near line 120; the `<main className="pass">` line)
- Modify: `src/styles/pass.css` (append)

**Interfaces:**
- Consumes: `Invitation`'s `onDone` (Task 8), existing `nf-rise` keyframe in `pass.css`, existing `reveal` state.
- Produces: class `pass--enter` on `<main>` after the invitation exits, unless the check-in reveal is running.

- [ ] **Step 1: Track the hand-off in `PassView.tsx`**

Add after `const [replay, setReplay] = useState(false);`:

```tsx
  const [entered, setEntered] = useState(false);
```

Replace the invitation return:

```tsx
  if (view === 'invitation') {
    return <Invitation data={data} token={token} replay={replay} onDone={() => { setReplay(false); setView('pass'); setEntered(true); }} />;
  }
```

Replace `<main className="pass">` with:

```tsx
    <main className={entered && reveal !== 'reveal' ? 'pass pass--enter' : 'pass'}>
```

- [ ] **Step 2: Add the entry motion to `src/styles/pass.css`**

Append:

```css
/* Hand-off from the invitation (motion spec 2026-10-19 §7): the ticket settles in.
   286 ms = half a beat and 143 ms = a quarter beat at 105 BPM. Skipped when the check-in reveal runs. */
@media (prefers-reduced-motion: no-preference) {
  .pass--enter .pass__hero { animation: nf-rise 286ms cubic-bezier(.2, .8, .2, 1) backwards; }
  .pass--enter .ticket { animation: nf-rise 286ms cubic-bezier(.2, .8, .2, 1) 143ms backwards; }
}
```

- [ ] **Step 3: Run checks**

Run: `npx tsc --noEmit && npm run lint && npm run test:unit`
Expected: no errors; all PASS.

- [ ] **Step 4: Smoke-test**

`npm run dev`: play the invitation to the end and tap VIEW MY PASS. The wordmark and ticket rise in. Tap Skip in the bar mid-scroll: the layer leaves in half a beat and the ticket rises in. With a checked-in test guest, replay and exit: no entry motion stacks on the Door Prize reveal.

- [ ] **Step 5: Commit**

```bash
git add src/components/pass/PassView.tsx src/styles/pass.css
git commit -m "Settle the ticket in after the invitation exits"
```

---

### Task 10: Verification on real devices

**Files:** none changed unless a check fails (fix in the file the failing check points to, then repeat that check).

- [ ] **Step 1: Production build and bundle size**

Run: `npm run build`
Expected: build succeeds. In the build output, the chunk containing `Invitation` (lazy-loaded from `PassView`) is ≤ 60 KB gzipped. If it is not, report the size before changing anything.

- [ ] **Step 2: Deploy to a preview and open on two phones from WhatsApp**

A mid-range Android phone (Chrome) and an iPhone (Safari). Send yourself a test guest's pass link in WhatsApp and open it from there. Screen-record each run. Check against spec §4.2, §5.1 and §6.3:
- Tape visibly enters the slot; the music (once the file is in `public/audio/`) starts on the click, not before.
- Exactly two glitch moments; the Polaroid flash is gold and happens once.
- Every scene's signature move is visible; the tracklist lines arrive after the J-card unfolds; the dress code cards deal from a stack.
- Mute works on iPhone (it uses `muted`, not volume).

- [ ] **Step 3: Reduced motion and transparency**

iOS: Settings → Accessibility → Motion → Reduce Motion ON. Android: Settings → Accessibility → Remove animations ON. Expected: PRESS PLAY goes straight to the scenes; every scene's content is visible, no blank areas, no flash; the Polaroid shows developed. Then iOS Reduce Transparency ON: glass becomes solid dark cards and the text stays readable.

- [ ] **Step 4: Photosensitivity**

Step through the recordings frame by frame: no more than 2 flashes or glitches in any 1 s window; nothing white.

- [ ] **Step 5: Performance**

Desktop Chrome DevTools → Performance, CPU 4× slowdown, device toolbar at 360 × 800. Record PRESS PLAY through to the end of the scroll. Expected: no red long-frame bars during scrolling; none over 50 ms during the opening. If the dress code deal stutters, apply spec open item 3: remove `glass` from the five `.outfit` elements only, then re-check.

- [ ] **Step 6: Record results**

Add a short "Verification" note under spec §12 in the NourishFest project (date, devices, pass/fail per check) and commit any fixes:

```bash
git add -A
git commit -m "Fix issues found in device verification"
```

(Skip the commit if nothing changed.)

---

## Spec coverage

| Spec section | Task |
|:--|:--|
| §3.1 tokens, 105 BPM | 1, 5 |
| §3.2 move library | 5 |
| §3.3 rules, allowed loops | 5 (guard test), 7 |
| §4.1 one stage, 360 × 640 set | 6 |
| §4.2 opening beat sheet | 5, 6 |
| §4.3 music drop | 1, 3, 8 |
| §4.4 end on animationend + visible-time backup | 1, 6 |
| §5 Polaroid, crowd art, paper colour | 2, 4, 5, 7 |
| §6.1 compact flow, trigger, settle | 5, 7 |
| §6.2 track chips | 2, 7 |
| §6.3 per-scene choreography | 5, 7 |
| §6.4 glass dress code and rules, strings | 2, 5, 7 |
| §7 transitions | 8, 9 |
| §8 reduced motion, photosensitivity | 5, 8, 10 |
| §9 performance | 5, 10 |
| §11 testing | 1, 5, 10 |

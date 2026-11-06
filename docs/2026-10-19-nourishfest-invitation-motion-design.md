# NourishFest 2026 — Invitation Motion: Design Spec

**Status:** Approved in brainstorming on 19 October 2026, awaiting written-spec review. Tempo changed from 90 to 105 BPM on 19 Oct; all choreography stays in beats. Tempo set to 104 BPM (1 beat = 577 ms) on 6 Nov 2026 to match the delivered theme track.
**Owner:** HR (Angel)
**Builds on:** Invitation Design Spec (14 Oct 2026), Design Guide v1.2, and the current `ngi-digital-event-system` repo at `c285110` ("Server-render the pass, add check-in reveal and invitation theme song")
**Replaces:** the *Motion* column of §2 and all of §7 *Visual and motion rules* in the 14 Oct spec. Everything else in that spec still applies.
**Prototype:** "NourishFest Invitation Prototype" artifact (private, `https://claude.ai/artifact/4e68RcAVkQBKGAgeYJKJjx`). Where the prototype and this spec differ, this spec wins.

**Amended 5 Nov 2026:** the theme is re-labelled to RETRO REWIND: BACK TO THE 90s. Hip-hop wording below is historical; copy, dress code and the opening's rewind labels follow `docs/2026-11-05-nourishfest-retro-rewind-relabel-design.md`.

**Amended 7 Nov 2026:** the Scene 8 dress code layout and choreography are replaced by `docs/2026-11-07-nourishfest-dress-code-illustrations-design.md` (four screens of drawn outfits). The `deal` move is removed.

---

## 1. Summary

The invitation is already built and live. A screen recording of the build (19 Oct) showed that most of the motion in the 14 Oct spec did not come through: the tape never enters the boombox, the opening has 3 s of dead air, the Polaroid is a grey-to-gold colour fade, every scroll scene uses the same fade-up, scenes are a full screen tall with mostly empty space, and the pass appears with a hard cut. There are also 11 infinite loops, three of them animating shadows or filters under frosted-glass blur.

This spec reworks all invitation motion on one shared system: a 105 BPM beat grid, three easings and a small library of named moves, CSS and SVG only.

### 1.1 Decisions

| # | Decision |
|:--|:--|
| 1 | **CSS motion tokens + named move library**, including the richer per-letter wordmark and tilting tape. No GSAP, no Lottie |
| 2 | **Tempo grid: 105 BPM**, so 1 beat = 571 ms. All timings are written in beats. The producer is briefed to deliver a 105 BPM track |
| 3 | **Opening is 12 beats (≈ 6.9 s)**, no dead air. The tape visibly drops into the boombox and the music drops on that click |
| 4 | **Polaroid: flash and eject.** One soft gold flash, the print ejects and swings, then develops dark → amber → colour. The photo is an **original illustrated crowd scene** |
| 5 | **Scroll scenes: compact flow.** Scenes size to their content with about 96 px between them; each plays once when its top crosses 80% of the screen height |
| 6 | **Energy: slam the headings, calm the info.** One signature move per scene on the hero element, everything else uses a calm settle |
| 7 | **Mixtape track chips.** Each scroll scene opens with a small `TRACK 0X` chip; the outro uses `SIDE A · END` |
| 8 | **Dress code and Do's & Don'ts use frosted glass**, matching the calendar and countdown panels. White text, pink/gold accent bars. No solid neon-green blocks |
| 9 | **Loops are limited to playback**: gate cassette and button, opening reels/EQ/speakers, the countdown tick, the outro reels and button. Every other infinite loop is removed |
| 10 | **Transform and opacity only.** No animation of `filter`, `text-shadow`, `box-shadow`, colour or layout properties |

### 1.2 Out of scope

Content, data, play logic, admin settings and the calendar/maps features in the 14 Oct spec (unchanged). The pass's own check-in reveal (unchanged). Rebranding or replacing the frosted-glass look.

---

## 2. Why the current build looks the way it does

| Seen in the recording | Cause in the code |
|:--|:--|
| Tape fades at the top, never enters the boombox | `.open__tape` sits above the boombox in the flex layout and `tape-in` only shrinks and fades it in place |
| About 3 s with nothing new | `tape-in` ends at 1.6 s, `.open__mark` starts at 4.6 s; nothing is scheduled between |
| No visible VHS glitch | The only glitch is a 0.3 s wiggle on the wordmark text |
| Polaroid is a colour change | `.polaroid__photo` transitions `filter: grayscale` and `opacity`; `filter` also breaks the transform/opacity rule and stutters on mid-range Android |
| Every scene feels the same | `.scene > *` fades up every child at the same time as each scene's own move, which hides it |
| Empty space | `.scene { min-height: 88dvh }` |
| Hard cut to the pass | `finish()` calls `onDone()` immediately |
| Constant background motion, scroll jank | Infinite `sway`, `wobble`, `hue`, `bob`, `lcd-glow`, `pulse` (box-shadow), `drift` and others, running behind `backdrop-filter: blur(16px)` panels |
| Opening and timer can drift | Phase change uses a fixed `setTimeout(8000)`, while CSS pauses when the tab is hidden |

---

## 3. Motion system

### 3.1 Tokens (in `invite.css`, on `.inv` and the stage)

| Token | Value | Use |
|:--|:--|:--|
| `--beat` | `571ms` | Base unit (105 BPM = 60 000 / 105). Change only this if the song's tempo differs |
| `--half` | `calc(var(--beat) / 2)` | Short moves |
| `--qtr` | `calc(var(--beat) / 4)` | Stagger step |
| `--ease-slam` | `cubic-bezier(.34, 1.56, .64, 1)` | Hits with overshoot |
| `--ease-out` | `cubic-bezier(.2, .8, .2, 1)` | Calm settles |
| `--ease-in` | `cubic-bezier(.5, 0, .9, .4)` | Exits |

Delays are written per element as a beat count: `style="--d: 1.25"` and `animation-delay: calc(var(--beat) * var(--d))`.

### 3.2 Move library

All moves animate `transform` and `opacity` only, use `animation-fill-mode: both`, and define their hidden "before" state in the keyframe's `from`.

| Move | Keyframes | Duration · easing | Used for |
|:--|:--|:--|:--|
| `slam` | scale 2.2 → 1, opacity 0 → 1 | 1 beat · slam | Scene titles, outro line |
| `slam-letters` | `slam` per letter, 55 ms apart (opening) or 0.06 beat apart (scene 3) | per letter 1 beat · slam | Wordmark, NOURISHFEST 2026 |
| `settle` | translateY 16 px → 0, opacity 0 → 1 | ½ beat · out | Body text, info, buttons |
| `stamp` | scale 1.8 → 1 at `--r` angle, opacity 0 → 1 | ½ beat · slam | Track chips, stickers, calendar circle, ✔/✖ |
| `bar` | scaleX 0 → 1 | ½ beat · slam | Pink title underline |
| `drop` | translateY −70 px → 0, opacity 0 → 1 | 1 beat · slam | Map pin, outro button |
| `slide-l` / `slide-r` | translateX ∓24 px → 0, opacity 0 → 1 | ½ beat · out | Tracklist lines, Do / Don't panels |
| `hinge` | rotateX −80° → 0 (origin top, parent `perspective: 800px`) | 1 beat · out | Calendar card |
| `roll` | translateY 0 → −n × digit height (digit strip 0–9) | 1 beat · out | Countdown digits |
| `flip` | rotateX 90° → 0 (origin top) | ½ beat · out | Gate-time digits |
| `unfold` | scaleY 0 → 1 (origin top) | ¾ beat · out | Tracklist J-card |
| `deal` | from translateY(−i × 82 px) rotate(`--r`) → none | ½ beat · slam | Removed 7 Nov 2026 (dress code illustrations spec) |
| `eject` | translateY 90 → −10 → 0, opacity 0 → 1 | 1 beat · slam | Outro cassette |
| `glitch` | translateX −7 / +6 / −3 px, skewX −6°, `steps(1)` | 0.35–0.4 beat | Opening only |

### 3.3 Rules

- **One signature move per scene**, on its hero element. Everything else uses `settle`. The blanket `.scene > *` fade is deleted.
- **Every scene finishes within about 2.5 beats** (≈ 1.4 s) of entering.
- **Loops allowed:** gate cassette float, gate reels, PRESS PLAY pulse (scale only); opening reels, equalizer, speaker pump; countdown tick (content, not decoration); outro reels and VIEW MY PASS pulse (scale only).
- **Removed loops:** `sway`, `wobble`, `hue`, `bob`, `lcd-glow`, the box-shadow `pulse`, and `drift` once the scroll phase starts.
- **Glitch limit:** at most 2 glitch events in the whole invitation, 3.25 beats (≈ 1.9 s) apart, never a white flash. The Polaroid flash is one gold flash at 50% opacity.

---

## 4. Gate and opening

### 4.1 Structure

Gate and opening become **one stage component** (`Stage.tsx`) with `data-phase="gate" | "opening"`. The same cassette element stays mounted across the tap, so there is no jump.

The stage draws on a fixed **360 × 640 set**, scaled to fit the screen with `transform: scale(k)` where `k = min(width / 360, height / 640)`. This keeps the tape's path into the boombox exact on every phone.

Set positions: cassette 280 px wide at (40, 170); boombox 260 px wide at (50, 140), cassette window centre at (180, 195); equalizer at y 300; wordmark from y 362; sticker at y 480; gate buttons from y 380.

### 4.2 Beat sheet (b = 571 ms)

| Beat | Time | What happens | Move |
|:--|:--|:--|:--|
| 0 | 0.00 s | Tap. Button, hint and Skip fade out; cassette float freezes in place | fade-out ¼ b · in |
| 0–0.9 | 0–0.51 s | Tape lifts to centre y 95, scale 0.6, tilts −6°, then holds until beat 1.2 | out |
| 0.5–1.5 | 0.29–0.86 s | Boombox rises from below | `rise` 1 b · slam |
| 1.2–1.9 | 0.69–1.09 s | Tape drops into the window centre, scale 0.25 | in |
| **2** | **1.14 s** | **Click:** tape hides, boombox squashes (scale 1.05/0.9 → 1), window reels spin, speakers pump, music drops | `squash` ½ b · out |
| 2.25 | 1.29 s | Equalizer bars pop in left to right, 40 ms apart; bounce every beat from beat 3 (1.71 s) | `pop` ½ b · slam, then `eq` ½ b alternate |
| 4 | 2.29 s | VHS glitch on the whole stage + one pink tracking band sweeps top to bottom | `glitch` 0.4 b, band 0.6 b |
| 5 | 2.86 s | NOURISH slams in letter by letter | `slam-letters` |
| 6 | 3.43 s | FEST slams in (gold, pink hard shadow) | `slam-letters` |
| 7.25 | 4.14 s | Small wordmark glitch | `glitch` 0.35 b |
| 7.5 | 4.29 s | MOVE IN UNITY. sticker drops | `drop` 1 b · slam |
| 7.5–10.75 | 4.29–6.14 s | Hold: reels, speakers and EQ on the beat | loops only |
| 10.75–12 | 6.14–6.86 s | Stage dips 6% and fades | `stageOut` 1.25 b · in |

### 4.3 Music drop

- The song is requested on the PRESS PLAY tap (unchanged).
- `dropAt = tapTime + 2 beats`. On `canplay`: if `now < dropAt`, wait until `dropAt`, then play and fade in over 600 ms; otherwise play and fade in immediately.
- Pure helper `musicDropDelay(nowMs, dropAtMs) = max(0, dropAtMs − nowMs)` in `src/lib/invite/music.ts`.

### 4.4 Ending the opening

- The phase changes to `scroll` on the stage's `animationend` where `animationName === 'stageOut'`.
- Backup: if that event never fires, switch after 10 s of **visible** time (a counter that only advances while `document.visibilityState === 'visible'`).
- The fixed `OPENING_MS` timeout is removed.

---

## 5. Scene 2: the Polaroid

### 5.1 Beat sheet (from the moment the scene mounts)

| Beat | Time | What happens |
|:--|:--|:--|
| 0 | 0 s | "Yo, {firstname}! You're officially invited to…" settles |
| 0.5 | 0.29 s | Camera slot (dark bar, gold edge) drops in |
| 1.25 | 0.71 s | One gold flash over the scene, 0 → 50% → 0 over ½ beat |
| 1.5–3.5 | 0.86–2.0 s | Print ejects from behind the slot (the slot's lower edge clips it), overshoots 6 px, swings to −6°, settles at −3° (origin top centre) |
| 3.5–6.5 | 2.0–3.71 s | Dark layer (`#1e1712`) fades out, 3 beats · in |
| 3.75 | 2.14 s | Name and outlet settle on the white strip |
| 4.25 | 2.43 s | Camera slot lifts away (−30 px, fade) |
| 5–7.5 | 2.86–4.29 s | Amber layer (`#7a4a1c`) fades out, 2.5 beats · in. Fully developed |

The develop effect is two opacity layers over the photo. `filter: grayscale` is removed. Nothing loops after the print settles.

### 5.2 Crowd scene art

New `Crowd` component in `art.tsx`: an original inline SVG (viewBox 120 × 120, about 1.5 KB) with a dark stage, three light beams (pink, green, gold, translucent), three stage lights, a gold "NOURISHFEST" banner, a pink floor glow and a black crowd silhouette with raised hands. No photos, real people, logos or brand marks.

### 5.3 Paper colour

New token `--nf-paper: #F4F1E8` for the Polaroid frame (replaces `--nf-white` there). The print keeps its hard pink shadow (`6px 6px 0`), which is static.

---

## 6. Scenes 3–10

### 6.1 Layout and trigger

- `.scene` drops `min-height: 88dvh`. Scenes size to their content with `padding-block: 44px` (≈ 88–96 px between scenes) and the existing gutter.
- Trigger: one `IntersectionObserver` with `root` = the invitation scroller, `rootMargin: '0px 0px -20% 0px'`, `threshold: 0`. On intersect, add `is-in` and stop observing that scene. Scene 2 is at the top, so it plays immediately.
- Three beats after `is-in`, add `is-settled` (used for glass blur, §6.4).
- If several scenes enter at once on a fast flick, each plays. Scenes never seen never animate.

### 6.2 Track chips

Each scene from 3 onward opens with a chip that `stamp`s at beat 0: `TRACK 02` (About) to `TRACK 08` (Do's & Don'ts), and `SIDE A · END` on the outro. Scene 2 (Polaroid) has no chip; it is the implied Track 01. Style: Oswald 12 px, letter-spacing 0.24 em, gold text, 1.5 px gold border. Title `slam` at +0.25 and the pink underline `bar` at +0.75 follow it in every scene.

### 6.3 Per-scene choreography (delays in beats after `is-in`)

| Scene | Signature move | Full order |
|:--|:--|:--|
| 3 About | NOURISHFEST 2026 `slam-letters` (0.06 b apart from +0.25) | Chip 0 → letters +0.25 → body lines `settle` +1.25, +1.5, +1.75 (one line each) → MOVE IN UNITY. `stamp` at −3° +2. Type-on from the old spec is replaced by line-by-line settle for readability |
| 4 Save the date | Calendar `hinge` opens like a cassette case | Chip → title → card `hinge` +0.5 → circle on the 10th `stamp` (−8°) +1 → countdown `settle` +1.5 → digits `roll` to the live value +1.75 → Google button `settle` +2.25 → iPhone button +2.4 |
| 5 What time | Split-flap digits `flip`, ¼ b apart | Chip → title → digits +0.75, +1.0, +1.25, +1.5 (colon static) → "Gates open 17:00 WITA" `settle` +2 → "Come early…" +2.25 |
| 6 Where | Pin `drop` onto a mini-map card | Chip → title → map card `settle` +0.5 → pin `drop` +1 → shadow squash (scaleX 0.3 → 1.3 → 1) +1.15 → one ripple ring (scale 0.3 → 2.4, fade out) +1.6 → venue `settle` +1.75 → Maps button +2 |
| 7 Tracklist | J-card `unfold`, ▶ playhead steps down | Chip → title → J-card `unfold` +0.5 → lines `slide-l` from +1.25, 0.17 b apart → playhead steps down with the lines (`steps(5)`, 0.85 b) and rests on track 06 |
| 8 Dress code | Replaced 7 Nov 2026, see the dress code illustrations spec §5. Was: cards `deal` from one tilted stack | Chip → title → card group `settle` +0.5 → cards `deal` +1, +1.25, +1.5, +1.75, Skip +2 (tilts −8°, 6°, −4°, 8°, −6°) → ✖ on Skip `stamp` at −12° +2.5 |
| 9 Do's & Don'ts | Panels slide in from opposite sides | Chip → title → DO panel `slide-l` +0.5 → DON'T panel `slide-r` +0.75 → ✔ items from +1.25, ✖ items from +1.5, 0.17 b apart (icon `stamp` + text `settle` together) |
| 10 Outro | Cassette `eject`s up | Chip → cassette `eject` +0.25, reels spin from +1.25 → "See you on 10 December!" `slam` +1 → VIEW MY PASS `drop` +1.75, then scale-only pulse from +2.75 |

### 6.4 Visual changes in scenes 8 and 9

Both scenes use the existing glass tokens (`--glass`, `--glass-edge`, `--glass-shadow`).

**Dress code cards**
- Glass, radius 14 px, fixed height 72 px, so the longer Indonesian descriptions fit on two lines.
- A 5 px accent bar on the left edge, inset 12 px top and bottom: pink, gold, pink, gold.
- Title: Anton 19 px, white, uppercase. Description: Archivo 13 px, white at 85%.
- **Skip card:** glass with a 1.5 px dashed border at 40% white and no accent bar. Title and description at 70% white. The pink ✖ sits top right.

**Do's & Don'ts panels**
- Glass panels with the same left accent bar: gold for DO, pink for DON'T.
- Each panel has a header in Anton 18 px in its accent colour.
- Items are white Archivo 14 px. Each has a 22 px round badge in the accent colour with a black ✔ or ✖.

**Glass blur timing**
- `backdrop-filter: blur(16px) saturate(160%)` applies only under `.is-settled`. Cards and panels move without blur and pick it up once still.
- The background is a soft glow, so the switch is barely visible.
- `prefers-reduced-transparency: reduce` keeps the existing solid `--nf-card` fallback.

**Other glass surfaces**
- The calendar card, countdown and flip digits keep glass and follow the same `.is-settled` rule.
- The J-card stays solid gold, because it's a paper insert.

**Strings.** New keys in `invite-strings.ts`. All new Indonesian goes through the ID wording review.

| Key | ID | EN |
|:--|:--|:--|
| `invite.track` | TRACK {n} | TRACK {n} |
| `invite.side_end` | SIDE A · END | SIDE A · END |
| `invite.do_hd` | BOLEH | DO |
| `invite.dont_hd` | JANGAN | DON'T |

---

## 7. Transitions

| Hand-off | Behaviour |
|:--|:--|
| Gate → opening | Same stage, class change only (§4.1) |
| Opening → scenes | On `stageOut` end, or the 10 s visible-time backup (§4.4). Background `drift` stops |
| VIEW MY PASS | Cassette ejects up (−60 px, fade, ½ b · in) → music fades (800 ms, unchanged) → invitation layer lifts 24 px and fades (1 b · in, starts at +½ b) → `onDone()` on that layer's `animationend` → pass ticket `settle`s (½ b, +¼ b). About 1.3 s in total |
| Skip (bar) | Same layer exit at ½ beat, no cassette eject |
| Skip (gate) | Straight to the pass |
| Replay | Back to the gate, all `is-in` / `is-settled` cleared, scroll reset to top |
| Event day / checked in | Straight to the pass (unchanged). The pass entry `settle` is skipped when the check-in reveal runs, so the two never stack |

---

## 8. Reduced motion, accessibility, photosensitivity

- **Rule:** an element's hidden "before" state exists only inside `@media (prefers-reduced-motion: no-preference)` (for example `.scene:not(.is-in) [data-a] { opacity: 0 }`) or in a keyframe `from` with `fill-mode: both`. Base styles always describe the final state. With reduced motion, `tokens.css` still sets `animation: none`, and everything shows at rest. The `!important` override block in `invite.css` is deleted.
- **Reduced-motion flow:** the gate shows without float; PRESS PLAY goes straight to the scenes (unchanged); the Polaroid shows developed with no flash; the countdown still ticks; the music still plays.
- **Photosensitivity:** two glitch events in total, one gold flash at 50%, nothing white, never more than 2 flashes in any 1 s window.
- Touch targets stay at least 48 px; all text is real text; no colour-only meaning (the ✔/✖ glyphs and DO/DON'T headers carry it).

---

## 9. Performance

- Added CSS ≤ 6 KB gzip; crowd SVG ≈ 1.5 KB. Both sit inside the invitation's existing lazy-loaded chunk (≤ 60 KB budget unchanged).
- Only `transform` and `opacity` animate.
- `drift` runs only during gate and opening.
- Glass blur only on settled scenes (§6.4).
- `will-change: transform` only on stage elements during the opening; removed when the scroll phase starts.
- Off-screen scenes never start animating (§6.1).
- **Target:** at least 50 fps while scrolling on a mid-range Android phone (Chrome DevTools, 4× CPU throttle), and no frame over 50 ms during the opening.

---

## 10. Files to change

```
src/styles/invite.css               motion tokens, move library, stage set, scene styles, glass rules; delete removed loops and the reduced-motion !important block
src/components/invite/Stage.tsx     new: gate + opening on one 360x640 set, fit scaling, animationend + visible-time backup
src/components/invite/Invitation.tsx  use Stage; compact scenes; IntersectionObserver rootMargin; is-settled; track chips; leave animation before onDone
src/components/invite/art.tsx       Boombox window reels (class for spin); Crowd; MapCard; Cassette reels unchanged
src/components/invite/useMusic.ts   start-on-tap, drop at tap + 2 beats via musicDropDelay
src/lib/invite/music.ts             new: musicDropDelay()
src/lib/i18n/invite-strings.ts      invite.track, invite.side_end, invite.do_hd, invite.dont_hd
src/styles/tokens.css               add --nf-paper
src/components/pass/PassView.tsx    pass entry class after the invitation exits; skip it when the check-in reveal runs
tests/unit/invite.test.ts           new cases (§11)
```

---

## 11. Testing

| Level | Cases |
|:--|:--|
| Unit (Vitest) | `musicDropDelay`: ready before the click waits until the click, ready after starts at 0, exact click gives 0. Visible-time backup: advances only while visible, fires at 10 s. ID/EN string parity for the four new keys. Existing invitation tests stay green |
| Device run | Mid-range Android Chrome and iPhone Safari, each opened from a WhatsApp message, screen-recorded. Check against §4.2, §5.1 and §6.3: tape into the slot, click + music drop, one glitch, letter slams, Polaroid flash/eject/develop, each scene's signature move, pass handoff |
| Reduced motion | iOS Reduce Motion and Android "Remove animations" on: all content visible, no flash, no blank areas |
| Reduced transparency | iOS Reduce Transparency on: solid cards, text readable |
| Photosensitivity | Step through the recording frame by frame: ≤ 2 flashes in any 1 s window, nothing white |
| Performance | DevTools Performance at 4× CPU, scroll top to bottom: no long-frame (red) bars |

---

## 12. Open items

| # | Item | Owner | Needed by |
|:--|:--|:--|:--|
| 1 | Brief the producer: theme track at **105 BPM**, with a clear downbeat on bar 1 so the drop lands on the click. If the delivered track differs, set `--beat` to 60 000 / BPM | HR with producer | With the song file (20 Nov) |
| 2 | ID wording review of BOLEH / JANGAN and the track chips | HR | With PRD decision 11 |
| 3 | Real-device glass check on the dress code deal (§6.4); if it still stutters, drop the blur on those 5 cards only | Build | Before 23 Nov |
| 4 | Items 1–5 of the 14 Oct spec §12 remain open (activities, alcohol line, song file, venue, ID review) | HR | As listed there |

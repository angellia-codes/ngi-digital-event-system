# NourishFest 2026 — Invitation Dress Code Illustrations: Design Spec

**Date:** 2026-11-07
**Owner:** Angel (HR, Nourish Group Indonesia)
**Status:** Approved in brainstorming on 7 Nov 2026, awaiting written-spec review
**Builds on:** Invitation Motion Spec (19 Oct), Retro Rewind Re-label Spec (5 Nov), Design Guide, `ngi-digital-event-system` at `09e1763`
**Replaces:** the Scene 8 dress code layout and choreography in the Invitation Motion Spec
**Deadline:** live before the invitation gate on 23 Nov 2026

---

## 1. Summary

The invitation's dress code scene changes from five text cards to four screens of drawn outfits. The art comes from the illustrated moodboard: six figures in three pairs, plus accessory items.

### 1.1 Decisions

| # | Decision |
|:--|:--|
| 1 | One screen per look, then one screen for Bling It On and Skip |
| 2 | Look screens use coloured panels: gold, pink, green |
| 3 | Bling It On and Skip stay on frosted glass |
| 4 | Each Bling It On item sits on a cream sticker, because black outlines disappear on dark glass |
| 5 | Art ships as inline SVG in the invitation code, not as image files |
| 6 | No male or female labels, and no beach or hijab wording |
| 7 | All existing ID and EN dress code text stays. No new translation keys |
| 8 | The four screens share TRACK 07. Do's & Don'ts stays TRACK 08 |

### 1.2 Out of scope

Check-in, pass page, beverage choice, stations, admin, database, poster, flyer, video and the moodboard canvas. No change to the opening, Do's & Don'ts or the scenes after them.

---

## 2. Screen flow

| Screen | Chip and title | Content | Backdrop | Copy keys |
|:--|:--|:--|:--|:--|
| 1 | TRACK 07, `invite.dress_title` | Denim Everything pair | Gold | `invite.dress1_t`, `invite.dress1` |
| 2 | None | Street Style pair | Pink | `invite.dress2_t`, `invite.dress2` |
| 3 | None | Colour Pop pair | Green | `invite.dress3_t`, `invite.dress3` |
| 4 | None | Bling It On items, then Skip | Frosted glass | `invite.dress4_t`, `invite.dress4`, `invite.dress_skip_t`, `invite.dress_skip` |

Each screen is a `Scene`, so it has natural height, the existing 44 px padding and its own play-once trigger.

---

## 3. Layout

### 3.1 Look panel

| Item | Spec |
|:--|:--|
| Width | Full scene width: 320 px on a 360 px phone, within the 480 px scene limit |
| Shape | 18 px radius, 16 px padding |
| Fill | `--nf-gold`, `--nf-pink` or `--nf-green` |
| Title | Anton, 30 px, uppercase, black |
| Text | Archivo 600, 14 px, black |
| Figures | Pair side by side, 320 px tall, feet on one line, sized from panel width so they never overflow |
| Texture | Black halftone behind the figures only, never behind text |

Text on all three fills is black, as the Design Guide requires.

### 3.2 Bling It On card

- `.glass` card with the existing title and text styles.
- 2 × 2 grid: bucket hat, scrunchie, retro shades, gold chain.
- Each item sits on a cream `--nf-text` sticker with a slight tilt.
- Items carry no labels. `invite.dress4` already names them.

### 3.3 Skip card

- Existing dashed glass card with its title and text.
- Drawn apron and blazer, each crossed out with a pink ✖.
- The ✖ is decorative. The text carries the meaning.

---

## 4. Art

### 4.1 Source

New file `src/components/invite/outfits.tsx`, following `art.tsx`. It exports `LookPair` (by look number), `BlingItem` (by name) and `SkipItem` (by name). The source drawings are stored in the moodboard canvas assets:

| Drawing | Screen | Asset id |
|:--|:--|:--|
| `look-1`, `look-2` | Denim Everything | `30d643eb244abf4cd67c85e03e8e7772`, `fd3c668353f52d65c92e57eb0d45a326` |
| `look-3`, `look-4` | Street Style | `cd814326521a031069fe2ea728845aad`, `4cebaeac79078c76fd75a8df078e0781` |
| `look-5`, `look-6` | Colour Pop | `c76f1bffefffa73cd594eec824ad0090`, `eed708c6b26e5ed49561507180a6e508` |
| `item-bucket`, `item-scrunchie`, `item-shades`, `item-chain` | Bling It On | `3a0138956bf1c3c201704b2d23724f06`, `8c688a90f634a147508bdaeb43003570`, `17f34739e3edf18c6a74bb888acb2588`, `feb0cd160c68590e2aacaf327da5da39` |
| `item-apron`, `item-blazer` | Skip | `008c1be55afcd5ab92538fd5ab69957c`, `8eb6195ae8e95c7c8f7f1eae1a7c936f` |

### 4.2 Conversion rules

- Colours use the existing brand values, plus denim blue and one skin tone inside the art only.
- `look-5`'s repeated check rectangles become one SVG `<pattern>`.
- SVG ids are unique across the page, including the sleeve and shirt clip paths.
- Figures stay faceless. The number 26 and the cassette graphic are invented. No team or brand marks.
- All art is `aria-hidden="true"`. The visible text describes each look.

### 4.3 Size

The art measures about 5.3 KB gzip. Added CSS and SVG stay inside the invitation's existing lazy-loaded chunk limit of 60 KB.

---

## 5. Motion

All timing uses the existing `--beat`, `d()` delays and `inv-` keyframes. Every screen plays once when it enters view.

| Element | Move | Delay |
|:--|:--|:--|
| Panel | `m-settle` | 0.5 beats |
| Left figure | `m-slide-l` | 1 beat |
| Right figure | `m-slide-r` | 1.25 beats |
| Bling It On item | `m-stamp` | 1 beat, then `STEP` between items |
| Skip ✖ | `m-stamp` | 2.5 beats, as now |

- `m-deal` and `inv-deal` are removed, since only the old cards use them.
- Animation stays on `transform` and `opacity`.
- `prefers-reduced-motion` shows the finished screen with no movement.
- Glitch count and photosensitivity limits are unchanged, and nothing here flashes.

---

## 6. Code changes

| File | Change |
|:--|:--|
| `src/components/invite/outfits.tsx` | New. Art components |
| `src/components/invite/Scenes.tsx` | Replace the single dress code `Scene` with four. Remove `TILTS` and `ACCENTS` if nothing else uses them |
| `src/styles/invite.css` | Replace `.cards` and `.outfit*` with look, Bling It On and Skip styles. Keep the `.rules__panel::before` rule. Remove `.m-deal` and `inv-deal` |
| `docs/` and the Project | Add this spec, and a dated note in the Motion Spec pointing to it |

---

## 7. Edge cases

| Case | Behaviour |
|:--|:--|
| Long Indonesian text | Text wraps inside the panel. No fixed text height and no line clamp |
| Phone narrower than 360 px | Figures scale down with the panel width |
| Large system text, up to 130% | Panels grow in height. Nothing is cut off |
| Older phone without backdrop blur | Existing `.glass` fallback to `--nf-card`. Stickers keep the items visible |
| Replay | Screens play as they do today |
| Lewati | Skips all four screens with no change to its behaviour |

---

## 8. Testing

| Level | Cases |
|:--|:--|
| Unit (Vitest) | `invite-css.test.ts` stays green. ID/EN parity unchanged. No guest-facing string contains a gender label |
| Repo checks | `npm test`, type check, lint and build pass. Invitation chunk stays within 60 KB |
| Browser, 360 px | All four screens in ID and EN. No overflow or text cut off. Black text on every fill. Figures sharp |
| Reduced motion | All four screens visible with no animation |
| Accessibility | Screen reader reads the text and skips the art. Text at 130% still fits |
| Real devices | Open from a WhatsApp message on one Android and one iPhone. Done by HR |

---

## 9. Acceptance criteria

- [ ] Six figures show in three pairs across three coloured panels
- [ ] Bling It On shows four items on cream stickers, and Skip shows two crossed-out items
- [ ] All dress code text matches the current ID and EN strings
- [ ] No gender label, beach note or hijab wording appears
- [ ] TRACK 07 appears once, and Do's & Don'ts stays TRACK 08
- [ ] No real brand or team mark appears in any drawing
- [ ] The invitation chunk stays within 60 KB
- [ ] Reduced motion shows every screen fully
- [ ] Check-in, pass, beverage, station and admin code is unchanged

---

## 10. Open items

| # | Item | Owner | Needed by |
|:--|:--|:--|:--|
| 1 | Confirm the committee accepts the drawn looks before release | HR | Before 23 Nov |
| 2 | Test on real phones from a WhatsApp message | HR | Before 23 Nov |

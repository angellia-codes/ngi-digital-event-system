# NourishFest 2026 — Retro Rewind Re-label: Design Spec

**Date:** 2026-11-05
**Owner:** Angel (HR, Nourish Group Indonesia)
**Status:** Approved in brainstorming on 5 Nov 2026, awaiting written-spec review
**Builds on:** Design Guide v1.3 (`docs/design-guide.md`), Invitation Design Spec (14 Oct), Invitation Motion Spec (19 Oct), Promo Video Spec (27 Oct), Poster Design Record (4 Nov), and `ngi-digital-event-system` at `74e281c`
**Deadline:** live before the invitation gate on 23 Nov 2026

---

## 1. Summary

The event theme changes from HipHop to **Retro Rewind: Back to the 90s**. The current design stays. This is a re-label: a theme line, a rewind moment, a wider dress code and updated records. The cassette, boombox, VHS and Polaroid concept already fits the new theme.

### 1.1 Decisions

| # | Decision |
|:--|:--|
| 1 | Written form of the theme is **RETRO REWIND: BACK TO THE 90s**, with "the" and no apostrophe |
| 2 | **Keep the current look:** colours, fonts, dark ground, two modes, motion system. The committee is fine with this (Angel, 5 Nov) |
| 3 | **Keep the tagline:** MOVE IN UNITY. Together, We Make a Difference |
| 4 | The October Retro Rewind concept (purple/teal/yellow, arcade fonts, "REWIND. RELIVE. REUNITE.") is **not used** |
| 5 | The theme line stays in **English in both languages**, as the event's name for the night |
| 6 | The dress code widens to **90s Throwback**. Hip-hop stays as one option, not the requirement |
| 7 | Neither the poster, the flyer nor the video has gone out, so all three are updated before release |
| 8 | Poster, flyer and video are **edited from their final files**, not rebuilt. Their source folders no longer exist, and this keeps the approved layouts and timing |

### 1.2 Out of scope

New colours, fonts, background patterns or artwork. Any change to check-in, QR codes, merchandise, door prize, stations, admin, the database or the staff home page. Theme wording on the pass page and the saved 9:16 image. Physical decor, merchandise artwork and the DJ or performer brief (listed in §7 for HR).

---

## 2. Copy changes

All text lives in the translation files, so ID and EN stay in parity. Indonesian goes through the existing ID wording review.

### 2.1 `src/lib/i18n/strings.ts`

| Key | ID | EN |
|:--|:--|:--|
| `brand.theme` (new) | RETRO REWIND: BACK TO THE 90s | RETRO REWIND: BACK TO THE 90s |

### 2.2 `src/lib/i18n/invite-strings.ts`

| Key | ID | EN |
|:--|:--|:--|
| `invite.about` | Satu malam buat kita semua. Dari semua outlet, satu panggung, satu irama: rewind ke era 90-an dan rayain kerja keras setahun bareng keluarga Nourish. | One night for all of us. Every outlet, one stage, one beat: rewinding to the 90s and celebrating a year of hard work with the Nourish family. |
| `invite.replay` | Putar ulang undangan | Rewind the tape |
| `invite.dress_title` | DRESS CODE: 90s THROWBACK | DRESS CODE: 90s THROWBACK |
| `invite.dress1_t` | Denim Everything | Denim Everything |
| `invite.dress1` | Jaket denim, overall, jeans high-waist | Denim jacket, overalls, high-waisted jeans |
| `invite.dress2_t` | Street Style | Street Style |
| `invite.dress2` | Kaos oversize, jersey, celana baggy, tracksuit | Oversized tee, jersey, baggy pants, tracksuit |
| `invite.dress3_t` | Colour Pop | Colour Pop |
| `invite.dress3` | Windbreaker terang, kemeja flanel, kaos grafis | Bright windbreaker, flannel shirt, graphic tee |
| `invite.dress4_t` | Bling It On (unchanged) | Bling It On (unchanged) |
| `invite.dress4` | Bucket hat, scrunchie, kacamata retro, rantai emas (palsu juga oke!) | Bucket hat, scrunchie, retro shades, gold chains (fake is fine!) |
| `invite.osd_rewind` (new) | ◀◀ REWIND | ◀◀ REWIND |
| `invite.osd_play` (new) | ▶ PLAY | ▶ PLAY |

The Skip card is unchanged. The calendar entry reads `invite.dress_title`, so it updates with no code change.

---

## 3. Invitation opening

Changes to the existing 360 × 640 set in `Stage.tsx` and `invite.css`. Only the two additions below are new. The existing beat sheet (Motion Spec §4.2) does not move.

| Beat | Time | New element | Behaviour |
|:--|:--|:--|:--|
| 3.5–5 | 2.00–2.86 s | `◀◀ REWIND` | VCR-style on-screen label, top left of the set at about (24, 100), above the boombox. Appears before the existing glitch at beat 4 and carries through it |
| 5–10.75 | 2.86–6.14 s | `▶ PLAY` | Same position. Replaces REWIND as NOURISH starts to slam. Ends with the stage fade |
| 8.25 | 4.71 s | `brand.theme` | One line, centred at about y 528, under the sticker at y 480. Enters with the existing `settle` move |

### 3.1 Style

- **VCR label:** Oswald 600, 18 px, tracking 0.14em, Neon Green on the black ground, no box. Decorative, so `aria-hidden`.
- **Theme line:** Oswald 600, 14 px or larger, Gold, uppercase, one line at 360 px. The line must fit inside the set with at least 20 px either side.

### 3.2 Rules

- Keyframes use the `inv-` prefix and animate `transform` and `opacity` only. `tests/unit/invite-css.test.ts` enforces both.
- The new elements are hidden in the gate phase with the other opening elements (`.inv--gate`).
- The VCR labels are not flashes. Glitch events stay at 2 and the photosensitivity limits in Motion Spec §8 are unchanged.
- **Reduced motion:** PRESS PLAY already skips the opening, so these elements never show. The theme still reaches these guests through the About scene copy.

---

## 4. Stage display

The idle screen (`StageView.tsx`, `stage.css`) gets a new `idle__theme` line showing `brand.theme`, directly under the tagline sticker.

- Oswald 600, about 36 px, tracking about 0.2em, Gold. Static, no animation.
- The projector-safe and reduced-effects variants show it unchanged.
- Intro, rolling, landed, revealed, batch and void states are unchanged. The footer keeps MOVE IN UNITY.

---

## 5. Poster, flyer and video

Source folders (`nourishfest-poster/`, `nourishfest-promo/`) were in earlier workspaces and are gone. No GitHub remote exists for either.

### 5.1 Poster and flyer

- **Input:** the latest final A3 and A5 print PDFs, after the smaller boombox and date revision.
- **Change:** add RETRO REWIND: BACK TO THE 90s under the NOURISHFEST 2026 wordmark. Final colour and size are set from the real layout, using brand fonts and colours only.
- **Method:** add the line to the existing PDFs, keeping the 3 mm bleed, crop marks, and trim and bleed boxes. Re-export the PNG previews from the new PDFs.
- **If the line does not fit cleanly:** recover the build script from the 4 Nov poster chat and re-space the layout. Sponsor logos are extracted from the PDF if they are needed.
- **Unchanged:** all other copy, sponsor band, RGB output.

### 5.2 Promo video

- **Input:** `final.mp4` (18.3 s, 1080 × 1920, 30 fps).
- **Change:** overlay the theme line twice. Each appears as a hard cut.

| Window | Cue | Time |
|:--|:--|:--|
| Wordmark bar | 3.3 to 4.1 | 5.71–6.86 s |
| End card | 8.1.5 to end | 16.29–18.29 s |

- **Method:** PNG overlay in ffmpeg. Audio stream copied untouched. Video re-encoded as H.264 yuv420p, CRF 16 (CRF 18 if over 16 MB), `+faststart`.
- **Placement:** inside the safe zone (x 80–1000, y 260–1580), clear of the boombox, wordmark, 2026 stamp and end card text. Set from the real frames.
- **Constraints:** 549 frames and duration unchanged. The end card stays still from 16.57 s, and its last frame stays a clean screenshot. The rewind label is not added to the video.

---

## 6. Records to update

| File | Change |
|:--|:--|
| `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json` | Theme name, description, and "hip-hop motif" wording becomes "90s motif" |
| `docs/design-guide.md` and the Project copy | Theme, brief, tagline row unchanged, content voice, version note (v1.4). The internal mode name Block Party stays |
| `docs/prd.md` | Theme field, with a change note |
| Invitation and promo specs, poster record | Add a dated amendment pointing to this spec |
| `docs/plans/` | Not edited; they are a history of completed work |

---

## 7. Open items

| # | Item | Owner | Needed by |
|:--|:--|:--|:--|
| 1 | Attach final A3 PDF, A5 PDF and `final.mp4` | HR | Before poster and video work starts |
| 2 | WhatsApp invitation and H-1 reminder text in the Apps Script sheet: check for hip-hop wording. Not in this repo | HR | Before 23 Nov |
| 3 | Theme song: confirm it suits a 90s night | HR | Before 23 Nov |
| 4 | Merchandise artwork, decor and DJ or performer brief: check against the new theme | HR | With the event vendors |
| 5 | ID wording review of §2 (with PRD decision 11) | HR | Before 23 Nov |
| 6 | Poster record items 1–3 and 6 (sponsor placement, vector logos, sponsor approval, printed proof) still apply | HR | Before the print run |

---

## 8. Testing

| Level | Cases |
|:--|:--|
| Unit (Vitest) | ID/EN parity for new keys (`tests/unit/strings.test.ts`). No guest-facing string contains "HIP-HOP". `invite-css.test.ts` stays green with the new keyframes |
| Repo checks | Existing `npm test`, type check, lint and build all pass |
| E2E / browser, 360 px | Opening shows REWIND, then PLAY, then the theme line, with no overlap. Theme line fits on one line. Dress code cards fit in ID and EN. Replay button shows the new label. Reduced motion goes straight to the scenes with the new About copy |
| Stage, 1920 × 1080 | Idle screen in standard, projector-safe and reduced-effects variants |
| Poster, flyer | Line clear of artwork at A3 and A5. Bleed, crop marks and page boxes intact. Flyer readable at phone size |
| Video | ffprobe: 1080 × 1920, 30 fps, 549 frames, H.264 + AAC, ≤ 16 MB. Audio stream unchanged. Theme line inside the safe zone. End card still from 16.57 s |
| Real devices | Invitation opened from a WhatsApp message on one Android and one iPhone. Video played as a WhatsApp Status and an Instagram Story. Done by HR |

## 9. Acceptance criteria

- [ ] No guest-facing text in the app says hip-hop
- [ ] Theme reads exactly RETRO REWIND: BACK TO THE 90s everywhere
- [ ] MOVE IN UNITY stays on every surface that has it today
- [ ] Check-in, merchandise, door prize, station and admin code is unchanged
- [ ] Glitch count, photosensitivity limits and the opening's length are unchanged
- [ ] Poster, flyer and video show the theme, with all other approved content unchanged
- [ ] Records in §6 name the new theme

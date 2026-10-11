# NourishFest 2026 — Design Guide

**Version:** 1.3
**Status:** Draft for approval
**Last updated:** 11 October 2026
**Applies to:** NourishFest 2026 Digital Event Experience (see PRD v1.2 and the Technical Design Spec)
**Visual reference:** "NourishFest 2026 Mockups" canvas (six screens: pass before check-in, pass after check-in, staff scan success, staff scan duplicate, stage display with the winning number, stage display with the winner revealed)
**Changes in 1.3 (11 Oct, synced to the current mockups):** pass header shows the company name; no tagline sticker on the pass (the tagline lives on the stage and idle screen); wordmark is two-tone (NOURISH off-white, FEST 2026 gold) at 50 px; date line is gold; pass backgrounds are page-wide with a different glow before and after check-in; the staff result type scale is 30 / 40 / 16 px; the stage LIVE badge is an outline pill; stage footer shows the tagline in pink Anton and the slot counter in muted Oswald; stage number shadows are 10 px (landed) and 7 px (revealed) with a gold glow; merchandise card text is stacked (QR, "1X PER ORANG" as pink text, helper, muted warning) (sections 5.2, 7, 8.8, 9.1, 9.2, 9.7, 14.3).
**Changes in 1.2 (10 Oct, synced to the updated mockups):** no congratulations wording anywhere, and the revealed stage shows name, outlet and department; the slot counter means slot n of the prize's total slots; the merchandise card is stacked with a larger QR and the helper text below it; QR frames are 8 px and the pass card border is 5 px; date line shows placeholders until HR supplies time and venue (sections 8.2, 8.3, 8.6, 8.8, 9.1, 14.3).
**Changes in 1.1:** the stage display now shows the prize and number first and reveals the winner after the MC confirms (sections 8.8, 9.5–9.7, 11, 13.1).

---

## 1. Brand Brief

| Item | Value |
| :---- | :---- |
| Event | NourishFest 2026 |
| Theme | HipHop |
| Tagline | **MOVE IN UNITY.** Together, We Make a Difference |
| Vibe | Urban street culture and block-party energy. Graffiti art, bomboxes, old-school swagger. High energy, bold, unapologetic |
| Audience | About 215 Nourish Group employees, mostly on mid-range phones, in a loud, dim, crowded venue |
| Languages | English (default) and Indonesian |

---

## 2. Design Principles

1. **Two modes, one brand.** Loud where people celebrate; quiet where staff work under pressure (section 3).
2. **Never make staff think.** A scan result is read in under a second, from arm's length.
3. **Colour is never alone.** Every state uses colour + icon + words (+ vibration where supported).
4. **One job per code.** The check-in QR and the merchandise QR must never be confused.
5. **Dark only.** Jet black ground everywhere. There is no light theme.
6. **Fast on weak Wi-Fi.** CSS and SVG textures, few font weights, no heavy images.
7. **Original imagery only.** Hip-hop motifs are drawn from scratch (boombox, vinyl, spray tags, brick). No copied logos, album art or known characters.

---

## 3. Two Modes

| | **Block Party** | **Ops** |
| :---- | :---- | :---- |
| Screens | Pass page (before and after check-in), RSVP, stage display | Check-in, merchandise booth, MC operator, prize verification, admin |
| Look | Full graffiti energy: big type, halftone dots, glow, hard pink shadows, rotated sticker tags | Flat black, huge touch targets, brand colours and fonts, **no decoration behind results** |
| Motion | Pass reveal, number roll | Result transitions only |
| Priority | Feel | Speed and certainty |

A decorated background behind a scan result costs seconds at the door. In Ops mode the brand shows in colour and headings, not in layout.

---

## 4. Colour

### 4.1 Brand colours

| Token | Hex | Role |
| :---- | :---- | :---- |
| `--nf-black` | `#0D0D0D` | Page background everywhere. Text on gold / pink / green fills |
| `--nf-gold` | `#D4AF37` | Headings, labels, check-in QR frame, Door Prize number, winner reveal, "attention / retry" state |
| `--nf-pink` | `#FF1B6B` | Primary action, merchandise frame, **blocked / duplicate** states, hard text shadows |
| `--nf-green` | `#39FF14` | **Success**, "live" indicator |

### 4.2 Support neutrals (used in the mockups)

| Token | Hex | Use |
| :---- | :---- | :---- |
| `--nf-text` | `#F5F5F0` | Main text (off-white, not pure white) |
| `--nf-text-soft` | `#BDBDB6` | Helper text on dark |
| `--nf-text-muted` | `#9A9A94` | Captions, inactive tabs |
| `--nf-card` | `#141414` | Cards on the black ground |
| `--nf-surface` | `#1B1B1B` | Camera area, raised panels |
| `--nf-line` | `#2A2A28` | Dividers, bottom-nav border |
| `--nf-line-dash` | `#3A3A36` | Ticket perforation (dashed) |
| `--nf-white` | `#FFFFFF` | **QR tiles only** |

### 4.3 Semantic mapping

| Meaning | Colour | Icon | Example label (ID / EN) |
| :---- | :---- | :---- | :---- |
| Success | Green with black text | Check | CHECK-IN BERHASIL / CHECKED IN |
| Already done / duplicate / blocked | Pink with black text | Exclamation | SUDAH CHECK-IN / ALREADY CHECKED IN |
| Needs attention / retry / wrong code type | Gold with black text | Refresh or swap | COBA LAGI / TRY AGAIN |
| Primary action | Pink fill, black text | none | AKU IKUT / I'M IN |
| Secondary action | Outline (off-white or gold) | none | TIDAK BISA / CAN'T MAKE IT |

### 4.4 Contrast (calculated, WCAG 2.x)

| Pair | Ratio | Verdict |
| :---- | :---- | :---- |
| Off-white `#F5F5F0` on black | 17.8 : 1 | Pass |
| Black on green | 14.3 : 1 | Pass |
| Black on gold | 9.2 : 1 | Pass |
| Gold on black | 9.2 : 1 | Pass |
| Gold on card `#141414` | 8.8 : 1 | Pass |
| Muted `#9A9A94` on black | 6.9 : 1 | Pass |
| Black on pink | 5.2 : 1 | Pass (AA) |
| Pink on black | 5.2 : 1 | Pass (AA) |
| Pink on card `#141414` | 4.9 : 1 | Pass (AA) |
| Camera hint `#8A8A84` on `#1B1B1B` | 5.0 : 1 | Pass (AA) |
| **White or off-white on pink** | **3.7 : 1 / 3.4 : 1** | **Fail for body text. Never use** |

**Rules**
- Text on gold, pink or green fills is **always black**, never white.
- Pink text on black is allowed for labels at 14 px or larger or any bold heading; avoid it for long body text.
- Do not place text on a busy background: halftone dots and glows sit under cards, never behind running text.

### 4.5 Projector note

Neon green, hot pink and gold can wash out or turn muddy on venue projectors. The stage display has a **projector-safe variant** (section 10.4). Decide on the day during the rehearsal.

---

## 5. Typography

### 5.1 Families

| Role | Font | Weight | Used for |
| :---- | :---- | :---- | :---- |
| Display | **Bungee** | 400 | Event wordmark, Door Prize numbers, stage number |
| Headings and buttons | **Anton** | 400 | Guest names, status titles, buttons, taglines |
| Labels and navigation | **Oswald** | 400 / 600 | Uppercase tracked labels, chips, tab bar, helper headings |
| Body | **Archivo** (regular) | 400 / 600 | Sentences, instructions, rules, all Indonesian helper text |

All four are on Google Fonts under open licences.

**Deviation from the original brief:** the brief named *Archivo Black* for body text. Archivo Black is too heavy for sentences, and Indonesian strings run about 20% longer than English. Use **Archivo regular (400 / 600)** for anything longer than a line. Archivo Black is not loaded. Reconsider if a stakeholder insists, but keep it to short labels only.

**Fallback stack:** `Impact, 'Arial Narrow', sans-serif` for Bungee / Anton / Oswald; `system-ui, sans-serif` for Archivo.

### 5.2 Type scale (as used in the mockups)

| Style | Font | Size | Notes |
| :---- | :---- | :---- | :---- |
| Wordmark (pass) | Bungee | 50 px, line-height 0.95 | Two lines: NOURISH (off-white) / FEST 2026 (gold), pink hard shadow 3 px |
| Door Prize number (pass) | Bungee | 150 px | Gold, pink hard shadow 5 px + soft gold glow |
| Guest name (pass card) | Anton | 38 px, uppercase | Wraps to two lines if needed |
| Guest name (pass, after check-in) | Anton | 24 px, uppercase | Next to the check-in status chip |
| Staff result: status title | Anton | 30 px | |
| Staff result: guest name | Anton | 40 px, uppercase | |
| Staff result: Door Prize number | Bungee | 96 px | In a black card |
| Staff result: outlet line | Oswald 600 | 16 px, tracking 0.08em | |
| Button | Anton | 18–24 px, tracking 0.04–0.08em | |
| Label / chip | Oswald 600 | 13–16 px, tracking 0.14–0.32em, uppercase | |
| Body | Archivo | 14 px | |
| Caption | Archivo | 12–13 px | Never below 12 px |
| Stage: prize banner | Anton | 34 px | Rotated sticker, -1.5° |
| Stage: winning number (landed) | Bungee | 300 px | At 1280 × 720 artboard; scale proportionally |
| Stage: winning number (after reveal) | Bungee | 180 px | Shrinks to make room for the name |
| Stage: winner name | Anton | 100 px, uppercase | Keep at 100 px or larger |
| Stage: outlet and department | Oswald 600 | 34 px, tracking 0.2em | Gold |
| Stage: "NOMOR PEMENANG" label | Oswald 600 | 30 px, tracking 0.3em | Gold, above the landed number |

### 5.3 Rules

- Headings are uppercase. Body copy is sentence case.
- Never fix the width of a text box tightly. Indonesian wraps longer than English; test every screen in both languages.
- Names can be long. Allow two lines for guest names and truncate nothing on the staff result screen.
- Load only the weights listed above (use `next/font`, Latin subset, `display: swap`).

---

## 6. Layout, Shape and Spacing

| Token | Value |
| :---- | :---- |
| Base unit | 4 px; common steps 8, 12, 14, 16, 20 |
| Design width | 360 px minimum (mockups are drawn at 390 px) |
| Side gutter | 20 px on guest and staff screens |
| Radius: buttons | 12 px (primary staff button 14 px) |
| Radius: cards | 18 px |
| Radius: chips / toggle | 999 px (pill) |
| Border weight | 2–3 px (thick, graffiti-sticker feel) |
| Guest button height | 52 px |
| Staff primary button height | 64 px |
| Minimum touch target | 48 px; 56 px and above on staff screens |
| Staff bottom tab bar | 64 px high |

**Shadows:** use hard offset text shadows with no blur (pink, 3 px / 5 px / 10 px by size). The only soft glow is gold on the Door Prize number and the stage display.

---

## 7. Brand Motifs and Texture

All drawn in CSS or inline SVG.

| Motif | Where | How |
| :---- | :---- | :---- |
| Halftone dot grid | Block Party backgrounds | `radial-gradient` gold at about 20% opacity, 14 px spacing (18 px on stage) |
| Colour glows | Block Party backgrounds | Page-wide, behind cards. Pass before check-in: pink glow top-left (38%), green glow right (14%). Pass after check-in: gold glow top-centre (28%), pink glow bottom-left (30%). Stage: gold ellipse centre (30%), pink bottom-left (35%), green bottom-right (16%) |
| Sticker tag | Stage prize banner, idle-screen tagline | Solid pink or green fill, black Anton text, rotated -2° to -1.5°. Not used on the pass page |
| Equalizer bars | Stage display sides | 16 px wide bars in pink / green / gold, varied heights; animate with a looping height keyframe |
| Ticket stub | Pass card | Dashed divider between name block and QR block |
| Spray tag, boombox, vinyl, brick wall | Optional accents on landing page and stage | Original SVG only. Keep file size small |

No decorative motif appears behind a QR code, a scan result, or running text.

---

## 8. Components

### 8.1 Buttons

| Variant | Spec |
| :---- | :---- |
| Primary | Pink fill, black Anton text, 12 px radius, 52 px high |
| Secondary | Transparent, 2 px off-white border and text |
| Accent outline | Transparent, 2 px gold border and text ("Save as image") |
| Staff primary | Black fill, off-white Anton text, 24 px, 64 px high, sits on a coloured result panel |
| Disabled | 40% opacity, no shadow, `aria-disabled` |

Focus state on every interactive element: 3 px gold outline with 2 px offset (on pink or gold surfaces use black).

### 8.2 QR tiles — critical rules

- The QR code always sits on a **solid white tile with black modules**. Never invert it and never put it on black or colour.
- Quiet zone of **at least 4 modules** on all sides (set the generator's margin to 4). The mockup uses a placeholder image; do not copy its padding.
- Render at an **integer number of pixels per module, at least 5 px**, with `shape-rendering: crispEdges`. A version 2–3 QR (about 25–29 modules) needs a tile of about 185–200 px or more including the quiet zone.
- Error correction level **M**. Keep the payload short (prefix + token) so the code stays low-density.
- No logo in the middle of the QR.
- Show the hint "Naikkan kecerahan layar" / "Turn up your screen brightness". Use the Screen Wake Lock API on the pass page where supported, so the screen does not dim at the door.

| | Check-in QR | Merchandise QR |
| :---- | :---- | :---- |
| Frame | **Gold**, 8 px | **Pink**, 8 px (inside a 3 px pink card border) |
| Label | Gold pill "PASS CHECK-IN" above | Pink banner "MERCHANDISE" across the top of its card (Anton 26 px) |
| Payload prefix | `NF:CI:` | `NF:MR:` |
| Appears | Before check-in (and remains available) | After check-in only |
| Helper | "Tunjukkan QR ini di meja check-in" | "Tunjukkan QR ini di booth merchandise. Bukan QR check-in. Jangan dibagikan." |

### 8.3 Ticket card (pass)

Black-on-card surface `#141414`, 5 px gold border, 18 px radius. Top block: "HALO," label, guest name (Anton), outlet · department · position line (Oswald, gold). Dashed divider. Bottom block: label pill, QR tile, helper line.

### 8.4 Status chip

Pill, black text on green: check icon + "CHECK-IN 17:42". Used on the pass page after check-in.

### 8.5 Language toggle

Two-segment pill, gold border; active segment gold fill with black text. Top-right of the pass page and staff headers. Switching saves the choice in the browser (with fallback if storage is unavailable).

### 8.6 Scan result panel (staff)

Full-width coloured panel under a 190 px camera strip: 52 px black circle with icon, status title, guest name, an outlet · department · position line, Door Prize number card, small meta line ("17:42 · Petugas: Check-in" on success, "Check-in pertama 17:42." on a duplicate), and a 64 px "SCAN BERIKUTNYA" button. The camera strip shows corner brackets in gold (normal) or pink (problem).

### 8.7 Staff bottom tab bar

Three tabs: SCAN, CARI MANUAL (manual search), and a live counter (for example "128 / 215"). Active tab: gold text with a 3 px gold top border. Inactive: muted.

### 8.8 Stage display parts

Header "NOURISHFEST 2026 · DOOR PRIZE" with a LIVE badge (green outline pill, 2 px, with a green dot), pink prize banner sticker ("HADIAH UTAMA · {prize}"), giant number with a "NOMOR PEMENANG" label and a "MENUNGGU PEMENANG..." line while the winner is being checked. After the MC confirms: the number shrinks to 180 px and the winner's name, outlet and department appear, with no congratulations wording. Footer: "MOVE IN UNITY." (Anton 28 px, pink) and the slot counter (Oswald 22 px, muted) ("UNDIAN 3 DARI 12" = slot 3 of the 12 slots of this prize).

**The name never appears on the stage before the MC confirms.** The landed view shows the prize and the number only.

### 8.9 Admin dashboard

Ops mode with brand colours. Counter tiles: large Bungee or Anton number, Oswald label, thin pink / green / gold indicator. Tables on `#141414` with `#2A2A28` row dividers. Use brand colours for status chips only; charts follow the chart rules in section 12.

---

## 9. Screen Specifications

### 9.1 Pass page — before check-in (`/pass/[token]`) — Block Party

1. Header: company name "NOURISH GROUP INDONESIA" (Oswald, gold, small) and language toggle.
2. Two-tone wordmark in Bungee with pink hard shadow (no tagline sticker on the pass), date · time · venue line in gold Oswald 13 px ("10 DES 2026 · {jam} · {lokasi}"). Time and venue appear only once HR has entered them; until then the line shows the date alone. The mockup shows `[JAM]` and `[LOKASI]` placeholders.
3. Ticket card with the guest's details and the gold-framed check-in QR.
4. RSVP block: label "KONFIRMASI KEHADIRAN", two buttons side by side. After a tap, show a one-line confirmation and a small "Ubah jawaban" link.
5. States: link opened first time (record `first_opened_at`), invalid or expired token (friendly message, no data), loading (skeleton card, no spinner over the QR).

### 9.2 Pass page — after check-in — Block Party

1. Header and language toggle.
2. Guest name (Anton 24 px) and green status chip with a check icon and the check-in time, on one row.
3. **Door Prize number takes over the page**: label "NOMOR DOOR PRIZE", Bungee 150 px gold, pink shadow, short helper line.
4. Merchandise card (3 px pink border) with pink banner, then the pink-framed QR, then "1X PER ORANG" as pink Oswald text, the helper line, and a muted 12 px warning ("Bukan QR check-in. Jangan dibagikan").
5. "SIMPAN SEBAGAI GAMBAR" button. The saved image is a clean **9:16** card (name, outlet, number, no buttons).
6. Reveal motion on first view after check-in (section 11).
7. After merchandise is claimed, the merchandise card changes to a muted "SUDAH DIAMBIL" state with the time, and the QR is hidden.

### 9.3 Check-in station (`/station/check-in`) — Ops

- Camera strip, result panel (success / duplicate / invalid / wrong type / retry), bottom tab bar.
- Manual search: single field searching name or Employee ID, results as large tappable rows (name, outlet). Selecting a row opens the same result panel.
- Station label shown in the header ("MEJA 1").

### 9.4 Merchandise booth (`/station/merchandise`) — Ops

- Same layout as check-in. After a valid scan the panel shows name and outlet and a large **SERAHKAN MERCHANDISE** button. The redemption is recorded only after that tap; the panel then turns green with "TERCATAT".
- Blocked states in pink: `SUDAH DIAMBIL` (with original time and station), `BELUM CHECK-IN`.
- Running count of items claimed in the tab bar.

### 9.5 MC operator (`/station/draw`) — Ops, phone or tablet

- Prize picker (current prize in large type, next prize below), big **DRAW** button.
- After a draw: number, name, outlet in large type, a 60-second countdown, and status "MENUNGGU PEMENANG". The name is shown here even though the stage does not show it yet.
- Two large buttons: **KONFIRMASI** (green, black text; reveals the name on the stage) and **TIDAK HADIR** (pink, black text; voids the draw and offers a redraw). Both buttons act on one tap, so keep them 16 px apart. An admin can reverse a mistaken action afterwards (`void_admin`).
- After confirming: a "TERCATAT" state and a **UNDIAN BERIKUTNYA** button.
- Always shows the result even if the stage display is disconnected.
- Connection indicator for the stage display (green dot / pink dot).

### 9.6 Prize verification (`/station/prizes`) — Ops, backup

- Optional second screen for a Prize Verification Officer. The MC screen is the primary place to confirm.
- Shows the current draw: number, name, outlet, prize.
- Two large buttons: **KONFIRMASI & SERAHKAN** (green) and **TIDAK HADIR** (pink). They do the same as on the MC screen; whichever is tapped first wins and a repeat is harmless.
- Manual number entry field for edge cases.

### 9.7 Stage display (`/stage`) — Block Party, 16:9

- Design at 1920 × 1080 and scale (the mockup is 1280 × 720).
- Idle state: wordmark, tagline, equalizer bars, "UNDIAN DIMULAI SEBENTAR LAGI".
- Intro state: prize banner and prize name only.
- Rolling state: number roll (cosmetic, about 5 seconds, local to the display).
- **Landed state:** prize banner, "NOMOR PEMENANG" label, the number at 300 px, "MENUNGGU PEMENANG..." line, footer with "MOVE IN UNITY." and the slot counter. No name.
- **Revealed state** (after the MC confirms): prize banner, number reduced to 180 px, winner name (100 px), outlet and department line. No congratulations wording (HR decision, 10 Oct).
- Batch state: a grid of numbers that all land together; each tile flips to the winner's name when that winner is confirmed.
- Void state: brief "TIDAK HADIR — UNDI ULANG" message, then returns to the prize banner.
- No controls, no cursor, no scrollbars.

### 9.8 Admin (`/admin/*`) — Ops

- Dashboard counters (section 8.9).
- Guests: import dropzone with preview and error list, table with search / filter by outlet and RSVP, export buttons, "Add walk-in".
- Prizes: sortable list with tier, quantity, batch toggle.
- Draws and Merchandise: history tables with void actions that open a reason dialog.
- Settings: PINs (reveal once on creation, rotate), stage key, projector-safe toggle.

---

## 10. States and Feedback

### 10.1 Scan results

| State | Panel | Icon | Title (ID) | Feedback |
| :---- | :---- | :---- | :---- | :---- |
| Checked in | Green | Check | CHECK-IN BERHASIL | Short vibration, high beep |
| Already checked in | Pink | Exclamation | SUDAH CHECK-IN | Double vibration, low beep |
| QR not recognised | Pink | Cross | QR TIDAK DIKENAL | Double vibration |
| Wrong code type | Gold | Swap | BUKAN QR CHECK-IN / BUKAN QR MERCHANDISE | Double vibration |
| Retryable error | Gold | Refresh | KONEKSI BERMASALAH, COBA LAGI | None |
| Merchandise recorded | Green | Check | TERCATAT | Short vibration |
| Already redeemed | Pink | Exclamation | SUDAH DIAMBIL | Double vibration |
| Not checked in | Pink | Exclamation | BELUM CHECK-IN | Double vibration |

Sound is optional per station (toggle). Vibration is not supported on iOS Safari, so colour, icon and words are the primary signal.

### 10.2 Empty, loading and error

- Loading: skeleton blocks in `#1B1B1B`. Never show a spinner on top of a QR.
- Errors: plain language, always say what to do next ("Coba lagi", "Panggil admin").
- Empty tables: one line of text and the next action.

### 10.3 Forms and dialogs

Used only in admin. Dialogs for void and override require a free-text reason (minimum 5 characters).

### 10.4 Projector-safe variant (stage display)

Switch on in settings. Removes glows and halftone, drops the pink shadow in favour of a 2 px black outline, uses pure white for names, and thickens the gold. Keep both variants shippable.

---

## 11. Motion

| Moment | Spec | Reduced-motion |
| :---- | :---- | :---- |
| Pass reveal after check-in | Number counts up or flips into place over about 600 ms; merchandise card slides up after 200 ms | Show the final state immediately |
| Scan result | Panel colour wipes in over 150 ms | None |
| Stage number roll | Slot-reel or equalizer-style roll, decelerating over about 5 seconds, lands on the number | Skip the roll and show the result |
| Winner reveal (after MC confirm) | 1 short neon flash, name slides up over 300 ms, number shrinks to 180 px | Fade only |
| Batch reveal | One winner every 1.5–2 seconds | Show all at once |
| Equalizer bars | Looping height animation | Static |

Rules: respect `prefers-reduced-motion`; no motion on staff screens other than results; the draw result is already saved before the animation starts, so the animation can never change the outcome.

---

## 12. Accessibility

- Contrast as in 4.4. White on pink is forbidden.
- Touch targets 48 px or more; 56 px or more on staff screens.
- Every state combines colour, icon and words.
- Real `<button>`, `<a>`, `<input>` + `<label>`; `aria-label` on icon-only buttons; icons that decorate are `aria-hidden`.
- Visible focus ring on all interactive elements.
- `lang` attribute follows the selected language (`id` / `en`).
- QR images have an alt text such as "QR check-in untuk Kadek Ayu Lestari".
- Camera permission: show a short explanation before the browser prompt, and a "Cari manual" fallback if denied.
- Text can scale to 130% without breaking layouts on guest and staff screens.
- Charts (dashboard): do not rely on colour alone; label directly, use the neutrals plus brand colours for series, and keep sufficient lightness difference between series.

---

## 13. Content and Voice

- **Tone:** upbeat, short, street-smart, respectful. Headlines are punchy; helper text is plain.
- **Avoid:** slang that excludes people, jokes about names or outlets, anything that sounds like a loan or prize scam.
- **English by default, Indonesian one tap away.** Indonesian uses casual "aku/kamu" on guest screens and neutral wording on staff and admin screens.
- All strings come from one translation file. Indonesian wording is drafted here and must be reviewed by HR before launch.

### 13.1 Starter string set

| Key | Indonesian (needs review) | English (default) |
| :---- | :---- | :---- |
| `brand.company` | NOURISH GROUP INDONESIA | NOURISH GROUP INDONESIA |
| `pass.greeting` | HALO, | HELLO, |
| `pass.checkin_label` | PASS CHECK-IN | CHECK-IN PASS |
| `pass.show_qr` | Tunjukkan QR ini di meja check-in | Show this QR at the check-in desk |
| `pass.brightness` | Naikkan kecerahan layar agar mudah dipindai | Turn up your screen brightness so it scans easily |
| `rsvp.title` | KONFIRMASI KEHADIRAN | RSVP |
| `rsvp.yes` | AKU IKUT | I'M IN |
| `rsvp.no` | TIDAK BISA | CAN'T MAKE IT |
| `rsvp.thanks_yes` | Sip, sampai ketemu 10 Desember! | You're in. See you on 10 December! |
| `rsvp.thanks_no` | Terima kasih sudah memberi kabar | Thanks for letting us know |
| `rsvp.change` | Ubah jawaban | Change answer |
| `pass.checked_in_at` | CHECK-IN {time} | CHECKED IN {time} |
| `pass.prize_number` | NOMOR DOOR PRIZE | DOOR PRIZE NUMBER |
| `pass.prize_hint` | Tunjukkan nomor ini ke panitia saat dipanggil | Show this number to the committee when it's called |
| `merch.banner` | MERCHANDISE | MERCHANDISE |
| `merch.once` | 1X PER ORANG | 1 PER PERSON |
| `merch.show` | Tunjukkan QR ini di booth merchandise | Show this QR at the merchandise booth |
| `merch.warn` | Bukan QR check-in. Jangan dibagikan | Not the check-in QR. Don't share it |
| `merch.claimed` | SUDAH DIAMBIL | CLAIMED |
| `pass.save` | SIMPAN SEBAGAI GAMBAR | SAVE AS IMAGE |
| `staff.success` | CHECK-IN BERHASIL | CHECKED IN |
| `staff.already` | SUDAH CHECK-IN | ALREADY CHECKED IN |
| `staff.checked_in_note` | {time} · Petugas: {station} | {time} · Staff: {station} |
| `staff.first_checkin` | Check-in pertama {time}. | First check-in {time}. |
| `staff.prize_label_new` | NOMOR DOOR PRIZE | DOOR PRIZE NUMBER |
| `staff.prize_label` | NOMOR DOOR PRIZE (TETAP) | DOOR PRIZE NUMBER (FIXED) |
| `staff.invalid` | QR TIDAK DIKENAL | QR NOT RECOGNISED |
| `staff.wrong_checkin` | BUKAN QR CHECK-IN | NOT A CHECK-IN QR |
| `staff.wrong_merch` | BUKAN QR MERCHANDISE | NOT A MERCHANDISE QR |
| `staff.retry` | KONEKSI BERMASALAH, COBA LAGI | CONNECTION PROBLEM, TRY AGAIN |
| `staff.next` | SCAN BERIKUTNYA | SCAN NEXT |
| `staff.manual` | CARI MANUAL | MANUAL SEARCH |
| `merch.handover` | SERAHKAN MERCHANDISE | HAND OVER MERCHANDISE |
| `merch.recorded` | TERCATAT | RECORDED |
| `merch.not_checked_in` | BELUM CHECK-IN | NOT CHECKED IN |
| `draw.you_won` | Kamu memenangkan {prize} | You won {prize} |
| `draw.landed_label` | NOMOR PEMENANG | WINNING NUMBER |
| `draw.next` | UNDIAN BERIKUTNYA | NEXT DRAW |
| `draw.must_be_present` | PEMENANG HARUS HADIR · 60 DETIK | WINNER MUST BE PRESENT · 60 SECONDS |
| `draw.progress` | UNDIAN {n} DARI {total} | DRAW {n} OF {total} |
| `draw.no_show` | TIDAK HADIR — UNDI ULANG | NOT HERE — REDRAW |
| `draw.confirm` | KONFIRMASI | CONFIRM |
| `draw.confirm_handover` | KONFIRMASI & SERAHKAN | CONFIRM & HAND OVER |
| `draw.waiting` | MENUNGGU PEMENANG | WAITING FOR WINNER |
| `draw.waiting_dots` | MENUNGGU PEMENANG... | WAITING FOR THE WINNER... |
| `stage.idle` | UNDIAN DIMULAI SEBENTAR LAGI | THE DRAW STARTS SOON |
| `brand.tagline` | MOVE IN UNITY. | MOVE IN UNITY. |

The tagline's second line, "Together, We Make a Difference", is used on the landing page and in the invitation message. Translate it only if stakeholders want an Indonesian version.

---

## 14. Implementation Notes

### 14.1 Design tokens (CSS custom properties)

```css
:root {
  /* brand */
  --nf-black: #0D0D0D;
  --nf-gold:  #D4AF37;
  --nf-pink:  #FF1B6B;
  --nf-green: #39FF14;

  /* neutrals */
  --nf-text:       #F5F5F0;
  --nf-text-soft:  #BDBDB6;
  --nf-text-muted: #9A9A94;
  --nf-card:       #141414;
  --nf-surface:    #1B1B1B;
  --nf-line:       #2A2A28;
  --nf-line-dash:  #3A3A36;
  --nf-white:      #FFFFFF; /* QR tiles only */

  /* type */
  --nf-font-display: 'Bungee', Impact, sans-serif;
  --nf-font-heading: 'Anton', Impact, 'Arial Narrow', sans-serif;
  --nf-font-label:   'Oswald', 'Arial Narrow', sans-serif;
  --nf-font-body:    'Archivo', system-ui, sans-serif;

  /* shape */
  --nf-radius-btn: 12px;
  --nf-radius-card: 18px;
  --nf-radius-pill: 999px;
  --nf-gutter: 20px;
}
```

Keep the theme in one file so the logo, colours and fonts can be swapped without touching components.

### 14.2 Performance

- Fonts via `next/font` (Latin subset, `display: swap`), only the weights in 5.1.
- Textures as CSS gradients and small inline SVGs. No large background images.
- QR codes rendered as SVG on a white tile for crisp scaling.
- "Save as image" renders a 1080 × 1920 canvas in the browser from the pass data (no server image generation).
- The pass page and station pages must remain usable on a mid-range Android phone over weak Wi-Fi.
- Test the stage display on the real projector and laptop at rehearsal.

### 14.3 Known differences between the mockups and the final build

- The mockup QR is a placeholder image with small padding. Final QR follows 8.2 (quiet zone of 4 modules, at least 5 px per module, 6 px by default, so the symbol is 222 px plus the 8 px frame).
- Mockup staff headers show only the page title ("CHECK-IN"). The build also shows the station label chip and the language toggle (8.5, 9.3).
- The mockup stage boards show the outlet · department line as "NOURISH GROUP · HR"; real data comes from the winner's record. The slot counter "UNDIAN 3 DARI 12" is slot 3 of 12 slots of the current prize.
- The mockup RSVP buttons are drawn 49 px high; the build keeps 52 px (section 6) for the touch target.
- The mockup draws the staff camera area very tall; the build uses the 190 px strip in 8.6.
- English is the default language everywhere (pass, staff, admin and stage), and a saved ID/EN choice in the browser overrides it. The original brief and PRD said Indonesian; to switch back, change the default in `src/lib/i18n/index.tsx`, `src/lib/stage.ts` (`DEFAULT_OPTIONS`) and `<html lang>` in `src/app/layout.tsx`.
- The equalizer bars are on the idle stage screen only; the other stage states keep the full width for the number and name.
- Mockups use text for the wordmark. If a NourishFest logo is provided, it replaces the wordmark in the header only; keep the Bungee wordmark on the pass hero.
- Mockups do not yet cover: merchandise booth, MC operator, prize verification, admin screens, void state, idle, intro and batch stage states. They follow sections 9.4 to 9.8.
- The mockup stage boards show the landed and revealed states only.
- Mockup captions at 12–13 px are the minimum; do not go smaller.

### 14.4 Do and Don't

| Do | Don't |
| :---- | :---- |
| Put QR codes on solid white tiles with a proper quiet zone | Put QR codes on black or inside colour |
| Use black text on gold, pink and green | Use white text on pink |
| Show colour + icon + words for every state | Rely on colour alone |
| Keep Ops screens flat and big | Put graffiti behind scan results |
| Test Indonesian strings on every screen | Fix text box widths tightly |
| Respect reduced motion | Animate staff screens |
| Draw original hip-hop imagery | Copy logos, album art or characters |

---

## 15. Open Design Questions

| # | Question |
| :---- | :---- |
| 1 | Is there a NourishFest logo, or does the text wordmark stand in? |
| 2 | Final date, time and venue text for the pass and stage display |
| 3 | Is a Nourish Group corporate logo or sponsor strip required on the stage display? |
| 4 | Final decision on optional sound effects at the check-in and booth stations |
| 5 | Who reviews the Indonesian wording before launch? |

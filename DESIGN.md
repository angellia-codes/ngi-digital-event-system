---
name: NourishFest 2026
description: "MOVE IN UNITY. A 90s throwback event pass in your pocket, with a flat, certain toolkit for the staff behind the desk."
colors:
  blacktop: "#0D0D0D"
  trophy-gold: "#D4AF37"
  spray-can-pink: "#FF1B6B"
  lightstick-green: "#39FF14"
  chalk: "#F5F5F0"
  smoke: "#BDBDB6"
  ash: "#9A9A94"
  tarmac-card: "#141414"
  asphalt-surface: "#1B1B1B"
  seam: "#2A2A28"
  perforation: "#3A3A36"
  qr-white: "#FFFFFF"
  stage-black: "#000000"
typography:
  display:
    fontFamily: "Bungee, Impact, sans-serif"
    fontSize: "150px"
    fontWeight: 400
    lineHeight: 0.95
  wordmark:
    fontFamily: "Bungee, Impact, sans-serif"
    fontSize: "50px"
    fontWeight: 400
    lineHeight: 0.95
  headline:
    fontFamily: "Anton, Impact, 'Arial Narrow', sans-serif"
    fontSize: "38px"
    fontWeight: 400
    lineHeight: 1.05
  title:
    fontFamily: "Anton, Impact, 'Arial Narrow', sans-serif"
    fontSize: "30px"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "0.04em"
  button:
    fontFamily: "Anton, Impact, 'Arial Narrow', sans-serif"
    fontSize: "18px"
    fontWeight: 400
    letterSpacing: "0.04em"
  button-staff:
    fontFamily: "Anton, Impact, 'Arial Narrow', sans-serif"
    fontSize: "24px"
    fontWeight: 400
    letterSpacing: "0.08em"
  label:
    fontFamily: "Oswald, 'Arial Narrow', sans-serif"
    fontSize: "14px"
    fontWeight: 600
    letterSpacing: "0.28em"
  label-admin:
    fontFamily: "Oswald, 'Arial Narrow', sans-serif"
    fontSize: "13px"
    fontWeight: 400
    letterSpacing: "0.06em"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  caption:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  field-admin: "8px"
  btn: "12px"
  btn-staff: "14px"
  card: "18px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  gutter: "20px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.spray-can-pink}"
    textColor: "{colors.blacktop}"
    typography: "{typography.button}"
    rounded: "{rounded.btn}"
    padding: "0 20px"
    height: "52px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.chalk}"
    typography: "{typography.button}"
    rounded: "{rounded.btn}"
    padding: "0 20px"
    height: "52px"
  button-outline-gold:
    backgroundColor: "transparent"
    textColor: "{colors.trophy-gold}"
    typography: "{typography.button}"
    rounded: "15px"
    padding: "0 20px"
    height: "52px"
  button-staff:
    backgroundColor: "{colors.trophy-gold}"
    textColor: "{colors.blacktop}"
    typography: "{typography.button-staff}"
    rounded: "{rounded.btn-staff}"
    height: "64px"
    width: "100%"
  button-staff-dark:
    backgroundColor: "{colors.blacktop}"
    textColor: "{colors.chalk}"
    typography: "{typography.button-staff}"
    rounded: "{rounded.btn-staff}"
    height: "64px"
    width: "100%"
  button-confirm:
    backgroundColor: "{colors.lightstick-green}"
    textColor: "{colors.stage-black}"
    rounded: "{rounded.btn-staff}"
    height: "64px"
  button-noshow:
    backgroundColor: "{colors.spray-can-pink}"
    textColor: "{colors.stage-black}"
    rounded: "{rounded.btn-staff}"
    height: "64px"
  button-admin:
    backgroundColor: "{colors.asphalt-surface}"
    textColor: "{colors.chalk}"
    typography: "{typography.label-admin}"
    rounded: "{rounded.btn}"
    padding: "9px 16px"
  button-admin-gold:
    backgroundColor: "{colors.trophy-gold}"
    textColor: "{colors.blacktop}"
    typography: "{typography.label-admin}"
    rounded: "{rounded.btn}"
    padding: "9px 16px"
  ticket-card:
    backgroundColor: "{colors.tarmac-card}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.card}"
    padding: "16px"
  merch-card:
    backgroundColor: "{colors.tarmac-card}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.card}"
    padding: "0 20px 16px"
  result-panel-success:
    backgroundColor: "{colors.lightstick-green}"
    textColor: "{colors.blacktop}"
    padding: "18px 20px 16px"
  result-panel-blocked:
    backgroundColor: "{colors.spray-can-pink}"
    textColor: "{colors.blacktop}"
    padding: "18px 20px 16px"
  result-panel-attention:
    backgroundColor: "{colors.trophy-gold}"
    textColor: "{colors.blacktop}"
    padding: "18px 20px 16px"
  chip-checked-in:
    backgroundColor: "{colors.lightstick-green}"
    textColor: "{colors.blacktop}"
    rounded: "{rounded.pill}"
    padding: "5px 10px"
  pill-label:
    backgroundColor: "{colors.trophy-gold}"
    textColor: "{colors.blacktop}"
    rounded: "{rounded.pill}"
    padding: "4px 14px"
  lang-toggle-on:
    backgroundColor: "{colors.trophy-gold}"
    textColor: "{colors.blacktop}"
    rounded: "{rounded.pill}"
    height: "48px"
  input-pin:
    backgroundColor: "{colors.tarmac-card}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.btn}"
    height: "64px"
  input-admin:
    backgroundColor: "{colors.asphalt-surface}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.field-admin}"
    padding: "9px 12px"
  tab-bar:
    backgroundColor: "{colors.blacktop}"
    textColor: "{colors.ash}"
    height: "64px"
  tab-bar-active:
    backgroundColor: "{colors.blacktop}"
    textColor: "{colors.trophy-gold}"
    height: "64px"
---

# Design System: NourishFest 2026

## Overview

**Creative North Star: "The Mixtape Pass"**

Every employee gets a personal mixtape: a handmade, old-school artifact with their name on the label, passed along on WhatsApp and kept in their pocket until the night. The system is built around that object. The guest pass is a ticket stub on a jet-black ground, stamped with a Bungee wordmark and framed QR codes. The invitation plays like a cassette: boombox, VHS glitch, Polaroid, LCD countdown. The stage display is the same tape played on the big speakers, with numbers 300 px tall and hard pink shadows. All imagery is drawn from scratch in CSS and inline SVG. Nothing is borrowed from real album art, logos or characters.

The mood is **loud and unapologetic, old-school and handmade, warm and inclusive**. It is loud in type and colour: four saturated brand colours on near-black, display type with hard offset shadows, sticker tags tilted a couple of degrees. It is handmade in its motifs: halftone dots, perforated ticket seams, equalizer bars. It is warm in who it speaks to: 215 colleagues in a respectful, street-smart voice, never a club that someone is left out of.

The tape has a B-side. Staff screens (check-in, merchandise, MC operator, prize verification, admin) run in **Ops mode**: the same colours and fonts, but flat black, huge touch targets and no decoration. The brand shows in colour and headings, never in layout. The pass and stage are where people feel the party. The stations are where staff need certainty in under a second, at arm's length, in a dim, loud room.

**Key Characteristics:**
- Dark only. Blacktop ground everywhere; there is no light theme.
- Four voices: Bungee for digits and the wordmark, Anton for names and buttons, Oswald for tracked labels, Archivo for sentences.
- Black text on every gold, pink and green fill.
- Ticket-stub components: thick borders, dashed perforations, stamped pill labels, white-tiled QR codes in coloured frames.
- Two depth layers: hard, blur-free pink offsets on type, and neon glows behind the content.
- Block Party mode (pass, invitation, stage) versus Ops mode (stations, admin).

## Colors

Four saturated street colours on near-black, each with one clear job, supported by a short ladder of warm, slightly yellowed greys.

### Primary
- **Trophy Gold** (`--nf-gold`): the house colour. It covers headings, tracked labels, the wordmark's "FEST 2026" line, the check-in QR frame, the Door Prize number, the ticket border, the active language and tab state, and the focus ring. On staff screens it also marks the **attention / retry / wrong code type** state.

### Secondary
- **Spray-Can Pink** (`--nf-pink`): action and alarm. It is the guest primary button, the merchandise QR frame and banner, every hard text shadow, sticker tags, and the **already done / duplicate / blocked** state. Pink text on black is fine for labels of 14 px or larger and for bold headings, never for long body text.

### Tertiary
- **Lightstick Green** (`--nf-green`): **success and live**, and nothing else. It is used for the check-in-success panel, the checked-in chip, the Confirm button, the stage LIVE badge, revealed batch tiles and healthy-connection dots.

### Neutral
- **Blacktop** (`--nf-black`): the page ground on every screen, and the text colour on gold, pink and green fills.
- **Stage Black**: pure black for the projector letterbox and the projector-safe board.
- **Chalk** (`--nf-text`): main text. Off-white, never pure white.
- **Smoke** (`--nf-text-soft`): helper text, table headers, secondary meta lines.
- **Ash** (`--nf-text-muted`): captions, inactive tabs, timestamps, the stage footer counter.
- **Tarmac Card** (`--nf-card`): cards on the black ground (ticket, merchandise card, admin cards, the neutral result panel).
- **Asphalt Surface** (`--nf-surface`): the camera area, admin inputs and buttons, hover lift on hub cards.
- **Seam** (`--nf-line`): dividers, the tab-bar top border, admin card borders.
- **Perforation** (`--nf-line-dash`): the ticket's dashed tear line, input borders, the muted "claimed" banner.
- **QR White** (`--nf-white`): **QR tiles only** (plus the Polaroid in the invitation).

### Named Rules
**The Black-on-Neon Rule.** Text on a gold, pink or green fill is always black. White or off-white on pink measures 3.4–3.7:1 and is forbidden.

**The One Job Per Colour Rule.** Green means success or live. Pink means act, or that something is blocked or already done. Gold means attention, or that this is yours. A state is never signalled by colour alone: every one pairs colour with an icon and words.

**The One Job Per Code Rule.** The check-in QR always has a gold frame and the merchandise QR always has a pink frame with a "MERCHANDISE" banner. The two must never look alike.

## Typography

**Display Font:** Bungee (with Impact, sans-serif)
**Heading / Button Font:** Anton (with Impact, 'Arial Narrow', sans-serif)
**Label Font:** Oswald 400 / 600 (with 'Arial Narrow', sans-serif)
**Body Font:** Archivo 400 / 600 (with system-ui, sans-serif)

**Character:** Bungee is the boombox: blocky, sign-painted, reserved for the wordmark and numbers. Anton is the hype voice, tall and condensed for names, status titles and buttons. Oswald is the tracked-out liner note that labels everything. Archivo is the plain-spoken friend who explains the rules in full sentences, in both languages. All four load through `next/font` (Latin subset, `display: swap`), using only the weights above.

### Hierarchy
- **Display** (Bungee 400, 150 px, line-height 0.95): the Door Prize number on the pass, in gold with a hard pink shadow and a gold glow. The same voice scales to 96 px on the staff result and MC screens, and to 300 px (landed) / 180 px (revealed) on the 1280 × 720 stage artboard.
- **Wordmark** (Bungee 400, 50 px, line-height 0.95): two lines, "NOURISH" in Chalk and "FEST 2026" in Trophy Gold, with a 3 px pink hard shadow. 120 px on the idle stage screen.
- **Headline** (Anton 400, 38 px, line-height 1.05, uppercase): the guest's name on the ticket. 40 px on the staff result and MC card, 100 px or more on the stage. Wraps to two lines and is never truncated on staff screens.
- **Title** (Anton 400, 30 px, 0.04em): status titles on staff result panels ("CHECKED IN", "ALREADY CHECKED IN"). Scene titles in the invitation use 32 px in gold.
- **Button** (Anton 400, 18 px, 0.04em; staff 24 px, 0.08em): every guest and staff button.
- **Label** (Oswald 600, 13–16 px, 0.14–0.32em tracking, uppercase): pills, chips, the ticket's meta line, tabs, "DOOR PRIZE" headers, the language toggle. The stage uses 22–34 px versions.
- **Admin label** (Oswald 400, 13 px, 0.06em, uppercase): admin nav, table headers, admin buttons. It is quieter tracking for denser screens.
- **Body** (Archivo 400, 14 px, line-height 1.45): sentences, instructions, rules, helper text.
- **Caption** (Archivo 400, 12–13 px): the floor. Nothing is set smaller than 12 px.

### Named Rules
**The Four Voices Rule.** Bungee only for digits and the wordmark, Anton for names, titles and buttons, Oswald for tracked labels, Archivo for anything longer than a line. Archivo Black is not loaded. Headings are uppercase, and body copy is sentence case.

**The Room-to-Grow Rule.** Indonesian runs about 20% longer than English, and names can be long. Never fix a text box's width tightly. Text must scale to 130% without breaking. Test every screen in both languages.

## Layout

The layout is mobile first at a **360 px minimum** (mockups are drawn at 390 px), with a **20 px side gutter** on guest and staff screens. It is built on a 4 px base with common steps of 8, 12, 16 and 20 px. Each surface is a single centred column with its own cap:

- **Pass** (Block Party): max 480 px. A vertical stack with 18 px gaps: top bar (company label and language toggle) → wordmark hero → ticket card → Door Prize number and merchandise card after check-in. The page-wide background carries a halftone dot grid (14 px) and colour glows that change position before and after check-in.
- **Invitation**: full-screen scenes, each at least 88dvh and max 480 px wide, revealed on scroll. A sticky top bar fades from Blacktop to transparent.
- **Stations** (Ops): max 520 px, full height. A 56 px header bar (title, station chip, language toggle) → camera area at 45dvh, clamped to 190–420 px → full-width result panel → 64 px bottom tab bar. Staff touch targets are 56 px or more, and primary staff buttons are 64 px.
- **Admin** (Ops): max 1100 px. A wrapping top nav, then counter tiles in an auto-fill grid (min 150 px), cards and horizontally scrollable tables.
- **Hub** (`/`): max 760 px, centred, with an auto-fill launcher grid (min 200 px).
- **Stage**: a fixed **1280 × 720 artboard**, scaled to fit by JavaScript, with nothing scrolling. It has a 72 px header, a centred main area with 60 px side padding, and a 64 px footer. The cursor is hidden until there is mouse activity.

**The Clean Ground Rule.** Halftone and glows sit under cards, never behind a QR code, a scan result, or running text. In Ops mode there is no decoration behind results at all.

## Elevation & Depth

The system is **flat print plus neon glow**, with two equal depth layers and no ambient drop shadows on surfaces. The first layer is the screen-print: solid fills, thick borders and **hard, blur-free offset shadows** in Spray-Can Pink under display type and the invitation's primary button. They read like a misregistered second ink pass. The second layer is **neon light**: page-wide radial colour glows behind the content, and a soft gold glow that makes the Door Prize number and the stage number feel lit. Cards stay flat on top of both layers and separate from the ground by tone (Tarmac Card on Blacktop) and by their thick borders.

### Shadow Vocabulary
- **Wordmark offset** (`text-shadow: 3px 3px 0 var(--nf-pink)`): the pass wordmark, invitation marks and scene marks.
- **Mid offset** (`text-shadow: 4px 4px 0 var(--nf-pink)`): the 96 px staff Door Prize number, MC winner number, stage tiles.
- **Prize number lit** (`text-shadow: 5px 5px 0 var(--nf-pink), 0 0 40px rgba(212,175,55,0.45)`): the pass Door Prize number.
- **Stage number lit** (`text-shadow: 10px 10px 0 var(--nf-pink), 0 0 80px rgba(212,175,55,.5)`): the landed stage number. The revealed version is 7 px with a 60 px glow.
- **Sticker button** (`box-shadow: 4px 4px 0 var(--nf-gold)`): the invitation's pink PRESS PLAY button.
- **Polaroid drop** (6 px × 6 px solid pink offset, drawn as a `::before` layer so it can settle on its own): the invitation Polaroid.
- **Background glows** (radial gradients, 14–38% opacity, in pink, green and gold): page-wide on the pass, invitation and stage only.

### Named Rules
**The Hard Offset Rule.** Offset shadows have zero blur, always. The only blurred light in the system is a glow: the gold number glow and the page-wide colour glows.

**The Ops Mode Is Flat Rule.** Station and admin screens have no glows, no halftone and no offset shadows except on the Door Prize number itself.

**The Projector-Safe Rule.** On the stage's projector-safe variant, glows and halftone switch off. Numbers and names lose their shadows, gain a 2 px black stroke, names go pure white, and tile borders thicken to 6 px.

## Shapes

The shapes are chunky and stamped. Corners are friendly but not soft: **12 px on buttons** (14 px on staff buttons, 15 px on the gold outline button), **18 px on cards, QR frames and stage tiles**, and **8 px on admin inputs**. Chips, pills, the language toggle and status dots are full pills (999 px). Borders are thick and sticker-like, at **2–5 px**: 5 px gold on the ticket, 3 px pink on the merchandise card, 8 px on QR frames, 4 px on stage tiles. The admin console uses 1 px borders for density.

Recurring shapes include the **dashed perforation** (2 px dashed Perforation) that tears the ticket between the name block and the QR block, **sticker tags** rotated −1.5° to −3° (stage prize banner, idle tagline, invitation stickers, Polaroid), **52 px black circles** that hold the status icon on result panels, and **scanner corner brackets** (28 px, 4 px stroke, gold normally and pink on a problem).

## Components

The feel is **ticket stub, torn and stamped**. Every container is a piece of the pass: thick-bordered, perforated, stamped with tracked labels, holding a framed code.

### Buttons
- **Shape:** gently squared (12 px), 52 px tall for guests and 64 px for staff, Anton type.
- **Primary (guest):** Spray-Can Pink fill, Blacktop text. Used for the main guest action.
- **Secondary:** transparent with a 2 px Chalk border and text.
- **Gold outline:** transparent with a 2 px Trophy Gold border and text, slightly wider tracking (0.08em) and a 15 px radius. Used for "Save as image".
- **Staff primary:** full-width Trophy Gold fill, Blacktop Anton text at 24 px, 64 px tall, 14 px radius.
- **Staff dark:** Blacktop fill with Chalk text. It sits on a coloured result panel ("SCAN NEXT") or in MC secondary actions.
- **Confirm / No-show (MC):** paired 64 px buttons, Lightstick Green and Spray-Can Pink, black Anton text at 22 px.
- **Admin:** Oswald 13 px uppercase, Asphalt Surface fill with a 1 px Perforation border. The gold variant is for primary actions, and the danger variant is a pink outline.
- **Invitation:** Anton 20 px. Hover lifts 2 px, and press scales to 0.96.
- **Focus:** a 3 px Trophy Gold outline with a 2 px offset on everything. It turns black on gold, pink and green surfaces. **Disabled:** 40% opacity (45% in admin).

### Chips and Pills
- **Checked-in chip:** a Lightstick Green pill with Blacktop Oswald 600 text, a check icon and the time ("CHECK-IN 17:42").
- **Label pill:** Trophy Gold fill with black tracked Oswald ("PASS CHECK-IN"). The pink variant marks merchandise.
- **Station chip:** a gold 2 px outline pill with the station label in the staff header.
- **Admin badges:** 1 px outline pills in gold, pink or green, used for status in tables only.
- **LIVE badge (stage):** a green 2 px outline pill with a pulsing green dot.

### Cards / Containers
- **Ticket card:** the signature container. It has a Tarmac Card fill, a 5 px Trophy Gold border and an 18 px radius. The top block holds a muted "HI," label, the guest name (Anton 38 px uppercase) and a gold Oswald meta line (outlet · department · position). A dashed perforation runs edge to edge, and below it sit a label pill, the QR tile and a helper line.
- **Merchandise card:** Tarmac Card with a 3 px Spray-Can Pink border and a full-bleed pink "MERCHANDISE" banner (Anton 26 px) across the top. The content is stacked: QR, "1X PER PERSON" in pink, helper text, then a muted warning. Once claimed, the banner turns to Perforation grey.
- **Admin card and stat tile:** Tarmac Card, 1 px Seam border, 18 px radius, 16 px padding. Stat tiles add a 3 px gold top border, a 34 px Anton number and an Oswald label.
- **Winner card (MC):** Tarmac Card with a 3 px border (gold while drawn, green on confirmed, pink on void), a status tag pill, a 96 px Bungee number, a 40 px Anton name and a 60-second countdown in 52 px Bungee that turns pink when time runs low.

### Inputs / Fields
- **PIN field (station login):** 64 px tall, Tarmac Card fill, 2 px Perforation border, 12 px radius, 28 px digits tracked 0.4em and centred.
- **Text search (station):** 56 px tall, 18 px text, left aligned, same border.
- **Admin input / select / textarea:** Asphalt Surface fill, 1 px Perforation border, 8 px radius, 9 × 12 px padding.
- **Focus:** the global 3 px gold ring. **Errors** are pink text, plus a pink-bordered message box in admin.

### Navigation
- **Staff tab bar:** 64 px tall with a 2 px Seam top border and three tabs (SCAN, MANUAL SEARCH, live counter). Inactive tabs are Ash Oswald 600, 14 px, tracked 0.14em. The active tab turns Trophy Gold with a 3 px gold top border.
- **Admin nav:** a wrapping row of Oswald uppercase links in Smoke, with a Bungee wordmark on the left. The current page gets a solid Trophy Gold fill and Blacktop text.
- **Language toggle (ID / EN):** a two-segment pill with a 2 px gold border on Tarmac Card. The active segment is filled gold with black text. Segments are 48 px minimum (56 × 52 px in staff headers).

### Signature: QR Tile
The QR code always sits on a **solid QR White tile with black modules**, with a quiet zone of at least 4 modules, integer pixels per module (at least 5 px, 6 px by default), `shape-rendering: crispEdges`, error correction M and no centre logo. It sits inside an 8 px frame, gold for check-in and pink for merchandise, with an 18 px radius. On the pass it scales to the card width, up to 300 px. A "Turn up your screen brightness" hint and the Screen Wake Lock API keep it scannable at the door.

### Signature: Scan Result Panel (Ops)
A full-width panel fills everything below the camera area: green for success, pink for blocked or duplicate, gold for attention or retry, Tarmac Card for neutral. It holds a 52 px black icon circle (with the icon stroked in the panel colour), a 30 px Anton status title, a 40 px Anton uppercase guest name, a 16 px Oswald meta line, a black card with the 96 px gold Door Prize number, a small meta line, and a 64 px dark "SCAN NEXT" button pinned to the bottom. The colour wipes in over about 150 ms with vibration where supported. Nothing decorative sits behind it.

### Signature: Stage Board
The 1280 × 720 board has a Blacktop ground with gold, pink and green glows and an 18 px halftone grid. The header reads "NOURISHFEST 2026 · DOOR PRIZE" with the LIVE badge. A pink prize-banner sticker sits at −1.5°. The number lands at 300 px under a gold "WINNING NUMBER" label, then shrinks to 180 px when the name (Anton 100 px), outlet and department (Oswald 34 px, gold) slide in. The footer shows "MOVE IN UNITY." in pink Anton 28 px and the slot counter in Ash. Batch prizes use a grid of tiles with 4 px gold borders that flip to names (green border) or show a struck-through number (pink border, void). The idle screen adds the 120 px wordmark, a tilted pink tagline sticker and equalizer bars.

### Motion
- **Block Party motion:** the pass reveal (the number rises over 600 ms, and the merchandise card follows 200 ms later), the stage number roll (about 5 s, decelerating), the winner reveal (a short flash, the name sliding up over 300 ms), batch reveals 1.5–2 s apart, and looping equalizer bars. The invitation adds cassette, VHS-glitch, Polaroid toss-shake-develop and LCD-glow scenes, animating `transform` and `opacity` only. The glitch flashes at most 2 times per second and never as a full-screen white flash.
- **Ops motion:** result transitions only.
- **Reduced motion:** `prefers-reduced-motion` switches off every animation and transition. The stage also has a reduced-effects mode that cuts it to fades. The draw result is saved before any animation runs, so an animation can never change the outcome.

## Do's and Don'ts

### Do:
- **Do** use Blacktop (#0D0D0D) as the ground on every screen. There is no light theme.
- **Do** set black text on every Trophy Gold, Spray-Can Pink and Lightstick Green fill.
- **Do** put every QR code on a solid white tile with a 4-module quiet zone, inside an 8 px gold (check-in) or pink (merchandise) frame.
- **Do** show every state as colour, icon and words together (plus vibration on staff devices where supported).
- **Do** keep Ops screens flat and big: 56 px or larger touch targets, 64 px primary buttons, results readable from arm's length.
- **Do** keep offset shadows hard (0 blur, pink, 3 / 4 / 5 / 10 px by size), and reserve blurred light for glows.
- **Do** draw every 90s motif from scratch in CSS or inline SVG (cassette, boombox, vinyl, spray tag, halftone, equalizer).
- **Do** let names and Indonesian strings wrap. Test both languages on every screen and at 130% text size.
- **Do** keep the 3 px gold focus ring visible on every interactive element, turning black on coloured surfaces.

### Don't:
- **Don't** put white or off-white text on Spray-Can Pink.
- **Don't** put a QR code on black or colour, invert it, or place a logo in its centre.
- **Don't** put halftone, glows or graffiti behind a QR code, a scan result or running text.
- **Don't** animate staff screens beyond the result transition.
- **Don't** rely on colour alone for any state.
- **Don't** copy logos, album art, real cassette or boombox brands, or known characters.
- **Don't** set any text below 12 px, or fix text-box widths tightly.
- **Don't** add a light theme, a blurred drop shadow on cards, or a fifth brand colour.
- **Don't** use congratulations wording on any screen, including the stage reveal.

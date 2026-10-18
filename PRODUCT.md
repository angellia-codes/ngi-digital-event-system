# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

NourishFest 2026 is a single company event: Thursday 10 December 2026, gates open 17:00 WITA, about 215 Nourish Group (NGI) employees. Everything below serves that one night and the weeks leading up to it.

- **Guests (employees only).** About 215 people, mostly on mid-range Android phones and iPhone Safari, often on weak venue Wi-Fi. They never register, log in or fill in forms. Each one gets a personal link on WhatsApp. Before the event they open it to see the invitation and their check-in QR. On the night they show the QR at the door, then use the same page to see their Door Prize number and merchandise QR.
- **Station staff.** Check-in Officers, Merchandise Officers, the MC / Draw Operator and an optional Prize Verification Officer. Each signs in with a 4-digit role PIN on a phone or tablet. They work in a loud, dim, crowded venue with queues in front of them, and must read a scan result in under a second from arm's length.
- **Admins.** 2–3 named people (HR Manager, committee lead) who sign in with Google. They import the employee list, export WhatsApp invitation links by outlet, set up prizes, rotate PINs, handle walk-ins, voids and overrides (always with a recorded reason), and watch the live dashboard. At least one admin with a device is on site during the event.
- **The room.** Everyone watching the projector during the Door Prize draw. The stage display (`/stage`) runs on a laptop with no controls on screen.

## Product Purpose

The app runs the digital side of NourishFest 2026: personal invitation, QR check-in, automatic Door Prize number allocation, one-time merchandise redemption, the Door Prize draw with a live stage display, and reporting. It is a standalone web app, independent of NourishOS.

Success means:
- check-in under 30 seconds per guest under normal conditions;
- zero duplicate Door Prize numbers;
- zero duplicate successful merchandise redemptions;
- 100% of draws, redraws and voids recorded in history;
- event reports available by the next working day;
- attendance reported by outlet (for planning, no target).

## Positioning

- **Zero friction for guests.** No sign-up, no RSVP, no login. Attendance is mandatory, so one personal WhatsApp link is the whole guest product: invitation, pass, prize number and merchandise code.
- **The rules live in the database, not the browser.** Every critical action (check-in, number allocation, redemption, draw, void) is a single atomic, idempotent Postgres transaction. Repeat scans, double taps and two stations scanning at the same moment never create duplicates.
- **A draw the room can trust.** The draw runs server-side. The projector shows only the prize and the winning number. The winner's name reaches the stage, and the stage data, only after the MC checks the person in the app and taps Confirm. A screenshot of a number is never proof.

## Operating Context

- **Before the event.** HR imports the employee CSV (upsert by Employee ID, with a row-level error preview). Invitations go out on WhatsApp in staggered batches by outlet through HODs, sent semi-manually from an exported CSV. Admins track who has opened their link. The guest list freezes around 20 November, and invitations go out 23–27 November.
- **First open of the link.** An animated "mixtape" invitation plays as the opening layer of `/pass/[token]` on the first open per phone. Later opens go straight to the pass with a replay option. On and after event day, the link always opens on the pass.
- **At the door.** Staff scan the guest's QR (gold frame), with manual name or Employee ID search one tap away. Check-in assigns the next Door Prize number (`001`, `002`, …). Walk-ins are added by an admin on the spot. If the network fails, staff use the printed backup list and paper; an admin enters those arrivals later.
- **Merchandise booth.** Staff scan a separate merchandise QR (pink frame, "MERCHANDISE" label). The redemption is recorded only after a deliberate "Hand over" tap. The booth shows a running count.
- **Door Prize draw.** The MC draws from the operator screen and sees number, name and outlet at once. The winner has 60 seconds to come forward. The MC then taps Confirm (the name appears on stage) or No-show (the draw is voided, kept in history, and the person stays eligible for later prizes). Batch prizes show a grid of numbers that flip to names as each winner is confirmed. One prize per person.
- **Hardware and network.** Several scanning phones, an MC device, and a projector laptop on its own connection (hotspot or cable). The stage display is tested on the real projector at rehearsal.
- **Rehearsals.** Full dry runs with test data in rehearsal mode, then a reset and go-live. Code freeze is 8 December. Runbooks live in `docs/runbooks/`.

## Capabilities and Constraints

- **Modules in scope:** guest import and management, personal invitation and pass, QR check-in and walk-ins, Door Prize numbers, prize setup, draw, no-show and verification, merchandise redemption, stage display and MC operator screen, admin dashboard, CSV exports, audit log.
- **Out of scope:** Candid Camera and photo gallery (separate project), guestbook (cancelled), RSVP (removed), automated WhatsApp API sending, external guests, plus-ones, VIPs and vendors, guest self-registration, payments, ticketing, seating.
- **Stack:** Next.js on Vercel (region `sin1`), Supabase Postgres, Realtime and Auth. Business rules live in Postgres functions that only Next.js route handlers call. Browsers never touch tables directly. RLS is on every table, and `stage_state` is the only publicly readable one.
- **Roles:** Admin (Google sign-in plus an allowlist); Check-in, Merchandise, MC / Draw and Prize Verification (role PINs: 4 digits, hashed, rate-limited, rotatable, short-lived sessions). Permissions are enforced on the server, never by hiding a button alone.
- **Codes:** two separate 128-bit URL-safe tokens per guest. QR payload prefixes `NF:CI:` (check-in) and `NF:MR:` (merchandise) let each scanner reject the wrong type.
- **Scan result states:** `CHECKED_IN`, `ALREADY_CHECKED_IN`, `INVALID`, `WRONG_CODE_TYPE`, `NOT_ELIGIBLE`, `RETRYABLE_ERROR`. Merchandise statuses: `NOT_CHECKED_IN`, `AVAILABLE`, `REDEEMED`, `VOIDED`. Draw states: `drawn`, `confirmed`, `void_no_show`, `void_admin`.
- **Performance:** mobile first, designed at 360 px. The pass loads fast on weak Wi-Fi: minimal JavaScript, few font weights, no large images. The pass can be saved as an image and still works offline at scan time.
- **Language:** bilingual EN / ID. **English is the default**, with Indonesian one tap away on the pass and staff screens. Every string lives in one translation file. HR reviews the Indonesian wording before launch. (PRD v1.2 says Indonesian is the default; that is outdated.)
- **Time:** stored in UTC, displayed in Asia/Makassar (WITA).
- **Privacy:** public pages show only the guest's own name, outlet, department and position. Phone numbers and Employee IDs are never shown publicly.
- **Terminology:** Door Prize number, merchandise QR, "Hand over", Confirm, No-show, walk-in, outlet, HOD, station, stage display, projector-safe mode, rehearsal / live mode.
- **Open decisions (do not invent):** venue name, Maps link and run-of-show times; final prize list (names, tiers, quantities, batches, grand prize); WhatsApp sender and message text; guest data retention period (proposed 90 days); event URL / domain; scanning hardware count; whether alcohol is served; the invitation activities list.

## Brand Commitments

- **Name:** NourishFest 2026. **Theme:** HipHop. **Tagline:** "MOVE IN UNITY. Together, We Make a Difference". The pass header shows the company name.
- **Visual authority:** `docs/design-guide.md` (v1.3) holds the binding identity: the HipHop theme with Bungee / Anton / Oswald / Archivo and the four brand colours (PRD decision 13), dark only, and the two modes ("Block Party" for the pass and stage, "Ops" for staff and admin screens). The invitation layer follows `docs/2026-10-14-nourishfest-invitation-design.md`: old-school 80s/90s hip-hop inside the same brand, animated with CSS and SVG only.
- **Original imagery only.** Hip-hop motifs are drawn from scratch. No copied logos, album art or known characters. No NourishFest logo file exists yet, so a text wordmark is used.
- **Voice:** upbeat, short, street-smart, respectful. Headlines are punchy, and helper text is plain. Indonesian uses casual "aku/kamu" on guest screens and neutral wording on staff and admin screens. Avoid slang that excludes people, jokes about names or outlets, and anything that sounds like a loan or prize scam.
- **No congratulations wording anywhere,** including the winner reveal on stage.
- **Music:** a fixed NGI-owned track at `public/audio/nourishfest-theme.mp3`, still to be supplied along with the producer's written permission.

## Evidence on Hand

- Product docs: `docs/prd.md` (v1.2), `docs/spec.md`, `docs/design-guide.md` (v1.3), `docs/2026-10-14-nourishfest-invitation-design.md`, `docs/plans/`, `docs/runbooks/`.
- A "NourishFest 2026 Mockups" canvas is referenced by the Design Guide (six screens). It is not in the repo.
- **Absent, so never fabricate:** a logo file, the music file, venue and times, the final prize list, real employee data (use clearly fake test data only), testimonials, attendance figures.

## Product Principles

1. **Certainty beats speed, and speed beats flourish, wherever staff act.** A result must be unmistakable at arm's length in a dim, loud room. Celebration belongs on the guest pass and the stage, not behind a scan result.
2. **Nothing can happen twice.** Every critical action is safe to repeat. The interface never implies a second scan, tap or draw did something new when it didn't.
3. **The stage never knows more than the room should.** Names appear only after an in-person check, and the reveal flow protects that order.
4. **Guests do nothing but show up.** No accounts, no forms, no RSVP. One link carries the whole guest experience, and it still works as a screenshot.
5. **Every exception leaves a trail.** Overrides, voids and walk-ins are admin only, need a reason, and land in the audit log.

## Accessibility & Inclusion

- Text contrast of at least 4.5:1. White on pink is forbidden.
- Touch targets of at least 48 px, and 56 px or more on staff screens.
- Every state uses colour, an icon and words together, plus vibration where supported. Colour is never the only signal.
- Reduced motion is respected. Reduced-effects and projector-safe (high-contrast) modes exist for the stage display.
- Text scales to 130% without breaking guest or staff layouts. The `lang` attribute follows the selected language. QR images have descriptive alt text.
- Camera access gets a short explanation before the browser prompt, and a manual-search fallback if permission is denied.

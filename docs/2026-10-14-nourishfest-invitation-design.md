# NourishFest 2026 — Interactive Invitation: Design Spec

**Status:** Approved in brainstorming on 14 October 2026, awaiting written-spec review
**Owner:** HR (Angel)
**Builds on:** PRD v1.2, Design Guide v1.2, Technical Design Spec, Plan 1 and Plan 2, and the current `ngi-digital-event-system` repository (which already dropped RSVP in `20261115000009_drop_rsvp.sql`)
**Deadline:** live before the invitations go out (invitation gate, 23 Nov 2026; guest list freeze about 20 Nov)

---

## 1. Summary

An animated "mixtape" invitation that plays as the **opening layer of each employee's existing personal pass link** (`/pass/[token]`). There is no new link, no new route and no RSVP. The employee taps PRESS PLAY, watches a short old-school hip-hop opening with music, scrolls through the event details, and lands on the pass with their check-in QR.

### 1.1 Decisions

| # | Decision |
|:--|:--|
| 1 | The invitation is a client layer inside the existing pass page. Same WhatsApp link, same token |
| 2 | No RSVP anywhere (already removed from the app; attendance is mandatory) |
| 3 | Look: old-school 80s/90s hip-hop **inside the current HipHop brand**. Same colours, fonts and Design Guide rules. Retro comes from motifs and motion (cassette, boombox, VHS, CRT, Polaroid, LCD) |
| 4 | Content: date, gate-open time, programme start, end, venue, Google Maps link are **editable in admin Settings**. Activities, dress code and do's and don'ts are **fixed in the translation file**. Music is a **fixed file** |
| 5 | Plays on **first open per phone**; later opens go straight to the pass with a replay button; **on and after event day it always opens on the pass** |
| 6 | Music is an **NGI-owned track**, added later at `public/audio/nourishfest-theme.mp3` |
| 7 | Animation is **CSS + SVG in code**. No Lottie, no video |
| 8 | **Gates open 17:00 WITA.** The countdown and calendar entry use the gate-open time |

### 1.2 Out of scope

RSVP, a separate invitation URL, per-outlet content variants, admin-editable long-form copy, analytics beyond the existing `first_opened_at`.

---

## 2. Scene flow

Theme: a personal mixtape. Only scene 1 plays by itself; everything after it scrolls at the guest's pace.

| # | Scene | Content | Motion |
|:--|:--|:--|:--|
| 0 | Gate | Cassette labelled `MIXTAPE UNTUK {name}`, PRESS PLAY button, sound hint | Slow idle float |
| 1 | Opening (≈8 s, auto) | Tape slides into a boombox, reels spin, equalizer bounces, VHS tracking glitch, wordmark slams in with hard pink shadow and the "MOVE IN UNITY." sticker | The only auto-played sequence |
| 2 | You're invited | "Yo, {firstname}!", Polaroid with name and outlet | Polaroid develops grey → colour |
| 3 | About | 2–3 lines and the tagline | Type-on |
| 4 | Save the date | December 2026 calendar, 10th circled; LCD countdown DD:HH:MM; Google Calendar and iPhone (.ics) buttons | Circle draws on, digits tick |
| 5 | Time | `GATE DIBUKA 17:00 WITA`; optional `Acara mulai {start}` | Flip-clock digits |
| 6 | Location | Venue name, pin card, Google Maps button | Pin drops |
| 7 | Activities | Cassette J-card tracklist | Lines slide in |
| 8 | Dress code | 4 outfit cards + a "skip" card | Cards fan out |
| 9 | Do's & Don'ts | Two columns; every item has icon + words | Fade up |
| 10 | Outro | "Sampai ketemu 10 Desember!" + LIHAT PASS-KU | Tape ejects, music fades out, pass appears |

**Persistent controls after the gate:** mute (only when the song loaded), ID/EN toggle, Lewati (skip to pass).

Scenes 2–10 animate once when scrolled into view (IntersectionObserver), not on a timer.

---

## 3. Play logic

Decided when the pass page opens.

```
decideStart({ checkedIn, todayWita, eventDate, seen, storageOk }) →
  'pass'        if checkedIn
  'pass'        if todayWita >= eventDate          (event-day bypass)
  'pass'        if storageOk && seen
  'invitation'  otherwise                          (blocked storage → plays; Skip always available)
```

- `todayWita` comes from the **server** (`server_now` in the pass payload converted to `Asia/Makassar`), never the phone clock.
- The seen flag is `localStorage['nf_invite_seen_' + token.slice(0, 8)] = '1'`, written when the guest **reaches the outro, taps LIHAT PASS-KU or taps Lewati**. Closing the tab mid-way means it plays again next time.
- To avoid a flash of the pass before the invitation, the page renders a plain black screen for the first client frame while the decision is made.
- The pass always shows a **Putar undangan** (replay) button, including on event day. Replay ignores the seen flag and does not change it.

---

## 4. Data and admin

### 4.1 Migration `2026111500001X_invitation_event_details.sql`
(Use the next free number after the latest migration in the repo at build time.)

```sql
alter table public.events
  add column doors_at timestamptz,
  add column ends_at  timestamptz,
  add column maps_url text;
```

- `create or replace function public.get_pass` from the current (RSVP-free) version, with `event` extended to
  `{ name, date, doors_at, starts_at, ends_at, venue, maps_url }` and a top-level `server_now` (`now()`).
- New `public.set_event_details(p_event uuid, p_details jsonb, p_actor text) → jsonb`:
  - Keys: `event_date`, `doors_at`, `starts_at`, `ends_at`, `venue`, `maps_url`. A key present with `null` clears it; an absent key is unchanged.
  - Returns `OK`, `INVALID_MAPS_URL`, `INVALID_TIMES` (`starts_at < doors_at` or `ends_at <= doors_at`), `NOT_FOUND`.
  - `maps_url` is accepted only for hosts `www.google.com/maps`, `google.com/maps`, `maps.google.com`, `maps.app.goo.gl`, `goo.gl/maps`, scheme `https`.
  - Audited as `event_details_updated` with the list of changed keys only.
- Ends with `select public.lock_down_public();`.

### 4.2 Routes
- `GET /api/admin/settings` additionally returns the event details.
- `POST /api/admin/settings/event {event_date?, doors_at?, starts_at?, ends_at?, venue?, maps_url?}`. Times are entered as `HH:mm` in WITA; the route combines them with `event_date` and `+08:00`. zod: venue ≤ 120 chars, maps_url ≤ 500 chars.
- `GET /api/pass/[token]` needs no change beyond the wider payload.

### 4.3 Admin UI
A new **Event details** panel at the top of Settings: date, gate opens (default 17:00), programme starts, ends, venue, Google Maps link, and a "Preview invitation" link that opens a pass in replay mode. English-only, flat Ops style, same as the rest of admin.

### 4.4 What depends on what

| Visible element | Shows when | Otherwise |
|:--|:--|:--|
| Countdown, calendar buttons | `event_date` and `doors_at` set | "Segera diumumkan", buttons hidden |
| Time scene | `doors_at` set | "Segera diumumkan" |
| "Acara mulai" line | `starts_at` set | Line hidden |
| Location scene | `venue` set | "Segera diumumkan" |
| Maps button | `maps_url` set | Button hidden |
| Calendar end time | `ends_at` set | 23:00 WITA on the event date |

Before go-live, HR sets: date, gate time, venue and Maps link. Starts/ends are optional.

---

## 5. Calendar, countdown, music

### 5.1 Save the date
- **Google Calendar:** `https://calendar.google.com/calendar/render?action=TEMPLATE&text=…&dates=<UTC start>/<UTC end>&location=…&details=…` opened in a new tab.
- **iPhone:** a `.ics` file (`VCALENDAR` / `VEVENT`, UTC times, `UID` stable per guest, `SUMMARY` "NourishFest 2026") built in the browser and downloaded as `nourishfest-2026.ics`.
- Both carry: title, venue, start = `doors_at`, end = `ends_at` or 23:00 WITA, and a description with the gate time, the dress code name and the guest's **own pass link** so they can reach their QR from the calendar on the day.
- Accepted trade-off: the pass link is stored in the guest's own calendar. It is their link and the token gives access only to their own pass.
- Inside in-app browsers that block downloads, show the hint "Buka di Safari/Chrome untuk menyimpan" under the .ics button.

### 5.2 Countdown
- Target `doors_at`. Display DD:HH:MM, updated every 30 s while visible.
- Offset = `server_now − Date.now()` captured at load, applied to every tick.
- At or after `doors_at`, or on the event date in WITA: "HARI INI!".

### 5.3 Music
- Source: `/audio/nourishfest-theme.mp3`, `preload="none"`, `loop`.
- Requested on the PRESS PLAY tap (the tap is the user gesture that unlocks audio). The opening starts immediately; music fades in over 600 ms when `canplay` fires.
- Mute button appears only after `canplay`. On `error` (file missing), no mute button and the invitation continues silently.
- Pauses on `visibilitychange` → hidden, resumes on visible if not muted.
- Fades out over 800 ms on the outro, Lewati or LIHAT PASS-KU, then stops and releases.
- Delivery spec for the producer: MP3, 60–90 s, clean loop point, ≤ 1 MB (96–128 kbps). Keep written permission for use on the invitation on file.

---

## 6. Components and files

```
src/lib/invite/
  play.ts          decideStart(), seen-flag read/write with try/catch
  time.ts          witaDate(), countdownParts(target, now)
  calendar.ts      googleCalendarUrl(input), buildIcs(input)
  maps.ts          isMapsUrl(url)   (shared rule with the SQL check)
src/components/invite/
  Invitation.tsx   scene controller; loaded with next/dynamic only when decideStart → 'invitation' or on replay
  useMusic.ts      audio element lifecycle, fade, mute, visibility handling
  Controls.tsx     mute, language toggle, Lewati
  scenes/          Gate, Opening, Invited, About, SaveDate, Time, Location, Activities, DressCode, DosDonts, Outro
  art/             Cassette, Boombox, Equalizer, Polaroid, CalendarCard, LcdDigits, MapPin, JCard (inline SVG)
src/components/pass/PassView.tsx    add the gate (black frame → invitation or pass) and the replay button
src/lib/i18n/strings.ts             invite.* keys (ID and EN), section 8
src/styles/invite.css               scene styles and keyframes
src/components/admin/EventDetails.tsx, src/app/api/admin/settings/event/route.ts
supabase/migrations/…_invitation_event_details.sql, supabase/tests/database/…_invitation.test.sql
public/audio/                        nourishfest-theme.mp3 (added later)
```

Each scene is a pure component taking `{ data, t, active }`. The controller owns music, scroll and the seen flag; scenes never touch them.

---

## 7. Visual and motion rules

- Brand tokens only: `--nf-black`, `--nf-gold`, `--nf-pink`, `--nf-green` and neutrals. Bungee for display and digits, Anton for headings and names, Oswald for labels, Archivo for body. Black text on gold, pink and green; never white on pink.
- All art is original inline SVG. No copied logos, album art, characters or real brand cassettes/boomboxes.
- Animate `transform` and `opacity` only. Pause CSS animations of scenes outside the viewport.
- VHS glitch: at most 2 flashes per second and never a full-screen white flash (photosensitivity limit is 3/s).
- `prefers-reduced-motion: reduce`: the gate still shows, but PRESS PLAY skips scene 1 and goes straight to scene 2 with static art, no glitch, no type-on; countdown still updates.
- Long names: cassette label truncates with "…" at 22 characters; Polaroid wraps the full name.
- Minimum width 360 px, 20 px gutter, touch targets ≥ 48 px, captions ≥ 12 px.

---

## 8. Content (draft for HR edit; fixed in `strings.ts`)

`{…}` values are filled from the pass data or admin. ⚠ marks items still open.

### 8.1 Scenes

| Key | ID (default) | EN |
|:--|:--|:--|
| invite.gate_label | MIXTAPE UNTUK {name} | MIXTAPE FOR {name} |
| invite.press_play | PRESS PLAY | PRESS PLAY |
| invite.sound_hint | Nyalakan suaramu 🔊 | Turn your sound on 🔊 |
| invite.yo | Yo, {firstname}! Kamu resmi diundang ke… | Yo, {firstname}! You're officially invited to… |
| invite.about | Satu malam buat kita semua. Dari semua outlet, satu panggung, satu irama: rayain kerja keras setahun bareng keluarga Nourish. | One night for all of us. Every outlet, one stage, one beat: celebrating a year of hard work with the Nourish family. |
| invite.save_date | SAVE THE DATE | SAVE THE DATE |
| invite.cd_days / hrs / mins | HARI · JAM · MENIT | DAYS · HRS · MINS |
| invite.today | HARI INI! 🎉 | IT'S TODAY! 🎉 |
| invite.add_google | Simpan ke Google Calendar | Add to Google Calendar |
| invite.add_ics | Simpan ke iPhone | Add to iPhone |
| invite.ics_hint | Buka di Safari/Chrome untuk menyimpan | Open in Safari/Chrome to save |
| invite.doors | GATE DIBUKA {doors} WITA | GATES OPEN {doors} WITA |
| invite.starts | Acara mulai {start} | Programme starts {start} |
| invite.early | Datang lebih awal biar check-in nggak antre. | Come early to skip the check-in queue. |
| invite.maps | Buka di Google Maps | Open in Google Maps |
| invite.tba | Segera diumumkan | To be announced |
| invite.outro | Sampai ketemu 10 Desember! | See you on 10 December! |
| invite.view_pass | LIHAT PASS-KU | VIEW MY PASS |
| invite.skip | Lewati | Skip |
| invite.replay | Putar undangan | Replay invitation |
| invite.mute / unmute | Matikan musik / Nyalakan musik | Mute music / Play music |

### 8.2 Activities tracklist ⚠ (no times until the run-of-show is final)

| Track | ID | EN |
|:--|:--|:--|
| 01 | Check-in & ambil merchandise | Check-in & merchandise pick-up |
| 02 | Welcome drop: sambutan manajemen | Welcome drop: management address |
| 03 | Makan malam bareng | Dinner together |
| 04 ⚠ | Penampilan & hiburan | Performances & entertainment |
| 05 | Door Prize: siapin nomormu! | Door Prize: have your number ready! |
| 06 | Party all night with the DJ | Party all night with the DJ |

### 8.3 Dress code: Old-School Hip-Hop

| Card | ID | EN |
|:--|:--|:--|
| Baggy & Oversized | Kaos/jersey oversize, celana baggy, jaket denim | Oversized tee or jersey, baggy pants, denim jacket |
| Tracksuit Era | Setelan training, windbreaker warna terang | Tracksuit, bright windbreaker |
| Headgear | Bucket hat, snapback, bandana | Bucket hat, snapback, bandana |
| Bling It On | Rantai emas (palsu juga oke!), anting hoop, sneakers chunky | Gold chains (fake is fine!), hoop earrings, chunky sneakers |
| Skip | Seragam kerja & pakaian formal | Work uniform & formal wear |

### 8.4 Do's & Don'ts

| ✔ Do (ID / EN) | ✖ Don't (ID / EN) |
|:--|:--|
| Bawa HP yang baterainya penuh, pass-mu ada di sini / Bring a charged phone, your pass lives here | Jangan bagikan link atau QR-mu, itu khusus untukmu / Don't share your link or QR, it's yours only |
| Datang mulai {doors} / Arrive from {doors} | Jangan bawa tamu dari luar, acara khusus karyawan / No outside guests, employees only |
| Ikuti dress code / Follow the dress code | ⚠ Jangan menyetir setelah minum alkohol / Don't drive after drinking — *or, if no alcohol is served:* Atur transportasi pulangmu / Arrange your ride home |
| Minta izin sebelum posting foto teman / Ask before posting colleagues' photos | Jangan pakai kostum yang mengejek budaya atau agama / No costumes that mock a culture or religion |
| Saling jaga & ikuti arahan panitia / Look out for each other, follow the committee | Jangan tinggalkan barang berharga tanpa pengawasan / Don't leave valuables unattended |

All Indonesian copy goes through the existing ID wording review (PRD open decision 11).

---

## 9. Edge cases

| Situation | Behaviour |
|:--|:--|
| Song not added yet / fails to load | No mute button; invitation plays silently |
| iPhone silent switch on | iOS mutes web audio; the gate's sound hint covers it |
| App switched / screen locked | Music pauses and resumes from the same point |
| Long name | Cassette label truncated at 22 chars; Polaroid wraps |
| Wrong phone clock | Countdown and event-day bypass use `server_now` |
| Language switched mid-scene | Text swaps in place; no restart |
| Event details missing | "Segera diumumkan"; dependent buttons hidden (§4.4) |
| Guest already checked in | Straight to pass |
| Invalid or old link | Existing "Link tidak dikenal" screen; no invitation |
| Storage blocked | Invitation plays every time; Lewati always available |
| In-app browser blocks .ics | Hint under the button |
| Weak connection | Invitation code is lazy-loaded; music never blocks the animation |

---

## 10. Performance budget

- Invitation code + SVG art ≤ **60 KB gzipped**, in its own chunk loaded via `next/dynamic` only when the invitation plays. The pass bundle stays as it is, so event-day loads at the door are unaffected.
- Song ≈ 1 MB, fetched only after PRESS PLAY.
- No web fonts beyond the four already loaded. No images; all art is SVG.

---

## 11. Testing

| Level | Cases |
|:--|:--|
| Unit (Vitest) | `decideStart` truth table (checked in / event day / seen / storage blocked); `countdownParts` with server offset and at zero; `googleCalendarUrl` UTC formatting and encoding; `buildIcs` (CRLF line endings, UTC, UID, escaping of commas and semicolons); `isMapsUrl` accept and reject lists; ID/EN key and placeholder parity (existing strings test) |
| Database (pgTAP) | `get_pass` returns `doors_at`, `ends_at`, `maps_url`, `server_now`; `set_event_details` partial update, null clears, `INVALID_MAPS_URL`, `INVALID_TIMES`, audit row lists keys only; anon/authenticated cannot execute (lockdown test) |
| API | `POST /api/admin/settings/event`: 401 without admin, 403 cross-origin, WITA `HH:mm` → `+08:00` conversion, invalid Maps link |
| E2E (Playwright, 360 px) | First open: gate → PRESS PLAY → opening → scroll to outro → pass; reload goes straight to pass; Lewati sets the seen flag; replay works; event day (set `event_date` to today in rehearsal) goes straight to pass; `reducedMotion: 'reduce'` shows static scenes; missing song shows no mute button; missing venue shows "Segera diumumkan" |
| Real devices | Mid-range Android Chrome and iPhone Safari, each opened **from a WhatsApp message**, 360 px, throttled to slow 3G; check audio start, calendar save on both, Maps opens the app |

---

## 12. Open items

| # | Item | Owner | Needed by |
|:--|:--|:--|:--|
| 1 | Confirm activities (track 04 and anything missing) | HR | 14 Nov |
| 2 | Alcohol served? Decides the drinking line | HR | 14 Nov |
| 3 | Song file + written permission from the producer | HR | 20 Nov |
| 4 | Venue name and Google Maps link (PRD open decision 1) | HR | 24 Oct |
| 5 | ID wording review of §8 | HR | with PRD decision 11 |

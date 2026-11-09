# NourishFest 2026 — MC Cue Card Module (Design)

**Date:** 2026-11-09
**Status:** Approved in brainstorming, pending spec review
**Owner:** HR (Angel)
**Depends on:** existing NourishFest digital event system (Next.js + Supabase), draw module (`/station/draw`), guest list, check-ins
**Deadline:** must pass the full rehearsal before the 6 December code freeze

---

## 1. Goal

Give the MC one screen on their phone that holds everything needed to run the show:

1. Event rundown, run live with timing
2. BOD and HOD names, in protocol order, with live arrival status
3. Attendance by outlet and department, live
4. Door prize draw and winner confirmation, linked to the rundown

### Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Screen | One tabbed MC screen, `/station/mc`. Draw tab reuses the existing draw component. `/station/draw` stays as backup |
| Rundown | Live run-sheet: MC taps NEXT, planned vs actual timing, admin-editable, timestamped log |
| BOD / HOD | Flagged on existing guests (all BOD are in the employee guest list), with title, protocol order, phonetic note; live arrived / not yet from check-ins |
| Pax | Live attendance by outlet (checked in / invited / %), sorted, tap for departments, total on top |
| Draw | Existing draw + prize progress + per-prize MC script line. Door-prize rundown segments own a set of prizes and open the Draw tab |
| Access | New `mc` role PIN. Any number of devices share one live state; first tap wins. Rundown edits are admin-only |
| Sync | Polling (same pattern as the draw operator screen). No Realtime dependency on MC devices |
| Backup | Print-optimised admin page `/admin/cue-card`, saved as PDF via the browser |
| Language | UI follows the existing EN/ID toggle (ID default). Script text is free text in whatever language the MC will speak |
| Stage display | Not changed. No new stage states |

### Out of scope

- Pushing rundown or attendance content to the projector
- Read-only "show caller" PIN for backstage
- Rundown editing by the MC
- Non-employee VIPs (if one arrives, add them as a walk-in and flag them)
- Google Sheets as a rundown source

---

## 2. MC screen — `/station/mc`

Phone-first, ops styling (same as `/station/draw`).

**Header (every tab):** current segment title, elapsed / planned duration, segment drift ("+1 min"). Before the show: "BELUM MULAI". After the last segment: "ACARA SELESAI". Gold "OFFLINE — mencoba lagi" banner when polling fails; the timer keeps counting locally.

**Bottom tab bar:** Rundown · VIP · Pax · Draw.

### 2.1 Rundown tab

- Show-wide drift at top: "Show running +7 min" (drift of the current segment).
- Segment list:
  - Done: muted, shows actual start and end.
  - Current: gold highlight, script expanded.
  - Upcoming: collapsed; tap to preview the script.
  - Each row: planned start (WITA), title, duration, PIC.
- Big **NEXT** button. Before the first segment it reads **MULAI ACARA**.
- NEXT always moves exactly one segment forward. There is no skip and no back button on the MC screen. To jump, an admin sets the current segment (Section 4.3).
- When the current segment is a door-prize segment with undrawn prizes, NEXT asks: "N hadiah belum diundi — lanjut?" Undrawn prizes stay drawable later.
- When NEXT opens a door-prize segment, the device switches to the Draw tab. Other MC devices switch on their next poll that sees the segment change.

### 2.2 VIP tab

- Two groups: **BOD** first, then **HOD**, each sorted by `protocol_order` then name.
- Row: title + full name (large), phonetic note, position, outlet, status ✅ arrived / ⏳ not yet.
- "Present only" toggle, on by default.
- Inactive guests are hidden.

### 2.3 Pax tab

- Top: total checked in / invited / %.
- Outlet rows sorted by checked-in count (desc), then outlet name: `Outlet · 24/26 · 92%`.
- Tap an outlet to expand its departments with the same three figures.
- Invited = active guests, walk-ins included once added. Checked in = rows in `check_ins` for active guests.

### 2.4 Draw tab

- The existing draw component, behaviour unchanged: select prize, DRAW, 60-second countdown, KONFIRMASI / TIDAK HADIR, next prize.
- Above it:
  - The current door-prize segment's prize list: ✅ done (with winner name) / ▶ current / ⏳ upcoming.
  - The selected prize's MC script line (if set).
- When the current segment is not a door-prize segment, the tab shows all prizes and a notice "Bukan segmen undian". Drawing is still allowed.

---

## 3. Admin

### 3.1 Rundown editor (`/admin/rundown`)

- Add, edit, delete, reorder segments.
- Fields: title, planned start (WITA), duration (minutes), PIC, script, kind (`normal` / `door_prize`).
- For `door_prize` segments: pick prizes. A prize can belong to at most one segment.
- During the show: finished segments are read-only; current and upcoming segments are editable. Deleting the current segment is blocked.
- **Set current segment** control (admin only, reason required, audited) for correcting a mistaken NEXT or jumping.

### 3.2 Guests page (extended)

- Fields per guest: VIP tier (`BOD` / `HOD` / none), title (e.g. "Bapak", "Ibu"), protocol order (integer), phonetic note.
- Filter by VIP tier.

### 3.3 Prizes page (extended)

- Optional `mc_script` per prize (e.g. sponsor mention).

### 3.4 Cue card print page (`/admin/cue-card`)

- Print-optimised, A4 portrait, black on white.
- Sections: rundown (planned times, titles, PIC, full script, prizes per draw segment with their script lines), BOD/HOD list in protocol order with phonetic notes, invited pax by outlet and department.
- Printed with the browser (Print → Save as PDF). Live figures are not on paper.

### 3.5 Reports

- New CSV report `rundown`: segment, planned start, planned duration, actual start, actual end, actual duration, drift, started by.

---

## 4. Data model

All new tables have `event_id`. Timestamps are stored in UTC and shown in WITA.

### 4.1 New tables

| Table | Columns | Constraints |
|---|---|---|
| `rundown_segments` | `id`, `event_id`, `sort_order`, `title`, `planned_start` (timestamptz), `duration_min` (int > 0), `pic`, `script`, `kind` (`normal` / `door_prize`), `updated_at` | Unique `(event_id, sort_order)` |
| `segment_prizes` | `segment_id`, `prize_id` | Unique `prize_id`. Segment must be `kind = door_prize` (checked in the function that writes it) |
| `rundown_runs` | `id`, `event_id`, `segment_id`, `started_at`, `ended_at`, `started_by` | Partial unique index on `event_id` where `ended_at is null` (max one open run) |

### 4.2 Changed tables

| Table | Change |
|---|---|
| `guests` | Add `vip_tier` (`BOD` / `HOD` / null), `vip_title`, `protocol_order` (int, null), `phonetic` |
| `prizes` | Add `mc_script` |
| `station_pins` | Add role `mc` |

### 4.3 Functions (Postgres, called from route handlers)

- **`mc_next(p_event, p_from_segment, p_actor)`**
  - `p_from_segment` is the segment the device believes is current (null before the show).
  - If the actual current segment differs → return `ALREADY_ADVANCED` with current state. No change.
  - Otherwise, in one transaction: close the open run (`ended_at = now()`), open a run for the next segment by `sort_order`, write the audit log. On the last segment, close the run and open nothing.
  - Returns `OK` with the new state, or `SHOW_ENDED`.
- **`mc_set_current(p_event, p_segment, p_reason, p_actor)`** — admin only. Closes the open run, opens a run for `p_segment`, audits with reason.
- **`mc_pax(p_event)`** — rows of outlet, department, invited, checked_in for active guests.
- **`mc_vip(p_event)`** — active guests with `vip_tier` set, with checked-in flag, sorted by tier, protocol order, name.

Drift = `started_at` of the current run − `planned_start` of its segment, in whole minutes.

---

## 5. Routes

**Station** (role `mc` or admin)

| Route | Purpose | Polling |
|---|---|---|
| `GET /api/station/mc/state` | Segments, runs, current segment, drift, current segment's prizes | Every 2 s |
| `POST /api/station/mc/next` | Body `{ from_segment_id }` → `mc_next` | — |
| `GET /api/station/mc/vip` | `mc_vip` | Every 10 s |
| `GET /api/station/mc/pax` | `mc_pax` | Every 10 s |

Existing draw routes (`/api/station/prizes`, `/draw/current`, `/draw`, `/draw/stage`, `/draw/resolve`, `/prizes/lookup-number`) also accept role `mc`. The Draw tab keeps polling `/api/station/draw/current` every 2 s.

**Admin**

| Route | Purpose |
|---|---|
| `GET/POST /api/admin/rundown` | List and upsert segments (body with `id` updates), reorder, prize assignment |
| `POST /api/admin/rundown/[id]/delete` | Delete a segment (blocked for finished or current) |
| `POST /api/admin/rundown/set-current` | `mc_set_current`, reason required |
| `PATCH /api/admin/guests` | Extended with VIP fields |
| `GET/POST /api/admin/prizes` | Extended with `mc_script` |
| `GET /api/admin/reports/rundown` | CSV |

---

## 6. Failure handling and edge cases

| Case | Behaviour |
|---|---|
| Two MC devices tap NEXT at once | First wins; second gets `ALREADY_ADVANCED` and refreshes |
| NEXT retried after a network error | Same `from_segment_id` → safe; never double-advances |
| MC device offline | Last known state stays; offline banner; timer counts locally |
| Everything offline | MC uses the printed cue card; draw falls back to the existing paper procedure |
| Mistaken NEXT | Admin uses Set current segment (audited) |
| Rundown edited mid-show | Picked up by MC devices within 2 s; finished segments locked |
| Undrawn prizes when leaving a draw segment | Confirmation prompt; prizes stay drawable |
| VIP guest deactivated | Hidden from VIP tab |
| Rehearsal reset / Go-live | Clears `rundown_runs`; keeps segments, prize assignments, VIP fields and scripts |
| Stage display | Unaffected by this module |

---

## 7. Testing

- **SQL:** `mc_next` with two concurrent calls on the same `from_segment` (one `OK`, one `ALREADY_ADVANCED`); open-run unique index; last-segment behaviour; `mc_pax` with walk-ins and inactive guests; `mc_vip` ordering; `segment_prizes` uniqueness.
- **API:** role guards on every new route; `mc` accepted on draw routes; admin-only routes reject `mc`.
- **UI:** each tab on a real phone; Draw tab switch on entering a door-prize segment; offline banner.
- **Rehearsal:** two MC phones + admin laptop; full rundown with test data; at least one door-prize segment drawn end to end; one MC phone put in airplane mode mid-segment; print the cue card and check it on paper; reset to live.

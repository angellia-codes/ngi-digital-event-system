# NourishFest 2026 — Digital Event Experience

**Product Requirements Document (PRD)**
**Version:** 1.2
**Status:** Draft for approval
**Last updated:** 10 October 2026
**Event date:** Thursday, 10 December 2026
**Target attendance:** Approximately 215 guests (employees only)
**Product type:** Standalone web application (mobile-first)
**Companion documents:** *NourishFest 2026 — Design Guide* (visual identity, components, screen specs); *NourishFest 2026 — Technical Design Spec* (architecture, data model, functions, API, testing and rollout)

---

## 0. Changes from earlier versions

### v1.2 (aligned with the Technical Design Spec)

- **Stage reveal flow:** the projector shows only the prize name and the winning number until the MC confirms. Confirming reveals the winner's name, outlet, department and prize (no congratulations wording).
- **Pass and stage details (10 Oct):** no congratulations wording anywhere; the stage counter "UNDIAN 3 DARI 12" means slot 3 of the prize's 12 slots; the pass shows time and venue only once HR has entered them (open decision 1).
- **MC confirms:** the MC (draw role) confirms a winner or marks a no-show. The Prize Verification screen is a backup. The first action wins; repeats are harmless.
- **Data model:** `door_prize_numbers` merged into `check_ins`; new tables `import_batches`, `auth_attempts`, `stage_heartbeat`; new draw status `void_admin`; `events.mode` for rehearsal and live; `stage_state` gains `rev` and `options`.
- **Auth detail:** PINs are 4 digits and unique across roles; lockouts are per device.
- **Routes and decisions:** new stage API routes; decisions log and open decisions updated.

### v1.1 compared with v1.0

| Area | v1.0 | v1.1 |
| :---- | :---- | :---- |
| Backend / database | Google Apps Script + Google Sheets | **Supabase** (Postgres, Realtime, Auth). Atomic database functions replace `LockService` |
| Media storage | Google Drive | **Not needed.** Candid Camera is removed from this project |
| Modules | Invitation, RSVP, check-in, door prize, merchandise, guestbook, candid camera, reports | **Invitation, QR check-in, door prize, merchandise, admin dashboard + reports.** RSVP removed (attendance is mandatory). Guestbook cancelled. Candid Camera moved to a separate project |
| Guests | "Guests" (undefined) | **Employees only.** Admin bulk-imports the list. Nobody registers themselves |
| Invitations | Not specified | **WhatsApp**, semi-manual from an exported CSV |
| Merchandise code | 1D barcode (open decision) | **QR code**, visually distinct from the check-in QR |
| Door prize rule | Open decision | **One prize per person.** Winner must be present (60-second window) |
| Roles | 9 roles, Google sign-in | **2–3 admins with Google sign-in + 4 station roles with PINs** |
| Languages | English | **Bilingual EN / ID**, Indonesian default |
| Draw display | Not specified | **Separate operator and display screens** synced through Supabase Realtime |
| Branding | None | **HipHop theme** (see Design Guide) |
| Phases | Undated | **Dated plan** working back from 10 December |

---

## 1. Product Overview

NourishFest 2026 Digital Event Experience is a standalone web application that runs the digital side of the event: personal invitation, QR check-in, automatic Door Prize number allocation, one-time merchandise redemption, the Door Prize draw with a live stage display, and reporting.

The application is independent of NourishOS. It has its own frontend, database, deployment and admin interface.

**Guests never register, log in, or fill in forms.** Attendance is mandatory, so there is no RSVP. HR imports the employee list; each employee receives a personal link on WhatsApp.

### 1.1 Objectives

- Give every employee a personal digital invitation and QR pass with no sign-up.
- Check guests in quickly by QR scan, with manual lookup as fallback.
- Assign exactly one unique Door Prize number to each checked-in guest.
- Let each checked-in guest claim merchandise **once only**.
- Run a transparent, logged Door Prize draw with a live stage display.
- Give HR and the event committee a live dashboard and next-day reports.

### 1.2 Success Metrics

- Check-in under 30 seconds per guest under normal conditions.
- Zero duplicate Door Prize numbers.
- Zero duplicate successful merchandise redemptions.
- 100% of draws, redraws and voids recorded in history.
- Event reports available by the next working day.
- Attendance rate reported by outlet (no target set; for planning only).

### 1.3 Scope

**In scope**
- Employee list import and guest management
- Personal invitation / pass page
- QR check-in (scan and manual lookup) and walk-in handling
- Door Prize number allocation, prize setup, draw, no-show handling, prize verification
- Merchandise redemption (QR, once per guest)
- Stage display and MC operator screen
- Admin dashboard, reports, CSV exports, audit log
- Bilingual interface (EN / ID)

**Out of scope for this project**
- **Digital Candid Camera** and photo gallery (separate project)
- **Digital guestbook** and guestbook wall (cancelled)
- Automated WhatsApp API sending (semi-manual from CSV)
- External guests, plus-ones, vendors, VIP categories (data model supports a `category` column if this changes)
- Online registration by guests
- Payments, ticketing, seating

---

## 2. Technology Architecture

### 2.1 Technology Stack

| Layer | Technology | Responsibility |
| :---- | :---- | :---- |
| Frontend | Next.js (React) on Vercel | Guest pass page, station screens, stage display, admin dashboard |
| Backend API | Next.js server routes (route handlers) | Validate requests, check PIN / admin session, call database functions. Holds all secrets |
| Database | Supabase Postgres | All event data. Uniqueness and concurrency enforced by constraints and transactional functions |
| Business logic | Postgres functions (RPC) | `import_guests`, `check_in`, `redeem_merchandise`, `draw_prize`, `resolve_draw` and similar. Each runs as one atomic transaction |
| Realtime | Supabase Realtime | Stage display sync (operator → display) |
| Admin auth | Supabase Auth (Google sign-in) with an `admins` allowlist | 2–3 named administrators |
| Station auth | Role PINs, verified server-side, short-lived signed session | Check-in, Merchandise, MC / Draw, Prize Verification |
| QR generation | QR library, server or client side | Check-in QR and merchandise QR |
| QR scanning | Browser camera scanning library | Scan check-in QR, merchandise QR |
| Hosting | Vercel (frontend), Supabase (backend) | Use Supabase **Pro plan** for the event month (no project pausing, backups) |
| Exports | CSV download from `/admin/reports` | Replaces Google Sheets as a reporting surface |

### 2.2 Architecture Rules

- The application must not depend on NourishOS authentication, components, routes, APIs, database or deployment.
- Browsers never read or write database tables directly. All reads and writes go through server routes using the service key, which is never exposed to client code.
- Row Level Security is enabled on every table with no public policies, except the single `stage_state` table described in 2.5.
- Critical actions (check-in, number allocation, redemption, draw, void) are single database transactions, safe under simultaneous requests.
- Every critical action is idempotent: repeating it returns the original result and creates no duplicate record.
- Every table carries an `event_id`, so the same schema can run next year's event.
- Keep the frontend modular so the Candid Camera project can reuse guest tokens and the event record later.

### 2.3 System Flow

Guest or staff browser → Next.js on Vercel (UI + server routes) → Supabase Postgres (functions, constraints) → Supabase Realtime (stage display only)

### 2.4 Routes

| Route | Audience | Purpose |
| :---- | :---- | :---- |
| `/` | Public | Minimal event landing page (no personal data) |
| `/pass/[token]` | Guest (token link, no login) | Personal invitation, QR pass. After check-in shows Door Prize number and merchandise QR, with "Save as image" |
| `/station` | Staff | PIN entry. Redirects to the station for that PIN's role |
| `/station/check-in` | Check-in Officer | Camera scan, manual search, result screen |
| `/station/merchandise` | Merchandise Officer | Camera scan, result screen, "Hand over" confirmation, running count |
| `/station/draw` | MC / Draw Operator | Choose prize, draw, see the winner, **confirm** (reveals the name on the stage) or mark **no-show**, move to the next prize |
| `/station/prizes` | Prize Verification Officer | Backup for confirm / no-show, check hand-over, enter a number manually |
| `/stage` | Projector laptop | Read-only display. Shows the prize and winning number first, and the winner's name only after the MC confirms. Protected by a display key (exchanged for a cookie) |
| `/admin/login` | Admin | Google sign-in |
| `/admin/dashboard` | Admin | Live counters |
| `/admin/guests` | Admin | CSV import, guest list, walk-in add, invitation-link export, eligibility overrides |
| `/admin/prizes` | Admin | Prize list setup (name, tier, order, quantity) |
| `/admin/draws` | Admin | Draw history, redraws, voids |
| `/admin/merchandise` | Admin | Redemption list, void a redemption |
| `/admin/reports` | Admin | CSV exports |
| `/admin/settings` | Admin | Station PINs, stage display key, event details, language strings, projector-safe mode |
| `/admin/audit` | Admin | Audit log |

Routes are proposed and may be grouped differently during implementation. Admins can use every station screen.

### 2.5 Stage Display Sync

- The MC operator screen calls the server to draw. The server writes the result to the database **first**.
- The server then updates a single `stage_state` row for the event with the prize name and the winning number only.
- When the MC confirms the draw, the same transaction adds the winner's name and outlet to that row. **The row never holds a winner's name before the confirmation.**
- `/stage` subscribes to that row through Supabase Realtime (with a 3-second polling fallback) and animates the change.
- `stage_state` is the only table with a public read policy. It holds only what is already shown on the projector.
- If the display link drops, the draw result is unaffected. The operator screen always shows the result too, so the MC can read it out. On reconnect the display shows the latest `stage_state`.

---

## 3. User Roles and Permissions

| Role | Sign-in | Permissions |
| :---- | :---- | :---- |
| Admin (2–3 people: HR Manager, committee lead) | Google sign-in, email allowlist | Everything: import guests, set prizes, manage PINs, overrides with reason, voids, reports, audit log, all station screens |
| Check-in Officer | Role PIN | Scan check-in QR, manual search, check in, see check-in status. No edits, no overrides |
| Merchandise Officer | Role PIN | Scan merchandise QR, confirm hand-over, see status |
| MC / Draw Operator | Role PIN | Choose prize, run draws, see results, confirm a winner (reveals the name on the stage), mark no-show |
| Prize Verification Officer | Role PIN | Backup for confirm / no-show, check hand-over, enter a number manually |
| Guest | None (personal link) | See own pass, see own Door Prize number and merchandise QR after check-in |

Rules:
- Permissions are enforced on the server. Hiding a button is never the only control.
- PIN sessions are short-lived and tied to one role. The audit log records the **role** (and station label if set) for PIN users and the **person** for admins.
- Eligibility overrides, voids and walk-in creation are **admin only** and require a recorded reason. At least one admin with a device must be on site during the event.
- PIN entry is rate-limited. Admins can rotate any PIN at any time.

---

## 4. Core Modules

### 4.1 Event Setup

- Configure event name, date, venue, start time, branding, and guest-facing copy (EN / ID).
- Configure station PINs and the stage display key.
- Configure the prize list (4.5).
- Manage the admin allowlist.
- Maintain a "projector-safe" display mode (high-contrast variant of the stage display).

### 4.2 Guest Management and Invitation

**Import**
- Admin uploads a CSV: `Employee_ID`, `Full_Name`, `Outlet`, `Department`, `Position`, `Phone`, optional `Category` (default `employee`).
- Import validates every row and shows a preview with errors before saving. Invalid rows are listed, not silently skipped.
- Import is an **upsert by `Employee_ID`**: re-importing updates changed details and adds new employees without creating duplicates. Employees missing from a later file are flagged, not deleted.
- Each guest gets two unguessable tokens (at least 128 bits, URL-safe): an **invitation token** (check-in QR and personal link) and a separate **merchandise token**.

**Invitation delivery (WhatsApp)**
- Admin exports a CSV of `Full_Name`, `Phone`, `Personal_Link`, with an optional "filter by outlet" so each HOD can send to their own team.
- Sending is semi-manual (WhatsApp broadcast or message template by HR or HODs). Automated API sending is out of scope.
- Admin can see which guests have opened their link (first-opened timestamp) to chase non-openers.
- A **printed backup list** (name, outlet, Employee ID) is prepared for the check-in desk.

**Walk-ins**
- If someone arrives with no pass and is not on the list, an admin can add them on the spot ("Add walk-in"). They then follow the normal check-in flow. The reason is recorded in the audit log.

**Privacy**
- Public pages show only the guest's own name, outlet, department and position. Phone numbers and Employee IDs are never shown on a public page.

### 4.3 RSVP (removed)

- Attendance is mandatory for every employee, so there is no RSVP. The pass page shows only the check-in QR.

### 4.4 QR Check-In

**Workflow**
1. Guest shows the personal pass (QR with gold frame). Staff scan it, or search by name / Employee ID.
2. The server validates the code type and token.
3. If the guest is already checked in, return the original check-in details and Door Prize number. No new records.
4. Otherwise, in one transaction: record the check-in and allocate the next Door Prize number.
5. Show the result screen: guest name, outlet, department and Door Prize number.
6. Write the audit log entry (station role or admin, time, method: scan or manual).

**Scan result states**

| State | Meaning | Colour |
| :---- | :---- | :---- |
| `CHECKED_IN` | New check-in recorded, number assigned | Green |
| `ALREADY_CHECKED_IN` | Shows original time, station and number | Pink |
| `INVALID` | QR not recognised | Pink |
| `WRONG_CODE_TYPE` | A merchandise QR was scanned at check-in | Gold |
| `NOT_ELIGIBLE` | Guest deactivated or blocked | Pink |
| `RETRYABLE_ERROR` | Network or server issue, safe to scan again | Gold |

**Requirements**
- Camera scanning and manual lookup. Manual lookup is one tap away.
- Repeat scans and double-taps never create duplicate records or numbers.
- Scan-result screens show colour, icon and words together, with vibration where the device supports it.
- Offline / outage procedure: staff fall back to the printed list and record arrivals on paper. Admin enters them later with an "arrival time" note. This procedure is documented and rehearsed.

### 4.5 Door Prize Numbers, Prizes and Drawing

**Number allocation**
- One unique number per checked-in guest, sequential and displayed as `001`, `002`, `003`.
- Numbers are allocated at check-in from a counter in the same transaction. A database uniqueness constraint backs this up.
- Repeat scans return the original number. Numbers are never recycled automatically.

**Prize setup (admin, before the event)**
- Each prize has: name, tier (for example grand / major / consolation), draw order, quantity.
- A prize with quantity above 1 can be drawn as a **batch** (for example "10 × consolation voucher"). Winners are revealed one by one on stage.
- Prize list can be edited until its first draw.

**Drawing rules**
- The draw runs on the server in SQL, not in the browser. The pool is: checked-in guests with a number who have **no active or confirmed win**.
- **One prize per person.** A winner is excluded from all later draws. A database constraint enforces this.
- Each draw records: time, prize, sequence number, winner, operator role.
- Redraws never overwrite earlier rows. Full history is preserved.

**Winner verification and no-shows**
1. MC draws. The **operator screen** shows the number, name and outlet at once. The **stage display** shows only the prize name and the winning number.
2. The winner comes forward. The MC checks the person against the name and outlet and taps **Confirm**. The stage then shows the winner's name, outlet, department and prize. A screenshot of a number is **not** proof; the check is done in the app.
3. If the winner does not come forward within **60 seconds** of the number landing, the MC taps **No-show**. That draw is marked `void_no_show` and stays in the history. The stage shows a short "not here, redraw" message.
4. The MC redraws for the same prize. The no-show is **not** counted as a winner and stays eligible for later prizes.
5. The Prize Verification screen is a backup: it can also confirm or mark a no-show (the first action wins; repeats are harmless) and can look up a number manually.
6. A confirmed draw can be reversed only by an admin, with a reason (status `void_admin`). The guest returns to the pool.

**Draw states:** `drawn` (waiting for the winner) → `confirmed` (name revealed) or `void_no_show`; `void_admin` for an admin correction.

**Batch prizes:** the stage shows a grid of winning numbers. Each tile flips to a name when that winner is confirmed.

### 4.6 Merchandise Redemption

**Objective:** each checked-in guest claims their merchandise **once only**.

**Guest journey**
1. The guest checks in. The pass page now shows a **Merchandise QR** (pink frame, "MERCHANDISE" label) below the Door Prize number.
2. At the booth, the Merchandise Officer scans it.
3. The server verifies: valid merchandise token, guest checked in, not already redeemed.
4. The screen shows the guest's name and outlet with a deliberate **"Hand over"** confirmation button. Only after that tap is the redemption recorded.
5. Repeat scans show `ALREADY_REDEEMED` with the original time and station.

**Rules**
- The merchandise QR is a **separate code with a separate token**, a different colour frame and a large "MERCHANDISE" label. It carries a different payload prefix than the check-in QR, so each scanner rejects the wrong type with a clear message.
- Only checked-in guests can redeem. Everyone who checks in is eligible for one item; no categories in this version.
- Exactly one successful redemption per guest, enforced by a partial unique index on active redemptions. Two booth stations scanning at the same instant cannot both succeed.
- Failed attempts are logged (including `NOT_CHECKED_IN`, `ALREADY_REDEEMED`, `INVALID`).
- Manual lookup is available. Overrides and voids are admin-only with a recorded reason. A voided redemption can be redeemed again.
- The booth screen shows a running count of items claimed.

**Statuses:** `NOT_CHECKED_IN`, `AVAILABLE`, `REDEEMED`, `VOIDED`.

### 4.7 Stage Display and MC Operator

- **Operator screen** (phone or tablet, `/station/draw`): select prize, **DRAW** button, current result (number, name, outlet), 60-second countdown, **CONFIRM** and **NO-SHOW** buttons, next-prize shortcut, and a stage-link indicator. Plain ops styling.
- **Stage display** (laptop on projector, `/stage`): the number roll lands on the winning number and shows it with the prize name. After the MC confirms, it shows the winner's name, outlet, department and prize. Batch draws show a grid of tiles that flip to names as winners are confirmed. No controls on screen.
- Reduced-effects mode and projector-safe mode are available from settings.
- The stage display is tested on the real projector at rehearsal.

### 4.8 Admin Dashboard and Reports

**Live counters:** invited, link opened, checked in and attendance rate (overall and by outlet), Door Prize numbers issued, merchandise claimed vs checked-in (outstanding), prizes drawn / confirmed / void by prize, last 20 audit events, error count.

**Exports (CSV):** guests with check-in status, check-ins, merchandise redemptions, draw history, audit log, invitation links.

Dashboard figures refresh automatically (every few seconds). Reports are available the next working day. Reports are visible to admins only.

---

## 5. Data Model (Supabase Postgres)

All tables have `event_id`. Timestamps are UTC, displayed in Asia/Makassar (WITA).

| Table | Purpose | Key fields and constraints |
| :---- | :---- | :---- |
| `events` | Event record and config | `id`, `name`, `event_date`, `venue`, `start_time`, `next_prize_number`, `display_key_hash`, `mode` (`rehearsal` / `live`), `config` (jsonb) |
| `admins` | Admin allowlist | `event_id`, `email`, `name` |
| `station_pins` | Role PINs | `event_id`, `role`, `pin_hash`, `active`, `session_version`. PINs are 4 digits, stored hashed, unique across roles |
| `guests` | Master guest list | `id`, `employee_id`, `full_name`, `outlet`, `department`, `position`, `phone`, `category`, `invite_token`, `merch_token`, `first_opened_at`, `is_walk_in`, `active`. Unique `(event_id, employee_id)`, unique tokens |
| `check_ins` | One row per checked-in guest, including the Door Prize number | `guest_id` unique, `checked_in_at`, `method` (scan / manual), `station_label`, `actor`, `prize_number` (not null). Unique `(event_id, prize_number)` |
| `merchandise_redemptions` | Claims | `guest_id`, `status` (redeemed / voided), `redeemed_at`, `station`, `actor`, `void_reason`. **Partial unique index on `guest_id` where `status = 'redeemed'`** |
| `prizes` | Prize list | `name`, `tier`, `sort_order`, `quantity`, `status` |
| `draws` | Every draw and redraw | `prize_id`, `slot`, `sequence` (identity), `winner_guest_id`, `status` (drawn / confirmed / void_no_show / void_admin), `request_id` (unique), `drawn_at`, `resolved_at`, `resolved_by`, `redraw_of`. **Partial unique index on `winner_guest_id` where `status in ('drawn','confirmed')`** (one prize per person) and on `(prize_id, slot)` for active draws |
| `stage_state` | Current stage display payload | One row per event: `rev`, `phase`, `payload`, `options`. Prize and number only until the MC confirms; the name is added in the confirming transaction. Public read, server write only |
| `stage_heartbeat` | Display liveness | `event_id`, `seen_at`. Not published to Realtime |
| `import_batches` | CSV imports | `filename`, `uploaded_by`, `inserted`, `updated`, `flagged_missing` |
| `auth_attempts` | PIN and token lockouts | `scope`, `key`, `at`, `success` |
| `attempt_log` | Failed and rejected scans | `type`, `token_prefix`, `result`, `at`, `actor` |
| `audit_log` | Admin and station actions | `at`, `actor_type`, `actor`, `action`, `entity`, `entity_id`, `details` (jsonb) |

**Functions (all transactional and idempotent):** `verify_pin`, `get_pass`, `find_guests`, `import_preview`, `import_guests`, `check_in`, `redeem_lookup`, `redeem_merchandise`, `draw_prize`, `resolve_draw`, `set_stage`, `add_walk_in`, `void_redemption`, `admin_void_draw`, `set_station_pin`, `go_live`, `reset_rehearsal_data`. See the Technical Design Spec for behaviour and status values.

**Tokens:** 128-bit random, URL-safe. QR payloads carry a short prefix (`NF:CI:` for check-in, `NF:MR:` for merchandise) so scanners can reject the wrong type.

---

## 6. Security, Privacy, and Non-Functional Requirements

### Security
- Server-side authorization on every route and function. Service key only on the server.
- Unguessable tokens; token lookups rate-limited.
- PIN entry rate-limited and hashed in storage; admins can rotate PINs.
- Stage display protected by a display key. `stage_state` exposes only what is on screen.
- Row Level Security on all tables.
- No stack traces or internals in responses.
- Audit log for check-ins, redemptions, draws, voids, overrides, imports, PIN changes.

### Privacy and Retention
- Collect only what is needed: name, Employee ID, outlet, department, position, phone.
- Phone numbers are used only to send invitations and never shown on public pages.
- Notify employees how their data is used for the event.
- Retention period for guest data after the event: **open decision** (proposed 90 days, then anonymise or delete). Confirm with HR and legal.

### Performance and Availability
- Designed for about 215 guests with bursts at doors-open and at the merchandise booth.
- Mobile first, designed at 360 px width, tested on mid-range Android and iPhone Safari.
- Pass page loads quickly on weak Wi-Fi: minimal JavaScript, few font weights, no large images.
- The QR pass can be screenshotted or saved as an image and still works offline at scan time.
- Clear retry guidance on network errors; scans are safe to repeat.
- Event-day backup: export CSVs of guests, check-ins and redemptions the evening before, and keep the printed list.

### Localisation
- Every user-facing string lives in one translation file with EN and ID values. Indonesian is the default; an EN / ID toggle is on the pass page and staff screens. Indonesian wording is reviewed by HR before launch.

### Accessibility
- Text contrast of at least 4.5:1, touch targets of at least 48 px (56 px and above on staff screens), results shown with colour + icon + words, reduced-motion respected. Details in the Design Guide.

---

## 7. Event-Day Operations

### 7.1 Check-In
- Prepare the number of scanning phones agreed in open decision 8, each tested in venue lighting.
- Guests are told to open their link beforehand, screenshot the pass, and raise screen brightness.
- Train staff on manual lookup, the printed list, and escalation to an admin for walk-ins.

### 7.2 Merchandise Booth
- At least one scanning device, ideally two. Test simultaneous scans across stations.
- Train staff: **hand over only after the green success screen and the Hand over tap.**

### 7.3 Door Prize Draw
- MC operator device (with the confirm and no-show buttons and a visible 60-second timer), projector laptop, and an optional Prize Verification Officer as backup. Give the projector laptop its own connection (hotspot or cable).
- Run a full dry run with test data in the rehearsal, then reset the data.

### 7.4 Admin Desk
- At least one admin on site with a device for overrides, walk-ins, voids and the live dashboard.

---

## 8. Acceptance Criteria

**Import and invitation**
- Admin can import the employee CSV with row-level error reporting; re-import updates without duplicates.
- Each guest has a working personal link and QR. Invitation-link CSV export works by outlet.
- Pass page works without login and shows only that guest's data.

**Check-in and Door Prize numbers**
- Staff can check in by scan or manual search. Result states are clear and distinct.
- Each checked-in guest receives one unique number. Repeat scans return the original number.
- Simultaneous check-ins never produce duplicate numbers (tested).

**Merchandise**
- Only checked-in guests can redeem. One successful redemption per guest.
- Simultaneous scans at two stations produce one success and one `ALREADY_REDEEMED` (tested).
- Check-in QR scanned at the booth, and merchandise QR scanned at check-in, are rejected with a clear message.

**Draw**
- The draw is server-side. Winners are never repeated across prizes. Batch draws work.
- No-show handling voids the draw, keeps full history, and the no-show stays eligible.
- Stage display updates from the operator action and recovers after a reconnect.
- The stage shows only the prize and the winning number until the MC confirms. The winner's name is **not present** in the stage data or the stage page before the confirmation.
- The MC can confirm or mark a no-show; a repeated or conflicting action from the Prize Verification screen causes no duplicate or inconsistent record.

**Admin and reporting**
- Dashboard shows live counters. All listed CSV exports work.
- Overrides, voids and walk-ins require admin and a reason, and appear in the audit log.

**Security and quality**
- Role permissions enforced on the server. Public responses expose no unnecessary personal data.
- Core flows pass mobile, permission, concurrency and failure-recovery tests.
- Both languages complete, with Indonesian reviewed.

---

## 9. Implementation Plan (proposed dates, to be confirmed)

Today is 10 October 2026 and the event is on 10 December 2026 (61 days).

| Phase | Scope | Target |
| :---- | :---- | :---- |
| 1. Foundation | Next.js project, Supabase project, schema, RLS, admin Google sign-in, station PIN sessions, audit log, design tokens and i18n file | 24 Oct |
| 2. Guest journey | CSV import, tokens, pass page, invitation-link export, check-in station, number allocation, walk-ins | 14 Nov |
| 3. Merchandise | Merchandise QR, booth station, "Hand over" confirmation, void | 21 Nov |
| **Invitations out** | Send WhatsApp invitations (staggered by outlet) once phase 2 has passed load and permission tests | 23–27 Nov |
| 4. Door prize | Prize setup, draw, verification and no-show flow, MC operator screen, stage display | 28 Nov |
| 5. Reporting and polish | Dashboard, exports, translations review, projector-safe mode, accessibility pass | 3 Dec |
| 6. Testing and rehearsal | Concurrency tests, device tests, full dry run on real projector and venue Wi-Fi, backup and recovery drill | 1–8 Dec |
| Code freeze | No feature changes after this | 8 Dec |
| Event | NourishFest 2026 | 10 Dec |

If the schedule slips, drop in this order: stage display animation polish, projector-safe mode. Do not cut the audit log, concurrency tests, or the rehearsal.

---

## 10. Risks and Mitigations

| Risk | Mitigation |
| :---- | :---- |
| Duplicate numbers or redemptions under simultaneous scans | Database constraints and transactional functions; concurrency tests before invitations go out |
| Venue Wi-Fi is weak or drops | QR pass saved as an image; scan screens are retry-safe; printed backup list; manual lookup; test on venue Wi-Fi at rehearsal |
| Staff scan the wrong QR | Different frame colours, large "MERCHANDISE" label, payload prefixes, scanners reject the wrong type |
| Screenshot of a number is shared or forged | The MC verifies the winner in the app before confirming; a screenshot is never proof |
| Winner not present | 60-second rule, no-show void, redraw, full history |
| Stage display link drops | Result written to the database first; operator screen shows the result; display recovers on reconnect |
| Station PIN leaks | PINs are role-limited, rate-limited, rotatable; admin-only sensitive actions |
| Wrong or outdated employee data | Import preview with errors; list freeze date; walk-in add; re-import upsert |
| WhatsApp bulk sending is slow or flagged | Send in staggered batches by outlet through HODs, not one bulk blast from a single number |
| Projector washes out neon colours | Rehearse on the real projector; projector-safe mode ready |
| Supabase project paused or limits hit | Pro plan for the event month; evening-before CSV backup |
| Time pressure (61 days) | Reduced scope (no guestbook / camera); dated phases; cut list in section 9 |

---

## 11. Decisions Log

Resolved on 10 October 2026:

| # | Decision |
| :---- | :---- |
| 1 | Scope is invitation, check-in, door prize, merchandise, dashboard. Guestbook cancelled. Candid Camera is a separate project |
| 2 | Backend is Supabase (Postgres, Realtime, Auth) with Next.js on Vercel. No Apps Script, Sheets or Drive |
| 3 | Guests are employees only. Admin bulk-imports; nobody registers |
| 4 | Invitations go out on WhatsApp, semi-manual from an exported CSV |
| 5 | The pass page needs no login; it shows the QR, then the Door Prize number and merchandise QR after check-in |
| 6 | No RSVP: attendance is mandatory for every employee |
| 7 | Merchandise code is a QR, visually and technically separate from the check-in QR; one claim per person; requires check-in |
| 8 | Door prize: one prize per person; winner must be present; 60-second window; no-show voids the draw and stays eligible |
| 9 | Auth: Google sign-in for 2–3 admins; role PINs for station staff |
| 10 | Draw display uses separate operator and display screens synced by Supabase Realtime |
| 11 | Prizes are set up in advance with tier and order; small prizes can be drawn as batches |
| 12 | Interface is bilingual EN / ID with a toggle, Indonesian default |
| 13 | Brand is HipHop theme with Bungee / Anton / Oswald / Archivo and the four brand colours (Design Guide) |
| 14 | Business rules live in Postgres functions called only from Next.js route handlers (Technical Design Spec) |
| 15 | The projector shows the prize and number first; the name, outlet and department appear after the MC confirms. The MC confirms and marks no-shows; Prize Verification is the backup |

---

## 12. Open Decisions

| # | Question | Needed by |
| :---- | :---- | :---- |
| 1 | Venue, start time and run-of-show (printed on the pass and stage display) | 24 Oct |
| 2 | Google email addresses for the 2–3 admins | 17 Oct |
| 3 | Prize list: names, tiers, quantities, which are drawn as batches, the grand prize | 28 Nov |
| 4 | Who sends the WhatsApp invitations, from which number, and the message text (EN / ID) | 14 Nov |
| 5 | Retention period for guest data after the event (proposed 90 days) | 3 Dec |
| 6 | Any external guests (owners, VIPs, vendors) attending? Assumed none | 24 Oct |
| 7 | Employee data source, HR sign-off on the list, and list-freeze date (proposed 20 Nov) | 14 Nov |
| 8 | Hardware: number of scanning phones, MC device, projector laptop, backups | 28 Nov |
| 9 | Event URL / domain | 14 Nov |
| 10 | Supabase Pro budget approval for the event month | 17 Oct |
| 11 | Review of the Indonesian wording | 3 Dec |
| 12 | Logo files, if a NourishFest logo exists (otherwise a text wordmark is used) | 24 Oct |
| 13 | A named technical contact reachable on event day (10 Dec) | 28 Nov |
| 14 | Supabase organisation and the billing owner for the new Pro project | 17 Oct |

---

## 13. Definition of Done

The application is ready for NourishFest 2026 when:

- It is deployed, accessible on the event URL, and independent of NourishOS.
- Admin can import the employee list and export WhatsApp invitation links by outlet.
- Guests can open their personal link and show a QR pass that checks them in.
- Each checked-in guest receives one unique Door Prize number and one merchandise QR.
- Merchandise can be redeemed once only, including under simultaneous scans.
- Prizes can be set up, drawn on the server with one prize per person, verified, voided for no-shows and redrawn, with full history.
- The stage display and MC operator screens work together and recover from a dropped connection.
- Role permissions, audit log, dashboard and CSV exports work.
- Both languages are complete and the Indonesian wording is reviewed.
- Concurrency, permission, mobile and failure-recovery tests have passed.
- The full dry run on the real projector and venue Wi-Fi has been completed, the evening-before backup procedure is written, and the fallback procedures are rehearsed.

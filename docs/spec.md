# NourishFest 2026 — Technical Design Spec

**Date:** 10 October 2026
**Status:** Draft for review
**Event:** Thursday, 10 December 2026, about 215 guests (employees only)
**Related documents:** *Digital Event Experience PRD* (v1.2) — what and why. *Design Guide* (v1.2) — how it looks. This spec — how it is built.

---

## 1. Summary of decisions

| Topic | Decision |
| :---- | :---- |
| Stack | Next.js on Vercel. Supabase (Postgres, Realtime, Auth) in a **new dedicated project**, Pro plan, Singapore region |
| Where the rules live | **Postgres functions** called only from Next.js route handlers with the service key (approach A). Constraints and transactions enforce the rules, not application code |
| Auth | Guests: token link. Station staff: 6-digit role PIN, signed session cookie. Admins (2–3): Supabase Auth with Google, `admins` allowlist. Stage: display key then cookie |
| Draw stage flow | Projector shows **prize and number only** until the MC confirms. Confirming reveals the winner's name, outlet and department (no congratulations wording, by HR's decision on 10 Oct) |
| Who confirms a draw | The **MC** (draw role). The Prize Verification screen is a backup. First action wins; repeats are harmless |
| Single event per deployment | `EVENT_ID` environment variable. The schema carries `event_id` everywhere so it can be reused |

---

## 2. Architecture and trust boundaries

```
Guest browser ──(token in URL)──┐
Station browser ─(PIN session)──┼─► Next.js route handlers (/api/*) ──(service key)──► Supabase Postgres
Admin browser ──(Google login)──┘        │                                              (functions, constraints, RLS)
                                         │
Stage display ──(display key cookie)─────┴──(anon key, read one table)──► Supabase Realtime (stage_state)
```

**Rules**
- Browsers never access tables. Every read and write goes through a route handler.
- The service key exists only in Vercel's server environment. The anon key reaches the browser on the stage page only.
- Row Level Security is on for every table. The only policy is `SELECT` on `stage_state`.
- All database functions are `SECURITY DEFINER` with a fixed `search_path`. `EXECUTE` is revoked from `anon` and `authenticated` and granted to `service_role` only.
- Authorization is checked in the route handlers. The handler passes the actor (role or admin email) to the function for the audit log.

**Proof of identity**

| Client | Proof | Check |
| :---- | :---- | :---- |
| Guest | 128-bit token in the URL path | Looked up server-side. The guest sees only their own row. Invalid lookups are rate-limited (20 per minute per IP). Valid lookups are not counted |
| Station staff | Signed cookie `nf_station` (HS256: role, station label, `session_version`; httpOnly, Secure, 14 hours) | Verified on every request, plus a database check of `session_version`. Rotating or disabling a PIN logs that role out immediately |
| Admin | Supabase Auth (Google) | `getUser()` server-side, then email must be in `admins` |
| Stage | `/stage?key=…` compared with a hash, then httpOnly cookie `nf_stage` and redirect without the key | Cookie checked by `/api/stage/*` |

**Environment variables:** `SUPABASE_URL`, `SUPABASE_ANON_KEY` (public), `SUPABASE_SERVICE_ROLE_KEY` (server only), `STATION_SESSION_SECRET`, `EVENT_ID`.

---

## 3. Data model

### 3.1 Tables

| Table | Key columns | Notes |
| :---- | :---- | :---- |
| `events` | `id`, `name`, `event_date`, `starts_at`, `venue`, `next_prize_number`, `display_key_hash`, `mode` (`rehearsal` / `live`), `config` | One row per event |
| `admins` | `event_id`, `email` | Primary key `(event_id, email)` |
| `station_pins` | `event_id`, `role`, `pin_hash`, `active`, `session_version` | Roles: `checkin`, `merchandise`, `draw`, `prizes`. bcrypt via pgcrypto. PINs unique across roles, 6 digits |
| `auth_attempts` | `scope`, `key`, `at`, `success` | PIN and token lockouts |
| `import_batches` | `id`, `filename`, `uploaded_by`, `inserted`, `updated`, `flagged_missing` | One per CSV import |
| `guests` | `employee_id`, `full_name`, `outlet`, `department`, `position`, `phone`, `category`, `invite_token`, `merch_token`, `rsvp_status`, `rsvp_at`, `first_opened_at`, `is_walk_in`, `active`, `last_import_id` | Unique `(event_id, employee_id)`. Walk-ins without an ID get `WALKIN-n` |
| `check_ins` | `guest_id` (unique), `checked_in_at`, `method`, `station_label`, `actor`, `prize_number` (NOT NULL) | The Door Prize number lives here. Unique `(event_id, prize_number)` |
| `merchandise_redemptions` | `guest_id`, `status` (`redeemed` / `voided`), `redeemed_at`, `station_label`, `actor`, `void_reason` | Foreign key `guest_id` → `check_ins.guest_id` |
| `prizes` | `name`, `tier`, `sort_order`, `quantity`, `draw_as_batch` | Remaining slots are calculated from `draws` |
| `draws` | `prize_id`, `slot`, `sequence` (identity), `winner_guest_id`, `status`, `request_id` (unique), `redraw_of`, `drawn_at`, `resolved_at`, `resolved_by` | `status`: `drawn`, `confirmed`, `void_no_show`, `void_admin` |
| `stage_state` | `event_id`, `rev`, `phase`, `payload`, `options`, `updated_at` | One row. Public read, server write only. Realtime enabled |
| `stage_heartbeat` | `event_id`, `seen_at` | Display liveness. Not published to Realtime |
| `attempt_log` | `kind`, `token_prefix` (first 6 characters), `result`, `actor`, `at` | Rejected scans |
| `audit_log` | `at`, `actor_type`, `actor`, `action`, `entity`, `entity_id`, `details` | Append-only |

Every table carries `event_id`. Timestamps are `timestamptz`, displayed in WITA. No indexes beyond the constraints (about 215 rows).

### 3.2 Rules and the mechanism that enforces each

| Rule | Mechanism |
| :---- | :---- |
| One check-in per guest | Unique `check_ins.guest_id` |
| Unique, gap-free Door Prize numbers | Counter on the `events` row, incremented in the same transaction as the check-in insert. A failed check-in rolls the counter back |
| No number without a check-in | The number is a `NOT NULL` column of `check_ins` |
| Merchandise needs a check-in | Foreign key from `merchandise_redemptions.guest_id` to `check_ins.guest_id` |
| One active redemption per guest | Partial unique index on `guest_id` where `status = 'redeemed'` |
| One prize per person | Partial unique index on `draws.winner_guest_id` where `status in ('drawn','confirmed')` |
| A no-show returns to the pool | `void_no_show` rows fall outside that index |
| A prize cannot be over-drawn | Slot from 1 to `quantity`; partial unique index on `(prize_id, slot)` for active draws; the prize row is locked during a draw |
| Double-tap on DRAW gives one draw | Unique `draws.request_id` |
| Re-import never duplicates | Unique `(event_id, employee_id)` |
| Tokens unguessable and distinct | 128 random bits, URL-safe, unique indexes on both tokens |
| Audit log cannot be edited | Trigger rejects `UPDATE`. `DELETE` is rejected unless the event is in rehearsal mode |

### 3.3 Random selection

The draw pool is checked-in, active guests with no `drawn` or `confirmed` win. The pick is `ORDER BY gen_random_uuid()`.

### 3.4 Rehearsal and go-live

`events.mode` starts as `rehearsal`. `reset_rehearsal_data` clears check-ins, redemptions, draws, `attempt_log`, rehearsal audit rows, resets the counters and sets the stage to idle. It **keeps** guests, RSVPs, tokens, prizes, settings and PINs, because invitations go out before the rehearsal. It runs only in rehearsal mode. `go_live` is one-way.

---

## 4. Database functions

### 4.1 Common rules

- One transaction each: the action, its audit entry and its counters commit together.
- Business outcomes are return values (`{status, …}`). Exceptions are for real failures only, and the app then shows "retry". Retrying is always safe.
- Lock order: guest advisory lock, then `events` row, then prize row, then draw row.

### 4.2 Function list

| Function | Called by | Result `status` |
| :---- | :---- | :---- |
| `verify_pin(event, pin, device_key)` | Station login | `OK` (returns role), `INVALID`, `LOCKED` |
| `get_pass(token)` | Pass page | `OK`, `INVALID`. Sets `first_opened_at`. **Returns the merchandise token only after check-in** |
| `set_rsvp(token, status)` | Pass page | `OK`, `INVALID` |
| `find_guests(event, q)` | Manual search | `OK` (max 20 rows, no phone) |
| `check_in(event, token or guest_id, method, station_label, actor)` | Check-in station | `CHECKED_IN`, `ALREADY_CHECKED_IN`, `INVALID`, `NOT_ELIGIBLE` |
| `redeem_lookup(token or guest_id)` | Merchandise scan | `READY`, `ALREADY_REDEEMED`, `NOT_CHECKED_IN`, `NOT_ELIGIBLE`, `INVALID` |
| `redeem_merchandise(token or guest_id, station_label, actor)` | "Hand over" tap | `REDEEMED`, plus the blocked states above |
| `draw_prize(event, prize_id, request_id, role)` | MC | `DRAWN`, `DRAW_IN_PROGRESS`, `PRIZE_COMPLETE`, `NO_ELIGIBLE_GUESTS` |
| `resolve_draw(draw_id, outcome, role, actor)` | MC (draw) or Prize Verification | `CONFIRMED`, `VOIDED`, `ALREADY_CONFIRMED`, `DRAW_VOID` |
| `set_stage(event, phase, payload)` | MC | `OK` |
| `import_preview(rows)`, `import_guests(rows, filename, actor)` | Admin | `OK`, `HAS_ERRORS` |
| `add_walk_in`, `void_redemption`, `admin_void_draw`, `set_station_pin` | Admin | `OK` (a reason is required where records change) |
| `go_live`, `reset_rehearsal_data` | Admin | `OK`, `NOT_REHEARSAL` |

The route handler reads the `NF:CI:` / `NF:MR:` prefix and answers `WRONG_CODE_TYPE` before calling the database.

### 4.3 `check_in`

1. Find the guest by token or ID. No match: write `attempt_log`, return `INVALID`.
2. Take a per-guest advisory lock.
3. Already checked in: return the original time, station and number. Write nothing else.
4. Otherwise increment the counter on the `events` row, insert `check_ins` with that number, write the audit entry, return `CHECKED_IN`.

### 4.4 `redeem_lookup` and `redeem_merchandise`

`redeem_lookup` writes nothing except `attempt_log` for rejections. `redeem_merchandise` re-checks everything under the guest lock, then inserts the redemption. **Double-tap guard:** if the same station already recorded this guest within 10 seconds, return `REDEEMED` instead of `ALREADY_REDEEMED`.

### 4.5 `draw_prize`

1. If `request_id` already exists, return that draw.
2. Lock the prize row. If any **other** prize has an unresolved winner, return `DRAW_IN_PROGRESS`.
3. Draw one winner, or all remaining slots if `draw_as_batch`. A redraw takes the lowest free slot and sets `redraw_of`.
4. Pool as in 3.3. If the pool is smaller than the batch, draw everyone available and return `short_by`.
5. Write `stage_state` with the prize and the **numbers only**. Never the name or outlet.
6. Return the winners (number, name, outlet) to the **operator**.

### 4.6 `resolve_draw`

- **confirm:** `drawn` → `confirmed`, and in the same transaction set that slot in `stage_state` to `revealed` with `name`, `outlet` and `department`. A repeat returns the same result.
- **no_show:** `drawn` → `void_no_show`, and set the slot to `void` in `stage_state`. The guest is back in the pool.
- A `confirmed` draw can be reversed only by an admin through `admin_void_draw` (status `void_admin`, reason required). If that draw is currently on the projector, the stage returns to idle.

### 4.7 Import

The route handler parses the CSV, trims text and normalises phones to `+62…`. `import_guests` checks required fields and duplicate IDs in the file and upserts. The import is all or nothing. Existing tokens never change. Guests missing from a later file are listed, never deleted or deactivated automatically.

---

## 5. API and sessions

### 5.1 Conventions

- Business outcomes return HTTP 200: `{ ok, status, data }`. Other codes: 400 invalid input (Zod schemas shared by client and server), 401 no or expired session, 403 wrong role, 429 rate limit, 500 `{ ok:false, status:"RETRYABLE_ERROR" }`.
- `Cache-Control: no-store`, `noindex` and `Referrer-Policy: no-referrer` (the token is in the URL).
- SameSite=Lax cookies; mutating routes are JSON `POST` with an Origin check.
- Logs never contain full tokens or PINs.

### 5.2 PIN login

- Lockout per **device**: 5 failures in 5 minutes locks that device (random device ID cookie). A looser per-IP cap of 30 failures in 5 minutes stops cookie clearing. All staff share the venue IP, so a strict per-IP lockout would lock everyone out.
- The PIN alone identifies the role. After login the user picks a station label from a list in admin settings.

### 5.3 Routes

**Guest:** `GET /api/pass/[token]`, `POST /api/pass/[token]/rsvp`.

**Stage:** `GET /api/stage/state`, `POST /api/stage/heartbeat` (cookie `nf_stage`).

**Station** (the listed role or admin):

| Route | Roles |
| :---- | :---- |
| `POST /api/station/login`, `/logout` | none |
| `POST /api/station/check-in` | checkin |
| `GET /api/station/guests?q=` | checkin, merchandise |
| `POST /api/station/merchandise/lookup`, `/redeem`; `GET …/count` | merchandise |
| `GET /api/station/prizes`; `GET …/draw/current` | draw, prizes |
| `POST /api/station/draw`; `POST …/stage` | draw |
| `POST /api/station/draw/resolve` | draw, prizes |
| `POST /api/station/prizes/lookup-number` | draw, prizes |

**Admin:** `POST /api/admin/import/preview` and `/commit`; `GET/PATCH /api/admin/guests`, `POST …/walk-in`; `GET /api/admin/invitations.csv?outlet=`; `GET/POST/PATCH /api/admin/prizes`; `GET /api/admin/draws`, `POST …/[id]/void`; `GET /api/admin/redemptions`, `POST …/[id]/void`; `GET /api/admin/dashboard` (polled every 5 seconds); `GET /api/admin/reports/[name].csv`; `POST /api/admin/settings/pin`, `/stage-key`, `/station-labels`, `/stage-options`; `POST /api/admin/go-live` and `/reset` (typed confirmation `GO LIVE` / `RESET`); `GET /api/admin/audit`.

### 5.4 Client behaviour

- Scanner screens ignore the same code for 2 seconds.
- Network errors show the gold retry panel. Retries reuse the same `request_id` on draws; everything else is idempotent by nature.
- No offline queue. The fallback is the printed list and the admin desk.

---

## 6. Stage display sync

### 6.1 Flow

```
MC phone ──POST──► Next.js ──► Postgres function ──► business data + stage_state (same transaction)
                                                            │ Realtime
                                                            ▼
                                                      /stage (projector)
```

### 6.2 `stage_state`

| Column | Purpose |
| :---- | :---- |
| `rev` | +1 on every write. The display ignores lower values |
| `phase` | Coarse hint: `idle`, `intro`, `rolling` (any slot unresolved), `revealed` (all slots resolved), `void` (a single slot awaiting redraw) |
| `payload` | Prize and `slots: [{slot, number, state, name?, outlet?, department?}]` where `state` is `rolling`, `revealed` or `void`. Slot `state` decides what is drawn |
| `options` | `safe_mode`, `reduce_effects`, `language` (default `id`) |

**Before the MC confirms, the payload contains no name, outlet or department.** The name appears only in the transaction that confirms the draw.

### 6.3 What the projector shows

| View | Shown | Trigger |
| :---- | :---- | :---- |
| Intro | Prize name and tier | MC selects the prize |
| Rolling | Prize name and the number roll (about 5 seconds, cosmetic) | MC taps DRAW |
| Landed | Prize name and the winning number | The roll ends (a display-local view, not stored) |
| Revealed | Name, outlet, department, prize (no congratulations wording) | MC taps CONFIRM |
| Void | "TIDAK HADIR, UNDI ULANG" | MC taps NO-SHOW |

Batch prizes show a grid of tiles. Each tile flips to a name when its draw is confirmed. A no-show tile becomes "undi ulang" and re-rolls. The name stays on screen until the MC picks the next prize or taps "Layar kosong".

### 6.4 Display behaviour

- On load: fetch `/api/stage/state`, then subscribe to Realtime changes on the one row.
- Fallback: poll every 3 seconds if the channel is not connected for 5 seconds; refetch when the tab becomes visible.
- The display only animates to the number in the payload. If it loads mid-roll it goes straight to the landed view.
- Heartbeat every 5 seconds; the operator shows a green dot if the last heartbeat is under 15 seconds old.
- One-time "Aktifkan suara" button because browsers block audio without a click. Fullscreen, hidden cursor, screen wake lock.
- The operator screen does not depend on Realtime. It polls `/api/station/draw/current` every 2 seconds and uses its own action responses.

### 6.5 Failures

| Failure | Result |
| :---- | :---- |
| Display drops or reloads | Refetch of the latest row, current phase shown. The database is unaffected |
| Projector link down for the whole draw | MC reads number and name from the operator screen |
| Double-tap DRAW | Same `request_id` returns the same draw |
| Two displays open | Both work (read-only) |
| Admin voids the confirmed draw on screen | Stage returns to idle |
| Realtime slow | The 3-second polling takes over |

Recommendation: give the projector laptop its own connection (phone hotspot or cable) separate from guest Wi-Fi.

---

## 7. Testing

| Layer | Method |
| :---- | :---- |
| Database | SQL tests (pgTAP) on a local Supabase stack: every status of every function, every constraint |
| Concurrency | Parallel scripts against real Postgres |
| API | Vitest against the local stack: role matrix, PIN lockout, wrong code type, CSRF, token rate limit, response contract |
| Security | Anon-key access refused on all tables except `stage_state` read; `rpc` refused for `anon` / `authenticated`; Supabase security advisor clean; Playwright asserts no winner name in the stage DOM or network payload before confirm |
| UI end to end | Playwright at 360 px: pass page, scanner (code injected instead of camera), operator + stage in two contexts, ID and EN screenshots checked for overflow |
| Devices | Manual QR scan from phone screens: at least 3 Android and 1 iPhone, low brightness |
| Load | 215 pass pages inside one minute; 20 simultaneous scans; `check_in` p95 under 1.5 seconds |
| Import | Bad CSVs, duplicate IDs, re-import, phone normalisation, very long names |

**Concurrency tests (must pass before invitations go out)**
- 50 parallel check-ins for one guest: exactly 1 `CHECKED_IN`.
- 215 parallel check-ins for different guests: numbers 1–215, unique, no gaps.
- Two stations redeeming one guest: 1 `REDEEMED`, 1 `ALREADY_REDEEMED`.
- DRAW double-tap with one `request_id`: one draw.
- Two simultaneous draws with different IDs: 1 `DRAWN`, 1 `DRAW_IN_PROGRESS`.
- Draw the entire pool: nobody wins twice; a no-show returns to the pool; a batch larger than the pool returns `short_by`.

---

## 8. Environments, gates and rollout

| Environment | Setup |
| :---- | :---- |
| Local | Supabase CLI stack |
| Staging | Second Supabase project and Vercel preview, seeded with 215 fake employees |
| Production | The Pro project and Vercel production |

All schema changes are numbered SQL migration files applied by the CLI. Nothing is edited by hand in the dashboard. After the 8 December freeze only critical fixes go out, each run on staging first.

| Gate | Date | Must be true |
| :---- | :---- | :---- |
| Invitation gate | before 23 Nov | Check-in, RSVP and merchandise tests pass, including concurrency. Security advisor clean. Pass page device-tested. HR has verified the import. List frozen (20 Nov proposed) |
| Rehearsal 1 | 1–3 Dec | Staff on real devices with test data |
| Rehearsal 2 | about 7 Dec | At the venue: real projector and Wi-Fi, full draw. Then `reset_rehearsal_data` |
| Freeze | 8 Dec | No feature changes |
| Day before | 9 Dec | Rotate all PINs, export CSV backups of all tables, print the guest list, charge devices |
| Event morning | 10 Dec | Final checks, then `go_live` as the last step before doors open |

### Failure playbook

| Failure | Response |
| :---- | :---- |
| Supabase or Vercel down | Paper guest list; admin enters arrivals afterwards with the arrival time noted |
| Camera will not scan | Manual search on the check-in screen |
| Projector fails | MC reads numbers and names from the operator screen |
| Device locked out | Admin resets from settings |
| Merchandise handed over by mistake, or a winner confirmed by mistake | Admin voids with a reason |

After the event: reports on the next working day, then the retention schedule.

---

## 9. Changes from PRD v1.1 (applied in PRD v1.2)

1. `door_prize_numbers` is merged into `check_ins.prize_number`.
2. New tables `import_batches`, `auth_attempts`, `stage_heartbeat`.
3. New columns: `events.mode`, `station_pins.session_version`, `draws.slot`, `draws.request_id`, `stage_state.rev`, `stage_state.options`. New draw status `void_admin`. Foreign key from redemptions to check-ins.
4. The MC confirms a draw and marks no-show; the stage reveals the name only after confirmation. Prize Verification is a backup.
5. New functions: `verify_pin`, `get_pass`, `find_guests`, `redeem_lookup`, `set_stage`, `admin_void_draw`, `go_live`, `reset_rehearsal_data`.
6. New routes: `/api/stage/state`, `/api/stage/heartbeat`, `/api/admin/settings/stage-options`.

---

## 10. Open items

| # | Item |
| :---- | :---- |
| 1 | **Named technical contact** reachable on 10 December (needed by 28 Nov) |
| 2 | Open decisions 1–12 in the PRD (venue, admin emails, prize list, WhatsApp sender, retention period, and so on) |
| 3 | Supabase organisation and billing owner for the new Pro project |
| 4 | Indonesian wording review, including the new stage strings |

Out of scope: Digital Candid Camera (separate project), guestbook (cancelled), automated WhatsApp sending, external guests and plus-ones.

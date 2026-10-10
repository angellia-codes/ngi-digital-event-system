# NourishFest 2026 — Plan 2: Door-Prize Draw, Stage Display, Full Dashboard and Rollout

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver everything after the invitation gate: the door-prize draw with the MC confirm / no-show flow, the projector stage display, the prize list and draw history, the full admin dashboard, CSV reports and audit view, the stage key and options, the rehearsal reset that clears draws, and the rollout material (rehearsal scripts, runbooks, go-live) for the 1 December rehearsal and the 10 December event.

**Architecture:** Same as Plan 1. Every rule lives in a `SECURITY DEFINER` Postgres function; the draw, the stage row and the audit entry commit in one transaction. The projector reads one table (`stage_state`) through Supabase Realtime with the anon key and falls back to polling `/api/stage/state`. The MC phone never depends on Realtime: it polls `/api/station/draw/current` and uses its own action responses. **The stage payload is built inside the database and contains no name, outlet or department until the draw is confirmed.**

**Tech Stack:** Plan 1's stack, plus `@supabase/supabase-js` Realtime in the browser (stage display only). No new dependencies.

**Prerequisite:** Plan 1 is complete and merged (Tasks 1–16). Plan 2 continues the numbering at **Task 17**.

**Source documents (already in the repo from Plan 1 Task 1):** `docs/spec.md` (Technical Design Spec), `docs/prd.md` (PRD v1.2), `docs/design-guide.md` (Design Guide v1.2). When this plan and the spec disagree, **this plan wins on the points listed in "Deviations from the spec" below** (they were found while building and testing the database); everywhere else the spec wins and any conflict is reported.

## Global Constraints

Every task's requirements implicitly include this section. The first block is Plan 1's list, unchanged; the second block is new in Plan 2.

- **Stack:** Next.js on Vercel. Supabase new dedicated project, **Pro plan, Singapore region**. One event per deployment via the `EVENT_ID` env var; every table carries `event_id`.
- **Environment variables:** `SUPABASE_URL`, `SUPABASE_ANON_KEY` (public), `SUPABASE_SERVICE_ROLE_KEY` (server only), `STATION_SESSION_SECRET`, `EVENT_ID`, plus `APP_URL` (used for pass links).
- **Browsers never access tables.** RLS is enabled on every table. `EXECUTE` is revoked from `anon` and `authenticated` on every function and granted to `service_role` only. All functions are `SECURITY DEFINER` with a fixed `search_path`.
- **Responses:** business outcomes are HTTP 200 `{ ok, status, data }`. Other codes: 400 invalid input, 401 no or expired session, 403 wrong role, 429 rate limit, 500 `{ ok:false, status:"RETRYABLE_ERROR" }`. Retrying is always safe.
- **Headers:** `Cache-Control: no-store`, `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`. Cookies are `SameSite=Lax`, `httpOnly`, `Secure` in production. Mutating routes are JSON `POST` with an Origin check. Logs never contain full tokens or PINs.
- **Guest auth:** 128-bit token in the URL. Invalid lookups are rate-limited **20 per minute per IP**; valid lookups are not counted. Each guest has two tokens: `invite_token` and `merch_token`. `get_pass` returns the merchandise token **only after check-in**.
- **Station auth:** 6-digit role PIN, unique across roles, bcrypt via pgcrypto. Signed HS256 cookie `nf_station` carrying role, station label and `session_version`; **14 hours**; the `session_version` is checked against the database on every request. Lockout is **per device** cookie (**5 failures in 5 minutes**) plus a per-IP cap of **30 failures in 5 minutes**.
- **Admin auth:** Supabase Auth (Google) plus an `admins` allowlist, verified with `getUser()`.
- **Roles:** `checkin`, `merchandise`, `draw`, `prizes` (PIN roles); admin (Google). Guests have tokens only.
- **QR payload prefixes:** `NF:CI:` (check-in) and `NF:MR:` (merchandise). The route handler returns `WRONG_CODE_TYPE` before calling the database.
- **QR rendering:** white tile, black modules, quiet zone of at least 4 modules, at least 5 px per module (integer), error correction **M**, no logo, `shape-rendering: crispEdges`. Both QR frames are **8 px** (check-in gold, merchandise pink); the merchandise card has a 3 px pink border and a "MERCHANDISE" banner, with the helper text stacked below the QR; the pass ticket card has a 5 px gold border.
- **Rules enforced by constraints:** one check-in per guest; unique gap-free Door Prize numbers (counter on the `events` row incremented in the same transaction); merchandise requires check-in (FK); one active redemption per guest (partial unique where `status = 'redeemed'`); audit log append-only via trigger (`DELETE` allowed only in rehearsal mode).
- **Merchandise:** two steps: `redeem_lookup` (read-only) then `redeem_merchandise` on the "Hand over" tap. A same-station replay within **10 seconds** returns `REDEEMED`, not `ALREADY_REDEEMED`.
- **Scanner:** ignores the same code for 2 seconds.
- **Design:** dark only. Fonts: Bungee (display, numbers), Anton (headings, buttons, names), Oswald (labels), Archivo regular 400/600 (body; **Archivo Black is not used**). Colours: `#0D0D0D` black, `#D4AF37` gold, `#FF1B6B` pink, `#39FF14` green; neutrals `#F5F5F0`, `#BDBDB6`, `#9A9A94`, `#141414`, `#1B1B1B`, `#2A2A28`, `#3A3A36`, `#FFFFFF` (QR tiles only). Text on gold, pink or green fills is always black; **white on pink is forbidden**.
- **Layout:** minimum design width 360 px, 20 px side gutter, touch targets at least 48 px (56 px or more on staff screens), staff primary button 64 px, captions never below 12 px.
- **Language:** bilingual ID/EN toggle, **Indonesian default**, one translation file, choice saved in the browser with a fallback if storage fails.
- **Time:** timestamps are `timestamptz`, displayed in WITA (`Asia/Makassar`).
- **Migrations:** numbered SQL files applied by the CLI. Every migration that adds a table or function ends with `select public.lock_down_public();`.

**Added in Plan 2 (draw, stage, rollout):**

- **One prize per person**, enforced by a partial unique index on live draws (`drawn`, `confirmed`). A **no-show stays eligible** for other prizes; for the slot they missed they are skipped.
- **Draw pool:** checked-in, active guests with no `drawn` or `confirmed` win. The pick is `ORDER BY gen_random_uuid()`.
- **One unresolved draw at a time** for the whole event. A second `draw_prize` while any draw is `drawn` returns `DRAW_IN_PROGRESS` (unless it repeats the same `request_id`, which returns the same draw).
- **A confirmed draw is reversed only by an admin** through `admin_void_draw` (status `void_admin`, reason required, audited). The MC can void only an unresolved draw (`void_no_show`). If the reversed draw is on the projector, the stage returns to idle.
- **The name never reaches the stage before the MC confirms.** `stage_state.payload` carries the prize, and per slot `slot`, `number` and `state`. `name`, `outlet`, `department` are written only in the transaction that confirms that slot. Playwright asserts this in the DOM and in the network payload. The operator (MC and Prize Verification screens) does see names before confirmation.
- **Batch prizes** (`draw_as_batch`) draw all remaining slots at once; tiles flip to names as each is confirmed; the stage phase stays `rolling` until every tile is resolved. If the pool is smaller than the batch, everyone available is drawn and the response carries `short_by`.
- **Prize list** is editable until the first draw of that prize; after that only the name, tier and sort order change, and quantity can only grow (or shrink down to the highest live slot). The batch flag locks once the prize has any draw.
- **Stage display:** design on a **1280 × 720** artboard scaled to the screen. Landed number **300 px** Bungee, revealed number **180 px**, winner name Anton **100 px or larger**, outlet and department line below. Footer: "MOVE IN UNITY." and the slot counter "UNDIAN {n} DARI {total}" (slot *n* of the prize's quantity). **No congratulations wording.** Void message: "TIDAK HADIR — UNDI ULANG". No controls, no cursor, no scrollbars.
- **Stage sync:** Realtime on the single `stage_state` row; if the channel is not connected for **5 s**, poll `/api/stage/state` every **3 s**; refetch when the tab becomes visible. The display accepts only a higher `rev`. The roll (about **5 s**) is local to the display; a display that loads mid-roll goes straight to the landed view. Heartbeat every **5 s**; the operator shows a green dot when the last heartbeat is under **15 s** old. One-time "Aktifkan suara" button, fullscreen, hidden cursor, screen wake lock.
- **Operator screen:** polls `/api/station/draw/current` every **2 s**; shows the 60-second countdown ("PEMENANG HARUS HADIR · 60 DETIK", advisory only, nothing auto-voids); **KONFIRMASI** (green) and **TIDAK HADIR** (pink) are black-text buttons at least 64 px high with **16 px** between them; "TERCATAT" then **UNDIAN BERIKUTNYA** after confirming.
- **Stage key:** stored as a bcrypt hash on `events.display_key_hash`; the clear key is shown once in the admin console. `/stage?key=…` verifies it, sets the signed httpOnly cookie `nf_stage` (carries a 12-character fingerprint of the key) and redirects without the key. Rotating the key signs every open display out. 20 failures from one IP in 5 minutes lock that IP.
- **Stage options** (`safe_mode`, `reduce_effects`, `language`) live in `stage_state.options` and are changed only by an admin. `safe_mode` = projector-safe variant (no glows or halftone, 2 px black outline instead of the pink shadow, pure white names, thicker gold, no sound). `reduce_effects` = no roll, no flash, fades only.
- **Reports:** seven CSV exports — guests, check-ins, merchandise, draw history, audit, RSVP non-responders, invitation links (the last is Plan 1's route). Every cell goes through `csvSafe`; files start with a BOM so Excel reads UTF-8.
- **Dashboard** is polled every **5 s** and shows counts, attendance by outlet, prize status, draw counters and the stage connection.
- **Backups:** the evening before the event (9 December) HR downloads all CSV exports.

---

## Deviations from the spec (found while building the database)

| # | Spec says | Plan 2 does | Why |
| :---- | :---- | :---- | :---- |
| 1 | `draw_prize` returns `DRAW_IN_PROGRESS` when **another** prize has an unresolved winner | Returns it when **any** draw is unresolved, including the same prize | One round on the stage at a time; a second tap on the same prize would otherwise overwrite the screen |
| 2 | `set_stage(event, phase, payload)` | `set_stage(event, phase, prize_id, actor)`, phases `idle` and `intro` only; payload is built in the database | The caller can never put a name on the stage. Refused with `DRAW_IN_PROGRESS` while a draw is unresolved |
| 3 | `resolve_draw(draw_id, outcome, role, actor)` | `resolve_draw(event, draw_id, outcome, actor)`; `actor` is the role or the admin's e-mail. New `resolve_round(event, round, actor)` confirms every open tile of a batch in one tap | Role is already the actor; 30 vouchers should not need 30 taps |
| 4 | `draws` columns | Adds `sequence` (identity), `request_group`, `round_id`, `redraw_of`, `drawn_by`, `resolved_at`, `resolved_by`, `void_reason`; `round_id` groups a batch and keeps a redraw in the round it replaces | Stage rebuild and audit |
| 5 | `GET/POST/PATCH /api/admin/prizes` | `GET` and `POST` (a body with `id` updates); delete is `POST /api/admin/prizes/[id]/delete` | The route wrappers support `GET` and `POST` only |
| 6 | `/api/admin/reports/[name].csv` | `/api/admin/reports/[name]` returning `text/csv` | A Next.js dynamic segment cannot carry a suffix |
| 7 | `/stage?key=…` sets the cookie and redirects | The page redirects to `/api/stage/enter?key=…`, which sets the cookie and redirects to `/stage` | A server component cannot set cookies |
| 8 | Extra statuses | `PRIZE_NOT_FOUND`, `INVALID`, `NOT_FOUND`, `NOTHING_TO_CONFIRM`, `REASON_REQUIRED`, `NOT_VOIDABLE`, `NO_SUCH_NUMBER`, `NOT_A_WINNER`, `PENDING`, `WINNER` | Needed by the screens |

Task 31, Step 6 patches the spec (§3.1, §4.2, §4.5, §5.3) with all eight items so the documents agree.

---

## File Structure (new and changed)

```
nourishfest/
├── scripts/
│   ├── concurrency/{lib.mjs (changed), draw.mjs}
│   ├── load/stage-latency.mjs
│   └── rehearsal/{seed-rehearsal.mjs, simulate-arrivals.mjs}
├── supabase/
│   ├── migrations/
│   │   ├── 20261115000001_draw_schema.sql          # prizes, draws, stage tables, trigger, policy, publication
│   │   ├── 20261115000002_prize_functions.sql      # actor_type_of, prize_list, admin_save_prize, admin_delete_prize
│   │   ├── 20261115000003_stage_functions.sql      # stage_*, set_stage, options, heartbeat, stage key
│   │   ├── 20261115000004_draw_functions.sql       # round_json, draw_prize, draw_current, lookup_prize_number
│   │   ├── 20261115000005_resolve_functions.sql    # resolve_draw, resolve_round, admin_void_draw
│   │   └── 20261115000006_admin_draw_views.sql     # reset_rehearsal_data (replaced), admin_dashboard, lists, report_rows
│   └── tests/database/{007_draw_schema,008_prizes,009_stage,010_draw,011_resolve,012_admin_views}.test.sql
├── src/
│   ├── lib/
│   │   ├── stage.ts  stage-session.ts  stage-fit.ts  stage-sound.ts  use-stage.ts      # projector
│   │   ├── draw-ui.ts  operator.ts  prizes.ts  use-current.ts                          # operator screens
│   │   ├── reports.ts  admin-draw-text.ts                                              # admin
│   │   └── i18n/{draw-strings.ts (new), strings.ts (changed)}
│   ├── components/
│   │   ├── stage/StageView.tsx
│   │   ├── station/WinnerCard.tsx
│   │   └── admin/{PrizeManager,DrawHistory,StagePanel,ReportsPanel,AuditTable,OutletTable}.tsx, AdminNav.tsx (changed)
│   ├── app/
│   │   ├── stage/{page.tsx, StageClient.tsx}
│   │   ├── station/{page.tsx (changed), draw/page.tsx, prizes/page.tsx}
│   │   ├── admin/(console)/{page.tsx, layout.tsx, settings/page.tsx (all replaced), prizes/page.tsx, draws/page.tsx, reports/page.tsx, audit/page.tsx}
│   │   └── api/
│   │       ├── stage/{enter,state,heartbeat}/route.ts
│   │       ├── station/{prizes,prizes/lookup-number,draw,draw/current,draw/resolve,draw/stage}/route.ts
│   │       └── admin/{prizes,prizes/[id]/delete,draws,draws/[id]/void,reports/[name],audit,stage,dashboard (changed),settings/stage-key,settings/stage-options}/route.ts
│   └── styles/{stage.css, operator.css, admin-draw.css}
├── tests/
│   ├── unit/{stage,draw-ui,reports,stage-fit,strings-draw,operator,admin-draw-text}.test.ts
│   ├── api/{draw-helpers.ts, draw,stage,admin-draw}.test.ts, security.test.ts (replaced)
│   └── e2e/{draw-helpers.ts, draw.spec.ts, stage.spec.ts}
└── docs/runbooks/{stage-setup,failure-playbook,rehearsal-1,rehearsal-2,day-before,event-day,go-live}.md
```

Responsibility notes:
- `lib/stage.ts` is pure (no React, no fetch): types, `acceptRow` (higher `rev` wins), roll bookkeeping and slot views. It is the unit-tested core of the projector.
- `lib/use-stage.ts` owns the Realtime channel, the polling fallback and the heartbeat; `components/stage/StageView.tsx` only draws what it is given.
- `lib/draw-ui.ts` holds the operator's pure helpers (countdown, request-id retention, heartbeat colour); `lib/operator.ts` holds the MC screen's state machine (`screenFor`, `roundKey`, `drawProblem`); `lib/stage-fit.ts` scales the 1280×720 artboard.
- `lib/reports.ts` maps each report name to its SQL report, columns, headers and filename.
- SQL functions keep Plan 1's conventions: `jsonb {status, …}`, exceptions only for real failures, `p_actor` is a role or an admin e-mail.

### Changes to Plan 1 files (each is spelled out in the task that makes it)

| File | Change | Task |
| :---- | :---- | :---- |
| `scripts/concurrency/lib.mjs` | `clean()` deletes `draws` first (FK to `check_ins`); `purge()` also removes `DA-`/`DB-`/`DC-` guests and test prizes | 23 |
| `src/lib/i18n/strings.ts` | Imports `DRAW_ID`/`DRAW_EN` from `draw-strings.ts` and spreads them into both languages | 27 |
| `src/app/station/page.tsx` | `HOME` gains `draw` and `prizes` | 28 |
| `src/app/api/admin/dashboard/route.ts` | Returns the full dashboard (`admin_dashboard`) | 26 |
| `src/app/admin/(console)/page.tsx`, `settings/page.tsx`, `layout.tsx`, `src/components/admin/AdminNav.tsx` | Whole-file replacements: full dashboard, stage panel in Settings, eight nav links, the Plan 2 stylesheets | 29 |
| `tests/api/security.test.ts` | Whole-file replacement: anon-key checks for the new tables and functions | 30 |
| `docs/spec.md` | Patched to match the build (deviations 1–8) | 31 |

---

## Task 17: Draw tables, stage tables and lockdown

**Files:**
- Create: `supabase/migrations/20261115000001_draw_schema.sql`, `supabase/tests/database/007_draw_schema.test.sql`

**Interfaces:**
- Consumes: Plan 1 tables `events`, `guests`, `check_ins`; `lock_down_public()`.
- Produces:
  - `prizes(id, event_id, name, tier, sort_order, quantity 1–500, draw_as_batch)`, unique `(event_id, name)`.
  - `draws(id, event_id, prize_id, slot, sequence identity, winner_guest_id → check_ins(guest_id), status in drawn|confirmed|void_no_show|void_admin, request_id unique, request_group, round_id, redraw_of, drawn_at, drawn_by, resolved_at, resolved_by, void_reason)`. Partial unique indexes: `one_prize_per_person` (winner, live statuses) and `one_live_draw_per_slot` (prize, slot, live statuses).
  - `stage_state(event_id pk, rev, phase, payload, options, updated_at)` — the **only** table with a policy (`SELECT` to `anon`, `authenticated`) and the only one in the `supabase_realtime` publication; `stage_heartbeat(event_id pk, seen_at)`.
  - Trigger `events_create_stage_row` creates the stage row for every new event (so an event inserted after the migration is covered).
  - `lock_down_public()` replaced: also grants `SELECT` on `stage_state` to `anon` and `authenticated`.

- [ ] **Step 1: Write the failing database test**

`supabase/tests/database/007_draw_schema.test.sql`:
```sql
begin;
select * from no_plan();

select has_table('public', t, t || ' exists')
from unnest(array['prizes', 'draws', 'stage_state', 'stage_heartbeat']) as t;

-- lockdown: stage_state is the only readable table
select is((select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
          0, 'RLS is still enabled on every public table');
select is(has_table_privilege('anon', 'public.stage_state', 'select'), true, 'anon can read stage_state');
select is(has_table_privilege('anon', 'public.stage_state', 'insert'), false, 'anon cannot write stage_state');
select is(has_table_privilege('anon', 'public.stage_state', 'update'), false, 'anon cannot update stage_state');
select is(has_table_privilege('authenticated', 'public.stage_state', 'delete'), false, 'authenticated cannot delete stage_state');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' and c.relname not in ('stage_state')
              and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'))),
          0, 'no other public table is readable by browsers');
select is((select count(*)::int from pg_policies where schemaname = 'public'), 1, 'the only policy is the stage_state read policy');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
          0, 'anon and authenticated still cannot execute any function');

-- fixtures
insert into events (id, name, event_date) values ('00000000-0000-4000-8000-0000000000bb', 'Test', '2026-12-10');
insert into guests (id, event_id, employee_id, full_name, outlet) values
 ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000bb', 'E1', 'Guest One', 'Outlet A'),
 ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000bb', 'E2', 'Guest Two', 'Outlet A'),
 ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000bb', 'E3', 'Guest Three', 'Outlet A');
insert into check_ins (event_id, guest_id, method, prize_number) values
 ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000b1', 'manual', 1),
 ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000b2', 'manual', 2);
insert into prizes (id, event_id, name, quantity) values
 ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000bb', 'Prize A', 2),
 ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000bb', 'Prize B', 1);

-- prizes
select throws_ok($$ insert into prizes (event_id, name) values ('00000000-0000-4000-8000-0000000000bb', 'Prize A') $$,
                 '23505', null, 'prize names are unique per event');
select throws_ok($$ insert into prizes (event_id, name, quantity) values ('00000000-0000-4000-8000-0000000000bb', 'Zero', 0) $$,
                 '23514', null, 'quantity must be at least 1');

-- draws
select throws_ok($$ insert into draws (event_id, prize_id, slot, winner_guest_id, request_id, request_group, round_id)
                    values ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000c1', 1,
                            '00000000-0000-4000-8000-0000000000b3', gen_random_uuid(), gen_random_uuid(), gen_random_uuid()) $$,
                 '23503', null, 'a guest without a check-in cannot win');
insert into draws (id, event_id, prize_id, slot, winner_guest_id, request_id, request_group, round_id)
values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000c1', 1,
        '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000e1', gen_random_uuid());
select throws_ok($$ insert into draws (event_id, prize_id, slot, winner_guest_id, request_id, request_group, round_id)
                    values ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000c2', 1,
                            '00000000-0000-4000-8000-0000000000b1', gen_random_uuid(), gen_random_uuid(), gen_random_uuid()) $$,
                 '23505', null, 'one prize per person');
select throws_ok($$ insert into draws (event_id, prize_id, slot, winner_guest_id, request_id, request_group, round_id)
                    values ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000c1', 1,
                            '00000000-0000-4000-8000-0000000000b2', gen_random_uuid(), gen_random_uuid(), gen_random_uuid()) $$,
                 '23505', null, 'a slot holds one live winner');
select throws_ok($$ insert into draws (event_id, prize_id, slot, winner_guest_id, request_id, request_group, round_id)
                    values ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000c1', 2,
                            '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000e1', gen_random_uuid(), gen_random_uuid()) $$,
                 '23505', null, 'a request id cannot be reused');
update draws set status = 'void_no_show' where id = '00000000-0000-4000-8000-0000000000d1';
select lives_ok($$ insert into draws (event_id, prize_id, slot, winner_guest_id, request_id, request_group, round_id)
                   values ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000c2', 1,
                           '00000000-0000-4000-8000-0000000000b1', gen_random_uuid(), gen_random_uuid(), gen_random_uuid()) $$,
                'a no-show is eligible again');
select lives_ok($$ insert into draws (event_id, prize_id, slot, winner_guest_id, request_id, request_group, round_id)
                   values ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000c1', 1,
                           '00000000-0000-4000-8000-0000000000b2', gen_random_uuid(), gen_random_uuid(), gen_random_uuid()) $$,
                'a voided slot can be drawn again');
select throws_ok($$ insert into draws (event_id, prize_id, slot, winner_guest_id, request_id, request_group, round_id, status)
                    values ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000c1', 2,
                            '00000000-0000-4000-8000-0000000000b2', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'won') $$,
                 '23514', null, 'unknown status refused');

-- stage state
select is((select phase from stage_state where event_id = '00000000-0000-4000-8000-0000000000bb'), 'idle', 'a new event gets an idle stage row');
select is((select options->>'language' from stage_state where event_id = '00000000-0000-4000-8000-0000000000bb'), 'id', 'default stage language is Indonesian');
select is((select rev from stage_state where event_id = '00000000-0000-4000-8000-0000000000bb'), 0::bigint, 'revision starts at 0');
select throws_ok($$ insert into stage_state (event_id, phase) values ('00000000-0000-4000-8000-0000000000bb', 'party') $$,
                 '23514', null, 'unknown phase refused');

select * from finish();
rollback;
```
- [ ] **Step 2: Run it to verify it fails**

Run: `npm run db:reset && npm run test:db`
Expected: `007_draw_schema.test.sql` fails (`relation "prizes" does not exist`); Plan 1's files still pass.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261115000001_draw_schema.sql`:
```sql
create table public.prizes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  name text not null check (length(name) between 1 and 80),
  tier text check (tier is null or length(tier) <= 30),
  sort_order int not null default 0,
  quantity int not null default 1 check (quantity between 1 and 500),
  draw_as_batch boolean not null default false,
  created_at timestamptz not null default now(),
  unique (event_id, name)
);

create table public.draws (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  prize_id uuid not null references public.prizes(id),
  slot int not null check (slot >= 1),
  sequence bigint generated always as identity,
  -- winner_guest_id references check_ins, so nobody can win without a Door Prize number
  winner_guest_id uuid not null references public.check_ins(guest_id),
  status text not null default 'drawn' check (status in ('drawn', 'confirmed', 'void_no_show', 'void_admin')),
  request_id uuid not null unique,   -- idempotency key of this row (derived from request_group for batch rows)
  request_group uuid not null,       -- the request_id the client sent; one group per DRAW tap
  round_id uuid not null,            -- what the projector shows together (one draw, one batch, or the redraws of them)
  redraw_of uuid references public.draws(id),
  drawn_at timestamptz not null default now(),
  drawn_by text,
  resolved_at timestamptz,
  resolved_by text,
  void_reason text
);
-- One prize per person; a no-show or admin void leaves this index, so that person is eligible again.
create unique index one_prize_per_person on public.draws (winner_guest_id) where status in ('drawn', 'confirmed');
-- A slot holds at most one live winner.
create unique index one_live_draw_per_slot on public.draws (prize_id, slot) where status in ('drawn', 'confirmed');
create index draws_request_group on public.draws (request_group);
create index draws_round on public.draws (round_id);

create table public.stage_state (
  event_id uuid primary key references public.events(id),
  rev bigint not null default 0,
  phase text not null default 'idle' check (phase in ('idle', 'intro', 'rolling', 'revealed', 'void')),
  payload jsonb not null default '{}'::jsonb,
  options jsonb not null default '{"safe_mode": false, "reduce_effects": false, "language": "id"}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.stage_state (event_id) select id from public.events on conflict do nothing;

-- Every new event gets its stage row (the dev seed and the production setup both insert events after migrations).
create function public.create_stage_row() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.stage_state (event_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger events_create_stage_row after insert on public.events
for each row execute function public.create_stage_row();

create table public.stage_heartbeat (
  event_id uuid primary key references public.events(id),
  seen_at timestamptz not null default now()
);

-- The only table a browser may read: the projector subscribes to it with the public key.
create policy stage_state_public_read on public.stage_state for select to anon, authenticated using (true);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stage_state') then
    alter publication supabase_realtime add table public.stage_state;
  end if;
end $$;

-- Same lockdown as before, except stage_state stays readable (read only) for anon and authenticated.
create or replace function public.lock_down_public() returns void
language plpgsql
as $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
  grant select on table public.stage_state to anon, authenticated;
  execute 'revoke execute on all functions in schema public from public, anon, authenticated';
  execute 'grant execute on all functions in schema public to service_role';
end $$;

select public.lock_down_public();
```
- [ ] **Step 4: Run the database tests to verify they pass**

Run: `npm run db:reset && npm run test:db`
Expected: every file passes, including Plan 1's `002`–`006` and, in `007`, "anon and authenticated still cannot execute any function".

- [ ] **Step 5: Commit**

```bash
git add supabase
git commit -m "feat(db): prizes, draws and stage tables with one-prize-per-person constraint"
```

---

## Task 18: Prize functions

**Files:**
- Create: `supabase/migrations/20261115000002_prize_functions.sql`, `supabase/tests/database/008_prizes.test.sql`

**Interfaces:**
- Consumes: Task 17 tables, `audit(...)`.
- Produces:
  - `actor_type_of(p_actor text) → text`: `'admin'` if the actor contains `@`, else `'station'`. Used by every Plan 2 function for the audit row.
  - `prize_list(p_event) → {status:'OK', prizes:[{id, name, tier, sort_order, quantity, draw_as_batch, confirmed, pending, no_shows, admin_voids, remaining, has_draws}]}` ordered by `sort_order, name`. `remaining = quantity − confirmed − pending`.
  - `admin_save_prize(p_event, p_id uuid|null, p_data jsonb, p_actor) → {status, id?}`: `OK`, `INVALID`, `NAME_IN_USE`, `NOT_FOUND`, `QUANTITY_TOO_LOW`, `LOCKED_BY_DRAWS`. `p_data` keys: `name`, `tier`, `sort_order`, `quantity`, `draw_as_batch` (all optional on update; `name` required on create).
  - `admin_delete_prize(p_event, p_id, p_actor) → {status}`: `OK`, `NOT_FOUND`, `HAS_DRAWS`.

- [ ] **Step 1: Write the failing database test**

`supabase/tests/database/008_prizes.test.sql`:
```sql
begin;
select * from no_plan();

insert into events (id, name, event_date) values ('00000000-0000-4000-8000-0000000000bb', 'Test', '2026-12-10');
insert into guests (id, event_id, employee_id, full_name, outlet) values
 ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000bb', 'E1', 'Guest One', 'Outlet A');
insert into check_ins (event_id, guest_id, method, prize_number) values
 ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000b1', 'manual', 1);

select is(actor_type_of('draw'), 'station', 'a role is a station actor');
select is(actor_type_of('hr@example.com'), 'admin', 'an email is an admin actor');
select is(actor_type_of(null), 'station', 'null is treated as a station actor');

-- create
create temp table made as
  select admin_save_prize('00000000-0000-4000-8000-0000000000bb', null,
                          '{"name":" Grand Prize ","tier":"grand","quantity":1}'::jsonb, 'hr@example.com') as r;
select is((select r->>'status' from made), 'OK', 'create a prize');
select is((select name from prizes where id = (select (r->>'id')::uuid from made)), 'Grand Prize', 'name is trimmed');
select is((select sort_order from prizes where id = (select (r->>'id')::uuid from made)), 10, 'first prize gets sort order 10');
select is((select (admin_save_prize('00000000-0000-4000-8000-0000000000bb', null, '{"name":"Voucher","quantity":10,"draw_as_batch":true}'::jsonb, 'hr@example.com'))->>'status'), 'OK', 'create a batch prize');
select is((select sort_order from prizes where name = 'Voucher'), 20, 'next prize gets sort order 20');
select is((select draw_as_batch from prizes where name = 'Voucher'), true, 'batch flag stored');
select is(admin_save_prize('00000000-0000-4000-8000-0000000000bb', null, '{"name":"Grand Prize"}'::jsonb, 'hr@example.com')->>'status', 'NAME_IN_USE', 'duplicate name refused');
select is(admin_save_prize('00000000-0000-4000-8000-0000000000bb', null, '{"name":""}'::jsonb, 'hr@example.com')->>'status', 'INVALID', 'empty name refused');
select is(admin_save_prize('00000000-0000-4000-8000-0000000000bb', null, '{"tier":"x"}'::jsonb, 'hr@example.com')->>'status', 'INVALID', 'name required on create');
select is(admin_save_prize('00000000-0000-4000-8000-0000000000bb', null, '{"name":"Q","quantity":0}'::jsonb, 'hr@example.com')->>'status', 'INVALID', 'quantity 0 refused');
select is(admin_save_prize('00000000-0000-4000-8000-0000000000bb', null, '{"name":"Q","quantity":501}'::jsonb, 'hr@example.com')->>'status', 'INVALID', 'quantity 501 refused');
select is(admin_save_prize('00000000-0000-4000-8000-0000000000bb', null, '{"name":"Q","quantity":"many"}'::jsonb, 'hr@example.com')->>'status', 'INVALID', 'non-numeric quantity refused');
select is(admin_save_prize('00000000-0000-4000-8000-0000000000bb', null, '{"name":"Q","draw_as_batch":"yes"}'::jsonb, 'hr@example.com')->>'status', 'INVALID', 'non-boolean batch flag refused');
select is(admin_save_prize('00000000-0000-4000-8000-0000000000bb', null, to_jsonb(repeat('x', 81))::jsonb, 'hr@example.com')->>'status', 'INVALID', 'non-object data refused');
select is(admin_save_prize('00000000-0000-4000-8000-0000000000bb', null, jsonb_build_object('name', repeat('x', 81)), 'hr@example.com')->>'status', 'INVALID', 'name over 80 characters refused');

-- update
select is(admin_save_prize('00000000-0000-4000-8000-0000000000bb', (select (r->>'id')::uuid from made), '{"tier":"major","sort_order":5}'::jsonb, 'hr@example.com')->>'status', 'OK', 'update tier and order');
select is((select tier from prizes where name = 'Grand Prize'), 'major', 'tier changed');
select is((select quantity from prizes where name = 'Grand Prize'), 1, 'untouched fields stay');
select is(admin_save_prize('00000000-0000-4000-8000-0000000000bb', (select (r->>'id')::uuid from made), '{"tier":null}'::jsonb, 'hr@example.com')->>'status', 'OK', 'clear the tier');
select is((select tier from prizes where name = 'Grand Prize'), null, 'tier cleared');
select is(admin_save_prize('00000000-0000-4000-8000-0000000000bb', gen_random_uuid(), '{"name":"X"}'::jsonb, 'hr@example.com')->>'status', 'NOT_FOUND', 'unknown prize');
select is(admin_save_prize('00000000-0000-4000-8000-0000000000bb', (select (r->>'id')::uuid from made), '{"name":"Voucher"}'::jsonb, 'hr@example.com')->>'status', 'NAME_IN_USE', 'rename onto an existing name refused');

-- locks once drawn
insert into draws (event_id, prize_id, slot, winner_guest_id, request_id, request_group, round_id, status)
select '00000000-0000-4000-8000-0000000000bb', id, 4, '00000000-0000-4000-8000-0000000000b1', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'confirmed'
  from prizes where name = 'Voucher';
select is(admin_save_prize('00000000-0000-4000-8000-0000000000bb', (select id from prizes where name = 'Voucher'), '{"quantity":3}'::jsonb, 'hr@example.com')->>'status', 'QUANTITY_TOO_LOW', 'cannot shrink below a drawn slot');
select is(admin_save_prize('00000000-0000-4000-8000-0000000000bb', (select id from prizes where name = 'Voucher'), '{"quantity":4}'::jsonb, 'hr@example.com')->>'status', 'OK', 'can shrink down to the drawn slot');
select is(admin_save_prize('00000000-0000-4000-8000-0000000000bb', (select id from prizes where name = 'Voucher'), '{"draw_as_batch":false}'::jsonb, 'hr@example.com')->>'status', 'LOCKED_BY_DRAWS', 'batch flag locked after a draw');
select is(admin_save_prize('00000000-0000-4000-8000-0000000000bb', (select id from prizes where name = 'Voucher'), '{"draw_as_batch":true,"name":"Voucher 100k"}'::jsonb, 'hr@example.com')->>'status', 'OK', 'same batch flag and a rename are fine after a draw');

-- delete
select is(admin_delete_prize('00000000-0000-4000-8000-0000000000bb', (select id from prizes where name = 'Voucher 100k'), 'hr@example.com')->>'status', 'HAS_DRAWS', 'cannot delete a drawn prize');
select is(admin_delete_prize('00000000-0000-4000-8000-0000000000bb', (select id from prizes where name = 'Grand Prize'), 'hr@example.com')->>'status', 'OK', 'delete an unused prize');
select is(admin_delete_prize('00000000-0000-4000-8000-0000000000bb', gen_random_uuid(), 'hr@example.com')->>'status', 'NOT_FOUND', 'unknown prize');

-- list
select is(jsonb_array_length(prize_list('00000000-0000-4000-8000-0000000000bb')->'prizes'), 1, 'list shows the remaining prize');
select is(prize_list('00000000-0000-4000-8000-0000000000bb')->'prizes'->0->>'confirmed', '1', 'list: confirmed count');
select is(prize_list('00000000-0000-4000-8000-0000000000bb')->'prizes'->0->>'remaining', '3', 'list: remaining slots');
select is(prize_list('00000000-0000-4000-8000-0000000000bb')->'prizes'->0->>'has_draws', 'true', 'list: has_draws');
select is((select count(*)::int from audit_log where action = 'prize_created'), 2, 'creates are audited');
select is((select actor_type from audit_log where action = 'prize_created' limit 1), 'admin', 'audit shows an admin actor');

select * from finish();
rollback;
```
- [ ] **Step 2: Run it to verify it fails**

Run: `npm run db:reset && npm run test:db`
Expected: `008_prizes.test.sql` fails (`function prize_list(uuid) does not exist`).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261115000002_prize_functions.sql`:
```sql
-- 'admin' when the actor is an email address (an admin using a station screen), otherwise 'station'.
create function public.actor_type_of(p_actor text) returns text
language sql immutable
as $$ select case when position('@' in coalesce(p_actor, '')) > 0 then 'admin' else 'station' end $$;

create function public.prize_list(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object('status', 'OK', 'prizes', coalesce(jsonb_agg(s.x order by s.sort_order, s.name), '[]'::jsonb))
  from (
    select p.sort_order, p.name, jsonb_build_object(
      'id', p.id, 'name', p.name, 'tier', p.tier, 'sort_order', p.sort_order, 'quantity', p.quantity,
      'draw_as_batch', p.draw_as_batch,
      'confirmed',    count(d.id) filter (where d.status = 'confirmed'),
      'pending',      count(d.id) filter (where d.status = 'drawn'),
      'no_shows',     count(d.id) filter (where d.status = 'void_no_show'),
      'admin_voids',  count(d.id) filter (where d.status = 'void_admin'),
      'remaining',    p.quantity - count(d.id) filter (where d.status in ('drawn', 'confirmed')),
      'has_draws',    count(d.id) > 0) as x
    from public.prizes p
    left join public.draws d on d.prize_id = p.id
    where p.event_id = p_event
    group by p.id
  ) s
$$;

-- Creates (p_id null) or updates a prize. Only the keys present in p_data change on update.
create function public.admin_save_prize(p_event uuid, p_id uuid, p_data jsonb, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  pr public.prizes%rowtype;
  v_name text;
  v_tier text;
  v_qty int;
  v_sort int;
  v_batch boolean;
  v_max_slot int;
  v_has_draws boolean;
begin
  if jsonb_typeof(p_data) is distinct from 'object' then
    return jsonb_build_object('status', 'INVALID');
  end if;

  if jsonb_exists(p_data, 'quantity') then
    if coalesce(p_data->>'quantity', '') !~ '^[0-9]{1,3}$' or (p_data->>'quantity')::int not between 1 and 500 then
      return jsonb_build_object('status', 'INVALID');
    end if;
    v_qty := (p_data->>'quantity')::int;
  end if;
  if jsonb_exists(p_data, 'sort_order') then
    if coalesce(p_data->>'sort_order', '') !~ '^[0-9]{1,6}$' then
      return jsonb_build_object('status', 'INVALID');
    end if;
    v_sort := (p_data->>'sort_order')::int;
  end if;
  if jsonb_exists(p_data, 'draw_as_batch') then
    if jsonb_typeof(p_data->'draw_as_batch') is distinct from 'boolean' then
      return jsonb_build_object('status', 'INVALID');
    end if;
    v_batch := (p_data->>'draw_as_batch')::boolean;
  end if;
  if jsonb_exists(p_data, 'name') then
    v_name := nullif(trim(coalesce(p_data->>'name', '')), '');
    if v_name is null or length(v_name) > 80 then
      return jsonb_build_object('status', 'INVALID');
    end if;
  end if;
  if jsonb_exists(p_data, 'tier') then
    v_tier := nullif(trim(coalesce(p_data->>'tier', '')), '');
    if length(coalesce(v_tier, '')) > 30 then
      return jsonb_build_object('status', 'INVALID');
    end if;
  end if;

  if p_id is null then
    if v_name is null then
      return jsonb_build_object('status', 'INVALID');
    end if;
    insert into public.prizes (event_id, name, tier, sort_order, quantity, draw_as_batch)
    values (p_event, v_name, v_tier,
            coalesce(v_sort, (select coalesce(max(sort_order), 0) + 10 from public.prizes where event_id = p_event)),
            coalesce(v_qty, 1), coalesce(v_batch, false))
    returning * into pr;
    perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'prize_created', 'prize', pr.id::text,
                         jsonb_build_object('name', pr.name, 'quantity', pr.quantity));
    return jsonb_build_object('status', 'OK', 'id', pr.id);
  end if;

  select * into pr from public.prizes where id = p_id and event_id = p_event for update;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  select coalesce(max(slot), 0), count(*) > 0 into v_max_slot, v_has_draws
    from public.draws where prize_id = pr.id and status in ('drawn', 'confirmed');
  if v_qty is not null and v_qty < v_max_slot then
    return jsonb_build_object('status', 'QUANTITY_TOO_LOW');
  end if;
  if v_batch is not null and v_batch is distinct from pr.draw_as_batch
     and exists (select 1 from public.draws where prize_id = pr.id) then
    return jsonb_build_object('status', 'LOCKED_BY_DRAWS');
  end if;

  update public.prizes set
    name          = coalesce(v_name, name),
    tier          = case when jsonb_exists(p_data, 'tier') then v_tier else tier end,
    sort_order    = coalesce(v_sort, sort_order),
    quantity      = coalesce(v_qty, quantity),
    draw_as_batch = coalesce(v_batch, draw_as_batch)
   where id = pr.id;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'prize_updated', 'prize', pr.id::text,
                       jsonb_build_object('fields', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(p_data) k)));
  return jsonb_build_object('status', 'OK', 'id', pr.id);
exception when unique_violation then
  return jsonb_build_object('status', 'NAME_IN_USE');
end $$;

create function public.admin_delete_prize(p_event uuid, p_id uuid, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  pr public.prizes%rowtype;
begin
  select * into pr from public.prizes where id = p_id and event_id = p_event for update;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  if exists (select 1 from public.draws where prize_id = pr.id) then
    return jsonb_build_object('status', 'HAS_DRAWS');
  end if;
  delete from public.prizes where id = pr.id;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'prize_deleted', 'prize', pr.id::text,
                       jsonb_build_object('name', pr.name));
  return jsonb_build_object('status', 'OK');
end $$;

select public.lock_down_public();
```
- [ ] **Step 4: Run the database tests to verify they pass**

Run: `npm run db:reset && npm run test:db`
Expected: all files pass.

- [ ] **Step 5: Commit**

```bash
git add supabase
git commit -m "feat(db): prize list and prize management functions"
```

---

## Task 19: Stage functions — state, options, heartbeat, stage key

**Files:**
- Create: `supabase/migrations/20261115000003_stage_functions.sql`, `supabase/tests/database/009_stage.test.sql`

**Interfaces:**
- Consumes: Task 17 tables, `actor_type_of`, `audit`, `auth_attempts`.
- Produces:
  - `stage_write(p_event, p_phase, p_payload) → void` — internal; bumps `rev`.
  - `stage_payload(p_event, p_round) → jsonb` — `{round_id, batch, prize:{id,name,tier,quantity}, slots:[{slot, number, state: rolling|revealed|void, name?, outlet?, department?}]}`. The latest row per slot wins. **`name`, `outlet`, `department` exist only for `confirmed` rows.**
  - `stage_publish(p_event, p_round) → void` — rebuilds the stage from the draws of a round: phase `rolling` while any slot is `drawn`, else `void` if any slot is void, else `revealed`; an unknown round publishes `idle`.
  - `get_stage(p_event) → {status:'OK', rev, phase, payload, options, updated_at}` — also what `/api/stage/state` returns.
  - `set_stage(p_event, p_phase, p_prize_id, p_actor) → {status}`: `OK`, `INVALID_PHASE`, `PRIZE_NOT_FOUND`, `DRAW_IN_PROGRESS`. Phases `idle` and `intro` only.
  - `set_stage_options(p_event, p_options jsonb, p_actor) → {status}`: `OK`, `INVALID` (only `safe_mode`, `reduce_effects` booleans and `language` `id`|`en` are accepted).
  - `touch_stage_heartbeat(p_event) → void`; `stage_heartbeat_age(p_event) → int|null` (seconds).
  - `set_stage_key(p_event, p_key, p_actor) → {status}`: `OK`, `INVALID_KEY` (16–64 characters of `A–Z a–z 0–9 _ -`), `NOT_FOUND`. The key is stored as a bcrypt hash and never written to the audit log.
  - `stage_key_tag(p_event) → text|null` — first 12 characters of `md5(hash)`; goes into the `nf_stage` cookie so rotating the key invalidates cookies.
  - `verify_stage_key(p_event, p_key, p_ip_key) → {status, tag?}`: `OK`, `INVALID`, `LOCKED` (20 failures per IP in 5 minutes), `NOT_SET`.

- [ ] **Step 1: Write the failing database test**

`supabase/tests/database/009_stage.test.sql`:
```sql
begin;
select * from no_plan();

insert into events (id, name, event_date) values ('00000000-0000-4000-8000-0000000000bb', 'Test', '2026-12-10');
insert into guests (id, event_id, employee_id, full_name, outlet, department) values
 ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000bb', 'E1', 'Guest One', 'Outlet A', 'FOH'),
 ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000bb', 'E2', 'Guest Two', 'Outlet B', null),
 ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000bb', 'E3', 'Guest Three', 'Outlet C', 'BOH');
insert into check_ins (event_id, guest_id, method, prize_number) values
 ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000b1', 'manual', 1),
 ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000b2', 'manual', 2),
 ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000b3', 'manual', 3);
insert into prizes (id, event_id, name, tier, quantity, draw_as_batch) values
 ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000bb', 'Grand Prize', 'grand', 1, false),
 ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000bb', 'Vouchers', 'minor', 3, true);

-- get_stage
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->>'phase', 'idle', 'a new event is idle');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->>'rev', '0', 'revision 0');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->'options'->>'language', 'id', 'default language');
select is(get_stage(gen_random_uuid())->>'phase', 'idle', 'an unknown event reads as idle');

-- stage_write bumps the revision
select stage_write('00000000-0000-4000-8000-0000000000bb', 'idle', '{}'::jsonb);
select stage_write('00000000-0000-4000-8000-0000000000bb', 'idle', '{}'::jsonb);
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->>'rev', '2', 'every write bumps rev');

-- payload: rolling shows the number only
insert into draws (event_id, prize_id, slot, winner_guest_id, request_id, request_group, round_id, status) values
 ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000c2', 1, '00000000-0000-4000-8000-0000000000b1',
  '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1', 'drawn'),
 ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000c2', 2, '00000000-0000-4000-8000-0000000000b2',
  '00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1', 'drawn');
select stage_publish('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000a1');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->>'phase', 'rolling', 'phase is rolling while slots are unresolved');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->>'rev', '3', 'publish bumps rev');
select is(jsonb_array_length(get_stage('00000000-0000-4000-8000-0000000000bb')->'payload'->'slots'), 2, 'two slots on stage');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->'payload'->'slots'->0->>'number', '1', 'slot 1 shows its Door Prize number');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->'payload'->'prize'->>'name', 'Vouchers', 'prize name on stage');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')::text ~* '(Guest One|Guest Two|Outlet A|Outlet B|FOH)', false, 'NO name, outlet or department before confirmation');

-- one slot confirmed: its name appears, the other still has none; phase stays rolling
update draws set status = 'confirmed' where request_id = '00000000-0000-4000-8000-0000000000f1';
select stage_publish('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000a1');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->'payload'->'slots'->0->>'name', 'Guest One', 'confirmed slot shows the name');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->'payload'->'slots'->0->>'outlet', 'Outlet A', 'and the outlet');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->'payload'->'slots'->0->>'department', 'FOH', 'and the department');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->'payload'->'slots'->1->>'name', null, 'the unresolved slot has no name');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')::text ~* 'Guest Two', false, 'the unresolved winner is not in the payload at all');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->>'phase', 'rolling', 'phase stays rolling while any slot is unresolved');

-- the other slot is a no-show: phase void
update draws set status = 'void_no_show' where request_id = '00000000-0000-4000-8000-0000000000f2';
select stage_publish('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000a1');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->>'phase', 'void', 'phase is void');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->'payload'->'slots'->1->>'state', 'void', 'void slot state');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')::text ~* 'Guest Two', false, 'a no-show is never named');

-- a redraw in the same round replaces the voided slot (latest row wins)
insert into draws (event_id, prize_id, slot, winner_guest_id, request_id, request_group, round_id, status) values
 ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000c2', 2, '00000000-0000-4000-8000-0000000000b3',
  '00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000a1', 'confirmed');
select stage_publish('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000a1');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->>'phase', 'revealed', 'all slots resolved: revealed');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->'payload'->'slots'->1->>'name', 'Guest Three', 'the redraw replaced the void slot');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->'payload'->'slots'->1->>'department', 'BOH', 'department of the redraw winner');

-- an unknown round publishes idle
select stage_publish('00000000-0000-4000-8000-0000000000bb', gen_random_uuid());
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->>'phase', 'idle', 'unknown round resets the stage');

-- set_stage
select is(set_stage('00000000-0000-4000-8000-0000000000bb', 'rolling', null, 'draw')->>'status', 'INVALID_PHASE', 'the MC cannot set arbitrary phases');
select is(set_stage('00000000-0000-4000-8000-0000000000bb', 'intro', gen_random_uuid(), 'draw')->>'status', 'PRIZE_NOT_FOUND', 'unknown prize');
select is(set_stage('00000000-0000-4000-8000-0000000000bb', 'intro', '00000000-0000-4000-8000-0000000000c1', 'draw')->>'status', 'OK', 'show a prize banner');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->>'phase', 'intro', 'phase intro');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->'payload'->'prize'->>'name', 'Grand Prize', 'banner shows the prize');
select is(jsonb_array_length(get_stage('00000000-0000-4000-8000-0000000000bb')->'payload'->'slots'), 0, 'intro has no slots');
select is(set_stage('00000000-0000-4000-8000-0000000000bb', 'idle', null, 'draw')->>'status', 'OK', 'blank the screen');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->>'phase', 'idle', 'phase idle');
insert into draws (event_id, prize_id, slot, winner_guest_id, request_id, request_group, round_id, status) values
 ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000c1', 1, '00000000-0000-4000-8000-0000000000b2',
  gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'drawn');
select is(set_stage('00000000-0000-4000-8000-0000000000bb', 'idle', null, 'draw')->>'status', 'DRAW_IN_PROGRESS', 'cannot blank the screen over an unresolved draw');
delete from draws where status = 'drawn';

-- options
select is(set_stage_options('00000000-0000-4000-8000-0000000000bb', '{"safe_mode":true}'::jsonb, 'hr@example.com')->>'status', 'OK', 'set safe mode');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->'options'->>'safe_mode', 'true', 'safe mode on');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->'options'->>'language', 'id', 'other options kept');
select is(set_stage_options('00000000-0000-4000-8000-0000000000bb', '{"language":"en","reduce_effects":true}'::jsonb, 'hr@example.com')->>'status', 'OK', 'set two options');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->'options'->>'language', 'en', 'language changed');
select is(set_stage_options('00000000-0000-4000-8000-0000000000bb', '{"language":"fr"}'::jsonb, 'hr@example.com')->>'status', 'INVALID', 'unknown language refused');
select is(set_stage_options('00000000-0000-4000-8000-0000000000bb', '{"safe_mode":"yes"}'::jsonb, 'hr@example.com')->>'status', 'INVALID', 'non-boolean refused');
select is(set_stage_options('00000000-0000-4000-8000-0000000000bb', '{"payload":{}}'::jsonb, 'hr@example.com')->>'status', 'INVALID', 'unknown option refused');
select is(set_stage_options('00000000-0000-4000-8000-0000000000bb', '{}'::jsonb, 'hr@example.com')->>'status', 'INVALID', 'empty options refused');

-- heartbeat
select is(stage_heartbeat_age('00000000-0000-4000-8000-0000000000bb'), null, 'no heartbeat yet');
select touch_stage_heartbeat('00000000-0000-4000-8000-0000000000bb');
select ok(stage_heartbeat_age('00000000-0000-4000-8000-0000000000bb') between 0 and 2, 'fresh heartbeat');
update stage_heartbeat set seen_at = now() - interval '40 seconds';
select ok(stage_heartbeat_age('00000000-0000-4000-8000-0000000000bb') >= 40, 'age grows');

-- stage key
select is(verify_stage_key('00000000-0000-4000-8000-0000000000bb', 'whatever', 'ip1')->>'status', 'NOT_SET', 'no key set yet');
select is(set_stage_key('00000000-0000-4000-8000-0000000000bb', 'short', 'hr@example.com')->>'status', 'INVALID_KEY', 'short key refused');
select is(set_stage_key('00000000-0000-4000-8000-0000000000bb', 'has spaces in it 12345', 'hr@example.com')->>'status', 'INVALID_KEY', 'unsafe characters refused');
select is(set_stage_key('00000000-0000-4000-8000-0000000000bb', 'Abcdefghijklmnop12345678', 'hr@example.com')->>'status', 'OK', 'set a key');
select is(verify_stage_key('00000000-0000-4000-8000-0000000000bb', 'Abcdefghijklmnop12345678', 'ip1')->>'status', 'OK', 'right key');
select is(length(verify_stage_key('00000000-0000-4000-8000-0000000000bb', 'Abcdefghijklmnop12345678', 'ip1')->>'tag'), 12, 'tag is 12 characters');
select is(verify_stage_key('00000000-0000-4000-8000-0000000000bb', 'Abcdefghijklmnop1234567X', 'ip1')->>'status', 'INVALID', 'wrong key');
select is(verify_stage_key('00000000-0000-4000-8000-0000000000bb', null, 'ip1')->>'status', 'INVALID', 'null key');
create temp table tag1 as select stage_key_tag('00000000-0000-4000-8000-0000000000bb') as t;
select set_stage_key('00000000-0000-4000-8000-0000000000bb', 'Zyxwvutsrqponmlk98765432', 'hr@example.com');
select isnt(stage_key_tag('00000000-0000-4000-8000-0000000000bb'), (select t from tag1), 'rotating the key changes the tag');
select is(verify_stage_key('00000000-0000-4000-8000-0000000000bb', 'Abcdefghijklmnop12345678', 'ip1')->>'status', 'INVALID', 'the old key stops working');
insert into auth_attempts (scope, key, success) select 'stage_ip', 'ip2', false from generate_series(1, 20);
select is(verify_stage_key('00000000-0000-4000-8000-0000000000bb', 'Zyxwvutsrqponmlk98765432', 'ip2')->>'status', 'LOCKED', 'an IP is locked after 20 failures');
select is(verify_stage_key('00000000-0000-4000-8000-0000000000bb', 'Zyxwvutsrqponmlk98765432', 'ip3')->>'status', 'OK', 'other IPs are unaffected');
select is((select count(*)::int from audit_log where action = 'set_stage_key' and details::text like '%Abcdef%'), 0, 'the key is never written to the audit log');

select * from finish();
rollback;
```
- [ ] **Step 2: Run it to verify it fails**

Run: `npm run db:reset && npm run test:db`
Expected: `009_stage.test.sql` fails (`function get_stage(uuid) does not exist`).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261115000003_stage_functions.sql`:
```sql
-- Writes the single stage_state row (creating it if missing) and bumps rev. Internal: no authorization here.
create function public.stage_write(p_event uuid, p_phase text, p_payload jsonb) returns void
language sql security definer set search_path = public, extensions
as $$
  insert into public.stage_state (event_id, rev, phase, payload)
  values (p_event, 1, p_phase, coalesce(p_payload, '{}'::jsonb))
  on conflict (event_id) do update
    set rev = public.stage_state.rev + 1, phase = excluded.phase, payload = excluded.payload, updated_at = now()
$$;

-- What the projector may know about one round. A winner's name, outlet and department appear ONLY for confirmed draws.
create function public.stage_payload(p_event uuid, p_round uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object(
    'round_id', p_round,
    'batch', pr.draw_as_batch,
    'prize', jsonb_build_object('id', pr.id, 'name', pr.name, 'tier', pr.tier, 'quantity', pr.quantity),
    'slots', (
      select coalesce(jsonb_agg(x.s order by x.slot), '[]'::jsonb)
      from (
        select distinct on (d.slot) d.slot,
               jsonb_build_object('slot', d.slot, 'number', c.prize_number,
                                  'state', case d.status when 'drawn' then 'rolling' when 'confirmed' then 'revealed' else 'void' end)
               || case when d.status = 'confirmed'
                       then jsonb_build_object('name', g.full_name, 'outlet', g.outlet, 'department', g.department)
                       else '{}'::jsonb end as s
          from public.draws d
          join public.check_ins c on c.guest_id = d.winner_guest_id
          join public.guests g on g.id = d.winner_guest_id
         where d.event_id = p_event and d.round_id = p_round
         order by d.slot, d.sequence desc
      ) x)
  )
  from public.prizes pr
  where pr.id = (select d.prize_id from public.draws d where d.event_id = p_event and d.round_id = p_round limit 1)
$$;

-- Recomputes the stage from the draws of one round and publishes it (rev + 1).
create function public.stage_publish(p_event uuid, p_round uuid) returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_payload jsonb;
  v_phase text;
begin
  v_payload := public.stage_payload(p_event, p_round);
  if v_payload is null then
    perform public.stage_write(p_event, 'idle', '{}'::jsonb);
    return;
  end if;
  v_phase := case
    when exists (select 1 from jsonb_array_elements(v_payload->'slots') s where s->>'state' = 'rolling') then 'rolling'
    when exists (select 1 from jsonb_array_elements(v_payload->'slots') s where s->>'state' = 'void') then 'void'
    else 'revealed' end;
  perform public.stage_write(p_event, v_phase, v_payload);
end $$;

create function public.get_stage(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object(
    'status', 'OK',
    'rev', coalesce(s.rev, 0),
    'phase', coalesce(s.phase, 'idle'),
    'payload', coalesce(s.payload, '{}'::jsonb),
    'options', coalesce(s.options, '{"safe_mode": false, "reduce_effects": false, "language": "id"}'::jsonb),
    'updated_at', s.updated_at)
  from (select 1) one
  left join public.stage_state s on s.event_id = p_event
$$;

-- The MC may blank the screen or show a prize banner. The payload is built here, never supplied by the caller.
create function public.set_stage(p_event uuid, p_phase text, p_prize_id uuid, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  pr public.prizes%rowtype;
begin
  if p_phase not in ('idle', 'intro') then
    return jsonb_build_object('status', 'INVALID_PHASE');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('draw:' || p_event::text, 0));
  if exists (select 1 from public.draws where event_id = p_event and status = 'drawn') then
    return jsonb_build_object('status', 'DRAW_IN_PROGRESS');
  end if;
  if p_phase = 'idle' then
    perform public.stage_write(p_event, 'idle', '{}'::jsonb);
  else
    select * into pr from public.prizes where id = p_prize_id and event_id = p_event;
    if not found then
      return jsonb_build_object('status', 'PRIZE_NOT_FOUND');
    end if;
    perform public.stage_write(p_event, 'intro', jsonb_build_object(
      'round_id', null, 'batch', pr.draw_as_batch, 'slots', '[]'::jsonb,
      'prize', jsonb_build_object('id', pr.id, 'name', pr.name, 'tier', pr.tier, 'quantity', pr.quantity)));
  end if;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'stage_' || p_phase, 'stage', p_event::text,
                       case when p_phase = 'intro' then jsonb_build_object('prize_id', p_prize_id) else '{}'::jsonb end);
  return jsonb_build_object('status', 'OK');
end $$;

create function public.set_stage_options(p_event uuid, p_options jsonb, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if jsonb_typeof(p_options) is distinct from 'object' or p_options = '{}'::jsonb then
    return jsonb_build_object('status', 'INVALID');
  end if;
  if exists (select 1 from jsonb_object_keys(p_options) k where k not in ('safe_mode', 'reduce_effects', 'language')) then
    return jsonb_build_object('status', 'INVALID');
  end if;
  if (jsonb_exists(p_options, 'safe_mode') and jsonb_typeof(p_options->'safe_mode') <> 'boolean')
     or (jsonb_exists(p_options, 'reduce_effects') and jsonb_typeof(p_options->'reduce_effects') <> 'boolean')
     or (jsonb_exists(p_options, 'language') and (p_options->>'language') not in ('id', 'en')) then
    return jsonb_build_object('status', 'INVALID');
  end if;
  insert into public.stage_state (event_id) values (p_event) on conflict do nothing;
  update public.stage_state
     set options = options || p_options, rev = rev + 1, updated_at = now()
   where event_id = p_event;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'stage_options', 'stage', p_event::text, p_options);
  return jsonb_build_object('status', 'OK');
end $$;

create function public.touch_stage_heartbeat(p_event uuid) returns void
language sql security definer set search_path = public, extensions
as $$
  insert into public.stage_heartbeat (event_id, seen_at) values (p_event, now())
  on conflict (event_id) do update set seen_at = now()
$$;

-- Seconds since the display last checked in; null if it never has.
create function public.stage_heartbeat_age(p_event uuid) returns int
language sql stable security definer set search_path = public, extensions
as $$
  select extract(epoch from (now() - seen_at))::int from public.stage_heartbeat where event_id = p_event
$$;

-- Stage display key: stored as a bcrypt hash; the clear key is shown once in the admin console.
create function public.set_stage_key(p_event uuid, p_key text, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if p_key is null or p_key !~ '^[A-Za-z0-9_-]{16,64}$' then
    return jsonb_build_object('status', 'INVALID_KEY');
  end if;
  update public.events set display_key_hash = crypt(p_key, gen_salt('bf')) where id = p_event;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'set_stage_key', 'event', p_event::text, '{}'::jsonb);
  return jsonb_build_object('status', 'OK');
end $$;

-- Short fingerprint of the current key. The stage cookie carries it, so rotating the key signs displays out.
create function public.stage_key_tag(p_event uuid) returns text
language sql stable security definer set search_path = public, extensions
as $$
  select left(md5(display_key_hash), 12) from public.events where id = p_event and display_key_hash is not null
$$;

create function public.verify_stage_key(p_event uuid, p_key text, p_ip_key text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  if (select count(*) from public.auth_attempts
       where scope = 'stage_ip' and key = p_ip_key and not success and at > now() - interval '5 minutes') >= 20 then
    return jsonb_build_object('status', 'LOCKED');
  end if;
  select display_key_hash into v_hash from public.events where id = p_event;
  if v_hash is null then
    return jsonb_build_object('status', 'NOT_SET');
  end if;
  if p_key is null or crypt(p_key, v_hash) <> v_hash then
    insert into public.auth_attempts (scope, key, success) values ('stage_ip', p_ip_key, false);
    return jsonb_build_object('status', 'INVALID');
  end if;
  return jsonb_build_object('status', 'OK', 'tag', public.stage_key_tag(p_event));
end $$;

select public.lock_down_public();
```
- [ ] **Step 4: Run the database tests to verify they pass**

Run: `npm run db:reset && npm run test:db`
Expected: all files pass. The assertion "NO name, outlet or department before confirmation" is the database half of the stage rule.

- [ ] **Step 5: Commit**

```bash
git add supabase
git commit -m "feat(db): stage state, options, heartbeat and display key"
```

---

## Task 20: `draw_prize`, `draw_current` and number lookup

**Files:**
- Create: `supabase/migrations/20261115000004_draw_functions.sql`, `supabase/tests/database/010_draw.test.sql`

**Interfaces:**
- Consumes: Tasks 17–19 (`stage_publish`, `get_stage`, `stage_heartbeat_age`, `actor_type_of`, `audit`).
- Produces:
  - `round_json(p_event, p_round) → jsonb` — the **operator view** of a round (names included): `{round_id, prize:{id,name,tier,quantity,batch}, pending, draws:[{id, slot, status, number, name, outlet, department, drawn_at, redraw_of}]}` with the latest row per slot. Never sent to the stage.
  - `draw_prize(p_event, p_prize_id, p_request_id uuid, p_actor) → jsonb` = `{status:'DRAWN', idempotent, short_by} || round_json(...)`, or `{status:'DRAW_IN_PROGRESS', round_id}`, `PRIZE_NOT_FOUND`, `PRIZE_COMPLETE`, `NO_ELIGIBLE_GUESTS`, `INVALID`. A repeat of `p_request_id` returns the same round with `idempotent:true`. Single prizes draw the lowest free slot; batch prizes draw every free slot; a redraw reuses the round of the slot it replaces and sets `redraw_of`. The stage is published in the same transaction (phase `rolling`, numbers only).
  - `draw_current(p_event) → {status:'OK', round: round_json|null, oldest_pending_at, stage:{rev,phase,options}, heartbeat_age}` — the newest round and the stage connection, for the operator's 2-second poll.
  - `lookup_prize_number(p_event, p_number int) → jsonb` — `NO_SUCH_NUMBER`; `NOT_A_WINNER {number,name,outlet,department}`; `PENDING` / `WINNER {…, draw_id, slot, prize:{id,name,tier,quantity}}`.
  - Lock order: draw advisory lock (`hashtextextended('draw:'||event, 0)`) → prize row → draw rows. No Plan 1 function takes the draw lock, so there is no cycle with the guest lock and `events` row used by `check_in`.

- [ ] **Step 1: Write the failing database test**

`supabase/tests/database/010_draw.test.sql`:
```sql
begin;
select * from no_plan();

-- Fixtures: events a (single prizes), b (eligibility), c (batch), d (redraw), e (no-show stays eligible), f (empty)
insert into events (id, name, event_date)
select ('00000000-0000-4000-8000-0000000000' || x)::uuid, 'T' || x, '2026-12-10' from unnest(array['a1','b1','c1','d1','e1','f1']) x;

create function pg_temp.mk_guests(p_event text, p_n int, p_start int default 1) returns void language sql as $f$
  insert into guests (id, event_id, employee_id, full_name, outlet, department)
  select ('00000000-0000-4000-8000-' || substr(p_event,1,2) || lpad(i::text, 10, '0'))::uuid,
         ('00000000-0000-4000-8000-0000000000' || p_event)::uuid, p_event || i, 'Guest ' || p_event || i, 'Outlet ' || p_event, 'Dept'
    from generate_series(p_start, p_start + p_n - 1) i;
  insert into check_ins (event_id, guest_id, method, prize_number)
  select ('00000000-0000-4000-8000-0000000000' || p_event)::uuid,
         ('00000000-0000-4000-8000-' || substr(p_event,1,2) || lpad(i::text, 10, '0'))::uuid, 'manual', i
    from generate_series(p_start, p_start + p_n - 1) i;
$f$;
select pg_temp.mk_guests('a1', 6);
select pg_temp.mk_guests('c1', 5);
select pg_temp.mk_guests('d1', 3);
select pg_temp.mk_guests('e1', 1);

insert into prizes (id, event_id, name, tier, quantity, draw_as_batch) values
 ('00000000-0000-4000-8000-00000000a101', '00000000-0000-4000-8000-0000000000a1', 'Grand', 'grand', 1, false),
 ('00000000-0000-4000-8000-00000000a102', '00000000-0000-4000-8000-0000000000a1', 'Second', 'major', 2, false),
 ('00000000-0000-4000-8000-00000000c101', '00000000-0000-4000-8000-0000000000c1', 'Voucher', 'minor', 3, true),
 ('00000000-0000-4000-8000-00000000c102', '00000000-0000-4000-8000-0000000000c1', 'Mug', 'minor', 4, true),
 ('00000000-0000-4000-8000-00000000d101', '00000000-0000-4000-8000-0000000000d1', 'Speaker', 'major', 2, false),
 ('00000000-0000-4000-8000-00000000e101', '00000000-0000-4000-8000-0000000000e1', 'P1', 'major', 1, false),
 ('00000000-0000-4000-8000-00000000e102', '00000000-0000-4000-8000-0000000000e1', 'P2', 'major', 1, false),
 ('00000000-0000-4000-8000-00000000f101', '00000000-0000-4000-8000-0000000000f1', 'Empty', 'major', 1, false);

-- b: 3 guests; one not checked in, one checked in but inactive, one eligible
insert into guests (id, event_id, employee_id, full_name, outlet, active) values
 ('00000000-0000-4000-8000-b100000000b1', '00000000-0000-4000-8000-0000000000b1', 'B1', 'Absent', 'O', true),
 ('00000000-0000-4000-8000-b100000000b2', '00000000-0000-4000-8000-0000000000b1', 'B2', 'Inactive', 'O', false),
 ('00000000-0000-4000-8000-b100000000b3', '00000000-0000-4000-8000-0000000000b1', 'B3', 'Eligible', 'O', true);
insert into check_ins (event_id, guest_id, method, prize_number) values
 ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-b100000000b2', 'manual', 1),
 ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-b100000000b3', 'manual', 2);
insert into prizes (id, event_id, name, tier, quantity, draw_as_batch) values
 ('00000000-0000-4000-8000-00000000b101', '00000000-0000-4000-8000-0000000000b1', 'PB', 'major', 1, false);

-- unknown prize, invalid request
select is(draw_prize('00000000-0000-4000-8000-0000000000a1', gen_random_uuid(), gen_random_uuid(), 'draw')->>'status', 'PRIZE_NOT_FOUND', 'unknown prize');
select is(draw_prize('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000a101', null, 'draw')->>'status', 'INVALID', 'request id required');
select is(draw_prize('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c101', gen_random_uuid(), 'draw')->>'status', 'PRIZE_NOT_FOUND', 'a prize of another event is not found');
select is(draw_prize('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-00000000f101', gen_random_uuid(), 'draw')->>'status', 'NO_ELIGIBLE_GUESTS', 'nobody checked in');

-- eligibility
select is(draw_prize('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000b101', gen_random_uuid(), 'draw')->'draws'->0->>'name', 'Eligible', 'only checked-in active guests are drawn');

-- single draw
create temp table r1 as select draw_prize('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000a101', '00000000-0000-4000-8000-00000000aa01', 'draw') as j;
select is((select j->>'status' from r1), 'DRAWN', 'a single draw');
select is((select j->>'short_by' from r1), '0', 'not short');
select is(jsonb_array_length((select j->'draws' from r1)), 1, 'one winner');
select is((select j->'draws'->0->>'slot' from r1), '1', 'slot 1');
select is((select j->'draws'->0->>'status' from r1), 'drawn', 'status drawn');
select ok((select j->'draws'->0->>'name' from r1) like 'Guest a1%', 'the operator gets the name');
select is((select j->>'pending' from r1), '1', 'one pending');
select is(get_stage('00000000-0000-4000-8000-0000000000a1')->>'phase', 'rolling', 'the stage is rolling');
select is(get_stage('00000000-0000-4000-8000-0000000000a1')::text ~* 'Guest a1', false, 'the stage payload has no name');
select is(get_stage('00000000-0000-4000-8000-0000000000a1')->'payload'->'slots'->0->>'number', (select j->'draws'->0->>'number' from r1), 'the stage shows the number');

-- retry, and a second draw while one is open
select is(draw_prize('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000a101', '00000000-0000-4000-8000-00000000aa01', 'draw')->>'idempotent', 'true', 'the same request id replays');
select is(draw_prize('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000a101', '00000000-0000-4000-8000-00000000aa01', 'draw')->'draws'->0->>'id', (select j->'draws'->0->>'id' from r1), 'and returns the same draw');
select is((select count(*)::int from draws where event_id = '00000000-0000-4000-8000-0000000000a1'), 1, 'a replay creates no rows');
select is(draw_prize('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000a102', gen_random_uuid(), 'draw')->>'status', 'DRAW_IN_PROGRESS', 'another prize while one is open');
select is(draw_prize('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000a101', gen_random_uuid(), 'draw')->>'status', 'DRAW_IN_PROGRESS', 'the same prize while one is open');

-- draw_current
select is(draw_current('00000000-0000-4000-8000-0000000000a1')->>'status', 'OK', 'draw_current ok');
select is(draw_current('00000000-0000-4000-8000-0000000000a1')->'round'->>'pending', '1', 'draw_current shows the pending draw');
select is(draw_current('00000000-0000-4000-8000-0000000000a1')->'stage'->>'phase', 'rolling', 'and the stage phase');
select isnt(draw_current('00000000-0000-4000-8000-0000000000a1')->>'oldest_pending_at', null, 'and when it was drawn');
select is(draw_current('00000000-0000-4000-8000-0000000000f1')->'round', 'null'::jsonb, 'no round yet on an empty event');

-- complete prize; one prize per person
update draws set status = 'confirmed' where event_id = '00000000-0000-4000-8000-0000000000a1';
select is(draw_prize('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000a101', gen_random_uuid(), 'draw')->>'status', 'PRIZE_COMPLETE', 'a one-slot prize is complete after confirmation');
create temp table r2 as select draw_prize('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000a102', gen_random_uuid(), 'draw') as j;
select is((select j->>'status' from r2), 'DRAWN', 'second prize, slot 1');
select is((select j->'draws'->0->>'slot' from r2), '1', 'slot 1 of Second');
select isnt((select j->'draws'->0->>'id' from r2), (select j->'draws'->0->>'id' from r1), 'a different draw');
select is((select count(distinct winner_guest_id)::int from draws where event_id = '00000000-0000-4000-8000-0000000000a1'), 2, 'the Grand winner cannot win again');
update draws set status = 'confirmed' where status = 'drawn' and event_id = '00000000-0000-4000-8000-0000000000a1';
create temp table r3 as select draw_prize('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000a102', gen_random_uuid(), 'draw') as j;
select is((select j->'draws'->0->>'slot' from r3), '2', 'the next draw takes slot 2');
select is((select j->'draws'->0->>'name' from r3) = any (select full_name from guests g join draws d on d.winner_guest_id = g.id where d.status = 'confirmed'), false, 'a confirmed winner is out of the pool');
select is((select j->>'pending' from r3), '1', 'a new round with one pending (the round of slot 2)');
select isnt((select j->>'round_id' from r3), (select j->>'round_id' from r2), 'single draws of one prize are separate rounds');

-- batch
create temp table rb as select draw_prize('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000c101', gen_random_uuid(), 'draw') as j;
select is(jsonb_array_length((select j->'draws' from rb)), 3, 'a batch draws all remaining slots at once');
select is((select count(distinct d->>'number')::int from jsonb_array_elements((select j->'draws' from rb)) d), 3, 'three different winners');
select is((select string_agg(d->>'slot', ',' order by (d->>'slot')::int) from jsonb_array_elements((select j->'draws' from rb)) d), '1,2,3', 'slots 1 to 3');
select is(jsonb_array_length(get_stage('00000000-0000-4000-8000-0000000000c1')->'payload'->'slots'), 3, 'the stage has three tiles');
select is(get_stage('00000000-0000-4000-8000-0000000000c1')::text ~* 'Guest c1', false, 'and no names');
update draws set status = 'confirmed' where event_id = '00000000-0000-4000-8000-0000000000c1';

-- short batch: pool 2, needs 4
create temp table rs as select draw_prize('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000c102', gen_random_uuid(), 'draw') as j;
select is((select j->>'status' from rs), 'DRAWN', 'short batch still draws');
select is((select j->>'short_by' from rs), '2', 'short_by reports the missing winners');
select is(jsonb_array_length((select j->'draws' from rs)), 2, 'everyone left is drawn');
update draws set status = 'confirmed' where event_id = '00000000-0000-4000-8000-0000000000c1';
select is(draw_prize('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000c102', gen_random_uuid(), 'draw')->>'status', 'NO_ELIGIBLE_GUESTS', 'the pool is empty');

-- redraw after a no-show stays in the round, takes the same slot, skips that guest
create temp table rd1 as select draw_prize('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000d101', gen_random_uuid(), 'draw') as j;
update draws set status = 'void_no_show' where id = ((select j->'draws'->0->>'id' from rd1))::uuid;
create temp table rd2 as select draw_prize('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000d101', gen_random_uuid(), 'draw') as j;
select is((select j->'draws'->0->>'slot' from rd2), '1', 'the redraw takes the lowest free slot');
select is((select j->>'round_id' from rd2), (select j->>'round_id' from rd1), 'in the same round');
select is((select j->'draws'->0->>'redraw_of' from rd2), (select j->'draws'->0->>'id' from rd1), 'redraw_of points at the void draw');
select isnt((select j->'draws'->0->>'number' from rd2), (select j->'draws'->0->>'number' from rd1), 'the no-show is skipped for that slot');
select is(jsonb_array_length((select j->'draws' from rd2)), 1, 'the round shows the latest row per slot');
select is(get_stage('00000000-0000-4000-8000-0000000000d1')->>'phase', 'rolling', 'the stage rolls again');

-- a no-show stays eligible for other prizes
create temp table re1 as select draw_prize('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-00000000e101', gen_random_uuid(), 'draw') as j;
update draws set status = 'void_no_show' where event_id = '00000000-0000-4000-8000-0000000000e1';
select is(draw_prize('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-00000000e102', gen_random_uuid(), 'draw')->>'status', 'DRAWN', 'a no-show can win a different prize');
update draws set status = 'void_no_show' where event_id = '00000000-0000-4000-8000-0000000000e1' and status = 'drawn';
select is(draw_prize('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-00000000e101', gen_random_uuid(), 'draw')->>'status', 'NO_ELIGIBLE_GUESTS', 'but not the same slot again');

-- lookup_prize_number (event a: slot-2 draw of Second is pending, others confirmed)
select is(lookup_prize_number('00000000-0000-4000-8000-0000000000a1', 999)->>'status', 'NO_SUCH_NUMBER', 'unknown number');
select is(lookup_prize_number('00000000-0000-4000-8000-0000000000a1', (select (j->'draws'->0->>'number')::int from r1))->>'status', 'WINNER', 'a confirmed winner');
select is(lookup_prize_number('00000000-0000-4000-8000-0000000000a1', (select (j->'draws'->0->>'number')::int from r1))->'prize'->>'name', 'Grand', 'with the prize');
select is(lookup_prize_number('00000000-0000-4000-8000-0000000000a1', (select (j->'draws'->0->>'number')::int from r3))->>'status', 'PENDING', 'a pending winner');
select isnt(lookup_prize_number('00000000-0000-4000-8000-0000000000a1', (select (j->'draws'->0->>'number')::int from r3))->>'draw_id', null, 'carries the draw id');
select is(lookup_prize_number('00000000-0000-4000-8000-0000000000e1', 1)->>'status', 'NOT_A_WINNER', 'a voided draw is not a win');
select is(lookup_prize_number('00000000-0000-4000-8000-0000000000e1', 1)->>'name', 'Guest e11', 'the name is still shown');

-- audit
select ok((select count(*) from audit_log where action = 'draw') >= 8, 'draws are audited');
select is((select count(*)::int from audit_log where action = 'draw' and details::text ~* 'Guest'), 0, 'the audit log never holds a name');

select * from finish();
rollback;
```
- [ ] **Step 2: Run it to verify it fails**

Run: `npm run db:reset && npm run test:db`
Expected: `010_draw.test.sql` fails (`function draw_prize(uuid, uuid, uuid, unknown) does not exist`).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261115000004_draw_functions.sql`:
```sql
-- Operator view of one round: latest row per slot, WITH names. Never sent to the projector.
create function public.round_json(p_event uuid, p_round uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object(
    'round_id', p_round,
    'prize', jsonb_build_object('id', pr.id, 'name', pr.name, 'tier', pr.tier, 'quantity', pr.quantity, 'batch', pr.draw_as_batch),
    'pending', (select count(*) from public.draws d where d.event_id = p_event and d.round_id = p_round and d.status = 'drawn'),
    'draws', (
      select coalesce(jsonb_agg(x.j order by x.slot), '[]'::jsonb)
      from (
        select distinct on (d.slot) d.slot,
               jsonb_build_object('id', d.id, 'slot', d.slot, 'status', d.status, 'number', c.prize_number,
                                  'name', g.full_name, 'outlet', g.outlet, 'department', g.department,
                                  'drawn_at', d.drawn_at, 'redraw_of', d.redraw_of) as j
          from public.draws d
          join public.check_ins c on c.guest_id = d.winner_guest_id
          join public.guests g on g.id = d.winner_guest_id
         where d.event_id = p_event and d.round_id = p_round
         order by d.slot, d.sequence desc
      ) x))
  from public.prizes pr
  where pr.id = (select d.prize_id from public.draws d where d.event_id = p_event and d.round_id = p_round limit 1)
$$;

create function public.draw_prize(p_event uuid, p_prize_id uuid, p_request_id uuid, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  pr public.prizes%rowtype;
  v_prev public.draws%rowtype;
  v_round uuid;
  v_free int[];
  v_slots int[];
  v_picked uuid[];
  v_need int;
  v_short int;
  i int;
begin
  if p_request_id is null then
    return jsonb_build_object('status', 'INVALID');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('draw:' || p_event::text, 0));

  -- 1. A retry of the same request returns the same draw.
  select d.round_id into v_round from public.draws d where d.event_id = p_event and d.request_group = p_request_id limit 1;
  if found then
    return jsonb_build_object('status', 'DRAWN', 'idempotent', true, 'short_by', 0) || public.round_json(p_event, v_round);
  end if;

  -- 2. One unresolved draw at a time, for the whole event.
  select d.round_id into v_round from public.draws d where d.event_id = p_event and d.status = 'drawn' limit 1;
  if found then
    return jsonb_build_object('status', 'DRAW_IN_PROGRESS', 'round_id', v_round);
  end if;

  select * into pr from public.prizes where id = p_prize_id and event_id = p_event for update;
  if not found then
    return jsonb_build_object('status', 'PRIZE_NOT_FOUND');
  end if;

  select coalesce(array_agg(s order by s), '{}') into v_free
    from generate_series(1, pr.quantity) s
   where not exists (select 1 from public.draws d where d.prize_id = pr.id and d.slot = s and d.status in ('drawn', 'confirmed'));
  if cardinality(v_free) = 0 then
    return jsonb_build_object('status', 'PRIZE_COMPLETE');
  end if;
  v_need := case when pr.draw_as_batch then cardinality(v_free) else 1 end;
  v_slots := v_free[1:v_need];

  -- 3. Pool: checked in, active, no live win. Someone who was a no-show for this very slot is skipped for that slot.
  select coalesce(array_agg(guest_id order by rn), '{}') into v_picked
    from (
      select c.guest_id, row_number() over (order by gen_random_uuid()) as rn
        from public.check_ins c
        join public.guests gu on gu.id = c.guest_id
       where c.event_id = p_event and gu.active
         and not exists (select 1 from public.draws d
                          where d.winner_guest_id = c.guest_id and d.status in ('drawn', 'confirmed'))
         and not exists (select 1 from public.draws d
                          where d.winner_guest_id = c.guest_id and d.prize_id = pr.id
                            and d.slot = any (v_slots) and d.status in ('void_no_show', 'void_admin'))
    ) pool
   where rn <= v_need;
  if cardinality(v_picked) = 0 then
    return jsonb_build_object('status', 'NO_ELIGIBLE_GUESTS');
  end if;
  v_short := v_need - cardinality(v_picked);

  -- 4. A redraw stays in the round of the slot it replaces.
  select d.round_id into v_round from public.draws d
   where d.prize_id = pr.id and d.slot = any (v_slots[1:cardinality(v_picked)]) and d.status in ('void_no_show', 'void_admin')
   order by d.sequence desc limit 1;
  v_round := coalesce(v_round, gen_random_uuid());

  for i in 1 .. cardinality(v_picked) loop
    select * into v_prev from public.draws d where d.prize_id = pr.id and d.slot = v_slots[i] order by d.sequence desc limit 1;
    insert into public.draws (event_id, prize_id, slot, winner_guest_id, status, request_id, request_group, round_id, redraw_of, drawn_by)
    values (p_event, pr.id, v_slots[i], v_picked[i], 'drawn', gen_random_uuid(), p_request_id, v_round,
            case when found then v_prev.id end, p_actor);
  end loop;

  perform public.stage_publish(p_event, v_round);
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'draw', 'prize', pr.id::text,
                       jsonb_build_object('round_id', v_round, 'slots', to_jsonb(v_slots[1:cardinality(v_picked)]), 'short_by', v_short));
  return jsonb_build_object('status', 'DRAWN', 'idempotent', false, 'short_by', v_short) || public.round_json(p_event, v_round);
end $$;

-- What the operator phone polls every 2 seconds.
create function public.draw_current(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  v_round uuid;
  v_stage jsonb := public.get_stage(p_event);
begin
  select d.round_id into v_round from public.draws d where d.event_id = p_event order by d.sequence desc limit 1;
  return jsonb_build_object(
    'status', 'OK',
    'round', case when v_round is null then null else public.round_json(p_event, v_round) end,
    'oldest_pending_at', (select min(d.drawn_at) from public.draws d where d.event_id = p_event and d.status = 'drawn'),
    'stage', jsonb_build_object('rev', v_stage->'rev', 'phase', v_stage->'phase', 'options', v_stage->'options'),
    'heartbeat_age', public.stage_heartbeat_age(p_event));
end $$;

-- Prize verification: who holds this Door Prize number, and did they win?
create function public.lookup_prize_number(p_event uuid, p_number int) returns jsonb
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  c record;
  w record;
begin
  select ci.guest_id, ci.prize_number, g.full_name, g.outlet, g.department into c
    from public.check_ins ci join public.guests g on g.id = ci.guest_id
   where ci.event_id = p_event and ci.prize_number = p_number;
  if not found then
    return jsonb_build_object('status', 'NO_SUCH_NUMBER');
  end if;
  select d.id, d.status, d.slot, pr.id as prize_id, pr.name as prize_name, pr.tier, pr.quantity into w
    from public.draws d join public.prizes pr on pr.id = d.prize_id
   where d.winner_guest_id = c.guest_id and d.status in ('drawn', 'confirmed')
   limit 1;
  if not found then
    return jsonb_build_object('status', 'NOT_A_WINNER', 'number', c.prize_number, 'name', c.full_name,
                              'outlet', c.outlet, 'department', c.department);
  end if;
  return jsonb_build_object(
    'status', case when w.status = 'confirmed' then 'WINNER' else 'PENDING' end,
    'number', c.prize_number, 'name', c.full_name, 'outlet', c.outlet, 'department', c.department,
    'draw_id', w.id, 'slot', w.slot,
    'prize', jsonb_build_object('id', w.prize_id, 'name', w.prize_name, 'tier', w.tier, 'quantity', w.quantity));
end $$;

select public.lock_down_public();
```
- [ ] **Step 4: Run the database tests to verify they pass**

Run: `npm run db:reset && npm run test:db`
Expected: all files pass.

- [ ] **Step 5: Commit**

```bash
git add supabase
git commit -m "feat(db): draw_prize with idempotent retries, batch draws and redraws"
```

---

## Task 21: `resolve_draw`, `resolve_round` and `admin_void_draw`

**Files:**
- Create: `supabase/migrations/20261115000005_resolve_functions.sql`, `supabase/tests/database/011_resolve.test.sql`

**Interfaces:**
- Consumes: Task 20 (`round_json`), Task 19 (`stage_publish`, `stage_write`).
- Produces:
  - `resolve_draw(p_event, p_draw_id, p_outcome text, p_actor) → jsonb` with `p_outcome` `confirm` | `no_show`: `CONFIRMED`, `VOIDED`, `ALREADY_CONFIRMED` (also returned when the MC tries to void a confirmed draw), `DRAW_VOID` (confirming a void draw), `NOT_FOUND`, `INVALID`. Every success also carries `draw_id` and `round_json`. The stage is republished in the same transaction: `confirm` adds `name`, `outlet`, `department` to that slot.
  - `resolve_round(p_event, p_round, p_actor) → {status:'CONFIRMED', confirmed:n, …round_json}` or `NOTHING_TO_CONFIRM` — confirms every open tile of a batch.
  - `admin_void_draw(p_event, p_draw_id, p_reason, p_actor) → {status, draw_id?}`: `OK`, `REASON_REQUIRED` (5+ characters after trimming), `NOT_FOUND`, `NOT_VOIDABLE` (already void). Works on `drawn` and `confirmed` draws; the slot becomes free and the voided guest is skipped for that slot on the redraw. If the stage is showing that round it returns to idle.

- [ ] **Step 1: Write the failing database test**

`supabase/tests/database/011_resolve.test.sql`:
```sql
begin;
select * from no_plan();

insert into events (id, name, event_date) values
 ('00000000-0000-4000-8000-0000000000a2', 'T', '2026-12-10'), ('00000000-0000-4000-8000-0000000000a3', 'Other', '2026-12-10');
insert into guests (id, event_id, employee_id, full_name, outlet, department)
select ('00000000-0000-4000-8000-a2' || lpad(i::text, 10, '0'))::uuid, '00000000-0000-4000-8000-0000000000a2', 'R' || i, 'Rguest ' || i, 'Outlet R', 'Dept R'
  from generate_series(1, 12) i;
insert into check_ins (event_id, guest_id, method, prize_number)
select '00000000-0000-4000-8000-0000000000a2', ('00000000-0000-4000-8000-a2' || lpad(i::text, 10, '0'))::uuid, 'manual', i from generate_series(1, 12) i;
insert into prizes (id, event_id, name, tier, quantity, draw_as_batch) values
 ('00000000-0000-4000-8000-00000000a201', '00000000-0000-4000-8000-0000000000a2', 'Single', 'major', 3, false),
 ('00000000-0000-4000-8000-00000000a202', '00000000-0000-4000-8000-0000000000a2', 'Batch', 'minor', 3, true);

-- confirm
create temp table d1 as select draw_prize('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000a201', gen_random_uuid(), 'draw') as j;
create temp table id1 as select (j->'draws'->0->>'id')::uuid as id, j->'draws'->0->>'name' as name from d1;
select is(resolve_draw('00000000-0000-4000-8000-0000000000a2', (select id from id1), 'maybe', 'draw')->>'status', 'INVALID', 'bad outcome');
select is(resolve_draw('00000000-0000-4000-8000-0000000000a2', gen_random_uuid(), 'confirm', 'draw')->>'status', 'NOT_FOUND', 'unknown draw');
select is(resolve_draw('00000000-0000-4000-8000-0000000000a3', (select id from id1), 'confirm', 'draw')->>'status', 'NOT_FOUND', 'a draw of another event');
select is(get_stage('00000000-0000-4000-8000-0000000000a2')::text ~* 'Rguest', false, 'no name before confirmation');
select is(resolve_draw('00000000-0000-4000-8000-0000000000a2', (select id from id1), 'confirm', 'draw')->>'status', 'CONFIRMED', 'confirm');
select is((select status from draws where id = (select id from id1)), 'confirmed', 'row confirmed');
select isnt((select resolved_at from draws where id = (select id from id1)), null, 'resolved_at set');
select is((select resolved_by from draws where id = (select id from id1)), 'draw', 'resolved_by set');
select is(get_stage('00000000-0000-4000-8000-0000000000a2')->>'phase', 'revealed', 'the stage is revealed');
select is(get_stage('00000000-0000-4000-8000-0000000000a2')->'payload'->'slots'->0->>'name', (select name from id1), 'the stage now shows the name');
select is(get_stage('00000000-0000-4000-8000-0000000000a2')->'payload'->'slots'->0->>'outlet', 'Outlet R', 'and the outlet');
select is(get_stage('00000000-0000-4000-8000-0000000000a2')->'payload'->'slots'->0->>'department', 'Dept R', 'and the department');
select is(resolve_draw('00000000-0000-4000-8000-0000000000a2', (select id from id1), 'confirm', 'draw')->>'status', 'ALREADY_CONFIRMED', 'a repeat is harmless');
select is(resolve_draw('00000000-0000-4000-8000-0000000000a2', (select id from id1), 'no_show', 'draw')->>'status', 'ALREADY_CONFIRMED', 'the MC cannot void a confirmed draw');
select is((select status from draws where id = (select id from id1)), 'confirmed', 'it stays confirmed');
select is((select rev from stage_state where event_id = '00000000-0000-4000-8000-0000000000a2')::text,
          (select rev from stage_state where event_id = '00000000-0000-4000-8000-0000000000a2')::text, 'rev stable');

-- no-show
create temp table d2 as select draw_prize('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000a201', gen_random_uuid(), 'draw') as j;
create temp table id2 as select (j->'draws'->0->>'id')::uuid as id, j->'draws'->0->>'name' as name from d2;
select is(resolve_draw('00000000-0000-4000-8000-0000000000a2', (select id from id2), 'no_show', 'draw')->>'status', 'VOIDED', 'no-show');
select is((select status from draws where id = (select id from id2)), 'void_no_show', 'row voided');
select is((select void_reason from draws where id = (select id from id2)), 'no_show', 'reason recorded');
select is(get_stage('00000000-0000-4000-8000-0000000000a2')->>'phase', 'void', 'the stage shows the void message');
select is(get_stage('00000000-0000-4000-8000-0000000000a2')::text ~* (select name from id2), false, 'a no-show is never named');
select is(resolve_draw('00000000-0000-4000-8000-0000000000a2', (select id from id2), 'no_show', 'draw')->>'status', 'VOIDED', 'repeat no-show is harmless');
select is(resolve_draw('00000000-0000-4000-8000-0000000000a2', (select id from id2), 'confirm', 'draw')->>'status', 'DRAW_VOID', 'cannot confirm a void draw');
select is(set_stage('00000000-0000-4000-8000-0000000000a2', 'intro', '00000000-0000-4000-8000-00000000a201', 'draw')->>'status', 'OK', 'the MC can move on after a void');

-- redraw replaces it in the same round
create temp table d3 as select draw_prize('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000a201', gen_random_uuid(), 'draw') as j;
select is((select j->>'round_id' from d3), (select j->>'round_id' from d2), 'the redraw is in the same round');
select resolve_draw('00000000-0000-4000-8000-0000000000a2', ((select j->'draws'->0->>'id' from d3))::uuid, 'confirm', 'draw');
select is(get_stage('00000000-0000-4000-8000-0000000000a2')->>'phase', 'revealed', 'revealed after the redraw is confirmed');
select is(get_stage('00000000-0000-4000-8000-0000000000a2')->'payload'->'slots'->0->>'name', (select j->'draws'->0->>'name' from d3), 'the stage shows the replacement');

-- batch: confirm one tile, then the rest
create temp table db as select draw_prize('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000a202', gen_random_uuid(), 'draw') as j;
select resolve_draw('00000000-0000-4000-8000-0000000000a2', ((select j->'draws'->0->>'id' from db))::uuid, 'confirm', 'draw');
select is(get_stage('00000000-0000-4000-8000-0000000000a2')->>'phase', 'rolling', 'a batch keeps rolling while tiles are open');
select is(get_stage('00000000-0000-4000-8000-0000000000a2')->'payload'->'slots'->0->>'state', 'revealed', 'tile 1 flipped');
select is(get_stage('00000000-0000-4000-8000-0000000000a2')->'payload'->'slots'->1->>'name', null, 'tile 2 still has no name');
select is(set_stage('00000000-0000-4000-8000-0000000000a2', 'idle', null, 'draw')->>'status', 'DRAW_IN_PROGRESS', 'the stage cannot be blanked mid-batch');
select is(resolve_round('00000000-0000-4000-8000-0000000000a2', ((select j->>'round_id' from db))::uuid, 'draw')->>'confirmed', '2', 'confirm all remaining tiles');
select is(get_stage('00000000-0000-4000-8000-0000000000a2')->>'phase', 'revealed', 'the batch is revealed');
select is((select count(*)::int from jsonb_array_elements(get_stage('00000000-0000-4000-8000-0000000000a2')->'payload'->'slots') s where s->>'name' is not null), 3, 'three names');
select is(resolve_round('00000000-0000-4000-8000-0000000000a2', ((select j->>'round_id' from db))::uuid, 'draw')->>'status', 'NOTHING_TO_CONFIRM', 'nothing left to confirm');

-- admin void
select is(admin_void_draw('00000000-0000-4000-8000-0000000000a2', (select id from id1), '', 'hr@example.com')->>'status', 'REASON_REQUIRED', 'reason required');
select is(admin_void_draw('00000000-0000-4000-8000-0000000000a2', (select id from id1), '  x ', 'hr@example.com')->>'status', 'REASON_REQUIRED', 'a blank reason is refused');
select is(admin_void_draw('00000000-0000-4000-8000-0000000000a2', gen_random_uuid(), 'wrong person', 'hr@example.com')->>'status', 'NOT_FOUND', 'unknown draw');
select is(admin_void_draw('00000000-0000-4000-8000-0000000000a3', (select id from id1), 'wrong person', 'hr@example.com')->>'status', 'NOT_FOUND', 'other event');
-- the stage shows the batch round; voiding an older single draw leaves it alone
select is(admin_void_draw('00000000-0000-4000-8000-0000000000a2', (select id from id1), 'Winner was a contractor', 'hr@example.com')->>'status', 'OK', 'admin void of a confirmed draw');
select is((select status from draws where id = (select id from id1)), 'void_admin', 'row void_admin');
select is((select void_reason from draws where id = (select id from id1)), 'Winner was a contractor', 'reason saved');
select is(get_stage('00000000-0000-4000-8000-0000000000a2')->>'phase', 'revealed', 'an older round on no screen does not touch the stage');
select is(admin_void_draw('00000000-0000-4000-8000-0000000000a2', (select id from id1), 'again', 'hr@example.com')->>'status', 'NOT_VOIDABLE', 'already void');
-- voiding a draw that is on the projector blanks it
select is(admin_void_draw('00000000-0000-4000-8000-0000000000a2', ((select j->'draws'->2->>'id' from db))::uuid, 'Tile 3 was a mistake', 'hr@example.com')->>'status', 'OK', 'void a tile that is on screen');
select is(get_stage('00000000-0000-4000-8000-0000000000a2')->>'phase', 'idle', 'the stage returns to idle');
-- the freed slot can be drawn again and the voided guest is skipped for it
create temp table d4 as select draw_prize('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000a202', gen_random_uuid(), 'draw') as j;
select is((select j->'draws'->2->>'slot' from d4), '3', 'the freed slot is redrawn');
select is((select j->'draws'->2->>'redraw_of' from d4), (select j->'draws'->2->>'id' from db), 'linked to the voided draw');
select isnt((select j->'draws'->2->>'number' from d4), (select j->'draws'->2->>'number' from db), 'not the same guest');
select is((select count(*)::int from draws where status in ('drawn', 'confirmed') and event_id = '00000000-0000-4000-8000-0000000000a2'), 4, 'four live draws: one single, three batch tiles');
select is((select count(*)::int from (select winner_guest_id from draws where status in ('drawn', 'confirmed') group by 1 having count(*) > 1) x), 0, 'one prize per person holds');
-- voiding a pending draw
select is(admin_void_draw('00000000-0000-4000-8000-0000000000a2', ((select j->'draws'->2->>'id' from d4))::uuid, 'Operator error', 'hr@example.com')->>'status', 'OK', 'void a pending draw');
select is(set_stage('00000000-0000-4000-8000-0000000000a2', 'idle', null, 'draw')->>'status', 'OK', 'nothing pending, the stage is free again');

-- audit trail
select is((select count(*)::int from audit_log where action = 'draw_confirm'), 3, 'confirms audited');
select is((select count(*)::int from audit_log where action = 'draw_no_show'), 1, 'no-show audited');
select is((select count(*)::int from audit_log where action = 'draw_void_admin' and actor_type = 'admin' and actor = 'hr@example.com'), 3, 'admin voids audited with the admin as actor');
select is((select count(*)::int from audit_log where action = 'draw_void_admin' and details->>'reason' is not null), 3, 'with reasons');
select is((select count(*)::int from audit_log where action = 'draw_confirm_round'), 1, 'confirm-all audited');

select * from finish();
rollback;
```
- [ ] **Step 2: Run it to verify it fails**

Run: `npm run db:reset && npm run test:db`
Expected: `011_resolve.test.sql` fails (`function resolve_draw(...) does not exist`).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261115000005_resolve_functions.sql`:
```sql
create function public.resolve_draw(p_event uuid, p_draw_id uuid, p_outcome text, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  d public.draws%rowtype;
  v_status text;
begin
  if p_outcome not in ('confirm', 'no_show') then
    return jsonb_build_object('status', 'INVALID');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('draw:' || p_event::text, 0));
  select * into d from public.draws where id = p_draw_id and event_id = p_event for update;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;

  if d.status = 'confirmed' then
    return jsonb_build_object('status', 'ALREADY_CONFIRMED', 'draw_id', d.id) || public.round_json(p_event, d.round_id);
  elsif d.status = 'void_admin' or (d.status = 'void_no_show' and p_outcome = 'confirm') then
    return jsonb_build_object('status', 'DRAW_VOID', 'draw_id', d.id) || public.round_json(p_event, d.round_id);
  elsif d.status = 'void_no_show' then
    return jsonb_build_object('status', 'VOIDED', 'draw_id', d.id) || public.round_json(p_event, d.round_id);
  end if;

  if p_outcome = 'confirm' then
    update public.draws set status = 'confirmed', resolved_at = now(), resolved_by = p_actor where id = d.id;
    v_status := 'CONFIRMED';
  else
    update public.draws set status = 'void_no_show', resolved_at = now(), resolved_by = p_actor, void_reason = 'no_show' where id = d.id;
    v_status := 'VOIDED';
  end if;
  perform public.stage_publish(p_event, d.round_id);
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor,
                       case when p_outcome = 'confirm' then 'draw_confirm' else 'draw_no_show' end,
                       'draw', d.id::text, jsonb_build_object('prize_id', d.prize_id, 'slot', d.slot));
  return jsonb_build_object('status', v_status, 'draw_id', d.id) || public.round_json(p_event, d.round_id);
end $$;

-- "Konfirmasi semua": confirm every unresolved tile of a batch round in one tap.
create function public.resolve_round(p_event uuid, p_round uuid, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_n int;
begin
  perform pg_advisory_xact_lock(hashtextextended('draw:' || p_event::text, 0));
  update public.draws set status = 'confirmed', resolved_at = now(), resolved_by = p_actor
   where event_id = p_event and round_id = p_round and status = 'drawn';
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return jsonb_build_object('status', 'NOTHING_TO_CONFIRM');
  end if;
  perform public.stage_publish(p_event, p_round);
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'draw_confirm_round', 'round', p_round::text,
                       jsonb_build_object('confirmed', v_n));
  return jsonb_build_object('status', 'CONFIRMED', 'confirmed', v_n) || public.round_json(p_event, p_round);
end $$;

-- Reverses a draw (confirmed or not). Admin only; the reason is mandatory. The stage returns to idle if it was showing that round.
create function public.admin_void_draw(p_event uuid, p_draw_id uuid, p_reason text, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  d public.draws%rowtype;
begin
  if p_reason is null or length(btrim(p_reason)) < 5 then
    return jsonb_build_object('status', 'REASON_REQUIRED');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('draw:' || p_event::text, 0));
  select * into d from public.draws where id = p_draw_id and event_id = p_event for update;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  if d.status in ('void_no_show', 'void_admin') then
    return jsonb_build_object('status', 'NOT_VOIDABLE');
  end if;
  update public.draws
     set status = 'void_admin', void_reason = btrim(p_reason), resolved_at = now(), resolved_by = p_actor
   where id = d.id;
  if (select s.payload->>'round_id' from public.stage_state s where s.event_id = p_event) = d.round_id::text then
    perform public.stage_write(p_event, 'idle', '{}'::jsonb);
  end if;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'draw_void_admin', 'draw', d.id::text,
                       jsonb_build_object('prize_id', d.prize_id, 'slot', d.slot, 'was', d.status, 'reason', btrim(p_reason)));
  return jsonb_build_object('status', 'OK', 'draw_id', d.id);
end $$;

select public.lock_down_public();
```
- [ ] **Step 4: Run the database tests to verify they pass**

Run: `npm run db:reset && npm run test:db`
Expected: all files pass.

- [ ] **Step 5: Commit**

```bash
git add supabase
git commit -m "feat(db): confirm, no-show and admin void of draws"
```

---

## Task 22: Dashboard, lists, report rows and the replacement rehearsal reset

**Files:**
- Create: `supabase/migrations/20261115000006_admin_draw_views.sql`, `supabase/tests/database/012_admin_views.test.sql`

**Interfaces:**
- Consumes: Tasks 17–21, Plan 1's `event_counts`, `reset_rehearsal_data`.
- Produces:
  - `reset_rehearsal_data(p_event, p_actor)` **replaced**: also deletes `draws` and `stage_heartbeat`, sets the stage to `idle` with an empty payload and a higher `rev` (open displays update), keeps guests, RSVPs, PINs, prizes, stage key and stage options. `NOT_REHEARSAL` on a live event, with nothing deleted.
  - `admin_dashboard(p_event) → {counts, outlets:[{outlet,total,rsvp_yes,checked_in,redeemed}], prizes:[prize_list rows], draw:{confirmed,pending,no_shows,admin_voids,eligible}, stage:{phase,rev,heartbeat_age}, recent:[{at,actor,action}]}`.
  - `admin_draw_list(p_event) → {status:'OK', draws:[{id, prize, slot, quantity, number, name, outlet, department, status, drawn_at, resolved_at, resolved_by, void_reason, redraw_of}]}` newest first, 1,000 rows at most.
  - `admin_audit_list(p_event, p_before bigint|null, p_limit int) → {status:'OK', rows:[{id,at,actor_type,actor,action,entity,entity_id,details}]}` newest first, 200 rows at most; `p_before` pages.
  - `report_rows(p_event, p_report) → {status:'OK', rows:[…]}` for `guests`, `check_ins`, `merchandise`, `draws`, `audit`, `rsvp_pending`; `UNKNOWN_REPORT` otherwise. Column order is fixed in the application (Task 24), not here.

- [ ] **Step 1: Write the failing database test**

`supabase/tests/database/012_admin_views.test.sql`:
```sql
begin;
select * from no_plan();

insert into events (id, name, event_date) values ('00000000-0000-4000-8000-0000000000a4', 'T', '2026-12-10');
insert into guests (id, event_id, employee_id, full_name, outlet, department, phone, rsvp_status, first_opened_at)
select ('00000000-0000-4000-8000-a4' || lpad(i::text, 10, '0'))::uuid, '00000000-0000-4000-8000-0000000000a4', 'S' || i, 'Sguest ' || i,
       case when i <= 4 then 'Outlet A' else 'Outlet B' end, 'Dept', '+62811' || i,
       case when i <= 3 then 'yes' when i = 4 then 'no' else 'pending' end,
       case when i <= 5 then now() else null end
  from generate_series(1, 6) i;
insert into check_ins (event_id, guest_id, method, prize_number, station_label, actor)
select '00000000-0000-4000-8000-0000000000a4', ('00000000-0000-4000-8000-a4' || lpad(i::text, 10, '0'))::uuid, 'scan', i, 'Meja 1', 'checkin' from generate_series(1, 4) i;
insert into merchandise_redemptions (event_id, guest_id, station_label, actor)
values ('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-a40000000001', 'Booth', 'merchandise');
insert into prizes (id, event_id, name, tier, quantity, draw_as_batch) values
 ('00000000-0000-4000-8000-00000000a401', '00000000-0000-4000-8000-0000000000a4', 'Grand', 'grand', 1, false),
 ('00000000-0000-4000-8000-00000000a402', '00000000-0000-4000-8000-0000000000a4', 'Mugs', 'minor', 2, true);
select set_stage_options('00000000-0000-4000-8000-0000000000a4', '{"safe_mode":true}'::jsonb, 'hr@example.com');
select touch_stage_heartbeat('00000000-0000-4000-8000-0000000000a4');

create temp table g1 as select draw_prize('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-00000000a401', gen_random_uuid(), 'draw') as j;
select resolve_draw('00000000-0000-4000-8000-0000000000a4', ((select j->'draws'->0->>'id' from g1))::uuid, 'confirm', 'draw');
create temp table g2 as select draw_prize('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-00000000a402', gen_random_uuid(), 'draw') as j;
select resolve_draw('00000000-0000-4000-8000-0000000000a4', ((select j->'draws'->0->>'id' from g2))::uuid, 'no_show', 'draw');

-- dashboard
create temp table dash as select admin_dashboard('00000000-0000-4000-8000-0000000000a4') as j;
select is((select j->'counts'->>'total' from dash), '6', 'counts: total');
select is((select j->'counts'->>'checked_in' from dash), '4', 'counts: checked in');
select is((select j->'counts'->>'redeemed' from dash), '1', 'counts: merchandise');
select is((select jsonb_array_length(j->'outlets') from dash), 2, 'two outlets');
select is((select j->'outlets'->0->>'outlet' from dash), 'Outlet A', 'sorted by outlet');
select is((select j->'outlets'->0->>'total' from dash), '4', 'outlet A total');
select is((select j->'outlets'->0->>'checked_in' from dash), '4', 'outlet A checked in');
select is((select j->'outlets'->0->>'redeemed' from dash), '1', 'outlet A merchandise');
select is((select j->'outlets'->0->>'rsvp_yes' from dash), '3', 'outlet A rsvp yes');
select is((select j->'outlets'->1->>'checked_in' from dash), '0', 'outlet B checked in');
select is((select jsonb_array_length(j->'prizes') from dash), 2, 'prize status for both prizes');
select is((select j->'draw'->>'confirmed' from dash), '1', 'draw: confirmed');
select is((select j->'draw'->>'pending' from dash), '1', 'draw: pending');
select is((select j->'draw'->>'no_shows' from dash), '1', 'draw: no-shows');
select is((select j->'draw'->>'admin_voids' from dash), '0', 'draw: admin voids');
select is((select j->'draw'->>'eligible' from dash), '2', 'draw: still eligible (4 present, 2 live wins)');
select is((select j->'stage'->>'phase' from dash), 'rolling', 'stage phase');
select ok((select (j->'stage'->>'heartbeat_age')::int between 0 and 3 from dash), 'heartbeat age');
select ok((select jsonb_array_length(j->'recent') from dash) between 1 and 10, 'recent activity capped at 10');
select is((select j->'recent'->0->>'action' from dash), 'draw_no_show', 'newest first');

-- draw list
select is(jsonb_array_length(admin_draw_list('00000000-0000-4000-8000-0000000000a4')->'draws'), 3, 'three draws listed');
select is(admin_draw_list('00000000-0000-4000-8000-0000000000a4')->'draws'->0->>'status', 'drawn', 'newest first');
select ok(admin_draw_list('00000000-0000-4000-8000-0000000000a4')->'draws'->0 ? 'name', 'admin sees names');
select is(jsonb_array_length(admin_draw_list(gen_random_uuid())->'draws'), 0, 'another event lists nothing');

-- audit list
select ok(jsonb_array_length(admin_audit_list('00000000-0000-4000-8000-0000000000a4', null, 100)->'rows') >= 4, 'audit rows');
select is(jsonb_array_length(admin_audit_list('00000000-0000-4000-8000-0000000000a4', null, 2)->'rows'), 2, 'limit honoured');
select is(jsonb_array_length(admin_audit_list('00000000-0000-4000-8000-0000000000a4', null, 100000)->'rows') <= 200, true, 'limit capped at 200');
select is((select max((r->>'id')::bigint) from jsonb_array_elements(admin_audit_list('00000000-0000-4000-8000-0000000000a4', (select max(id) from audit_log), 100)->'rows') r) < (select max(id) from audit_log), true, 'paging by before-id');

-- reports
select is(report_rows('00000000-0000-4000-8000-0000000000a4', 'nope')->>'status', 'UNKNOWN_REPORT', 'unknown report');
select is(jsonb_array_length(report_rows('00000000-0000-4000-8000-0000000000a4', 'guests')->'rows'), 6, 'guests report');
select is(report_rows('00000000-0000-4000-8000-0000000000a4', 'guests')->'rows'->0->>'merchandise', 'redeemed', 'guests report shows merchandise');
select is(jsonb_array_length(report_rows('00000000-0000-4000-8000-0000000000a4', 'check_ins')->'rows'), 4, 'check-ins report');
select is(report_rows('00000000-0000-4000-8000-0000000000a4', 'check_ins')->'rows'->0->>'station', 'Meja 1', 'with the station');
select is(jsonb_array_length(report_rows('00000000-0000-4000-8000-0000000000a4', 'merchandise')->'rows'), 1, 'merchandise report');
select is(jsonb_array_length(report_rows('00000000-0000-4000-8000-0000000000a4', 'draws')->'rows'), 3, 'draw history includes voided draws');
select is(report_rows('00000000-0000-4000-8000-0000000000a4', 'draws')->'rows'->0->>'status', 'confirmed', 'oldest first');
select ok(jsonb_array_length(report_rows('00000000-0000-4000-8000-0000000000a4', 'audit')->'rows') >= 4, 'audit report');
select is(jsonb_array_length(report_rows('00000000-0000-4000-8000-0000000000a4', 'rsvp_pending')->'rows'), 2, 'two guests have not answered');
select ok(report_rows('00000000-0000-4000-8000-0000000000a4', 'rsvp_pending')->'rows'->0->>'phone' like '+62811%', 'with their phone');
select is(report_rows('00000000-0000-4000-8000-0000000000a4', 'guests')::text ~* 'phone', false, 'the guests report has no phone');

-- reset
select is(reset_rehearsal_data('00000000-0000-4000-8000-0000000000a4', 'hr@example.com')->>'status', 'OK', 'reset in rehearsal');
select is((select count(*)::int from draws where event_id = '00000000-0000-4000-8000-0000000000a4'), 0, 'draws gone');
select is((select count(*)::int from check_ins where event_id = '00000000-0000-4000-8000-0000000000a4'), 0, 'check-ins gone');
select is((select count(*)::int from merchandise_redemptions where event_id = '00000000-0000-4000-8000-0000000000a4'), 0, 'redemptions gone');
select is((select count(*)::int from stage_heartbeat where event_id = '00000000-0000-4000-8000-0000000000a4'), 0, 'heartbeat gone');
select is(get_stage('00000000-0000-4000-8000-0000000000a4')->>'phase', 'idle', 'stage idle');
select is(get_stage('00000000-0000-4000-8000-0000000000a4')->'payload', '{}'::jsonb, 'stage payload empty');
select ok((get_stage('00000000-0000-4000-8000-0000000000a4')->>'rev')::int > 0, 'rev moved on so open displays update');
select is(get_stage('00000000-0000-4000-8000-0000000000a4')->'options'->>'safe_mode', 'true', 'stage options kept');
select is((select count(*)::int from guests where event_id = '00000000-0000-4000-8000-0000000000a4'), 6, 'guests kept');
select is((select count(*)::int from guests where event_id = '00000000-0000-4000-8000-0000000000a4' and rsvp_status = 'yes'), 3, 'RSVPs kept');
select is((select count(*)::int from prizes where event_id = '00000000-0000-4000-8000-0000000000a4'), 2, 'prizes kept');
select is((select next_prize_number from events where id = '00000000-0000-4000-8000-0000000000a4'), 1, 'counter back to 1');
select is((select count(*)::int from audit_log where event_id = '00000000-0000-4000-8000-0000000000a4'), 1, 'only the reset entry remains');
-- everyone is drawable again and the prize can be drawn from scratch
select is(draw_prize('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-00000000a401', gen_random_uuid(), 'draw')->>'status', 'NO_ELIGIBLE_GUESTS', 'nobody is checked in after the reset');

-- live events cannot be reset
update events set mode = 'live' where id = '00000000-0000-4000-8000-0000000000a4';
insert into check_ins (event_id, guest_id, method, prize_number) values ('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-a40000000001', 'manual', 1);
select is(reset_rehearsal_data('00000000-0000-4000-8000-0000000000a4', 'hr@example.com')->>'status', 'NOT_REHEARSAL', 'a live event cannot be reset');
select is((select count(*)::int from check_ins where event_id = '00000000-0000-4000-8000-0000000000a4'), 1, 'and nothing was deleted');

select * from finish();
rollback;
```
- [ ] **Step 2: Run it to verify it fails**

Run: `npm run db:reset && npm run test:db`
Expected: `012_admin_views.test.sql` fails (`function admin_dashboard(uuid) does not exist`).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261115000006_admin_draw_views.sql`:
```sql
-- Rehearsal reset now also clears draws and returns the stage to idle. Guests, RSVPs, PINs, prizes, stage key and options stay.
create or replace function public.reset_rehearsal_data(p_event uuid, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not exists (select 1 from public.events where id = p_event and mode = 'rehearsal') then
    return jsonb_build_object('status', 'NOT_REHEARSAL');
  end if;
  delete from public.draws where event_id = p_event;
  delete from public.merchandise_redemptions where event_id = p_event;
  delete from public.check_ins where event_id = p_event;
  delete from public.attempt_log where event_id = p_event;
  delete from public.auth_attempts;
  delete from public.stage_heartbeat where event_id = p_event;
  delete from public.audit_log where event_id = p_event;
  update public.stage_state
     set rev = rev + 1, phase = 'idle', payload = '{}'::jsonb, updated_at = now()
   where event_id = p_event;
  update public.events set next_prize_number = 1 where id = p_event;
  perform public.audit(p_event, 'admin', p_actor, 'rehearsal_reset', 'event', p_event::text, '{}'::jsonb);
  return jsonb_build_object('status', 'OK');
end $$;

-- Everything the admin dashboard shows, in one call.
create function public.admin_dashboard(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object(
    'counts', public.event_counts(p_event),
    'outlets', (
      select coalesce(jsonb_agg(s.o order by s.o->>'outlet'), '[]'::jsonb)
      from (
        select jsonb_build_object('outlet', g.outlet, 'total', count(*),
                                  'rsvp_yes', count(*) filter (where g.rsvp_status = 'yes'),
                                  'checked_in', count(c.id), 'redeemed', count(m.id)) as o
          from public.guests g
          left join public.check_ins c on c.guest_id = g.id
          left join public.merchandise_redemptions m on m.guest_id = g.id and m.status = 'redeemed'
         where g.event_id = p_event and g.active
         group by g.outlet) s),
    'prizes', public.prize_list(p_event)->'prizes',
    'draw', jsonb_build_object(
      'confirmed',   (select count(*) from public.draws d where d.event_id = p_event and d.status = 'confirmed'),
      'pending',     (select count(*) from public.draws d where d.event_id = p_event and d.status = 'drawn'),
      'no_shows',    (select count(*) from public.draws d where d.event_id = p_event and d.status = 'void_no_show'),
      'admin_voids', (select count(*) from public.draws d where d.event_id = p_event and d.status = 'void_admin'),
      'eligible',    (select count(*) from public.check_ins c join public.guests g on g.id = c.guest_id
                       where c.event_id = p_event and g.active
                         and not exists (select 1 from public.draws d where d.winner_guest_id = c.guest_id and d.status in ('drawn', 'confirmed')))),
    'stage', jsonb_build_object(
      'phase', public.get_stage(p_event)->'phase',
      'rev', public.get_stage(p_event)->'rev',
      'heartbeat_age', public.stage_heartbeat_age(p_event)),
    'recent', (
      select coalesce(jsonb_agg(jsonb_build_object('at', r.at, 'actor', r.actor, 'action', r.action) order by r.id desc), '[]'::jsonb)
        from (select a.id, a.at, a.actor, a.action from public.audit_log a where a.event_id = p_event order by a.id desc limit 10) r))
$$;

create function public.admin_draw_list(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object('status', 'OK', 'draws', coalesce(jsonb_agg(x.j order by x.seq desc), '[]'::jsonb))
  from (
    select d.sequence as seq,
           jsonb_build_object('id', d.id, 'prize', pr.name, 'slot', d.slot, 'quantity', pr.quantity, 'number', c.prize_number,
                              'name', g.full_name, 'outlet', g.outlet, 'department', g.department, 'status', d.status,
                              'drawn_at', d.drawn_at, 'resolved_at', d.resolved_at, 'resolved_by', d.resolved_by,
                              'void_reason', d.void_reason, 'redraw_of', d.redraw_of) as j
      from public.draws d
      join public.prizes pr on pr.id = d.prize_id
      join public.check_ins c on c.guest_id = d.winner_guest_id
      join public.guests g on g.id = d.winner_guest_id
     where d.event_id = p_event
     order by d.sequence desc
     limit 1000) x
$$;

create function public.admin_audit_list(p_event uuid, p_before bigint, p_limit int) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object('status', 'OK',
    'rows', coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'at', r.at, 'actor_type', r.actor_type, 'actor', r.actor,
                                                  'action', r.action, 'entity', r.entity, 'entity_id', r.entity_id,
                                                  'details', r.details) order by r.id desc), '[]'::jsonb))
  from (
    select a.* from public.audit_log a
     where a.event_id = p_event and (p_before is null or a.id < p_before)
     order by a.id desc
     limit least(greatest(coalesce(p_limit, 100), 1), 200)) r
$$;

-- Rows for the CSV exports. Column order is fixed in the application, not here.
create function public.report_rows(p_event uuid, p_report text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  v jsonb;
begin
  if p_report = 'guests' then
    select coalesce(jsonb_agg(jsonb_build_object(
        'employee_id', g.employee_id, 'full_name', g.full_name, 'outlet', g.outlet, 'department', g.department,
        'position', g.position, 'category', g.category, 'rsvp_status', g.rsvp_status,
        'opened', g.first_opened_at is not null, 'checked_in_at', c.checked_in_at, 'prize_number', c.prize_number,
        'merchandise', case when m.id is not null then 'redeemed' else '' end,
        'walk_in', g.is_walk_in, 'active', g.active) order by g.outlet, g.full_name), '[]'::jsonb) into v
      from public.guests g
      left join public.check_ins c on c.guest_id = g.id
      left join public.merchandise_redemptions m on m.guest_id = g.id and m.status = 'redeemed'
     where g.event_id = p_event;
  elsif p_report = 'check_ins' then
    select coalesce(jsonb_agg(jsonb_build_object(
        'checked_in_at', c.checked_in_at, 'prize_number', c.prize_number, 'employee_id', g.employee_id,
        'full_name', g.full_name, 'outlet', g.outlet, 'department', g.department,
        'method', c.method, 'station', c.station_label, 'actor', c.actor) order by c.prize_number), '[]'::jsonb) into v
      from public.check_ins c join public.guests g on g.id = c.guest_id
     where c.event_id = p_event;
  elsif p_report = 'merchandise' then
    select coalesce(jsonb_agg(jsonb_build_object(
        'redeemed_at', m.redeemed_at, 'status', m.status, 'employee_id', g.employee_id, 'full_name', g.full_name,
        'outlet', g.outlet, 'station', m.station_label, 'actor', m.actor, 'void_reason', m.void_reason)
        order by m.redeemed_at), '[]'::jsonb) into v
      from public.merchandise_redemptions m join public.guests g on g.id = m.guest_id
     where m.event_id = p_event;
  elsif p_report = 'draws' then
    select coalesce(jsonb_agg(jsonb_build_object(
        'drawn_at', d.drawn_at, 'prize', pr.name, 'slot', d.slot, 'prize_number', c.prize_number,
        'employee_id', g.employee_id, 'full_name', g.full_name, 'outlet', g.outlet, 'department', g.department,
        'status', d.status, 'drawn_by', d.drawn_by, 'resolved_at', d.resolved_at, 'resolved_by', d.resolved_by,
        'void_reason', d.void_reason) order by d.sequence), '[]'::jsonb) into v
      from public.draws d
      join public.prizes pr on pr.id = d.prize_id
      join public.check_ins c on c.guest_id = d.winner_guest_id
      join public.guests g on g.id = d.winner_guest_id
     where d.event_id = p_event;
  elsif p_report = 'audit' then
    select coalesce(jsonb_agg(jsonb_build_object(
        'at', a.at, 'actor_type', a.actor_type, 'actor', a.actor, 'action', a.action,
        'entity', a.entity, 'entity_id', a.entity_id, 'details', a.details::text) order by a.id), '[]'::jsonb) into v
      from (select * from public.audit_log where event_id = p_event order by id desc limit 50000) a;
  elsif p_report = 'rsvp_pending' then
    select coalesce(jsonb_agg(jsonb_build_object(
        'employee_id', g.employee_id, 'full_name', g.full_name, 'outlet', g.outlet, 'department', g.department,
        'phone', g.phone, 'opened', g.first_opened_at is not null) order by g.outlet, g.full_name), '[]'::jsonb) into v
      from public.guests g
     where g.event_id = p_event and g.active and g.rsvp_status = 'pending';
  else
    return jsonb_build_object('status', 'UNKNOWN_REPORT');
  end if;
  return jsonb_build_object('status', 'OK', 'rows', v);
end $$;

select public.lock_down_public();
```
- [ ] **Step 4: Run the database tests to verify they pass**

Run: `npm run db:reset && npm run test:db`
Expected: every file (`002`–`012`) passes.

- [ ] **Step 5: Commit**

```bash
git add supabase
git commit -m "feat(db): admin dashboard, draw and audit lists, report rows, full rehearsal reset"
```

---

## Task 23: Draw concurrency proof

This task proves the draw rules from spec section 7 against real Postgres, in parallel, before any screen exists.

**Files:**
- Modify: `scripts/concurrency/lib.mjs`
- Create: `scripts/concurrency/draw.mjs`

**Interfaces:**
- Consumes: `scripts/concurrency/lib.mjs` (`EVENT`, `pool`, `q`, `clean`, `purge`, `makeGuests`), Tasks 17–21.
- Produces: `node --env-file=.env.test scripts/concurrency/draw.mjs` prints one line per passing scenario.

- [ ] **Step 1: Make the shared cleanup draw-aware**

`draws` references `check_ins`, so `clean()` must delete draws first. In `scripts/concurrency/lib.mjs` replace `clean` and `purge` with:

```js
export async function clean() {
  await q('delete from draws where event_id = $1', [EVENT]);
  await q('delete from merchandise_redemptions where event_id = $1', [EVENT]);
  await q('delete from check_ins where event_id = $1', [EVENT]);
  await q('update events set next_prize_number = 1 where id = $1', [EVENT]);
}

export async function purge() {
  await clean();
  await q('delete from prizes where event_id = $1', [EVENT]);
  await q(`delete from guests where event_id = $1 and employee_id ~ '^(CA|CB|MA|MB|DA|DB|DC)-'`, [EVENT]);
}
```

- [ ] **Step 2: Write the draw concurrency script**

`scripts/concurrency/draw.mjs`:
```js
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { EVENT, pool, q, clean, purge, makeGuests } from './lib.mjs';

const one = async (sql, params) => (await q(sql, params))[0].r;
const draw = (prizeId, requestId = randomUUID()) =>
  one(`select public.draw_prize($1::uuid, $2::uuid, $3::uuid, 'concurrency') as r`, [EVENT, prizeId, requestId]);
const resolve = (drawId, outcome) =>
  one(`select public.resolve_draw($1::uuid, $2::uuid, $3::text, 'concurrency') as r`, [EVENT, drawId, outcome]);
const resolveRound = (roundId) => one(`select public.resolve_round($1::uuid, $2::uuid, 'concurrency') as r`, [EVENT, roundId]);

async function prize(name, quantity, batch = false) {
  const [{ id }] = await q(
    `insert into prizes (event_id, name, tier, quantity, draw_as_batch) values ($1, $2, 'minor', $3, $4) returning id`,
    [EVENT, name, quantity, batch],
  );
  return id;
}
async function arrive(n, prefix) {
  const gs = await makeGuests(n, prefix);
  await Promise.all(gs.map((g) => q(`select public.check_in($1::uuid, $2::text, null, 'scan', 'Meja 1', 'concurrency')`, [EVENT, g.invite_token])));
}
async function wipe() {
  await clean();
  await q('delete from prizes where event_id = $1', [EVENT]);
}
const count = (rs, s) => rs.filter((r) => r.status === s).length;

// A: two (here thirty) simultaneous draws with different request ids -> exactly one DRAWN, the rest DRAW_IN_PROGRESS
await wipe();
await arrive(40, 'DA');
const pA = await prize('Prize A', 1);
const resA = await Promise.all(Array.from({ length: 30 }, () => draw(pA)));
assert.equal(count(resA, 'DRAWN'), 1, 'exactly one DRAWN');
assert.equal(count(resA, 'DRAW_IN_PROGRESS'), 29, '29 refused');
const [{ n: liveA }] = await q(`select count(*)::int n from draws where event_id = $1`, [EVENT]);
assert.equal(liveA, 1, 'one draw row');
console.log('A ok: 30 simultaneous draws -> 1 DRAWN, 29 DRAW_IN_PROGRESS');

// B: double-tap with ONE request id -> one draw, everybody sees it
await wipe();
await arrive(40, 'DA');
const pB = await prize('Prize B', 1);
const rid = randomUUID();
const resB = await Promise.all(Array.from({ length: 30 }, () => draw(pB, rid)));
assert.ok(resB.every((r) => r.status === 'DRAWN'), 'all report DRAWN');
assert.equal(resB.filter((r) => r.idempotent === false).length, 1, 'one fresh draw');
assert.equal(new Set(resB.map((r) => r.draws[0].id)).size, 1, 'one draw id');
const [{ n: rowsB }] = await q(`select count(*)::int n from draws where event_id = $1`, [EVENT]);
assert.equal(rowsB, 1, 'one row');
console.log('B ok: 30 taps with one request id -> 1 draw');

// C: confirm and no-show racing on one draw -> a single final state, the loser sees it
const dB = resB[0].draws[0].id;
const racers = await Promise.all([
  ...Array.from({ length: 10 }, () => resolve(dB, 'confirm')),
  ...Array.from({ length: 10 }, () => resolve(dB, 'no_show')),
]);
const [{ status: finalC }] = await q(`select status from draws where id = $1`, [dB]);
assert.ok(['confirmed', 'void_no_show'].includes(finalC), `final state ${finalC}`);
if (finalC === 'confirmed') {
  assert.equal(count(racers, 'CONFIRMED'), 1, 'one CONFIRMED');
  assert.ok(racers.every((r) => ['CONFIRMED', 'ALREADY_CONFIRMED'].includes(r.status)), 'a confirmed draw cannot be voided by the MC');
} else {
  assert.equal(count(racers, 'VOIDED'), 1, 'one VOIDED');
  assert.ok(racers.every((r) => ['VOIDED', 'DRAW_VOID'].includes(r.status)), 'a voided draw cannot be confirmed');
}
console.log(`C ok: confirm vs no-show race -> one final state (${finalC})`);

// D: draw the whole pool through ten single prizes, fired in parallel each round -> nobody wins twice
await wipe();
await arrive(10, 'DB');
const singles = [];
for (let i = 1; i <= 10; i++) singles.push(await prize(`Single ${i}`, 1));
let confirmed = 0;
for (let guard = 0; guard < 60 && confirmed < 10; guard++) {
  const rs = await Promise.all(singles.map((p) => draw(p)));
  const drawn = rs.filter((r) => r.status === 'DRAWN');
  assert.ok(drawn.length <= 1, 'never two unresolved draws');
  for (const r of drawn) {
    await resolve(r.draws[0].id, 'confirm');
    confirmed += 1;
  }
}
assert.equal(confirmed, 10, 'ten prizes drawn');
const [{ n: distinct }] = await q(`select count(distinct winner_guest_id)::int n from draws where event_id = $1 and status = 'confirmed'`, [EVENT]);
assert.equal(distinct, 10, 'ten different winners');
const extra = await prize('Single 11', 1);
assert.equal((await draw(extra)).status, 'NO_ELIGIBLE_GUESTS', 'pool is empty');
console.log('D ok: whole pool drawn, nobody wins twice, empty pool reported');

// E: a no-show goes back into the pool for other prizes
await wipe();
await arrive(1, 'DC');
const pE1 = await prize('E1', 1);
const pE2 = await prize('E2', 1);
const e1 = await draw(pE1);
await resolve(e1.draws[0].id, 'no_show');
const e2 = await draw(pE2);
assert.equal(e2.status, 'DRAWN', 'the no-show can win a different prize');
assert.equal(e2.draws[0].number, e1.draws[0].number, 'same person');
assert.equal((await draw(pE1)).status, 'DRAW_IN_PROGRESS', 'but only after the open draw is resolved');
await resolve(e2.draws[0].id, 'confirm');
assert.equal((await draw(pE1)).status, 'NO_ELIGIBLE_GUESTS', 'and a confirmed winner is out of the pool');
console.log('E ok: a no-show stays eligible for other prizes');

// F: 215 present, batches larger than the pool -> short_by, everybody drawn once
await wipe();
await arrive(215, 'DA');
const b1 = await prize('Batch 1', 100, true);
const b2 = await prize('Batch 2', 100, true);
const b3 = await prize('Batch 3', 40, true);
const f1 = await draw(b1);
assert.equal(f1.draws.length, 100, 'first batch draws 100');
assert.equal((await resolveRound(f1.round_id)).confirmed, 100, 'confirm all 100');
const f2 = await draw(b2);
assert.equal(f2.draws.length, 100, 'second batch draws 100');
await resolveRound(f2.round_id);
const f3 = await draw(b3);
assert.equal(f3.status, 'DRAWN');
assert.equal(f3.draws.length, 15, 'only 15 people are left');
assert.equal(f3.short_by, 25, 'short by 25');
await resolveRound(f3.round_id);
const [{ n: winners, d: distinctF }] = await q(
  `select count(*)::int n, count(distinct winner_guest_id)::int d from draws where event_id = $1 and status = 'confirmed'`, [EVENT]);
assert.equal(winners, 215, '215 confirmed draws');
assert.equal(distinctF, 215, 'every guest won exactly once');
assert.equal((await draw(b3)).status, 'NO_ELIGIBLE_GUESTS', 'nobody left');
console.log('F ok: 215 guests, three batches, short_by 25, nobody won twice');

await wipe();
await purge();
await pool.end();
```

- [ ] **Step 3: Run it**

Run: `node --env-file=.env.test scripts/concurrency/draw.mjs`
Expected output:
```
A ok: 30 simultaneous draws -> 1 DRAWN, 29 DRAW_IN_PROGRESS
B ok: 30 taps with one request id -> 1 draw
C ok: confirm vs no-show race -> one final state (confirmed)
D ok: whole pool drawn, nobody wins twice, empty pool reported
E ok: a no-show stays eligible for other prizes
F ok: 215 guests, three batches, short_by 25, nobody won twice
```
(Line C may end in `void_no_show`; either is correct.) Re-run Plan 1's scripts too: `node --env-file=.env.test scripts/concurrency/checkin.mjs && node --env-file=.env.test scripts/concurrency/redeem.mjs` — expected: unchanged output.

- [ ] **Step 4: Commit**

```bash
git add scripts
git commit -m "test: draw concurrency proof (double tap, races, whole pool, short batch)"
```


---

## Task 24: Pure libraries — stage model, operator helpers, reports, stage session

Nothing here touches the network or React except the cookie helper. These are the parts worth unit-testing hard: the projector's "newest revision wins" and roll bookkeeping, and the rule that a name is only ever shown for a revealed slot.

**Files:**
- Create: `src/lib/stage.ts`, `src/lib/draw-ui.ts`, `src/lib/reports.ts`, `src/lib/stage-session.ts`
- Test: `tests/unit/stage.test.ts`, `tests/unit/draw-ui.test.ts`, `tests/unit/reports.test.ts`

**Interfaces:**
- Consumes: `csvSafe` (`lib/csv.ts`), `Lang` (`lib/i18n/strings.ts`), `env`, `rpc`, `parseCookies`, `jose`.
- Produces:
  - `stage.ts`: types `StagePhase`, `StageSlot`, `StagePrize`, `StagePayload`, `StageOptions`, `StageRow`, `SlotView`, `SlotKind`; constants `ROLL_MS = 5000`, `REVEAL_STEP_MS = 1700`, `DEFAULT_OPTIONS`; `parseRow(raw): StageRow | null`; `acceptRow(current, incoming): StageRow`; `noteRolls(starts: Map<string, number>, row, now, live): void`; `slotViews(row, starts, now): SlotView[]`; `revealDelays(prev, next): Record<number, number>`; `bannerText(prize): string`.
  - `draw-ui.ts`: types `DrawRow`, `Round`, `Current`; `WINNER_SECONDS = 60`; `secondsLeft(drawnAt, now)`; `heartbeatState(age): 'ok' | 'down' | 'never'`; `requestIds(gen?)` → `{ idFor(prizeId), done(prizeId) }`; `pendingDraws(round)`.
  - `reports.ts`: `REPORTS` (name → `{ sql, file, cols }`), `type ReportName`, `isReportName(s)`, `buildReportCsv(name, rows)`, `witaStamp(iso)`.
  - `stage-session.ts`: `STAGE_COOKIE = 'nf_stage'`, `signStage(tag)`, `stageCookie(value, maxAge?)`, `verifyStageCookie(value)`, `readStage(req)`.

- [ ] **Step 1: Write the failing unit tests**

`tests/unit/stage.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_OPTIONS, REVEAL_STEP_MS, ROLL_MS, acceptRow, bannerText, noteRolls, parseRow, revealDelays, slotViews,
  type StageRow, type StageSlot,
} from '@/lib/stage';

const prize = { id: 'p1', name: 'Smart TV', tier: 'Hadiah Utama', quantity: 3 };
const row = (rev: number, slots: StageSlot[], over: Partial<StageRow> = {}): StageRow => ({
  rev, phase: 'rolling', options: DEFAULT_OPTIONS, payload: { round_id: 'r1', batch: false, prize, slots }, ...over,
});
const rolling = (slot: number, number: number): StageSlot => ({ slot, number, state: 'rolling' });
const revealed = (slot: number, number: number, name: string): StageSlot =>
  ({ slot, number, state: 'revealed', name, outlet: 'Outlet A', department: 'FOH' });

describe('parseRow', () => {
  it('accepts the database shape and fills default options', () => {
    const r = parseRow({ rev: 4, phase: 'idle', payload: {}, options: {} });
    expect(r).toEqual({ rev: 4, phase: 'idle', payload: {}, options: DEFAULT_OPTIONS });
  });
  it('accepts a Realtime row with extra columns and a string revision', () => {
    const r = parseRow({ event_id: 'e', rev: '7', phase: 'rolling', payload: { slots: [] }, options: { safe_mode: true, language: 'en' }, updated_at: 'x' });
    expect(r?.rev).toBe(7);
    expect(r?.options).toEqual({ safe_mode: true, reduce_effects: false, language: 'en' });
  });
  it.each([null, undefined, 'x', 3, { phase: 'idle' }, { rev: 1, phase: 'dancing' }, { rev: 'abc', phase: 'idle' }])('rejects %j', (bad) => {
    expect(parseRow(bad)).toBeNull();
  });
  it('falls back to Indonesian for an unknown language', () => {
    expect(parseRow({ rev: 1, phase: 'idle', options: { language: 'fr' } })?.options.language).toBe('id');
  });
});

describe('acceptRow', () => {
  it('takes the first row, a higher revision, and ignores equal or lower ones', () => {
    const a = row(5, []);
    expect(acceptRow(null, a)).toBe(a);
    const b = row(6, []);
    expect(acceptRow(a, b)).toBe(b);
    expect(acceptRow(b, a)).toBe(b);
    expect(acceptRow(b, row(6, [rolling(1, 9)]))).toBe(b);
  });
});

describe('roll bookkeeping', () => {
  it('rolls for ROLL_MS after a live update, then lands', () => {
    const starts = new Map<string, number>();
    const r = row(1, [rolling(1, 42)]);
    noteRolls(starts, r, 10_000, true);
    expect(slotViews(r, starts, 10_000)[0].kind).toBe('rolling');
    expect(slotViews(r, starts, 10_000 + ROLL_MS - 1)[0].kind).toBe('rolling');
    expect(slotViews(r, starts, 10_000 + ROLL_MS)[0].kind).toBe('landed');
  });
  it('goes straight to landed when the display loads mid-roll', () => {
    const starts = new Map<string, number>();
    const r = row(1, [rolling(1, 42)]);
    noteRolls(starts, r, 10_000, false);
    expect(slotViews(r, starts, 10_000)[0].kind).toBe('landed');
  });
  it('does not restart the roll on a repeated row, but rolls again for a redraw with a new number', () => {
    const starts = new Map<string, number>();
    noteRolls(starts, row(1, [rolling(1, 42)]), 10_000, true);
    noteRolls(starts, row(2, [rolling(1, 42)]), 14_000, true);
    expect(slotViews(row(2, [rolling(1, 42)]), starts, 15_000)[0].kind).toBe('landed');
    const redraw = row(3, [rolling(1, 77)]);
    noteRolls(starts, redraw, 16_000, true);
    expect(slotViews(redraw, starts, 16_100)[0].kind).toBe('rolling');
  });
  it('skips the roll when effects are reduced', () => {
    const starts = new Map<string, number>();
    const r = row(1, [rolling(1, 42)], { options: { ...DEFAULT_OPTIONS, reduce_effects: true } });
    noteRolls(starts, r, 10_000, true);
    expect(slotViews(r, starts, 10_000)[0].kind).toBe('landed');
  });
  it('shows the name only for a revealed slot, even if the payload carries one', () => {
    const sneaky: StageSlot = { slot: 1, number: 5, state: 'rolling', name: 'LEAK', outlet: 'LEAK', department: 'LEAK' };
    const v = slotViews(row(1, [sneaky, revealed(2, 6, 'Kadek Ayu')]), new Map(), 0);
    expect(JSON.stringify(v[0])).not.toContain('LEAK');
    expect(v[1]).toMatchObject({ kind: 'revealed', name: 'Kadek Ayu', outlet: 'Outlet A', department: 'FOH' });
  });
  it('marks a void slot', () => {
    expect(slotViews(row(1, [{ slot: 1, number: 5, state: 'void' }]), new Map(), 0)[0].kind).toBe('void');
  });
});

describe('revealDelays', () => {
  it('staggers tiles that were revealed together, lowest slot first', () => {
    const prev = row(1, [rolling(1, 1), rolling(2, 2), rolling(3, 3)]);
    const next = row(2, [revealed(1, 1, 'A'), revealed(2, 2, 'B'), revealed(3, 3, 'C')]);
    expect(revealDelays(prev, next)).toEqual({ 1: 0, 2: REVEAL_STEP_MS, 3: 2 * REVEAL_STEP_MS });
  });
  it('ignores tiles that were already revealed', () => {
    const prev = row(2, [revealed(1, 1, 'A'), rolling(2, 2)]);
    const next = row(3, [revealed(1, 1, 'A'), revealed(2, 2, 'B')]);
    expect(revealDelays(prev, next)).toEqual({ 2: 0 });
  });
  it('shows everything at once when effects are reduced', () => {
    const prev = row(1, [rolling(1, 1), rolling(2, 2)]);
    const next = row(2, [revealed(1, 1, 'A'), revealed(2, 2, 'B')], { options: { ...DEFAULT_OPTIONS, reduce_effects: true } });
    expect(revealDelays(prev, next)).toEqual({ 1: 0, 2: 0 });
  });
  it('treats a different round as all new', () => {
    const prev = row(1, [revealed(1, 1, 'A')]);
    const next = row(2, [revealed(1, 9, 'Z')], { payload: { round_id: 'r2', prize, slots: [revealed(1, 9, 'Z')] } });
    expect(revealDelays(prev, next)).toEqual({ 1: 0 });
  });
});

describe('bannerText', () => {
  it('joins tier and name in capitals', () => expect(bannerText(prize)).toBe('HADIAH UTAMA · SMART TV'));
  it('uses only the name when there is no tier', () => expect(bannerText({ ...prize, tier: null })).toBe('SMART TV'));
  it('is empty without a prize', () => expect(bannerText(undefined)).toBe(''));
});
```

`tests/unit/draw-ui.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { WINNER_SECONDS, heartbeatState, pendingDraws, requestIds, secondsLeft, type Round } from '@/lib/draw-ui';

describe('secondsLeft', () => {
  const t0 = Date.parse('2026-12-10T10:00:00Z');
  it('counts down from 60', () => {
    expect(secondsLeft('2026-12-10T10:00:00Z', t0)).toBe(WINNER_SECONDS);
    expect(secondsLeft('2026-12-10T10:00:00Z', t0 + 1_500)).toBe(59);
    expect(secondsLeft('2026-12-10T10:00:00Z', t0 + 59_000)).toBe(1);
  });
  it('stops at zero and never goes negative', () => {
    expect(secondsLeft('2026-12-10T10:00:00Z', t0 + 60_000)).toBe(0);
    expect(secondsLeft('2026-12-10T10:00:00Z', t0 + 600_000)).toBe(0);
  });
  it('never exceeds 60 when the phone clock is behind the server', () => {
    expect(secondsLeft('2026-12-10T10:00:00Z', t0 - 20_000)).toBe(WINNER_SECONDS);
  });
  it('is 60 when there is nothing pending', () => expect(secondsLeft(null, t0)).toBe(WINNER_SECONDS));
});

describe('heartbeatState', () => {
  it.each([[0, 'ok'], [14, 'ok'], [15, 'down'], [300, 'down'], [null, 'never'], [undefined, 'never']] as const)('%s s is %s', (age, want) => {
    expect(heartbeatState(age)).toBe(want);
  });
});

describe('requestIds', () => {
  it('returns the same id for the same prize until it is marked done', () => {
    let n = 0;
    const ids = requestIds(() => `id-${++n}`);
    expect(ids.idFor('a')).toBe('id-1');
    expect(ids.idFor('a')).toBe('id-1'); // a retry after a dropped connection reuses the id
    expect(ids.idFor('b')).toBe('id-2');
    ids.done('a');
    expect(ids.idFor('a')).toBe('id-3');
    expect(ids.idFor('b')).toBe('id-2');
  });
});

describe('pendingDraws', () => {
  const round = {
    round_id: 'r', pending: 1, prize: { id: 'p', name: 'Mug', tier: null, quantity: 2, batch: true },
    draws: [
      { id: '1', slot: 1, status: 'confirmed', number: 5, name: 'A', outlet: 'O', department: null, drawn_at: 'x', redraw_of: null },
      { id: '2', slot: 2, status: 'drawn', number: 6, name: 'B', outlet: 'O', department: null, drawn_at: 'x', redraw_of: null },
    ],
  } satisfies Round;
  it('keeps only the unresolved draws', () => expect(pendingDraws(round).map((d) => d.id)).toEqual(['2']));
  it('handles no round', () => expect(pendingDraws(null)).toEqual([]));
});
```

`tests/unit/reports.test.ts`:
```ts
import Papa from 'papaparse';
import { describe, it, expect } from 'vitest';
import { REPORTS, buildReportCsv, isReportName, witaStamp } from '@/lib/reports';

const parse = (csv: string) => Papa.parse<Record<string, string>>(csv.replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: true });

describe('witaStamp', () => {
  it('shows date and time in WITA', () => expect(witaStamp('2026-12-10T09:42:05Z')).toBe('2026-12-10 17:42:05'));
  it('is empty for null', () => expect(witaStamp(null)).toBe(''));
});

describe('isReportName', () => {
  it.each(['guests', 'check-ins', 'merchandise', 'draws', 'audit', 'rsvp-pending'])('knows %s', (n) => expect(isReportName(n)).toBe(true));
  it.each(['invitations', '../etc', 'toString', '__proto__', ''])('rejects %s', (n) => expect(isReportName(n)).toBe(false));
});

describe('buildReportCsv', () => {
  it('starts with a BOM and writes the header row even when there are no rows', () => {
    const csv = buildReportCsv('draws', []);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(parse(csv).meta.fields).toEqual(REPORTS.draws.cols.map((c) => c.header));
    expect(parse(csv).data).toEqual([]);
  });
  it('keeps the column order and formats times, booleans and phones', () => {
    const csv = buildReportCsv('rsvp-pending', [
      { employee_id: 'E1', full_name: 'Ayu', outlet: 'A', department: null, phone: '+62 812-3456-7001', opened: false },
    ]);
    const row = parse(csv).data[0];
    expect(Object.keys(row)).toEqual(REPORTS['rsvp-pending'].cols.map((c) => c.header));
    expect(row.Phone).toBe('6281234567001');
    expect(row['Opened invitation']).toBe('no');
    expect(row.Department).toBe('');

    const g = buildReportCsv('check-ins', [
      { checked_in_at: '2026-12-10T01:30:00Z', prize_number: 7, employee_id: 'E1', full_name: 'Ayu', outlet: 'A', department: 'FOH', method: 'scan', station: 'Meja 1', actor: 'checkin' },
    ]);
    expect(parse(g).data[0].Time).toBe('2026-12-10 09:30:00');
    expect(parse(g).data[0]['Door Prize no.']).toBe('7');
  });
  it('neutralises spreadsheet formulas in every text cell', () => {
    const csv = buildReportCsv('guests', [
      { employee_id: '=1+1', full_name: '@SUM(A1)', outlet: '-cmd', department: '+x', position: '\tTab', category: null, rsvp_status: 'yes', opened: true, checked_in_at: null, prize_number: null, merchandise: '', walk_in: false, active: true },
    ]);
    const row = parse(csv).data[0];
    expect(row['Employee ID']).toBe("'=1+1");
    expect(row.Name).toBe("'@SUM(A1)");
    expect(row.Outlet).toBe("'-cmd");
    expect(row.Department).toBe("'+x");
    expect(row.Position).toBe("'\tTab");
  });
  it('writes the audit details as text', () => {
    const csv = buildReportCsv('audit', [
      { at: '2026-12-10T01:00:00Z', actor_type: 'admin', actor: 'hr@example.com', action: 'draw_void_admin', entity: 'draw', entity_id: 'x', details: '{"reason":"wrong person"}' },
    ]);
    expect(parse(csv).data[0].Details).toBe('{"reason":"wrong person"}');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run test:unit -- stage draw-ui reports`
Expected: FAIL — cannot resolve `@/lib/stage`, `@/lib/draw-ui`, `@/lib/reports`.

- [ ] **Step 3: Implement `src/lib/stage.ts`**

`src/lib/stage.ts`:
```ts
import type { Lang } from './i18n/strings';

export type StagePhase = 'idle' | 'intro' | 'rolling' | 'revealed' | 'void';
export type StageSlot = {
  slot: number;
  number: number;
  state: 'rolling' | 'revealed' | 'void';
  name?: string;
  outlet?: string;
  department?: string;
};
export type StagePrize = { id: string; name: string; tier: string | null; quantity: number };
export type StagePayload = { round_id?: string | null; batch?: boolean; prize?: StagePrize; slots?: StageSlot[] };
export type StageOptions = { safe_mode: boolean; reduce_effects: boolean; language: Lang };
export type StageRow = { rev: number; phase: StagePhase; payload: StagePayload; options: StageOptions };

export type SlotKind = 'rolling' | 'landed' | 'revealed' | 'void';
export type SlotView = { slot: number; number: number; kind: SlotKind; name?: string; outlet?: string; department?: string };

export const ROLL_MS = 5000; // cosmetic; the outcome is already saved before the roll starts
export const REVEAL_STEP_MS = 1700; // one winner every 1.5–2 seconds when a batch is confirmed together
export const DEFAULT_OPTIONS: StageOptions = { safe_mode: false, reduce_effects: false, language: 'id' };
const PHASES: readonly string[] = ['idle', 'intro', 'rolling', 'revealed', 'void'];

/** Normalises a row from `/api/stage/state` or from Realtime. Returns null if it is not a stage row. */
export function parseRow(raw: unknown): StageRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const rev = Number(r.rev);
  if (!Number.isFinite(rev) || typeof r.phase !== 'string' || !PHASES.includes(r.phase)) return null;
  const payload = r.payload && typeof r.payload === 'object' ? (r.payload as StagePayload) : {};
  const o = (r.options && typeof r.options === 'object' ? r.options : {}) as Partial<StageOptions>;
  return {
    rev,
    phase: r.phase as StagePhase,
    payload,
    options: { ...DEFAULT_OPTIONS, ...o, language: o.language === 'en' ? 'en' : 'id' },
  };
}

/** The newest revision wins. A stale or repeated row (a late poll, a duplicate event) changes nothing. */
export function acceptRow(current: StageRow | null, incoming: StageRow): StageRow {
  return !current || incoming.rev > current.rev ? incoming : current;
}

const slotKey = (p: StagePayload, s: StageSlot) => `${p.round_id ?? 'none'}:${s.slot}:${s.number}`;

/**
 * Remembers when each rolling slot first appeared. `live` is false for the very first row after a load or reload:
 * those slots count as already landed, so a display that joins mid-roll shows the number straight away.
 * A redraw has a new number, so it gets a new key and rolls again.
 */
export function noteRolls(starts: Map<string, number>, row: StageRow, now: number, live: boolean): void {
  for (const s of row.payload.slots ?? []) {
    if (s.state !== 'rolling') continue;
    const k = slotKey(row.payload, s);
    if (!starts.has(k)) starts.set(k, live ? now : now - ROLL_MS);
  }
}

/** What to draw for each slot at time `now`. A name is copied only for a revealed slot. */
export function slotViews(row: StageRow, starts: Map<string, number>, now: number): SlotView[] {
  return (row.payload.slots ?? []).map((s): SlotView => {
    if (s.state === 'revealed') return { slot: s.slot, number: s.number, kind: 'revealed', name: s.name, outlet: s.outlet, department: s.department };
    if (s.state === 'void') return { slot: s.slot, number: s.number, kind: 'void' };
    const t = starts.get(slotKey(row.payload, s));
    const rolling = !row.options.reduce_effects && t !== undefined && now - t < ROLL_MS;
    return { slot: s.slot, number: s.number, kind: rolling ? 'rolling' : 'landed' };
  });
}

/** Delay (ms) before each newly revealed tile flips, so a batch confirmed in one tap reveals one by one. */
export function revealDelays(prev: StageRow | null, next: StageRow): Record<number, number> {
  const sameRound = prev?.payload.round_id === next.payload.round_id;
  const was = new Set((sameRound ? prev?.payload.slots ?? [] : []).filter((s) => s.state === 'revealed').map((s) => s.slot));
  const fresh = (next.payload.slots ?? [])
    .filter((s) => s.state === 'revealed' && !was.has(s.slot))
    .map((s) => s.slot)
    .sort((a, b) => a - b);
  const out: Record<number, number> = {};
  fresh.forEach((slot, i) => { out[slot] = next.options.reduce_effects ? 0 : i * REVEAL_STEP_MS; });
  return out;
}

/** "HADIAH UTAMA · SMART TV" */
export function bannerText(prize: StagePrize | undefined): string {
  if (!prize) return '';
  return [prize.tier, prize.name].filter(Boolean).join(' · ').toUpperCase();
}
```

- [ ] **Step 4: Implement `src/lib/draw-ui.ts`**

`src/lib/draw-ui.ts`:
```ts
export const WINNER_SECONDS = 60;

export type DrawRow = {
  id: string; slot: number; status: 'drawn' | 'confirmed' | 'void_no_show' | 'void_admin';
  number: number; name: string; outlet: string; department: string | null; drawn_at: string; redraw_of: string | null;
};
export type Round = {
  round_id: string;
  prize: { id: string; name: string; tier: string | null; quantity: number; batch: boolean };
  pending: number;
  draws: DrawRow[];
};
export type Current = {
  round: Round | null;
  oldest_pending_at: string | null;
  stage: { rev: number; phase: string; options: { safe_mode: boolean; reduce_effects: boolean; language: 'id' | 'en' } };
  heartbeat_age: number | null;
};

/** Whole seconds left of the 60-second "winner must be present" window. Advisory: nothing is voided automatically. */
export function secondsLeft(drawnAt: string | null, now: number): number {
  if (!drawnAt) return WINNER_SECONDS;
  const elapsed = Math.floor((now - new Date(drawnAt).getTime()) / 1000);
  return Math.max(0, Math.min(WINNER_SECONDS, WINNER_SECONDS - elapsed));
}

export type Link = 'ok' | 'down' | 'never';

/** Green when the projector checked in less than 15 seconds ago. */
export function heartbeatState(age: number | null | undefined): Link {
  if (age === null || age === undefined) return 'never';
  return age < 15 ? 'ok' : 'down';
}

/**
 * One request id per prize, kept until the server has answered. A retry after a dropped connection or a double tap
 * reuses the id, so the server returns the same draw instead of drawing twice.
 */
export function requestIds(gen: () => string = () => crypto.randomUUID()) {
  const open = new Map<string, string>();
  return {
    idFor(prizeId: string): string {
      let id = open.get(prizeId);
      if (!id) { id = gen(); open.set(prizeId, id); }
      return id;
    },
    done(prizeId: string): void { open.delete(prizeId); },
  };
}

export const pendingDraws = (round: Round | null): DrawRow[] => (round ? round.draws.filter((d) => d.status === 'drawn') : []);
```

- [ ] **Step 5: Implement `src/lib/reports.ts`**

`src/lib/reports.ts`:
```ts
import Papa from 'papaparse';
import { csvSafe } from './csv';

type Kind = 'text' | 'time' | 'bool' | 'phone';
type Col = { key: string; header: string; kind?: Kind };
type Report = { sql: string; file: string; cols: Col[] };

const person: Col[] = [
  { key: 'employee_id', header: 'Employee ID' },
  { key: 'full_name', header: 'Name' },
  { key: 'outlet', header: 'Outlet' },
  { key: 'department', header: 'Department' },
];

/** `sql` is the report name `report_rows` expects. Column order lives here because jsonb objects have no order. */
export const REPORTS = {
  guests: {
    sql: 'guests', file: 'nourishfest-guests.csv',
    cols: [
      ...person,
      { key: 'position', header: 'Position' }, { key: 'category', header: 'Category' }, { key: 'rsvp_status', header: 'RSVP' },
      { key: 'opened', header: 'Opened invitation', kind: 'bool' }, { key: 'checked_in_at', header: 'Checked in at', kind: 'time' },
      { key: 'prize_number', header: 'Door Prize no.' }, { key: 'merchandise', header: 'Merchandise' },
      { key: 'walk_in', header: 'Walk-in', kind: 'bool' }, { key: 'active', header: 'Active', kind: 'bool' },
    ],
  },
  'check-ins': {
    sql: 'check_ins', file: 'nourishfest-check-ins.csv',
    cols: [
      { key: 'checked_in_at', header: 'Time', kind: 'time' }, { key: 'prize_number', header: 'Door Prize no.' }, ...person,
      { key: 'method', header: 'Method' }, { key: 'station', header: 'Station' }, { key: 'actor', header: 'Staff' },
    ],
  },
  merchandise: {
    sql: 'merchandise', file: 'nourishfest-merchandise.csv',
    cols: [
      { key: 'redeemed_at', header: 'Time', kind: 'time' }, { key: 'status', header: 'Status' },
      { key: 'employee_id', header: 'Employee ID' }, { key: 'full_name', header: 'Name' }, { key: 'outlet', header: 'Outlet' },
      { key: 'station', header: 'Booth' }, { key: 'actor', header: 'Staff' }, { key: 'void_reason', header: 'Void reason' },
    ],
  },
  draws: {
    sql: 'draws', file: 'nourishfest-draw-history.csv',
    cols: [
      { key: 'drawn_at', header: 'Drawn at', kind: 'time' }, { key: 'prize', header: 'Prize' }, { key: 'slot', header: 'Slot' },
      { key: 'prize_number', header: 'Door Prize no.' }, ...person,
      { key: 'status', header: 'Status' }, { key: 'drawn_by', header: 'Drawn by' },
      { key: 'resolved_at', header: 'Resolved at', kind: 'time' }, { key: 'resolved_by', header: 'Resolved by' },
      { key: 'void_reason', header: 'Void reason' },
    ],
  },
  audit: {
    sql: 'audit', file: 'nourishfest-audit.csv',
    cols: [
      { key: 'at', header: 'Time', kind: 'time' }, { key: 'actor_type', header: 'Actor type' }, { key: 'actor', header: 'Actor' },
      { key: 'action', header: 'Action' }, { key: 'entity', header: 'Entity' }, { key: 'entity_id', header: 'Entity ID' },
      { key: 'details', header: 'Details' },
    ],
  },
  'rsvp-pending': {
    sql: 'rsvp_pending', file: 'nourishfest-rsvp-not-answered.csv',
    cols: [
      ...person, { key: 'phone', header: 'Phone', kind: 'phone' }, { key: 'opened', header: 'Opened invitation', kind: 'bool' },
    ],
  },
} satisfies Record<string, Report>;

export type ReportName = keyof typeof REPORTS;
export const isReportName = (s: string): s is ReportName => Object.hasOwn(REPORTS, s);

const stamp = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Makassar', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
/** "2026-12-10 17:42:05" in WITA. */
export const witaStamp = (iso: string | null | undefined): string => (iso ? stamp.format(new Date(iso)) : '');

function cell(value: unknown, kind: Kind = 'text'): string {
  if (value === null || value === undefined) return '';
  if (kind === 'time') return witaStamp(String(value));
  if (kind === 'bool') return value ? 'yes' : 'no';
  if (kind === 'phone') return String(value).replace(/\D/g, ''); // digits only: a leading "+" would be read as a formula
  return csvSafe(String(value));
}

export function buildReportCsv(name: ReportName, rows: Record<string, unknown>[]): string {
  const { cols } = REPORTS[name];
  // Object form with explicit fields, so an empty list still produces the header row.
  return '\uFEFF' + Papa.unparse({
    fields: cols.map((c) => c.header),
    data: rows.map((r) => cols.map((c) => cell(r[c.key], c.kind))),
  });
}
```

- [ ] **Step 6: Implement `src/lib/stage-session.ts`**

`src/lib/stage-session.ts`:
```ts
import { SignJWT, jwtVerify } from 'jose';
import { parseCookies } from './api';
import { rpc } from './db';
import { env } from './env';

export const STAGE_COOKIE = 'nf_stage';
const key = () => new TextEncoder().encode(env().STATION_SESSION_SECRET);

/** `tag` is the 12-character fingerprint of the current display key (SQL `stage_key_tag`). */
export async function signStage(tag: string): Promise<string> {
  return new SignJWT({ k: tag })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience('stage')
    .setIssuedAt()
    .setExpirationTime('36h')
    .sign(key());
}

export const stageCookie = (value: string, maxAge = 36 * 3600) => ({
  name: STAGE_COOKIE, value, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge,
});

/** Valid signature, right audience, and the fingerprint still matches the current key (rotating the key signs displays out). */
export async function verifyStageCookie(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  let tag: string;
  try {
    const { payload } = await jwtVerify(value, key(), { algorithms: ['HS256'], audience: 'stage' });
    tag = String(payload.k ?? '');
  } catch {
    return false;
  }
  const current = await rpc<string | null>('stage_key_tag', { p_event: env().EVENT_ID });
  return !!current && current === tag;
}

export const readStage = (req: Request): Promise<boolean> =>
  verifyStageCookie(parseCookies(req.headers.get('cookie'))[STAGE_COOKIE]);
```

- [ ] **Step 7: Run the unit tests to verify they pass**

Run: `npm run test:unit -- stage draw-ui reports`
Expected: PASS (all three files).

- [ ] **Step 8: Typecheck, lint and commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

```bash
git add src/lib tests/unit
git commit -m "feat: stage model, operator helpers, report definitions and stage cookie"
```

---

## Task 25: Station API — prizes, draw, current, resolve, stage banner, number lookup

**Files:**
- Create: `src/app/api/station/prizes/route.ts`, `src/app/api/station/prizes/lookup-number/route.ts`, `src/app/api/station/draw/route.ts`, `src/app/api/station/draw/current/route.ts`, `src/app/api/station/draw/resolve/route.ts`, `src/app/api/station/draw/stage/route.ts`
- Create: `tests/api/draw-helpers.ts`
- Test: `tests/api/draw.test.ts`

**Interfaces:**
- Consumes: `stationPost`, `stationGet`, `actorId`, `ok`, `rpc`, `env`; SQL `prize_list`, `draw_prize`, `draw_current`, `resolve_draw`, `resolve_round`, `set_stage`, `lookup_prize_number`.
- Produces (all `ok(status, data)`; business statuses are HTTP 200):
  - `GET /api/station/prizes` (draw, prizes) → `OK { prizes }`.
  - `GET /api/station/draw/current` (draw, prizes) → `OK { round, oldest_pending_at, stage, heartbeat_age }`.
  - `POST /api/station/draw {prize_id, request_id}` (draw) → `DRAWN` / `DRAW_IN_PROGRESS` / `PRIZE_COMPLETE` / `NO_ELIGIBLE_GUESTS` / `PRIZE_NOT_FOUND`; `data` is the SQL result (round with names, `short_by`, `idempotent`).
  - `POST /api/station/draw/resolve {draw_id, outcome: 'confirm'|'no_show'}` or `{round_id, outcome: 'confirm_all'}` (draw, prizes) → `CONFIRMED` / `VOIDED` / `ALREADY_CONFIRMED` / `DRAW_VOID` / `NOT_FOUND` / `NOTHING_TO_CONFIRM`.
  - `POST /api/station/draw/stage {phase: 'idle'|'intro', prize_id?}` (draw) → `OK` / `DRAW_IN_PROGRESS` / `PRIZE_NOT_FOUND`. `intro` without `prize_id` is a 400.
  - `POST /api/station/prizes/lookup-number {number}` (draw, prizes) → `NO_SUCH_NUMBER` / `NOT_A_WINNER` / `PENDING` / `WINNER`.
  - A signed-in admin is accepted on all of them (Plan 1's wrappers), acting as the e-mail.

- [ ] **Step 1: Write the test helpers and the failing API test**

`tests/api/draw-helpers.ts`:
```ts
import { expect } from 'vitest';
import { EVENT, svc, type TestGuest } from './helpers';

/** Checks every guest in through the real function, so each gets a Door Prize number. */
export async function arrive(guests: TestGuest[]) {
  for (const g of guests) {
    const { data, error } = await svc().rpc('check_in', {
      p_event: EVENT, p_token: g.invite_token, p_guest_id: null, p_method: 'scan', p_station_label: 'Meja 1', p_actor: 'test',
    });
    expect(error).toBeNull();
    expect(data.status).toBe('CHECKED_IN');
  }
}

export async function newPrize(data: Record<string, unknown>): Promise<string> {
  const { data: r, error } = await svc().rpc('admin_save_prize', { p_event: EVENT, p_id: null, p_data: data, p_actor: 'test' });
  expect(error).toBeNull();
  expect(r.status).toBe('OK');
  return r.id as string;
}

/** Call after `resetEvent()` (which already removes draws). */
export async function clearPrizes() {
  await svc().from('draws').delete().eq('event_id', EVENT);
  await svc().from('prizes').delete().eq('event_id', EVENT);
}

export const stageRow = async () => (await svc().from('stage_state').select('*').eq('event_id', EVENT).single()).data!;
```

`tests/api/draw.test.ts`:
```ts
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GET as current } from '@/app/api/station/draw/current/route';
import { POST as drawRoute } from '@/app/api/station/draw/route';
import { POST as resolveRoute } from '@/app/api/station/draw/resolve/route';
import { POST as stageRoute } from '@/app/api/station/draw/stage/route';
import { GET as prizesRoute } from '@/app/api/station/prizes/route';
import { POST as lookup } from '@/app/api/station/prizes/lookup-number/route';
import { arrive, clearPrizes, newPrize, stageRow } from './draw-helpers';
import { getReq, loginAs, postJson, resetEvent, seedGuests, setupPins, type TestGuest } from './helpers';

let g: TestGuest[];
let mc: string;
let desk: string;
let single: string;
let batch: string;
const json = (r: Response) => r.json();
const draw = (prize_id: string, request_id = randomUUID(), c = mc) => drawRoute(postJson('/api/station/draw', { prize_id, request_id }, c));
const resolve = (body: object, c = mc) => resolveRoute(postJson('/api/station/draw/resolve', body, c));
const stage = (body: object, c = mc) => stageRoute(postJson('/api/station/draw/stage', body, c));

beforeAll(setupPins);
beforeEach(async () => {
  await resetEvent();
  await clearPrizes();
  g = await seedGuests(4);
  await arrive(g);
  single = await newPrize({ name: 'T-Single', tier: 'Hadiah Utama', quantity: 2 });
  batch = await newPrize({ name: 'T-Batch', tier: 'Hiburan', quantity: 3, draw_as_batch: true });
  mc = await loginAs('draw', 'Meja 1');
  desk = await loginAs('prizes', 'Meja 2');
});
afterAll(async () => {
  await resetEvent();
  await clearPrizes();
});

describe('access', () => {
  it('needs a session, and the draw or prizes role', async () => {
    expect((await drawRoute(postJson('/api/station/draw', { prize_id: single, request_id: randomUUID() }))).status).toBe(401);
    expect((await draw(single, randomUUID(), await loginAs('checkin'))).status).toBe(403);
    expect((await draw(single, randomUUID(), await loginAs('merchandise'))).status).toBe(403);
    expect((await current(getReq('/api/station/draw/current', await loginAs('checkin')))).status).toBe(403);
  });
  it('lets the prizes desk read and confirm, but not draw or change the stage', async () => {
    expect((await draw(single, randomUUID(), desk)).status).toBe(403);
    expect((await stage({ phase: 'idle' }, desk)).status).toBe(403);
    expect((await current(getReq('/api/station/draw/current', desk))).status).toBe(200);
    expect((await prizesRoute(getReq('/api/station/prizes', desk))).status).toBe(200);
  });
  it('rejects a foreign Origin', async () => {
    const req = new Request('http://localhost/api/station/draw', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example', cookie: mc },
      body: JSON.stringify({ prize_id: single, request_id: randomUUID() }),
    });
    expect((await drawRoute(req)).status).toBe(403);
  });
  it.each([{}, { prize_id: 'nope', request_id: randomUUID() }, { prize_id: randomUUID() }])('400 on bad input %j', async (body) => {
    expect((await drawRoute(postJson('/api/station/draw', body, mc))).status).toBe(400);
  });
});

describe('prize list', () => {
  it('returns the prizes with what is left', async () => {
    const j = await json(await prizesRoute(getReq('/api/station/prizes', mc)));
    expect(j.status).toBe('OK');
    const s = j.data.prizes.find((p: { name: string }) => p.name === 'T-Single');
    expect(s).toMatchObject({ quantity: 2, remaining: 2, confirmed: 0, pending: 0 });
  });
});

describe('drawing', () => {
  it('draws one winner, shows the operator the name and the stage only the number', async () => {
    const j = await json(await draw(single));
    expect(j.status).toBe('DRAWN');
    expect(j.data.draws).toHaveLength(1);
    const d = j.data.draws[0];
    expect(d).toMatchObject({ slot: 1, status: 'drawn' });
    expect(g.map((x) => x.full_name)).toContain(d.name);

    const row = await stageRow();
    expect(row.phase).toBe('rolling');
    expect(row.payload.prize.name).toBe('T-Single');
    expect(row.payload.slots).toEqual([{ slot: 1, number: d.number, state: 'rolling' }]);
    expect(JSON.stringify(row)).not.toContain(d.name);
  });

  it('repeats the same answer for the same request id and refuses a second draw while one is open', async () => {
    const rid = randomUUID();
    const a = await json(await draw(single, rid));
    const b = await json(await draw(single, rid));
    expect(b.status).toBe('DRAWN');
    expect(b.data.idempotent).toBe(true);
    expect(b.data.draws[0].id).toBe(a.data.draws[0].id);
    expect((await json(await draw(single))).status).toBe('DRAW_IN_PROGRESS');
    expect((await json(await draw(batch))).status).toBe('DRAW_IN_PROGRESS');
  });

  it('confirms: the name reaches the stage only now', async () => {
    const a = await json(await draw(single));
    const d = a.data.draws[0];
    const r = await json(await resolve({ draw_id: d.id, outcome: 'confirm' }));
    expect(r.status).toBe('CONFIRMED');
    const row = await stageRow();
    expect(row.phase).toBe('revealed');
    expect(row.payload.slots[0]).toMatchObject({ state: 'revealed', name: d.name, outlet: 'Outlet A' });
    expect((await json(await resolve({ draw_id: d.id, outcome: 'confirm' }, desk))).status).toBe('ALREADY_CONFIRMED');
    expect((await json(await resolve({ draw_id: d.id, outcome: 'no_show' }))).status).toBe('ALREADY_CONFIRMED');
  });

  it('lets the prizes desk confirm as the backup', async () => {
    const a = await json(await draw(single));
    expect((await json(await resolve({ draw_id: a.data.draws[0].id, outcome: 'confirm' }, desk))).status).toBe('CONFIRMED');
  });

  it('voids a no-show, shows the void state without a name, and redraws the same slot in the same round', async () => {
    const a = await json(await draw(single));
    const d = a.data.draws[0];
    expect((await json(await resolve({ draw_id: d.id, outcome: 'no_show' }))).status).toBe('VOIDED');
    const row = await stageRow();
    expect(row.phase).toBe('void');
    expect(JSON.stringify(row)).not.toContain(d.name);
    const b = await json(await draw(single));
    expect(b.status).toBe('DRAWN');
    expect(b.data.round_id).toBe(a.data.round_id);
    expect(b.data.draws[0]).toMatchObject({ slot: 1, redraw_of: d.id });
    expect(b.data.draws[0].number).not.toBe(d.number);
  });

  it('draws a batch together and confirms it with one tap', async () => {
    const a = await json(await draw(batch));
    expect(a.data.draws).toHaveLength(3);
    expect((await json(await resolve({ draw_id: a.data.draws[0].id, outcome: 'confirm' }))).status).toBe('CONFIRMED');
    expect((await stageRow()).phase).toBe('rolling'); // two tiles still open
    const all = await json(await resolve({ round_id: a.data.round_id, outcome: 'confirm_all' }));
    expect(all).toMatchObject({ status: 'CONFIRMED', data: { confirmed: 2 } });
    expect((await stageRow()).phase).toBe('revealed');
    expect((await json(await resolve({ round_id: a.data.round_id, outcome: 'confirm_all' }))).status).toBe('NOTHING_TO_CONFIRM');
  });

  it('reports a finished prize and an unknown prize', async () => {
    const a = await json(await draw(single));
    await resolve({ draw_id: a.data.draws[0].id, outcome: 'confirm' });
    const b = await json(await draw(single));
    await resolve({ draw_id: b.data.draws[0].id, outcome: 'confirm' });
    expect((await json(await draw(single))).status).toBe('PRIZE_COMPLETE');
    expect((await json(await draw(randomUUID()))).status).toBe('PRIZE_NOT_FOUND');
  });

  it('draws everyone available when the batch is bigger than the pool', async () => {
    const big = await newPrize({ name: 'T-Big', quantity: 10, draw_as_batch: true });
    const a = await json(await draw(big));
    expect(a.data.draws).toHaveLength(4);
    expect(a.data.short_by).toBe(6);
    await resolve({ round_id: a.data.round_id, outcome: 'confirm_all' });
    expect((await json(await draw(single))).status).toBe('NO_ELIGIBLE_GUESTS');
  });
});

describe('current', () => {
  it('shows nothing before the first draw, then the open round and the stage', async () => {
    const empty = await json(await current(getReq('/api/station/draw/current', mc)));
    expect(empty).toMatchObject({ status: 'OK', data: { round: null, heartbeat_age: null } });
    await draw(single);
    const j = await json(await current(getReq('/api/station/draw/current', desk)));
    expect(j.data.round.pending).toBe(1);
    expect(j.data.round.draws[0].name).toBeTruthy();
    expect(j.data.stage.phase).toBe('rolling');
    expect(j.data.oldest_pending_at).toBeTruthy();
  });
});

describe('stage banner', () => {
  it('shows a prize banner and blanks the screen', async () => {
    expect((await json(await stage({ phase: 'intro', prize_id: single }))).status).toBe('OK');
    expect(await stageRow()).toMatchObject({ phase: 'intro', payload: { prize: { name: 'T-Single' } } });
    expect((await json(await stage({ phase: 'idle' }))).status).toBe('OK');
    expect((await stageRow()).phase).toBe('idle');
  });
  it('needs a prize for the banner, refuses unknown prizes, and cannot overwrite an open draw', async () => {
    expect((await stage({ phase: 'intro' })).status).toBe(400);
    expect((await stage({ phase: 'rolling' })).status).toBe(400);
    expect((await json(await stage({ phase: 'intro', prize_id: randomUUID() }))).status).toBe('PRIZE_NOT_FOUND');
    await draw(single);
    expect((await json(await stage({ phase: 'idle' }))).status).toBe('DRAW_IN_PROGRESS');
  });
});

describe('number lookup', () => {
  it('finds a pending and a confirmed winner, and a guest who did not win', async () => {
    const a = await json(await draw(single));
    const d = a.data.draws[0];
    const look = async (number: number) => json(await lookup(postJson('/api/station/prizes/lookup-number', { number }, desk)));
    expect(await look(d.number)).toMatchObject({ status: 'PENDING', data: { name: d.name, prize: { name: 'T-Single' } } });
    await resolve({ draw_id: d.id, outcome: 'confirm' });
    expect(await look(d.number)).toMatchObject({ status: 'WINNER', data: { slot: 1 } });
    const other = [1, 2, 3, 4].find((n) => n !== d.number)!;
    expect((await look(other)).status).toBe('NOT_A_WINNER');
    expect((await look(999)).status).toBe('NO_SUCH_NUMBER');
  });
  it('rejects a non-integer number', async () => {
    for (const number of [0, -1, 1.5, '3', null]) {
      expect((await lookup(postJson('/api/station/prizes/lookup-number', { number }, desk))).status).toBe(400);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:api -- draw`
Expected: FAIL — cannot resolve the new route modules.

- [ ] **Step 3: Implement the routes**

`src/app/api/station/prizes/route.ts`:
```ts
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { stationGet } from '@/lib/routes';

export const GET = stationGet(['draw', 'prizes'], async () => {
  const r = await rpc<{ prizes: unknown[] }>('prize_list', { p_event: env().EVENT_ID });
  return ok('OK', { prizes: r.prizes });
});
```
`src/app/api/station/prizes/lookup-number/route.ts`:
```ts
import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { stationPost } from '@/lib/routes';

const schema = z.object({ number: z.number().int().min(1).max(100_000) });

export const POST = stationPost(['draw', 'prizes'], schema, async ({ body }) => {
  const r = await rpc<{ status: string }>('lookup_prize_number', { p_event: env().EVENT_ID, p_number: body.number });
  return ok(r.status, r);
});
```
`src/app/api/station/draw/route.ts`:
```ts
import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, stationPost } from '@/lib/routes';

const schema = z.object({ prize_id: z.string().uuid(), request_id: z.string().uuid() });

export const POST = stationPost(['draw'], schema, async ({ actor, body }) => {
  const r = await rpc<{ status: string }>('draw_prize', {
    p_event: env().EVENT_ID, p_prize_id: body.prize_id, p_request_id: body.request_id, p_actor: actorId(actor),
  });
  return ok(r.status, r);
});
```
`src/app/api/station/draw/current/route.ts`:
```ts
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { stationGet } from '@/lib/routes';

export const GET = stationGet(['draw', 'prizes'], async () => {
  const r = await rpc<Record<string, unknown>>('draw_current', { p_event: env().EVENT_ID });
  return ok('OK', r);
});
```
`src/app/api/station/draw/resolve/route.ts`:
```ts
import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, stationPost } from '@/lib/routes';

const schema = z.union([
  z.object({ draw_id: z.string().uuid(), outcome: z.enum(['confirm', 'no_show']) }),
  z.object({ round_id: z.string().uuid(), outcome: z.literal('confirm_all') }),
]);

export const POST = stationPost(['draw', 'prizes'], schema, async ({ actor, body }) => {
  const r =
    'draw_id' in body
      ? await rpc<{ status: string }>('resolve_draw', {
          p_event: env().EVENT_ID, p_draw_id: body.draw_id, p_outcome: body.outcome, p_actor: actorId(actor),
        })
      : await rpc<{ status: string }>('resolve_round', { p_event: env().EVENT_ID, p_round: body.round_id, p_actor: actorId(actor) });
  return ok(r.status, r);
});
```
`src/app/api/station/draw/stage/route.ts`:
```ts
import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, stationPost } from '@/lib/routes';

const schema = z
  .object({ phase: z.enum(['idle', 'intro']), prize_id: z.string().uuid().optional() })
  .refine((b) => b.phase === 'idle' || !!b.prize_id);

export const POST = stationPost(['draw'], schema, async ({ actor, body }) => {
  const r = await rpc<{ status: string }>('set_stage', {
    p_event: env().EVENT_ID, p_phase: body.phase, p_prize_id: body.prize_id ?? null, p_actor: actorId(actor),
  });
  return ok(r.status, r);
});
```

- [ ] **Step 4: Run the API tests to verify they pass**

Run: `npm run test:api -- draw`
Expected: PASS. Then the whole suite: `npm run test:unit && npm run test:api` — Plan 1's tests must still pass (the rehearsal reset now also clears draws).

- [ ] **Step 5: Typecheck, lint and commit**

Run: `npx tsc --noEmit && npm run lint`

```bash
git add src tests
git commit -m "feat: station API for prizes, draw, confirm, no-show, stage banner and number lookup"
```

---

## Task 26: Stage API and admin API — prizes, draws, dashboard, reports, audit, stage key and options

**Files:**
- Create: `src/app/api/stage/enter/route.ts`, `src/app/api/stage/state/route.ts`, `src/app/api/stage/heartbeat/route.ts`
- Create: `src/app/api/admin/prizes/route.ts`, `src/app/api/admin/prizes/[id]/delete/route.ts`, `src/app/api/admin/draws/route.ts`, `src/app/api/admin/draws/[id]/void/route.ts`, `src/app/api/admin/reports/[name]/route.ts`, `src/app/api/admin/audit/route.ts`, `src/app/api/admin/stage/route.ts`, `src/app/api/admin/settings/stage-key/route.ts`, `src/app/api/admin/settings/stage-options/route.ts`
- Modify: `src/app/api/admin/dashboard/route.ts`
- Test: `tests/api/stage.test.ts`, `tests/api/admin-draw.test.ts`

**Interfaces:**
- Consumes: `guard`, `ok`, `fail`, `sameOrigin`, `clientIp`, `adminGet`, `adminPost`, `actorId`, `rpc`, `env`, `readStage`, `signStage`, `stageCookie`, `REPORTS`, `isReportName`, `buildReportCsv`; SQL from Tasks 18–22.
- Produces:
  - `GET /api/stage/enter?key=` → 302 to `/stage` with cookie `nf_stage`, or 302 to `/stage?error=invalid|locked|notset` with no cookie.
  - `GET /api/stage/state` (cookie) → `OK {rev, phase, payload, options}`; no or stale cookie → 401. `POST /api/stage/heartbeat` (cookie, same Origin) → `OK`.
  - `GET /api/admin/prizes` → `OK {prizes}`. `POST /api/admin/prizes {id?, name?, tier?, quantity?, draw_as_batch?, sort_order?}` → SQL status (`OK` with `id`, `INVALID`, `NAME_IN_USE`, `NOT_FOUND`, `QUANTITY_TOO_LOW`, `LOCKED_BY_DRAWS`). `POST /api/admin/prizes/[id]/delete {}` → `OK` / `NOT_FOUND` / `HAS_DRAWS`.
  - `GET /api/admin/draws` → `OK {draws}`. `POST /api/admin/draws/[id]/void {reason}` → `OK` / `REASON_REQUIRED` / `NOT_FOUND` / `NOT_VOIDABLE`.
  - `GET /api/admin/dashboard` → `OK` with `{counts, outlets, prizes, draw, stage, recent}` (a superset of Plan 1's `{counts, recent}`).
  - `GET /api/admin/reports/[name]` (`guests`, `check-ins`, `merchandise`, `draws`, `audit`, `rsvp-pending`) → `text/csv` attachment, audited as `report_exported`; unknown name → 400.
  - `GET /api/admin/audit?before=&limit=` → `OK {rows}`.
  - `GET /api/admin/stage` → `OK {stage, heartbeat_age, key_set}`. `POST /api/admin/settings/stage-key {}` → `OK {key, url}` (the only time the key is visible). `POST /api/admin/settings/stage-options {safe_mode?, reduce_effects?, language?}` → `OK` / `INVALID`.

- [ ] **Step 1: Write the failing API tests**

`tests/api/stage.test.ts`:
```ts
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GET as enter } from '@/app/api/stage/enter/route';
import { POST as heartbeat } from '@/app/api/stage/heartbeat/route';
import { GET as state } from '@/app/api/stage/state/route';
import { EVENT, getReq, loginAs, mergeCookies, postJson, resetEvent, setupPins, svc } from './helpers';

const KEY = 'Abcdefghijklmnop12345678';
const setKey = (k: string) => svc().rpc('set_stage_key', { p_event: EVENT, p_key: k, p_actor: 'test' });
const goto = (path: string, ip = '10.0.0.1') => new Request(`http://localhost${path}`, { headers: { 'x-forwarded-for': ip } });
const location = (r: Response) => new URL(r.headers.get('location')!, 'http://localhost');

beforeAll(setupPins);
beforeEach(async () => {
  await resetEvent(); // also clears auth_attempts
  expect((await setKey(KEY)).data.status).toBe('OK');
});

describe('entering with the display key', () => {
  it('sets an httpOnly cookie and redirects to /stage without the key', async () => {
    const res = await enter(goto(`/api/stage/enter?key=${KEY}`));
    expect(res.status).toBe(302);
    expect(location(res).pathname).toBe('/stage');
    expect(location(res).search).toBe('');
    expect(res.headers.getSetCookie().join('\n')).toMatch(/nf_stage=.+HttpOnly/i);
  });
  it('refuses a wrong key without a cookie', async () => {
    const res = await enter(goto('/api/stage/enter?key=wrong'));
    expect(location(res).search).toBe('?error=invalid');
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });
  it('says so when no key has been set', async () => {
    await svc().from('events').update({ display_key_hash: null }).eq('id', EVENT);
    expect(location(await enter(goto(`/api/stage/enter?key=${KEY}`))).search).toBe('?error=notset');
  });
  it('locks an address after 20 wrong keys but not other addresses', async () => {
    for (let i = 0; i < 20; i++) await enter(goto('/api/stage/enter?key=wrong', '10.9.9.9'));
    expect(location(await enter(goto(`/api/stage/enter?key=${KEY}`, '10.9.9.9'))).search).toBe('?error=locked');
    expect(location(await enter(goto(`/api/stage/enter?key=${KEY}`, '10.1.1.1'))).pathname).toBe('/stage');
  });
});

describe('state and heartbeat', () => {
  const cookieFor = async () => mergeCookies('', await enter(goto(`/api/stage/enter?key=${KEY}`)));

  it('answers 401 without the cookie, with a station cookie, and with a garbage cookie', async () => {
    expect((await state(getReq('/api/stage/state'))).status).toBe(401);
    expect((await state(getReq('/api/stage/state', 'nf_stage=garbage'))).status).toBe(401);
    expect((await state(getReq('/api/stage/state', await loginAs('draw')))).status).toBe(401); // a station session is not a display
    expect((await heartbeat(postJson('/api/stage/heartbeat', {}))).status).toBe(401);
  });
  it('returns the current row with the cookie', async () => {
    const j = await (await state(getReq('/api/stage/state', await cookieFor()))).json();
    expect(j).toMatchObject({ ok: true, status: 'OK', data: { phase: 'idle', options: { language: 'id' } } });
    expect(typeof j.data.rev).toBe('number');
  });
  it('records a heartbeat, and refuses one from another Origin', async () => {
    const c = await cookieFor();
    expect((await heartbeat(postJson('/api/stage/heartbeat', {}, c))).status).toBe(200);
    const age = await svc().rpc('stage_heartbeat_age', { p_event: EVENT });
    expect(age.data).toBeLessThanOrEqual(2);
    const bad = new Request('http://localhost/api/stage/heartbeat', { method: 'POST', headers: { origin: 'https://evil.example', cookie: c }, body: '{}' });
    expect((await heartbeat(bad)).status).toBe(403);
  });
  it('signs the display out when the key is rotated', async () => {
    const c = await cookieFor();
    expect((await state(getReq('/api/stage/state', c))).status).toBe(200);
    await setKey('Zyxwvutsrqponmlk98765432');
    expect((await state(getReq('/api/stage/state', c))).status).toBe(401);
  });
});
```

`tests/api/admin-draw.test.ts`:
```ts
import Papa from 'papaparse';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/admin-auth', () => ({ getAdmin: vi.fn() }));

import { getAdmin } from '@/lib/admin-auth';
import { GET as auditRoute } from '@/app/api/admin/audit/route';
import { GET as dashboard } from '@/app/api/admin/dashboard/route';
import { GET as listDraws } from '@/app/api/admin/draws/route';
import { POST as voidDraw } from '@/app/api/admin/draws/[id]/void/route';
import { POST as deletePrize } from '@/app/api/admin/prizes/[id]/delete/route';
import { GET as listPrizes, POST as savePrize } from '@/app/api/admin/prizes/route';
import { GET as report } from '@/app/api/admin/reports/[name]/route';
import { GET as stageInfo } from '@/app/api/admin/stage/route';
import { POST as stageKey } from '@/app/api/admin/settings/stage-key/route';
import { POST as stageOptions } from '@/app/api/admin/settings/stage-options/route';
import { arrive, clearPrizes, newPrize, stageRow } from './draw-helpers';
import { EVENT, getReq, loginAs, postJson, resetEvent, seedGuests, setupPins, svc, type TestGuest } from './helpers';

const asAdmin = () => vi.mocked(getAdmin).mockResolvedValue({ email: 'dev-admin@example.com' });
const asNobody = () => vi.mocked(getAdmin).mockResolvedValue(null);
const json = (r: Response) => r.json();
const withId = (id: string) => ({ params: Promise.resolve({ id }) });
const withName = (name: string) => ({ params: Promise.resolve({ name }) });
let g: TestGuest[];

beforeAll(setupPins);
beforeEach(async () => {
  asAdmin();
  await resetEvent();
  await clearPrizes();
  g = await seedGuests(3);
  await arrive(g);
});
afterAll(async () => {
  await resetEvent();
  await clearPrizes();
});

describe('access', () => {
  it('answers 401 without an admin session, even with a station cookie', async () => {
    asNobody();
    const station = await loginAs('draw');
    expect((await listPrizes(getReq('/api/admin/prizes', station))).status).toBe(401);
    expect((await dashboard(getReq('/api/admin/dashboard', station))).status).toBe(401);
    expect((await report(getReq('/api/admin/reports/guests', station), withName('guests'))).status).toBe(401);
    expect((await stageKey(postJson('/api/admin/settings/stage-key', {}, station))).status).toBe(401);
  });
});

describe('prizes', () => {
  it('creates, updates and lists a prize', async () => {
    const c = await json(await savePrize(postJson('/api/admin/prizes', { name: 'T-Prize', tier: 'Utama', quantity: 2 })));
    expect(c.status).toBe('OK');
    const u = await json(await savePrize(postJson('/api/admin/prizes', { id: c.data.id, quantity: 5, draw_as_batch: true })));
    expect(u.status).toBe('OK');
    const list = await json(await listPrizes(getReq('/api/admin/prizes')));
    expect(list.data.prizes.find((p: { id: string }) => p.id === c.data.id)).toMatchObject({ name: 'T-Prize', quantity: 5, draw_as_batch: true });
  });
  it('reports a duplicate name, bad input, and an unknown prize', async () => {
    await newPrize({ name: 'T-Dup' });
    expect((await json(await savePrize(postJson('/api/admin/prizes', { name: 'T-Dup' })))).status).toBe('NAME_IN_USE');
    expect((await savePrize(postJson('/api/admin/prizes', { name: 'X', quantity: 0 }))).status).toBe(400);
    expect((await savePrize(postJson('/api/admin/prizes', { name: 'X', quantity: 501 }))).status).toBe(400);
    expect((await json(await savePrize(postJson('/api/admin/prizes', { name: '   ' })))).status).toBe('INVALID');
    expect((await json(await savePrize(postJson('/api/admin/prizes', { id: '00000000-0000-4000-8000-00000000dead', name: 'Z' })))).status).toBe('NOT_FOUND');
  });
  it('deletes a prize without draws and refuses one with draws', async () => {
    const free = await newPrize({ name: 'T-Free' });
    expect((await json(await deletePrize(postJson(`/api/admin/prizes/${free}/delete`, {}), withId(free)))).status).toBe('OK');
    const used = await newPrize({ name: 'T-Used' });
    const { data } = await svc().rpc('draw_prize', { p_event: EVENT, p_prize_id: used, p_request_id: crypto.randomUUID(), p_actor: 'test' });
    expect(data.status).toBe('DRAWN');
    expect((await json(await deletePrize(postJson(`/api/admin/prizes/${used}/delete`, {}), withId(used)))).status).toBe('HAS_DRAWS');
    expect((await deletePrize(postJson('/api/admin/prizes/nope/delete', {}), withId('nope'))).status).toBe(400);
  });
});

describe('draws', () => {
  async function confirmedDraw() {
    const p = await newPrize({ name: 'T-Void', quantity: 2 });
    const { data } = await svc().rpc('draw_prize', { p_event: EVENT, p_prize_id: p, p_request_id: crypto.randomUUID(), p_actor: 'draw' });
    await svc().rpc('resolve_draw', { p_event: EVENT, p_draw_id: data.draws[0].id, p_outcome: 'confirm', p_actor: 'draw' });
    return data.draws[0] as { id: string; name: string };
  }
  it('lists draws with names, newest first', async () => {
    const d = await confirmedDraw();
    const j = await json(await listDraws(getReq('/api/admin/draws')));
    expect(j.data.draws[0]).toMatchObject({ id: d.id, name: d.name, status: 'confirmed', prize: 'T-Void' });
  });
  it('voids a confirmed draw with a reason, blanks the stage, and audits it', async () => {
    const d = await confirmedDraw();
    expect((await json(await voidDraw(postJson(`/api/admin/draws/${d.id}/void`, { reason: 'ok' }), withId(d.id)))).status).toBe('REASON_REQUIRED');
    expect((await json(await voidDraw(postJson(`/api/admin/draws/${d.id}/void`, { reason: 'Winner is a contractor' }), withId(d.id)))).status).toBe('OK');
    expect((await stageRow()).phase).toBe('idle');
    expect((await json(await voidDraw(postJson(`/api/admin/draws/${d.id}/void`, { reason: 'Winner is a contractor' }), withId(d.id)))).status).toBe('NOT_VOIDABLE');
    const { count } = await svc().from('audit_log').select('id', { count: 'exact', head: true }).eq('event_id', EVENT).eq('action', 'draw_void_admin');
    expect(count).toBe(1);
    expect((await voidDraw(postJson('/api/admin/draws/nope/void', { reason: 'long enough' }), withId('nope'))).status).toBe(400);
  });
});

describe('dashboard', () => {
  it('keeps Plan 1 fields and adds outlets, prizes, draw counters and the stage', async () => {
    await newPrize({ name: 'T-Dash', quantity: 3 });
    const j = await json(await dashboard(getReq('/api/admin/dashboard')));
    expect(j.data.counts).toMatchObject({ checked_in: 3, mode: 'rehearsal' });
    expect(j.data.recent.length).toBeLessThanOrEqual(10);
    expect(j.data.outlets[0]).toMatchObject({ outlet: 'Outlet A', checked_in: 3 });
    expect(j.data.prizes.find((p: { name: string }) => p.name === 'T-Dash').remaining).toBe(3);
    expect(j.data.draw).toMatchObject({ confirmed: 0, pending: 0, eligible: 3 });
    expect(j.data.stage).toMatchObject({ phase: 'idle', heartbeat_age: null });
  });
});

describe('reports', () => {
  const parse = (csv: string) => Papa.parse<Record<string, string>>(csv.replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: true });

  it.each(['guests', 'check-ins', 'merchandise', 'draws', 'audit', 'rsvp-pending'])('downloads %s as CSV and audits the export', async (name) => {
    const res = await report(getReq(`/api/admin/reports/${name}`), withName(name));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain(`nourishfest-`);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const text = await res.text();
    expect(text.startsWith('\uFEFF')).toBe(true);
    expect(parse(text).meta.fields!.length).toBeGreaterThan(3);
    const { count } = await svc().from('audit_log').select('id', { count: 'exact', head: true }).eq('event_id', EVENT).eq('action', 'report_exported');
    expect(count).toBeGreaterThanOrEqual(1);
  });
  it('contains the real rows, in WITA, with formulas neutralised', async () => {
    await svc().from('guests').update({ full_name: '=HYPERLINK("http://x")' }).eq('id', g[0].id);
    const guests = parse(await (await report(getReq('/api/admin/reports/guests'), withName('guests'))).text());
    expect(guests.data.find((r) => r['Employee ID'] === 'T1')!.Name).toBe(`'=HYPERLINK("http://x")`);
    const cis = parse(await (await report(getReq('/api/admin/reports/check-ins'), withName('check-ins'))).text());
    expect(cis.data).toHaveLength(3);
    expect(cis.data[0].Time).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
  });
  it('rejects an unknown report name', async () => {
    expect((await report(getReq('/api/admin/reports/passwords'), withName('passwords'))).status).toBe(400);
    expect((await report(getReq('/api/admin/reports/__proto__'), withName('__proto__'))).status).toBe(400);
  });
});

describe('audit', () => {
  it('pages newest first', async () => {
    const a = await json(await auditRoute(getReq('/api/admin/audit?limit=2')));
    expect(a.data.rows).toHaveLength(2);
    const next = await json(await auditRoute(getReq(`/api/admin/audit?limit=2&before=${a.data.rows[1].id}`)));
    expect(next.data.rows[0].id).toBeLessThan(a.data.rows[1].id);
  });
  it('ignores a silly limit', async () => {
    expect((await auditRoute(getReq('/api/admin/audit?limit=abc&before=xyz'))).status).toBe(200);
  });
});

describe('stage settings', () => {
  const DEFAULTS = { safe_mode: false, reduce_effects: false, language: 'id' };
  const restore = () => stageOptions(postJson('/api/admin/settings/stage-options', DEFAULTS));

  it('creates a key once, stores only a hash, and the key works on the stage', async () => {
    await svc().from('events').update({ display_key_hash: null }).eq('id', EVENT);
    expect((await json(await stageInfo(getReq('/api/admin/stage')))).data).toMatchObject({ key_set: false });
    const j = await json(await stageKey(postJson('/api/admin/settings/stage-key', {})));
    expect(j.status).toBe('OK');
    expect(j.data.key).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(j.data.url).toBe(`${process.env.APP_URL!.replace(/\/+$/, '')}/stage?key=${j.data.key}`);
    const { data } = await svc().from('events').select('display_key_hash').eq('id', EVENT).single();
    expect(data!.display_key_hash).not.toContain(j.data.key);
    const verify = await svc().rpc('verify_stage_key', { p_event: EVENT, p_key: j.data.key, p_ip_key: 'test' });
    expect(verify.data.status).toBe('OK');
    expect((await json(await stageInfo(getReq('/api/admin/stage')))).data.key_set).toBe(true);
    const { data: rows } = await svc().from('audit_log').select('details').eq('event_id', EVENT);
    expect(JSON.stringify(rows)).not.toContain(j.data.key);
  });

  it('changes the options and refuses nonsense', async () => {
    await restore();
    expect((await json(await stageOptions(postJson('/api/admin/settings/stage-options', { safe_mode: true, language: 'en' })))).status).toBe('OK');
    expect((await stageRow()).options).toMatchObject({ safe_mode: true, reduce_effects: false, language: 'en' });
    expect((await stageOptions(postJson('/api/admin/settings/stage-options', {}))).status).toBe(400);
    expect((await stageOptions(postJson('/api/admin/settings/stage-options', { language: 'fr' }))).status).toBe(400);
    expect((await stageOptions(postJson('/api/admin/settings/stage-options', { sneaky: true }))).status).toBe(400);
    await restore(); // options survive the rehearsal reset, so leave the dev event the way the other tests expect it
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run test:api -- stage admin-draw`
Expected: FAIL — cannot resolve the new route modules.

- [ ] **Step 3: Implement the stage routes**

`src/app/api/stage/enter/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { clientIp, guard } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { signStage, stageCookie } from '@/lib/stage-session';

const NO_STORE = { 'Cache-Control': 'no-store' };

export const GET = guard(async (req: Request) => {
  const key = (new URL(req.url).searchParams.get('key') ?? '').slice(0, 80);
  const r = await rpc<{ status: string; tag?: string }>('verify_stage_key', {
    p_event: env().EVENT_ID, p_key: key, p_ip_key: clientIp(req),
  });
  if (r.status !== 'OK' || !r.tag) {
    return NextResponse.redirect(new URL(`/stage?error=${r.status.toLowerCase().replace('_', '')}`, req.url), { status: 302, headers: NO_STORE });
  }
  const res = NextResponse.redirect(new URL('/stage', req.url), { status: 302, headers: NO_STORE });
  res.cookies.set(stageCookie(await signStage(r.tag)));
  return res;
});
```
(`NOT_SET` becomes `notset`, `INVALID` becomes `invalid`, `LOCKED` becomes `locked`.)

`src/app/api/stage/state/route.ts`:
```ts
import { fail, guard, ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { readStage } from '@/lib/stage-session';

export const GET = guard(async (req: Request) => {
  if (!(await readStage(req))) return fail(401, 'NO_SESSION');
  const r = await rpc<{ rev: number; phase: string; payload: unknown; options: unknown }>('get_stage', { p_event: env().EVENT_ID });
  return ok('OK', { rev: r.rev, phase: r.phase, payload: r.payload, options: r.options });
});
```
`src/app/api/stage/heartbeat/route.ts`:
```ts
import { fail, guard, ok, sameOrigin } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { readStage } from '@/lib/stage-session';

export const POST = guard(async (req: Request) => {
  if (!sameOrigin(req)) return fail(403, 'BAD_ORIGIN');
  if (!(await readStage(req))) return fail(401, 'NO_SESSION');
  await rpc('touch_stage_heartbeat', { p_event: env().EVENT_ID });
  return ok('OK');
});
```

- [ ] **Step 4: Implement the admin routes**

`src/app/api/admin/prizes/route.ts`:
```ts
import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminGet, adminPost } from '@/lib/routes';

const schema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().max(80).optional(),
  tier: z.string().max(30).nullable().optional(),
  quantity: z.number().int().min(1).max(500).optional(),
  draw_as_batch: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(100_000).optional(),
});

export const GET = adminGet(async () => {
  const r = await rpc<{ prizes: unknown[] }>('prize_list', { p_event: env().EVENT_ID });
  return ok('OK', { prizes: r.prizes });
});

export const POST = adminPost(schema, async ({ actor, body }) => {
  const { id, ...data } = body;
  const r = await rpc<{ status: string }>('admin_save_prize', {
    p_event: env().EVENT_ID, p_id: id ?? null, p_data: data, p_actor: actorId(actor),
  });
  return ok(r.status, r);
});
```
`src/app/api/admin/prizes/[id]/delete/route.ts`:
```ts
import { z } from 'zod';
import { fail, ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminPost } from '@/lib/routes';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = adminPost(z.object({}), async ({ actor, params }) => {
  if (!UUID.test(params.id ?? '')) return fail(400, 'BAD_INPUT');
  const r = await rpc<{ status: string }>('admin_delete_prize', { p_event: env().EVENT_ID, p_id: params.id, p_actor: actorId(actor) });
  return ok(r.status, r);
});
```
`src/app/api/admin/draws/route.ts`:
```ts
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { adminGet } from '@/lib/routes';

export const GET = adminGet(async () => {
  const r = await rpc<{ draws: unknown[] }>('admin_draw_list', { p_event: env().EVENT_ID });
  return ok('OK', { draws: r.draws });
});
```
`src/app/api/admin/draws/[id]/void/route.ts`:
```ts
import { z } from 'zod';
import { fail, ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminPost } from '@/lib/routes';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = adminPost(z.object({ reason: z.string().max(200) }), async ({ actor, body, params }) => {
  if (!UUID.test(params.id ?? '')) return fail(400, 'BAD_INPUT');
  const r = await rpc<{ status: string }>('admin_void_draw', {
    p_event: env().EVENT_ID, p_draw_id: params.id, p_reason: body.reason, p_actor: actorId(actor),
  });
  return ok(r.status, r);
});
```
`src/app/api/admin/dashboard/route.ts` (replace the whole file):
```ts
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { adminGet } from '@/lib/routes';

export const GET = adminGet(async () => ok('OK', await rpc<Record<string, unknown>>('admin_dashboard', { p_event: env().EVENT_ID })));
```
`src/app/api/admin/reports/[name]/route.ts`:
```ts
import { fail } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { buildReportCsv, isReportName, REPORTS } from '@/lib/reports';
import { actorId, adminGet } from '@/lib/routes';

export const GET = adminGet(async ({ actor, params }) => {
  const name = params.name ?? '';
  if (!isReportName(name)) return fail(400, 'BAD_INPUT');
  const r = await rpc<{ rows: Record<string, unknown>[] }>('report_rows', { p_event: env().EVENT_ID, p_report: REPORTS[name].sql });
  await rpc('audit', {
    p_event: env().EVENT_ID, p_actor_type: 'admin', p_actor: actorId(actor), p_action: 'report_exported',
    p_entity: 'report', p_entity_id: name, p_details: { rows: r.rows.length },
  });
  return new Response(buildReportCsv(name, r.rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${REPORTS[name].file}"`,
      'Cache-Control': 'no-store',
    },
  });
});
```
`src/app/api/admin/audit/route.ts`:
```ts
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { adminGet } from '@/lib/routes';

export const GET = adminGet(async ({ req }) => {
  const q = new URL(req.url).searchParams;
  const before = Number(q.get('before'));
  const limit = Number(q.get('limit'));
  const r = await rpc<{ rows: unknown[] }>('admin_audit_list', {
    p_event: env().EVENT_ID,
    p_before: Number.isInteger(before) && before > 0 ? before : null,
    p_limit: Number.isInteger(limit) && limit > 0 ? limit : 100,
  });
  return ok('OK', { rows: r.rows });
});
```
`src/app/api/admin/stage/route.ts`:
```ts
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { adminGet } from '@/lib/routes';

export const GET = adminGet(async () => {
  const [stage, age, tag] = await Promise.all([
    rpc<Record<string, unknown>>('get_stage', { p_event: env().EVENT_ID }),
    rpc<number | null>('stage_heartbeat_age', { p_event: env().EVENT_ID }),
    rpc<string | null>('stage_key_tag', { p_event: env().EVENT_ID }),
  ]);
  return ok('OK', { stage, heartbeat_age: age, key_set: !!tag });
});
```
`src/app/api/admin/settings/stage-key/route.ts`:
```ts
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminPost } from '@/lib/routes';

/** Makes a new display key. It is returned once; only a bcrypt hash is stored. Every open display is signed out. */
export const POST = adminPost(z.object({}), async ({ actor }) => {
  const key = randomBytes(24).toString('base64url'); // 32 characters of A–Z a–z 0–9 _ -
  const r = await rpc<{ status: string }>('set_stage_key', { p_event: env().EVENT_ID, p_key: key, p_actor: actorId(actor) });
  if (r.status !== 'OK') return ok(r.status);
  return ok('OK', { key, url: `${env().APP_URL.replace(/\/+$/, '')}/stage?key=${key}` });
});
```
`src/app/api/admin/settings/stage-options/route.ts`:
```ts
import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminPost } from '@/lib/routes';

const schema = z
  .object({ safe_mode: z.boolean().optional(), reduce_effects: z.boolean().optional(), language: z.enum(['id', 'en']).optional() })
  .strict()
  .refine((o) => Object.keys(o).length > 0);

export const POST = adminPost(schema, async ({ actor, body }) => {
  const r = await rpc<{ status: string }>('set_stage_options', { p_event: env().EVENT_ID, p_options: body, p_actor: actorId(actor) });
  return ok(r.status, r);
});
```

- [ ] **Step 5: Run the API tests to verify they pass**

Run: `npm run test:api -- stage admin-draw`
Expected: PASS. Then `npm run test:unit && npm run test:api` — Plan 1's `admin-settings` dashboard test still passes against the richer response.

- [ ] **Step 6: Typecheck, lint and commit**

Run: `npx tsc --noEmit && npm run lint`

```bash
git add src tests
git commit -m "feat: stage API (key, state, heartbeat) and admin API (prizes, draws, dashboard, reports, audit, stage settings)"
```

## Task 27: Draw, stage and verification strings, and the projector display (`/stage`)

**Files:**
- Create: `src/lib/i18n/draw-strings.ts`, `src/lib/stage-fit.ts`, `src/lib/stage-sound.ts`, `src/lib/use-stage.ts`
- Create: `src/styles/stage.css`, `src/components/stage/StageView.tsx`, `src/app/stage/StageClient.tsx`, `src/app/stage/page.tsx`
- Modify: `src/lib/i18n/strings.ts`
- Test: `tests/unit/stage-fit.test.ts`, `tests/unit/strings-draw.test.ts`

**Interfaces:**
- Consumes (Task 24): `StageRow`, `SlotView`, `parseRow`, `acceptRow`, `noteRolls`, `slotViews`, `revealDelays`, `bannerText`, `ROLL_MS` from `@/lib/stage`; `readStage`-style cookie check `verifyStageCookie`, `STAGE_COOKIE` from `@/lib/stage-session`. Consumes (Task 26): `GET /api/stage/state`, `POST /api/stage/heartbeat`, `GET /api/stage/enter`. Plan 1: `api` from `@/lib/client`, `translate`, `Lang`, `StringKey`, `padPrize`, `env()`.
- Produces:
  - Strings (both languages) used by Tasks 28 and 29: `draw.*`, `verify.*`, `stage.*` (listed in Step 3).
  - `fitScale(w, h): number`, `gridColumns(n): number`, `ARTBOARD` from `@/lib/stage-fit`.
  - `useStage(cfg: StageConfig)` → `{ row, delays, starts, now, link, signedOut }` from `@/lib/use-stage`.
  - `<StageView row views delays />` — draws one `StageRow`; has no data access of its own.
  - Route `/stage` (server page: key redirect, cookie check, error messages) and `<StageClient url anonKey eventId />`.

The display is the one screen the whole room watches, so it has three rules the code must not bend: it **never draws a name unless the row says `revealed`**, it **only accepts a higher `rev`**, and it **keeps showing the last good state when the network drops**.

- [ ] **Step 1: Write the failing tests**

`tests/unit/stage-fit.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ARTBOARD, fitScale, gridColumns } from '@/lib/stage-fit';

describe('fitScale', () => {
  it('scales the 1280 × 720 artboard to the screen without cropping', () => {
    expect(ARTBOARD).toEqual({ w: 1280, h: 720 });
    expect(fitScale(1280, 720)).toBe(1);
    expect(fitScale(1920, 1080)).toBe(1.5);
    expect(fitScale(1000, 1000)).toBe(1000 / 1280); // width is the limit
    expect(fitScale(2560, 720)).toBe(1); // height is the limit
  });
  it('falls back to 1 for a window that reports no size', () => {
    expect(fitScale(0, 0)).toBe(1);
    expect(fitScale(Number.NaN, 720)).toBe(1);
  });
});

describe('gridColumns', () => {
  it('keeps batch tiles large enough to read from the back of the room', () => {
    expect([1, 2, 3, 4, 6, 7, 12, 13, 20, 21, 50].map(gridColumns)).toEqual([1, 2, 3, 2, 3, 4, 4, 5, 5, 6, 6]);
  });
});
```

`tests/unit/strings-draw.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { STRINGS, translate, type StringKey } from '@/lib/i18n/strings';

describe('draw strings', () => {
  it('match the Design Guide wording', () => {
    expect(translate('id', 'draw.landed_label')).toBe('NOMOR PEMENANG');
    expect(translate('id', 'draw.must_be_present')).toBe('PEMENANG HARUS HADIR · 60 DETIK');
    expect(translate('id', 'draw.progress', { n: 3, total: 12 })).toBe('UNDIAN 3 DARI 12');
    expect(translate('en', 'draw.progress', { n: 3, total: 12 })).toBe('DRAW 3 OF 12');
    expect(translate('id', 'draw.no_show')).toBe('TIDAK HADIR — UNDI ULANG');
    expect(translate('id', 'draw.confirm')).toBe('KONFIRMASI');
    expect(translate('id', 'draw.confirm_handover')).toBe('KONFIRMASI & SERAHKAN');
    expect(translate('id', 'draw.waiting_dots')).toBe('MENUNGGU PEMENANG...');
    expect(translate('id', 'stage.idle')).toBe('UNDIAN DIMULAI SEBENTAR LAGI');
    expect(translate('id', 'draw.next')).toBe('UNDIAN BERIKUTNYA');
  });

  it('carry no congratulations wording on any draw, verify or stage string (HR decision, 10 Oct)', () => {
    const keys = (Object.keys(STRINGS.id) as StringKey[]).filter((k) => /^(draw|verify|stage)\./.test(k));
    expect(keys.length).toBeGreaterThan(30);
    for (const k of keys) {
      for (const lang of ['id', 'en'] as const) {
        expect(translate(lang, k), `${lang} ${k}`).not.toMatch(/selamat|congrat|kamu memenangkan|you won|hooray/i);
      }
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit -- stage-fit strings-draw`
Expected: FAIL — `Cannot find module '@/lib/stage-fit'`, and `draw.landed_label` is not a known key.

- [ ] **Step 3: Add the strings**

`src/lib/i18n/draw-strings.ts`:
```ts
/**
 * Door-prize, prize-verification and stage strings. Kept in one file so the stage display and the operator screens
 * share wording. The five lines at the top are the Design Guide's table; the rest follow the same style.
 * There is deliberately no "congratulations" wording anywhere (HR decision, 10 Oct); a unit test enforces it.
 */
export const DRAW_ID = {
  'draw.landed_label': 'NOMOR PEMENANG',
  'draw.next': 'UNDIAN BERIKUTNYA',
  'draw.must_be_present': 'PEMENANG HARUS HADIR · 60 DETIK',
  'draw.progress': 'UNDIAN {n} DARI {total}',
  'draw.no_show': 'TIDAK HADIR — UNDI ULANG',
  'draw.confirm': 'KONFIRMASI',
  'draw.confirm_handover': 'KONFIRMASI & SERAHKAN',
  'draw.waiting': 'MENUNGGU PEMENANG',
  'draw.waiting_dots': 'MENUNGGU PEMENANG...',

  'draw.title': 'UNDIAN',
  'draw.pick_prize': 'PILIH HADIAH',
  'draw.prize_left': 'SISA {n} DARI {total}',
  'draw.show_prize': 'TAMPILKAN HADIAH',
  'draw.blank_stage': 'LAYAR KOSONG',
  'draw.draw': 'UNDI SEKARANG',
  'draw.draw_batch': 'UNDI {n} PEMENANG',
  'draw.not_here': 'TIDAK HADIR',
  'draw.confirm_all': 'KONFIRMASI SEMUA',
  'draw.recorded': 'TERCATAT',
  'draw.batch_count': '{n} PEMENANG',
  'draw.seconds': '{n} DETIK',
  'draw.stage_ok': 'LAYAR PANGGUNG TERHUBUNG',
  'draw.stage_down': 'LAYAR PANGGUNG TERPUTUS',
  'draw.stage_never': 'LAYAR PANGGUNG BELUM DIBUKA',
  'draw.stage_note': 'Layar panggung hanya menampilkan nomor sampai kamu konfirmasi.',
  'draw.no_eligible': 'Belum ada tamu yang memenuhi syarat.',
  'draw.short_by': 'Hanya {got} pemenang tersedia, kurang {short}.',
  'draw.in_progress': 'Selesaikan undian yang sedang berjalan dulu.',
  'draw.prize_complete': 'Semua pemenang hadiah ini sudah ditentukan.',
  'draw.no_prizes': 'Belum ada hadiah. Minta admin menambahkannya.',
  'draw.error': 'Koneksi bermasalah. Tidak ada yang berubah, coba lagi.',

  'verify.title': 'VERIFIKASI HADIAH',
  'verify.current': 'UNDIAN SAAT INI',
  'verify.none': 'Tidak ada undian yang menunggu.',
  'verify.number': 'Nomor Door Prize',
  'verify.lookup': 'CARI',
  'verify.winner': 'PEMENANG TERKONFIRMASI',
  'verify.pending': 'MENUNGGU KONFIRMASI',
  'verify.not_winner': 'BUKAN PEMENANG',
  'verify.no_such': 'NOMOR TIDAK DITEMUKAN',
  'verify.prize_for': 'Hadiah: {prize}',

  'stage.idle': 'UNDIAN DIMULAI SEBENTAR LAGI',
  'stage.header': 'NOURISHFEST 2026 · DOOR PRIZE',
  'stage.live': 'LIVE',
  'stage.sound': 'Aktifkan suara',
  'stage.sound_on': 'Suara aktif',
  'stage.fullscreen': 'Layar penuh',
  'stage.need_key': 'Buka link layar panggung dari Admin → Settings.',
  'stage.error_invalid': 'Kunci layar tidak valid.',
  'stage.error_locked': 'Terlalu banyak percobaan. Tunggu beberapa menit.',
  'stage.error_notset': 'Kunci layar belum dibuat. Buat di Admin → Settings.',
  'stage.error_retry': 'Koneksi bermasalah. Muat ulang halaman.',
  'stage.signed_out': 'Kunci layar sudah diganti. Buka link layar yang baru.',
} as const;

export const DRAW_EN: Record<keyof typeof DRAW_ID, string> = {
  'draw.landed_label': 'WINNING NUMBER',
  'draw.next': 'NEXT DRAW',
  'draw.must_be_present': 'WINNER MUST BE PRESENT · 60 SECONDS',
  'draw.progress': 'DRAW {n} OF {total}',
  'draw.no_show': 'NOT HERE — REDRAW',
  'draw.confirm': 'CONFIRM',
  'draw.confirm_handover': 'CONFIRM & HAND OVER',
  'draw.waiting': 'WAITING FOR WINNER',
  'draw.waiting_dots': 'WAITING FOR THE WINNER...',

  'draw.title': 'DRAW',
  'draw.pick_prize': 'PICK A PRIZE',
  'draw.prize_left': '{n} OF {total} LEFT',
  'draw.show_prize': 'SHOW PRIZE',
  'draw.blank_stage': 'BLANK SCREEN',
  'draw.draw': 'DRAW NOW',
  'draw.draw_batch': 'DRAW {n} WINNERS',
  'draw.not_here': 'NOT HERE',
  'draw.confirm_all': 'CONFIRM ALL',
  'draw.recorded': 'RECORDED',
  'draw.batch_count': '{n} WINNERS',
  'draw.seconds': '{n} SEC',
  'draw.stage_ok': 'STAGE SCREEN CONNECTED',
  'draw.stage_down': 'STAGE SCREEN DISCONNECTED',
  'draw.stage_never': 'STAGE SCREEN NOT OPENED',
  'draw.stage_note': 'The stage screen shows the number only until you confirm.',
  'draw.no_eligible': 'No eligible guests yet.',
  'draw.short_by': 'Only {got} winners available, {short} short.',
  'draw.in_progress': 'Finish the current draw first.',
  'draw.prize_complete': 'All winners for this prize are already decided.',
  'draw.no_prizes': 'No prizes yet. Ask an admin to add them.',
  'draw.error': 'Connection problem. Nothing changed, try again.',

  'verify.title': 'PRIZE VERIFICATION',
  'verify.current': 'CURRENT DRAW',
  'verify.none': 'No draw is waiting.',
  'verify.number': 'Door Prize number',
  'verify.lookup': 'LOOK UP',
  'verify.winner': 'CONFIRMED WINNER',
  'verify.pending': 'WAITING FOR CONFIRMATION',
  'verify.not_winner': 'NOT A WINNER',
  'verify.no_such': 'NUMBER NOT FOUND',
  'verify.prize_for': 'Prize: {prize}',

  'stage.idle': 'THE DRAW STARTS SOON',
  'stage.header': 'NOURISHFEST 2026 · DOOR PRIZE',
  'stage.live': 'LIVE',
  'stage.sound': 'Turn on sound',
  'stage.sound_on': 'Sound on',
  'stage.fullscreen': 'Full screen',
  'stage.need_key': 'Open the stage link from Admin → Settings.',
  'stage.error_invalid': 'The display key is not valid.',
  'stage.error_locked': 'Too many attempts. Wait a few minutes.',
  'stage.error_notset': 'No display key yet. Create one in Admin → Settings.',
  'stage.error_retry': 'Connection problem. Reload the page.',
  'stage.signed_out': 'The display key was replaced. Open the new display link.',
};
```

In `src/lib/i18n/strings.ts` make three edits.

1. First line. Replace `export type Lang = 'id' | 'en';` with:
```ts
import { DRAW_EN, DRAW_ID } from './draw-strings';

export type Lang = 'id' | 'en';
```
2. End of the `id` object. Replace
```ts
  'login.coming_soon': 'Layar ini belum tersedia.',
} as const;
```
with
```ts
  'login.coming_soon': 'Layar ini belum tersedia.',

  ...DRAW_ID,
} as const;
```
3. End of the `en` object. Replace
```ts
  'login.coming_soon': "This screen isn't available yet.",
};
```
with
```ts
  'login.coming_soon': "This screen isn't available yet.",

  ...DRAW_EN,
};
```
`en` is typed `Record<StringKey, string>`, so the compiler fails if a key exists in one language and not the other.

- [ ] **Step 4: Write the layout helpers and run the tests**

`src/lib/stage-fit.ts`:
```ts
export const ARTBOARD = { w: 1280, h: 720 } as const;

/** The stage is designed on a 1280 × 720 board and scaled, never cropped, to whatever the projector reports. */
export function fitScale(w: number, h: number): number {
  if (!(w > 0) || !(h > 0)) return 1;
  return Math.min(w / ARTBOARD.w, h / ARTBOARD.h);
}

/** Columns for a batch grid. Few winners get big tiles; 20+ winners still fit on one board. */
export function gridColumns(n: number): number {
  if (n <= 3) return Math.max(1, n);
  if (n === 4) return 2;
  if (n <= 6) return 3;
  if (n <= 12) return 4;
  if (n <= 20) return 5;
  return 6;
}
```

Run: `npm run test:unit -- stage-fit strings-draw`
Expected: PASS (stage-fit: 3 tests; strings-draw: 2 tests). Then `npm run test:unit -- strings` — Plan 1's `strings.test.ts` (same keys in both languages, same placeholders) still passes.

- [ ] **Step 5: Sound and the stage hook**

`src/lib/stage-sound.ts`:
```ts
export type SoundKind = 'landed' | 'revealed' | 'void';

/**
 * Three short Web Audio cues. Browsers only allow audio after a tap or key press, so nothing plays until `enable()` has
 * run (the "Aktifkan suara" button or the S key). The projector-safe option never calls `play`.
 */
export function createSound() {
  let ctx: AudioContext | null = null;

  function tone(freq: number, at: number, len: number, type: OscillatorType, volume: number) {
    if (!ctx) return;
    const start = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + len);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + len + 0.05);
  }

  return {
    isOn: () => ctx !== null,
    async enable(): Promise<boolean> {
      try {
        ctx ??= new AudioContext();
        await ctx.resume();
        tone(880, 0, 0.12, 'square', 0.05);
        return true;
      } catch {
        ctx = null;
        return false;
      }
    },
    play(kind: SoundKind) {
      if (!ctx) return;
      if (kind === 'landed') {
        tone(196, 0, 0.2, 'sawtooth', 0.07);
        tone(392, 0.2, 0.35, 'sawtooth', 0.07);
      } else if (kind === 'revealed') {
        tone(523, 0, 0.12, 'square', 0.06);
        tone(659, 0.12, 0.12, 'square', 0.06);
        tone(784, 0.24, 0.3, 'square', 0.06);
      } else {
        tone(220, 0, 0.25, 'triangle', 0.08);
        tone(165, 0.25, 0.35, 'triangle', 0.08);
      }
    },
  };
}
```

`src/lib/use-stage.ts`:
```ts
'use client';
import { createClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './client';
import { acceptRow, noteRolls, parseRow, revealDelays, type StageRow } from './stage';

export type StageConfig = { url: string; anonKey: string; eventId: string };

const HEARTBEAT_MS = 5_000;
const POLL_AFTER_MS = 5_000; // Realtime must be down this long before polling starts
const POLL_MS = 3_000;
const RECONCILE_MS = 30_000; // slow safety net even while Realtime says it is fine

/**
 * Keeps one `StageRow` up to date. Three sources feed the same `apply()`: the first fetch, Realtime, and polling.
 * `apply()` keeps a row only if its `rev` is higher, so late or duplicate deliveries change nothing.
 */
export function useStage(cfg: StageConfig) {
  const [row, setRow] = useState<StageRow | null>(null);
  const [delays, setDelays] = useState<Record<number, number>>({});
  const [now, setNow] = useState(() => Date.now());
  const [realtimeUp, setRealtimeUp] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const current = useRef<StageRow | null>(null);
  const starts = useRef(new Map<string, number>());
  const sawFirst = useRef(false);

  const apply = useCallback((incoming: StageRow) => {
    const prev = current.current;
    const next = acceptRow(prev, incoming);
    if (next === prev) return;
    const live = sawFirst.current; // the very first row after a load counts as already landed / already revealed
    noteRolls(starts.current, next, Date.now(), live);
    setDelays(live ? revealDelays(prev, next) : {});
    sawFirst.current = true;
    current.current = next;
    setNow(Date.now());
    setRow(next);
  }, []);

  const poll = useCallback(async () => {
    const r = await api<unknown>('/api/stage/state');
    if (r.http === 401) { setSignedOut(true); return; }
    const parsed = r.ok ? parseRow(r.data) : null;
    if (parsed) apply(parsed);
  }, [apply]);

  // First fetch, a slow reconcile, and a refetch whenever the tab becomes visible again.
  useEffect(() => {
    poll();
    const id = setInterval(poll, RECONCILE_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') poll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [poll]);

  // Realtime on the single stage_state row (the only table the anon key may read).
  useEffect(() => {
    const sb = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const channel = sb
      .channel('stage')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stage_state', filter: `event_id=eq.${cfg.eventId}` }, (p) => {
        const parsed = parseRow(p.new);
        if (parsed) apply(parsed);
      })
      .subscribe((status) => setRealtimeUp(status === 'SUBSCRIBED'));
    return () => { sb.removeChannel(channel); };
  }, [cfg.url, cfg.anonKey, cfg.eventId, apply]);

  // Polling fallback: only after Realtime has been down for 5 seconds.
  useEffect(() => {
    if (realtimeUp) return;
    let interval: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => { poll(); interval = setInterval(poll, POLL_MS); }, POLL_AFTER_MS);
    return () => { clearTimeout(start); if (interval) clearInterval(interval); };
  }, [realtimeUp, poll]);

  // Heartbeat: tells the operator's phone this display is alive.
  useEffect(() => {
    const beat = async () => {
      const r = await api('/api/stage/heartbeat', {});
      if (r.http === 401) setSignedOut(true);
    };
    beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, []);

  // Keep the projector awake.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const take = async () => {
      try { lock = (await navigator.wakeLock?.request('screen')) ?? null; } catch { /* not allowed here: ignore */ }
    };
    take();
    const onVisible = () => { if (document.visibilityState === 'visible') take(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); lock?.release().catch(() => {}); };
  }, []);

  // A clock that ticks only while a number is rolling, so the roll can end on its own.
  const rolling = !!row?.payload.slots?.some((s) => s.state === 'rolling');
  useEffect(() => {
    if (!rolling) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [rolling]);

  return { row, delays, starts: starts.current, now, link: realtimeUp ? ('live' as const) : ('polling' as const), signedOut };
}
```

- [ ] **Step 6: Write the stage stylesheet**

`src/styles/stage.css`:
```css
/* Stage display: a 1280 × 720 artboard, scaled by JavaScript (fitScale). Nothing here scrolls. */
html:has(.stage), body:has(.stage) { overflow: hidden; background: #000; }
.stage { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #000; cursor: none; }
.stage--active { cursor: default; }
.stage__fit { flex: none; width: 1280px; height: 720px; transform-origin: center center; }
.stage__boot { width: 100%; height: 100%; background: #000; }

.board { position: relative; width: 1280px; height: 720px; display: flex; flex-direction: column; overflow: hidden; color: var(--nf-text);
  background: radial-gradient(circle at 0% 0%, rgba(255,27,107,.30), transparent 45%), radial-gradient(circle at 100% 100%, rgba(212,175,55,.16), transparent 45%), var(--nf-black); }
.board::before { content: ''; position: absolute; inset: 0; pointer-events: none; background: radial-gradient(rgba(212,175,55,.18) 1.5px, transparent 2px); background-size: 18px 18px; }
.board__head { position: relative; height: 72px; padding: 0 40px; display: flex; align-items: center; justify-content: space-between; }
.board__title { font-family: var(--nf-font-label); font-weight: 600; font-size: 24px; letter-spacing: .28em; color: var(--nf-gold); }
.board__main { position: relative; flex: 1; min-height: 0; padding: 0 60px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; text-align: center; }
.board__foot { position: relative; height: 64px; padding: 0 40px; display: flex; align-items: center; justify-content: space-between; font-family: var(--nf-font-label); font-weight: 600; font-size: 22px; letter-spacing: .2em; }
.board__foot b { color: var(--nf-gold); font-weight: 600; }

.live { display: inline-flex; align-items: center; gap: 10px; padding: 4px 18px; border-radius: 999px; background: var(--nf-green); color: #000; font-family: var(--nf-font-label); font-weight: 600; font-size: 20px; letter-spacing: .2em; }
.live i { width: 12px; height: 12px; border-radius: 50%; background: #000; animation: nf-pulse 1.4s ease-in-out infinite; }

.banner { display: inline-block; padding: 6px 28px; background: var(--nf-pink); color: #000; font-family: var(--nf-font-heading); font-size: 40px; letter-spacing: .06em; text-transform: uppercase; transform: rotate(-2deg); }
.banner--xl { font-size: 76px; padding: 14px 48px; }

.label { font-family: var(--nf-font-label); font-weight: 600; font-size: 28px; letter-spacing: .4em; color: var(--nf-gold); }
.num { margin: 0; font-family: var(--nf-font-display); line-height: 1; color: var(--nf-gold); text-shadow: 8px 8px 0 var(--nf-pink); }
.num--big { font-size: 300px; }
.num--small { font-size: 180px; }
.name { margin: 0; max-width: 1160px; font-family: var(--nf-font-heading); font-weight: 400; font-size: 100px; line-height: 1.02; text-transform: uppercase; color: #fff; overflow-wrap: anywhere; }
.where { font-family: var(--nf-font-label); font-weight: 600; font-size: 34px; letter-spacing: .12em; text-transform: uppercase; color: var(--nf-gold); }
.waiting { font-family: var(--nf-font-label); font-weight: 600; font-size: 30px; letter-spacing: .3em; color: var(--nf-text-soft); animation: nf-blink 1.6s ease-in-out infinite; }
.reveal { display: flex; flex-direction: column; align-items: center; gap: 10px; animation: nf-in .45s ease-out both; }

.void { padding: 18px 44px; border: 6px solid var(--nf-pink); color: var(--nf-pink); font-family: var(--nf-font-heading); font-size: 64px; letter-spacing: .04em; text-transform: uppercase; animation: nf-in .3s ease-out both; }

.idle__mark { margin: 0; display: flex; flex-direction: column; font-family: var(--nf-font-display); font-weight: 400; font-size: 120px; line-height: .95; color: var(--nf-gold); text-shadow: 6px 6px 0 var(--nf-pink); }
.idle__tag { padding: 4px 22px; background: var(--nf-pink); color: #000; font-family: var(--nf-font-heading); font-size: 34px; letter-spacing: .06em; transform: rotate(-2deg); }
.idle__text { margin-top: 12px; font-family: var(--nf-font-label); font-weight: 600; font-size: 32px; letter-spacing: .3em; color: var(--nf-text); }

.eq { display: flex; align-items: flex-end; gap: 8px; height: 60px; }
.eq i { width: 12px; height: 12px; background: var(--nf-pink); animation: nf-eq 1s ease-in-out infinite; animation-delay: calc(var(--i) * .12s); }

.grid { width: 100%; max-height: 440px; flex: 1; display: grid; gap: 16px; align-content: center; grid-auto-rows: minmax(0, 1fr); }
.tile { position: relative; min-height: 0; border: 4px solid var(--nf-gold); border-radius: 18px; background: var(--nf-card); overflow: hidden; }
.tile__front, .tile__back { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 6px 10px; }
.tile__num { font-family: var(--nf-font-display); font-size: 64px; line-height: 1; color: var(--nf-gold); text-shadow: 4px 4px 0 var(--nf-pink); }
.tile__name { font-family: var(--nf-font-heading); font-size: 40px; line-height: 1.02; text-transform: uppercase; color: #fff; overflow-wrap: anywhere; }
.tile__where { font-family: var(--nf-font-label); font-weight: 600; font-size: 20px; letter-spacing: .08em; text-transform: uppercase; color: var(--nf-gold); }
.tile__void { font-family: var(--nf-font-heading); font-size: 26px; color: var(--nf-pink); text-transform: uppercase; }
.tile--revealed { border-color: var(--nf-green); }
.tile--revealed .tile__front { animation: nf-out .25s ease-in both; animation-delay: var(--d, 0ms); }
.tile--revealed .tile__back { animation: nf-in .4s ease-out both; animation-delay: var(--d, 0ms); }
.tile--void { border-color: var(--nf-pink); }
.tile--void .tile__num { opacity: .35; text-decoration: line-through; }

/* Projector-safe: no glows or halftone, 2 px black outline, pure white names, thicker gold. */
.stage--safe .board { background: #000; }
.stage--safe .board::before { display: none; }
.stage--safe .num, .stage--safe .tile__num { text-shadow: none; -webkit-text-stroke: 2px #000; paint-order: stroke fill; }
.stage--safe .name, .stage--safe .tile__name { color: #fff; -webkit-text-stroke: 2px #000; paint-order: stroke fill; }
.stage--safe .banner, .stage--safe .idle__tag { transform: none; -webkit-text-stroke: 0; }
.stage--safe .idle__mark { text-shadow: none; -webkit-text-stroke: 2px #000; paint-order: stroke fill; }
.stage--safe .tile { border-width: 6px; }
.stage--safe .live i, .stage--safe .eq i { animation: none; }

/* Reduced effects: no roll (handled in code), no flashing or bouncing; fades only. */
.stage--reduce .live i, .stage--reduce .eq i, .stage--reduce .waiting { animation: none; }
.stage--reduce .banner, .stage--reduce .idle__tag { transform: none; }
.stage--reduce .tile--revealed .tile__front { animation: none; opacity: 0; }
.stage--reduce .tile--revealed .tile__back, .stage--reduce .reveal, .stage--reduce .void { animation: nf-fade .25s linear both; animation-delay: 0ms; }

.stage__controls { position: absolute; left: 16px; bottom: 16px; display: flex; gap: 10px; opacity: 0; transition: opacity .2s; }
.stage--active .stage__controls { opacity: 1; }
.stage__btn { min-height: 44px; padding: 0 16px; border-radius: 10px; border: 2px solid var(--nf-gold); background: rgba(0,0,0,.75); color: var(--nf-gold); font-family: var(--nf-font-label); font-weight: 600; letter-spacing: .1em; }
.stage__notice { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 40px; text-align: center; background: rgba(0,0,0,.92); color: var(--nf-pink); font-family: var(--nf-font-heading); font-size: 40px; }

.stage-gate { min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 24px; text-align: center; background: #000; color: var(--nf-text); }
.stage-gate h1 { margin: 0; font-family: var(--nf-font-display); font-weight: 400; color: var(--nf-gold); }
.stage-gate p { margin: 0; color: var(--nf-pink); font-size: 18px; }

@keyframes nf-pulse { 50% { opacity: .35; } }
@keyframes nf-blink { 50% { opacity: .4; } }
@keyframes nf-eq { 0%, 100% { height: 12px; } 50% { height: 60px; } }
@keyframes nf-in { from { opacity: 0; transform: scale(.96); } to { opacity: 1; transform: none; } }
@keyframes nf-out { to { opacity: 0; } }
@keyframes nf-fade { from { opacity: 0; } to { opacity: 1; } }
```

- [ ] **Step 7: Write the stage view and client**

`src/components/stage/StageView.tsx`:
```tsx
'use client';
import { useEffect, useState } from 'react';
import { padPrize } from '@/components/pass/PrizeNumber';
import { translate, type StringKey } from '@/lib/i18n/strings';
import { bannerText, type SlotView, type StageRow } from '@/lib/stage';
import { gridColumns } from '@/lib/stage-fit';

const VOID_MS = 3_000; // the "not here" message is brief; then the prize banner returns

/** A number that spins until its parent decides it has landed. Cosmetic only: the winner is already saved. */
function Roll() {
  const [n, setN] = useState(() => 1 + Math.floor(Math.random() * 999));
  useEffect(() => {
    const id = setInterval(() => setN(1 + Math.floor(Math.random() * 999)), 70);
    return () => clearInterval(id);
  }, []);
  return <>{padPrize(n)}</>;
}

const where = (v: { outlet?: string; department?: string }) => [v.outlet, v.department].filter(Boolean).join(' · ');

function Bars() {
  return (
    <div className="eq" aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => <i key={i} style={{ '--i': i } as React.CSSProperties} />)}
    </div>
  );
}

export function StageView({ row, views, delays }: { row: StageRow; views: SlotView[]; delays: Record<number, number> }) {
  const lang = row.options.language;
  const t = (key: StringKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const prize = row.payload.prize;
  const [voidDone, setVoidDone] = useState(false);
  useEffect(() => {
    setVoidDone(false);
    if (row.phase !== 'void') return;
    const id = setTimeout(() => setVoidDone(true), VOID_MS);
    return () => clearTimeout(id);
  }, [row.rev, row.phase]);

  const phase = row.phase === 'void' && voidDone ? 'intro' : row.phase;
  const batch = !!row.payload.batch;
  const single = views[0];
  const banner = bannerText(prize);

  let body: React.ReactNode;
  let progress: string | null = null;

  if (phase === 'idle' || !prize) {
    body = (
      <>
        <h1 className="idle__mark" aria-label="NourishFest 2026"><span>NOURISH</span><span>FEST 2026</span></h1>
        <span className="idle__tag">{t('brand.tagline')}</span>
        <Bars />
        <p className="idle__text">{t('stage.idle')}</p>
      </>
    );
  } else if (phase === 'intro' || (!batch && !single)) {
    body = <span className="banner banner--xl">{banner}</span>;
  } else if (phase === 'void') {
    body = (
      <>
        <span className="banner">{banner}</span>
        <p className="void">{t('draw.no_show')}</p>
      </>
    );
  } else if (batch) {
    body = (
      <>
        <span className="banner">{banner}</span>
        <div className="grid" style={{ gridTemplateColumns: `repeat(${gridColumns(views.length)}, 1fr)` }}>
          {views.map((v) => (
            <div key={`${v.slot}:${v.number}`} className={`tile tile--${v.kind === 'rolling' ? 'landed' : v.kind}`}
              style={{ '--d': `${delays[v.slot] ?? 0}ms` } as React.CSSProperties}>
              <div className="tile__front">
                <span className="tile__num">{v.kind === 'rolling' ? <Roll /> : padPrize(v.number)}</span>
                {v.kind === 'void' && <span className="tile__void">{t('draw.no_show')}</span>}
              </div>
              {v.kind === 'revealed' && (
                <div className="tile__back">
                  <span className="tile__name">{v.name}</span>
                  <span className="tile__where">{where(v)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </>
    );
    progress = t('draw.batch_count', { n: views.length });
  } else if (single) {
    const revealed = single.kind === 'revealed';
    body = (
      <>
        <span className="banner">{banner}</span>
        <span className="label">{t('draw.landed_label')}</span>
        <p className={`num ${revealed ? 'num--small' : 'num--big'}`}>
          {single.kind === 'rolling' ? <Roll /> : padPrize(single.number)}
        </p>
        {revealed ? (
          <div className="reveal">
            <p className="name">{single.name}</p>
            <span className="where">{where(single)}</span>
          </div>
        ) : (
          <>
            {single.kind === 'landed' && <p className="waiting">{t('draw.waiting_dots')}</p>}
          </>
        )}
      </>
    );
    progress = t('draw.progress', { n: single.slot, total: prize.quantity });
  }

  return (
    <div className="board">
      <header className="board__head">
        <span className="board__title">{t('stage.header')}</span>
        <span className="live"><i />{t('stage.live')}</span>
      </header>
      <main className="board__main">{body}</main>
      <footer className="board__foot"><b>{t('brand.tagline')}</b><span>{progress}</span></footer>
    </div>
  );
}
```
Note for the reviewer of this file: a name is only ever read from a `SlotView` whose `kind` is `'revealed'`, and `slotViews()` (Task 24) only copies `name`, `outlet` and `department` for those. The two `v.name` / `single.name` uses sit inside the `revealed` branches.

`src/app/stage/StageClient.tsx`:
```tsx
'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StageView } from '@/components/stage/StageView';
import { translate } from '@/lib/i18n/strings';
import { slotViews } from '@/lib/stage';
import { fitScale } from '@/lib/stage-fit';
import { createSound } from '@/lib/stage-sound';
import { useStage, type StageConfig } from '@/lib/use-stage';

function useFit(): number {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(fitScale(window.innerWidth, window.innerHeight));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return scale;
}

export function StageClient(cfg: StageConfig) {
  const { row, delays, starts, now, signedOut } = useStage(cfg);
  const scale = useFit();
  const sound = useMemo(() => createSound(), []);
  const [soundOn, setSoundOn] = useState(false);
  const [active, setActive] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const lang = row?.options.language ?? 'id';
  const safe = !!row?.options.safe_mode;
  const reduce = !!row?.options.reduce_effects;
  const views = row ? slotViews(row, starts, now) : [];

  // Sound cues (never in projector-safe mode, never before the first tap).
  const landed = views.filter((v) => v.kind === 'landed').length;
  const revealed = views.filter((v) => v.kind === 'revealed').length;
  const isVoid = row?.phase === 'void';
  const prev = useRef<{ landed: number; revealed: number; isVoid: boolean } | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = { landed, revealed, isVoid };
    if (!p || !soundOn || safe) return; // the first state after a load is not an event
    if (isVoid && !p.isVoid) sound.play('void');
    else if (revealed > p.revealed) sound.play('revealed');
    else if (landed > p.landed) sound.play('landed');
  }, [landed, revealed, isVoid, soundOn, safe, sound]);

  const enableSound = useCallback(async () => { if (await sound.enable()) setSoundOn(true); }, [sound]);
  const fullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  }, []);

  // The controls and the cursor appear when the pointer moves and fade after 3 seconds. F = full screen, S = sound.
  const poke = useCallback(() => {
    setActive(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setActive(false), 3_000);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') fullscreen();
      if ((e.key === 's' || e.key === 'S') && !safe) enableSound();
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(hideTimer.current); };
  }, [fullscreen, enableSound, safe]);

  const classes = ['stage', active ? 'stage--active' : '', safe ? 'stage--safe' : '', reduce ? 'stage--reduce' : ''].filter(Boolean).join(' ');
  return (
    <div className={classes} onMouseMove={poke} onPointerDown={poke}>
      <div className="stage__fit" style={{ transform: `scale(${scale})` }}>
        {row ? <StageView row={row} views={views} delays={delays} /> : <div className="stage__boot" />}
      </div>
      <div className="stage__controls">
        {!safe && (
          <button type="button" className="stage__btn" onClick={enableSound} disabled={soundOn}>
            {translate(lang, soundOn ? 'stage.sound_on' : 'stage.sound')}
          </button>
        )}
        <button type="button" className="stage__btn" onClick={fullscreen}>{translate(lang, 'stage.fullscreen')}</button>
      </div>
      {signedOut && <div className="stage__notice" role="alert">{translate(lang, 'stage.signed_out')}</div>}
    </div>
  );
}
```

`src/app/stage/page.tsx`:
```tsx
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from '@/lib/env';
import { translate, type StringKey } from '@/lib/i18n/strings';
import { STAGE_COOKIE, verifyStageCookie } from '@/lib/stage-session';
import '@/styles/stage.css';
import { StageClient } from './StageClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'NourishFest Stage', robots: { index: false, follow: false }, referrer: 'no-referrer' };

const ERRORS: Record<string, StringKey> = {
  invalid: 'stage.error_invalid',
  locked: 'stage.error_locked',
  notset: 'stage.error_notset',
};

export default async function StagePage({ searchParams }: { searchParams: Promise<{ key?: string; error?: string }> }) {
  const sp = await searchParams;
  // A server component cannot set a cookie, so the key goes to the route that can; it redirects back here without it.
  if (sp.key) redirect(`/api/stage/enter?key=${encodeURIComponent(sp.key)}`);

  let valid = false;
  let failed = false;
  try {
    valid = await verifyStageCookie((await cookies()).get(STAGE_COOKIE)?.value);
  } catch {
    failed = true; // the database did not answer; a reload will
  }
  if (valid) {
    const e = env();
    return <StageClient url={e.SUPABASE_URL} anonKey={e.SUPABASE_ANON_KEY} eventId={e.EVENT_ID} />;
  }
  const message = failed ? 'stage.error_retry' : ((sp.error && ERRORS[sp.error]) || 'stage.need_key');
  return (
    <main className="stage-gate">
      <h1>NOURISHFEST 2026</h1>
      <p role="alert">{translate('id', message)}</p>
    </main>
  );
}
```

- [ ] **Step 8: Typecheck, build and look at it**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: no errors. (`NEXT_PUBLIC_E2E` is not needed here; the stage reads no scanner.)

Then a manual check against the local stack (`npm run db:reset && ./scripts/make-env.sh`, `npm run dev`):
1. In the Supabase SQL editor (or `psql "$DATABASE_URL"`): `select public.set_stage_key('<EVENT_ID>', 'devkey-devkey-devkey-devkey-1234', 'dev');`
2. Open `http://localhost:3000/stage?key=devkey-devkey-devkey-devkey-1234` in a desktop browser. Expected: the address bar ends as `/stage` (no key), the idle board shows (wordmark, tagline, bars, "UNDIAN DIMULAI SEBENTAR LAGI"), and the header has a green LIVE pill.
3. Open `http://localhost:3000/stage` in a private window. Expected: the black gate with "Buka link layar panggung dari Admin → Settings."
4. Resize the window to a narrow and a tall shape. Expected: the board shrinks to fit and keeps its 16:9 shape; nothing scrolls.
5. Press **F** (full screen) and **S** (sound). Move the mouse: the two buttons appear for 3 seconds; with the mouse still, the cursor is hidden.
6. In SQL: `select public.set_stage_options('<EVENT_ID>', '{"safe_mode": true}'::jsonb, 'dev');` Expected: the board turns flat black with no halftone within a second, and the sound button disappears.

(The full draw sequence on this screen is exercised by the Playwright test in Task 30.)

- [ ] **Step 9: Commit**

```bash
git add src/lib/i18n src/lib/stage-fit.ts src/lib/stage-sound.ts src/lib/use-stage.ts src/styles/stage.css src/components/stage src/app/stage tests/unit/stage-fit.test.ts tests/unit/strings-draw.test.ts
git commit -m "feat: projector stage display with Realtime, polling fallback, heartbeat and draw strings"
```

## Task 28: MC operator screen (`/station/draw`) and Prize Verification screen (`/station/prizes`)

**Files:**
- Create: `src/lib/prizes.ts`, `src/lib/operator.ts`, `src/lib/use-current.ts`
- Create: `src/styles/operator.css`, `src/components/station/WinnerCard.tsx`
- Create: `src/app/station/draw/page.tsx`, `src/app/station/prizes/page.tsx`
- Modify: `src/app/station/page.tsx` (the `HOME` map)
- Test: `tests/unit/operator.test.ts`

**Interfaces:**
- Consumes (Task 24): `Current`, `Round`, `DrawRow`, `pendingDraws`, `secondsLeft`, `heartbeatState`, `requestIds`, `WINNER_SECONDS` from `@/lib/draw-ui`. Consumes (Task 25): `GET /api/station/prizes`, `GET /api/station/draw/current`, `POST /api/station/draw`, `POST /api/station/draw/resolve`, `POST /api/station/draw/stage`, `POST /api/station/prizes/lookup-number`. Plan 1: `StationShell`, `useStation`, `api`, `useI18n`, `padPrize`, station CSS classes `btn--staff`, `btn--staff-dark`, `choice`, `choices`, `field`, `panel`, `error`.
- Produces:
  - `PrizeRow`, `firstOpenPrize(prizes)`, `prizeLabel(p)` from `@/lib/prizes` (Task 29 reuses `PrizeRow`).
  - `screenFor(round, dismissedKey): 'pick' | 'active' | 'recorded' | 'redraw'`, `roundKey(round)`, `drawProblem(status)` from `@/lib/operator`.
  - `useCurrent(enabled, intervalMs = 2000)` → `{ current, offline, reload }`.
  - `<WinnerCard winner tone tag prizeLine compact busy confirmLabel onConfirm onNoShow>{children}</WinnerCard>`.
  - Station roles `draw` and `prizes` can now log in and land on `/station/draw` and `/station/prizes`.

Four rules from the Design Guide (§9.5, §9.6) shape these screens: the operator **always** sees the winner's name even though the stage does not; **KONFIRMASI** and **TIDAK HADIR** are black-text buttons, at least 64 px high, **16 px apart**; the 60-second countdown is **advice only** (nothing is voided automatically); and the screen keeps working when the projector is disconnected, because it reads its own data every 2 seconds.

- [ ] **Step 1: Write the failing tests**

`tests/unit/operator.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { DrawRow, Round } from '@/lib/draw-ui';
import { drawProblem, roundKey, screenFor } from '@/lib/operator';
import { firstOpenPrize, prizeLabel, type PrizeRow } from '@/lib/prizes';

const draw = (slot: number, status: DrawRow['status']): DrawRow => ({
  id: `d${slot}`, slot, status, number: 10 + slot, name: `Guest ${slot}`, outlet: 'Outlet A', department: null,
  drawn_at: '2026-12-10T10:00:00Z', redraw_of: null,
});
const round = (draws: DrawRow[], batch = false): Round => ({
  round_id: 'r1',
  prize: { id: 'p1', name: 'Smart TV', tier: 'HADIAH UTAMA', quantity: Math.max(1, draws.length), batch },
  pending: draws.filter((d) => d.status === 'drawn').length,
  draws,
});

describe('screenFor', () => {
  it('shows the prize picker when nothing has been drawn yet', () => {
    expect(screenFor(null, null)).toBe('pick');
  });
  it('shows the winner and the two buttons while any draw is unresolved', () => {
    expect(screenFor(round([draw(1, 'drawn')]), null)).toBe('active');
    expect(screenFor(round([draw(1, 'confirmed'), draw(2, 'drawn')], true), null)).toBe('active');
  });
  it('shows TERCATAT after a confirm, until the operator taps UNDIAN BERIKUTNYA', () => {
    const r = round([draw(1, 'confirmed')]);
    expect(screenFor(r, null)).toBe('recorded');
    expect(screenFor(r, roundKey(r))).toBe('pick');
  });
  it('goes back to the picker for a redraw after a no-show, and dismissing a confirmed round does not hide it', () => {
    expect(screenFor(round([draw(1, 'void_no_show')]), null)).toBe('redraw');
    expect(screenFor(round([draw(1, 'confirmed'), draw(2, 'void_no_show')], true), null)).toBe('redraw');
    const before = round([draw(1, 'confirmed')]);
    const after = round([draw(1, 'void_admin')]); // an admin reversed it later
    expect(roundKey(after)).not.toBe(roundKey(before));
    expect(screenFor(after, roundKey(before))).toBe('redraw');
  });
});

describe('roundKey', () => {
  it('changes when a draw changes status, so an old "next" tap never hides a new result', () => {
    expect(roundKey(round([draw(1, 'drawn')]))).not.toBe(roundKey(round([draw(1, 'confirmed')])));
    expect(roundKey(round([draw(1, 'confirmed')]))).toBe(roundKey(round([draw(1, 'confirmed')])));
  });
});

describe('drawProblem', () => {
  it('explains each refusal and stays silent on success', () => {
    expect(drawProblem('DRAWN')).toBeNull();
    expect(drawProblem('DRAW_IN_PROGRESS')).toBe('draw.in_progress');
    expect(drawProblem('NO_ELIGIBLE_GUESTS')).toBe('draw.no_eligible');
    expect(drawProblem('PRIZE_COMPLETE')).toBe('draw.prize_complete');
    expect(drawProblem('RETRYABLE_ERROR')).toBe('draw.error');
    expect(drawProblem('SOMETHING_NEW')).toBe('draw.error');
  });
});

describe('prizes', () => {
  const p = (id: string, remaining: number): PrizeRow => ({
    id, name: id, tier: null, sort_order: 0, quantity: 3, draw_as_batch: false, confirmed: 3 - remaining, pending: 0,
    no_shows: 0, admin_voids: 0, remaining, has_draws: remaining < 3,
  });
  it('picks the first prize that still has a free slot', () => {
    expect(firstOpenPrize([p('a', 0), p('b', 2), p('c', 3)])).toBe('b');
    expect(firstOpenPrize([p('a', 0)])).toBeNull();
    expect(firstOpenPrize([])).toBeNull();
  });
  it('labels a prize with its tier when it has one', () => {
    expect(prizeLabel({ tier: 'HADIAH UTAMA', name: 'Smart TV' })).toBe('HADIAH UTAMA · Smart TV');
    expect(prizeLabel({ tier: null, name: 'Voucher' })).toBe('Voucher');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit -- operator`
Expected: FAIL — `Cannot find module '@/lib/operator'`.

- [ ] **Step 3: Write the helpers and run the tests**

`src/lib/prizes.ts`:
```ts
/** One row of `prize_list` (SQL, Task 18). Counts are live: a no-show or an admin void frees the slot again. */
export type PrizeRow = {
  id: string;
  name: string;
  tier: string | null;
  sort_order: number;
  quantity: number;
  draw_as_batch: boolean;
  confirmed: number;
  pending: number;
  no_shows: number;
  admin_voids: number;
  remaining: number;
  has_draws: boolean;
};

export const firstOpenPrize = (prizes: PrizeRow[]): string | null => prizes.find((p) => p.remaining > 0)?.id ?? null;

export const prizeLabel = (p: { tier: string | null; name: string }): string => [p.tier, p.name].filter(Boolean).join(' · ');
```

`src/lib/operator.ts`:
```ts
import { pendingDraws, type Round } from './draw-ui';
import type { StringKey } from './i18n/strings';

export type Screen = 'pick' | 'active' | 'recorded' | 'redraw';

/**
 * A fingerprint of everything the operator could have seen in a round. "UNDIAN BERIKUTNYA" stores it, so the dismissal
 * lasts only until the round changes again (a redraw into the same round, or an admin void).
 */
export const roundKey = (round: Round): string => `${round.round_id}:${round.draws.map((d) => `${d.id}=${d.status}`).join(',')}`;

/**
 * Which of the four views the operator sees.
 *  active   — a draw is waiting for KONFIRMASI / TIDAK HADIR
 *  recorded — everything is confirmed: "TERCATAT" and UNDIAN BERIKUTNYA
 *  redraw   — a slot was freed by a no-show or an admin void: the picker, with the prize still selected
 *  pick     — nothing in progress
 */
export function screenFor(round: Round | null, dismissedKey: string | null): Screen {
  if (!round) return 'pick';
  if (pendingDraws(round).length > 0) return 'active';
  if (round.draws.some((d) => d.status === 'void_no_show' || d.status === 'void_admin')) return 'redraw';
  if (round.draws.some((d) => d.status === 'confirmed')) return roundKey(round) === dismissedKey ? 'pick' : 'recorded';
  return 'pick';
}

/** The string that explains a `draw_prize` answer which did not produce a draw; null when it did. */
export function drawProblem(status: string): StringKey | null {
  switch (status) {
    case 'DRAWN': return null;
    case 'DRAW_IN_PROGRESS': return 'draw.in_progress';
    case 'NO_ELIGIBLE_GUESTS': return 'draw.no_eligible';
    case 'PRIZE_COMPLETE': return 'draw.prize_complete';
    default: return 'draw.error';
  }
}
```

Run: `npm run test:unit -- operator`
Expected: PASS (6 tests).

- [ ] **Step 4: Write the polling hook, the stylesheet and the winner card**

`src/lib/use-current.ts`:
```ts
'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from './client';
import type { Current } from './draw-ui';

/**
 * The operator's view of the draw. It polls the server every 2 seconds and never depends on Realtime or on the
 * projector being connected. A lost session sends the phone back to the PIN screen.
 */
export function useCurrent(enabled: boolean, intervalMs = 2_000) {
  const [current, setCurrent] = useState<Current | null>(null);
  const [offline, setOffline] = useState(false);

  const reload = useCallback(async () => {
    const r = await api<Current>('/api/station/draw/current');
    if (r.http === 401 || r.http === 403) {
      window.location.href = '/station';
      return;
    }
    if (r.ok && r.data) { setCurrent(r.data); setOffline(false); }
    else setOffline(true); // keep showing the last good answer
  }, []);

  useEffect(() => {
    if (!enabled) return;
    reload();
    const id = setInterval(reload, intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, reload]);

  return { current, offline, reload };
}
```

`src/styles/operator.css`:
```css
.op { flex: 1; padding: var(--nf-gutter); display: flex; flex-direction: column; gap: 16px; }
.op h2 { margin: 0; font-family: var(--nf-font-label); font-weight: 600; font-size: 14px; letter-spacing: .2em; color: var(--nf-gold); }
.op__link { display: flex; align-items: center; gap: 10px; font-family: var(--nf-font-label); font-weight: 600; font-size: 13px; letter-spacing: .1em; color: var(--nf-text-soft); }
.op__note { margin: 0; color: var(--nf-text-muted); font-size: 13px; }
.op__void { margin: 0; padding: 10px 14px; border: 3px solid var(--nf-pink); border-radius: 12px; color: var(--nf-pink); font-family: var(--nf-font-heading); font-size: 22px; text-align: center; }
.op__muted { margin: 0; color: var(--nf-text-muted); }
.op__row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.op__form { display: flex; gap: 12px; }
.op__form .field { flex: 1; letter-spacing: .2em; }
.op__form .btn--staff { width: auto; padding: 0 20px; }
.choice small { display: block; font-family: var(--nf-font-label); font-size: 12px; letter-spacing: .12em; opacity: .85; }
.choice:disabled { opacity: .35; }
.btn--staff:disabled { opacity: .4; }

.dot { width: 14px; height: 14px; border-radius: 50%; background: var(--nf-line-dash); flex: none; }
.dot--ok { background: var(--nf-green); }
.dot--down { background: var(--nf-pink); }

.winner { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 16px; text-align: center; background: var(--nf-card); border: 4px solid var(--nf-gold); border-radius: 18px; }
.winner--green { border-color: var(--nf-green); }
.winner--pink { border-color: var(--nf-pink); }
.winner__tag { padding: 2px 14px; border-radius: 999px; background: var(--nf-gold); color: #000; font-family: var(--nf-font-label); font-weight: 600; font-size: 13px; letter-spacing: .16em; }
.winner__tag--green { background: var(--nf-green); }
.winner__tag--pink { background: var(--nf-pink); }
.winner__prize { font-family: var(--nf-font-label); font-weight: 600; font-size: 14px; letter-spacing: .16em; color: var(--nf-text-soft); text-transform: uppercase; }
.winner__number { margin: 0; font-family: var(--nf-font-display); font-size: 96px; line-height: 1.05; color: var(--nf-gold); text-shadow: 4px 4px 0 var(--nf-pink); }
.winner__name { margin: 0; font-family: var(--nf-font-heading); font-weight: 400; font-size: 40px; line-height: 1.05; text-transform: uppercase; overflow-wrap: anywhere; }
.winner__meta { margin: 0; font-family: var(--nf-font-label); font-weight: 600; font-size: 16px; letter-spacing: .08em; color: var(--nf-text-soft); }
.winner--compact { padding: 12px; }
.winner--compact .winner__number { font-size: 56px; }
.winner--compact .winner__name { font-size: 28px; }

.countdown { margin-top: 6px; text-align: center; font-family: var(--nf-font-label); font-weight: 600; letter-spacing: .14em; color: var(--nf-text-soft); }
.countdown b { display: block; font-family: var(--nf-font-display); font-weight: 400; font-size: 52px; line-height: 1.1; color: var(--nf-text); }
.countdown--low b { color: var(--nf-pink); }

.actions { align-self: stretch; margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.btn-confirm, .btn-noshow { min-height: 64px; border: 0; border-radius: 14px; color: #000; font-family: var(--nf-font-heading); font-size: 22px; letter-spacing: .04em; }
.btn-confirm { background: var(--nf-green); }
.btn-noshow { background: var(--nf-pink); }
.btn-confirm:disabled, .btn-noshow:disabled { opacity: .45; }
.winner--compact .btn-confirm, .winner--compact .btn-noshow { font-size: 18px; }
.btn-confirm--wide { width: 100%; }
```

`src/components/station/WinnerCard.tsx`:
```tsx
'use client';
import type { ReactNode } from 'react';
import { padPrize } from '@/components/pass/PrizeNumber';
import { useI18n } from '@/lib/i18n';
import '@/styles/operator.css';

export type WinnerInfo = { number: number; name: string; outlet: string; department: string | null };
type Tone = 'gold' | 'green' | 'pink';

/**
 * Number, name and outlet in large type. With `onConfirm` / `onNoShow` it also shows the two big buttons, 16 px apart,
 * black text on green and pink. The same card serves the MC screen and the Prize Verification screen.
 */
export function WinnerCard(props: {
  winner: WinnerInfo;
  tone?: Tone;
  tag?: string;
  prizeLine?: string;
  compact?: boolean;
  busy?: boolean;
  confirmLabel?: string;
  onConfirm?: () => void;
  onNoShow?: () => void;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const { winner, tone = 'gold', tag, prizeLine, compact, busy, confirmLabel, onConfirm, onNoShow, children } = props;
  return (
    <section className={`winner winner--${tone}${compact ? ' winner--compact' : ''}`}>
      {tag && <span className={`winner__tag winner__tag--${tone}`}>{tag}</span>}
      {prizeLine && <span className="winner__prize">{prizeLine}</span>}
      <p className="winner__number" aria-label={String(winner.number)}>{padPrize(winner.number)}</p>
      <p className="winner__name">{winner.name}</p>
      <p className="winner__meta">{[winner.outlet, winner.department].filter(Boolean).join(' · ')}</p>
      {children}
      {(onConfirm || onNoShow) && (
        <div className="actions">
          {onConfirm && <button type="button" className="btn-confirm" disabled={busy} onClick={onConfirm}>{confirmLabel ?? t('draw.confirm')}</button>}
          {onNoShow && <button type="button" className="btn-noshow" disabled={busy} onClick={onNoShow}>{t('draw.not_here')}</button>}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Write the MC operator screen**

`src/app/station/draw/page.tsx`:
```tsx
'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { padPrize } from '@/components/pass/PrizeNumber';
import { StationShell } from '@/components/station/StationShell';
import { WinnerCard } from '@/components/station/WinnerCard';
import { api } from '@/lib/client';
import { heartbeatState, pendingDraws, requestIds, secondsLeft } from '@/lib/draw-ui';
import { useI18n } from '@/lib/i18n';
import type { StringKey } from '@/lib/i18n/strings';
import { drawProblem, roundKey, screenFor } from '@/lib/operator';
import { firstOpenPrize, prizeLabel, type PrizeRow } from '@/lib/prizes';
import { useCurrent } from '@/lib/use-current';
import { useStation } from '@/lib/use-station';
import '@/styles/operator.css';

type Resolve = { draw_id: string; outcome: 'confirm' | 'no_show' } | { round_id: string; outcome: 'confirm_all' };
const LINK_TEXT: Record<'ok' | 'down' | 'never', StringKey> = { ok: 'draw.stage_ok', down: 'draw.stage_down', never: 'draw.stage_never' };

export default function DrawStation() {
  const { me } = useStation('draw');
  const { t } = useI18n();
  const { current, offline, reload } = useCurrent(!!me);
  const [prizes, setPrizes] = useState<PrizeRow[]>([]);
  const [prizeId, setPrizeId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const ids = useMemo(() => requestIds(), []);

  const loadPrizes = useCallback(async () => {
    const r = await api<{ prizes: PrizeRow[] }>('/api/station/prizes');
    if (r.ok && r.data) setPrizes(r.data.prizes);
  }, []);
  useEffect(() => {
    if (!me) return;
    loadPrizes();
    const id = setInterval(loadPrizes, 10_000);
    return () => clearInterval(id);
  }, [me, loadPrizes]);

  const round = current?.round ?? null;
  const screen = screenFor(round, dismissed);
  const pending = round ? pendingDraws(round) : [];

  // After a no-show the same prize is selected again for the redraw (the operator can still pick another one).
  const redrawPrize = screen === 'redraw' && round ? round.prize.id : null;
  const key = round ? roundKey(round) : null;
  useEffect(() => {
    if (redrawPrize) setPrizeId(redrawPrize);
  }, [redrawPrize, key]);
  // Otherwise start on the first prize that still has a free slot.
  useEffect(() => {
    if (prizeId === null && prizes.length > 0) setPrizeId(firstOpenPrize(prizes) ?? prizes[0].id);
  }, [prizeId, prizes]);

  // The 60-second countdown ticks once a second, only while a draw is waiting.
  const waiting = pending.length > 0;
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [waiting]);

  const refresh = useCallback(() => Promise.all([reload(), loadPrizes()]), [reload, loadPrizes]);

  async function draw() {
    if (!prizeId || busy) return;
    setBusy(true);
    setNote('');
    // The same request id is reused until the server answers, so a retry or a double tap cannot draw twice.
    const r = await api<{ short_by?: number; pending?: number }>('/api/station/draw', { prize_id: prizeId, request_id: ids.idFor(prizeId) });
    if (r.status !== 'RETRYABLE_ERROR') ids.done(prizeId);
    setBusy(false);
    if (r.status === 'DRAWN') {
      const short = r.data?.short_by ?? 0;
      if (short > 0) setNote(t('draw.short_by', { got: r.data?.pending ?? 0, short }));
    } else {
      const key = drawProblem(r.status);
      if (key) setNote(t(key));
    }
    await refresh();
  }

  async function resolve(body: Resolve) {
    if (busy) return;
    setBusy(true);
    setNote('');
    const r = await api('/api/station/draw/resolve', body);
    setBusy(false);
    if (!r.ok) setNote(t('draw.error')); // the action is safe to repeat: whichever tap lands first wins
    await refresh();
  }

  async function showOnStage() {
    if (!prizeId || busy) return;
    setBusy(true);
    setNote('');
    const r = await api<{ status: string }>('/api/station/draw/stage', { phase: 'intro', prize_id: prizeId });
    setBusy(false);
    if (r.status === 'DRAW_IN_PROGRESS') setNote(t('draw.in_progress'));
    else if (!r.ok) setNote(t('draw.error'));
    await reload();
  }

  async function blankStage() {
    if (busy) return;
    setBusy(true);
    setNote('');
    const r = await api<{ status: string }>('/api/station/draw/stage', { phase: 'idle' });
    setBusy(false);
    if (r.status === 'DRAW_IN_PROGRESS') setNote(t('draw.in_progress'));
    else if (!r.ok) setNote(t('draw.error'));
    await reload();
  }

  function next() {
    if (round) setDismissed(roundKey(round));
    setPrizeId(null);
    setNote('');
  }

  if (!me) return null;
  const link = heartbeatState(current?.heartbeat_age);
  const left = secondsLeft(current?.oldest_pending_at ?? null, now);
  const selected = prizes.find((p) => p.id === prizeId) ?? null;
  const batch = !!round?.prize.batch;
  const prizeLine = round ? prizeLabel(round.prize) : '';

  return (
    <StationShell title={t('draw.title')} me={me}>
      <div className="op">
        <div className="op__link" aria-live="polite">
          <span className={`dot dot--${link}`} />
          {offline ? t('common.retry_hint') : t(LINK_TEXT[link])}
        </div>

        {screen === 'active' && round && (
          <>
            <p className="op__note">{t('draw.stage_note')}</p>
            {note && <p role="alert" className="error">{note}</p>}
            {batch ? (
              <>
                {round.draws.filter((d) => d.status !== 'void_no_show' && d.status !== 'void_admin').map((d) => (
                  <WinnerCard key={d.id} compact tone={d.status === 'confirmed' ? 'green' : 'gold'} busy={busy}
                    winner={d} tag={`${d.slot} / ${round.prize.quantity}`} prizeLine={prizeLine}
                    onConfirm={d.status === 'drawn' ? () => resolve({ draw_id: d.id, outcome: 'confirm' }) : undefined}
                    onNoShow={d.status === 'drawn' ? () => resolve({ draw_id: d.id, outcome: 'no_show' }) : undefined} />
                ))}
                {pending.length > 1 && (
                  <button type="button" className="btn-confirm btn-confirm--wide" disabled={busy}
                    onClick={() => resolve({ round_id: round.round_id, outcome: 'confirm_all' })}>{t('draw.confirm_all')}</button>
                )}
              </>
            ) : (
              pending.map((d) => (
                <WinnerCard key={d.id} winner={d} busy={busy} prizeLine={prizeLine}
                  tag={t('draw.progress', { n: d.slot, total: round.prize.quantity })}
                  onConfirm={() => resolve({ draw_id: d.id, outcome: 'confirm' })}
                  onNoShow={() => resolve({ draw_id: d.id, outcome: 'no_show' })}>
                  <div className={left <= 10 ? 'countdown countdown--low' : 'countdown'}>
                    {t('draw.must_be_present')}
                    <b>{t('draw.seconds', { n: left })}</b>
                    {t('draw.waiting')}
                  </div>
                </WinnerCard>
              ))
            )}
          </>
        )}

        {screen === 'recorded' && round && (
          <div className="panel panel--green">
            <div className="panel__head"><span className="panel__title">{t('draw.recorded')}</span></div>
            {round.draws.filter((d) => d.status === 'confirmed').map((d) => (
              <div key={d.id}>
                <div className="panel__name">{d.name}</div>
                <div className="panel__meta">{padPrize(d.number)} · {d.outlet}</div>
              </div>
            ))}
            <div className="panel__actions">
              <button type="button" className="btn--staff btn--staff-dark" onClick={next}>{t('draw.next')}</button>
              <button type="button" className="btn--staff btn--staff-dark" disabled={busy} onClick={blankStage}>{t('draw.blank_stage')}</button>
            </div>
          </div>
        )}

        {(screen === 'pick' || screen === 'redraw') && (
          <>
            {screen === 'redraw' && <p className="op__void">{t('draw.no_show')}</p>}
            {prizes.length === 0 ? (
              <p className="op__muted">{t('draw.no_prizes')}</p>
            ) : (
              <>
                <h2>{t('draw.pick_prize')}</h2>
                <div className="choices">
                  {prizes.map((p) => (
                    <button key={p.id} type="button" className="choice" aria-pressed={p.id === prizeId} disabled={p.remaining === 0}
                      onClick={() => setPrizeId(p.id)}>
                      {prizeLabel(p)}
                      <small>{t('draw.prize_left', { n: p.remaining, total: p.quantity })}</small>
                    </button>
                  ))}
                </div>
                {note && <p role="alert" className="error">{note}</p>}
                <div className="op__row">
                  <button type="button" className="btn--staff btn--staff-dark" disabled={busy || !selected} onClick={showOnStage}>{t('draw.show_prize')}</button>
                  <button type="button" className="btn--staff" disabled={busy || !selected || selected.remaining === 0} onClick={draw}>
                    {selected?.draw_as_batch ? t('draw.draw_batch', { n: selected.remaining }) : t('draw.draw')}
                  </button>
                </div>
                <button type="button" className="btn--staff btn--staff-dark" disabled={busy} onClick={blankStage}>{t('draw.blank_stage')}</button>
              </>
            )}
          </>
        )}
      </div>
    </StationShell>
  );
}
```
The winner's name is shown here on purpose. Only the stage hides it until KONFIRMASI.

- [ ] **Step 6: Write the Prize Verification screen**

`src/app/station/prizes/page.tsx`:
```tsx
'use client';
import { useCallback, useState } from 'react';
import { StationShell } from '@/components/station/StationShell';
import { WinnerCard } from '@/components/station/WinnerCard';
import { api } from '@/lib/client';
import { pendingDraws } from '@/lib/draw-ui';
import { useI18n } from '@/lib/i18n';
import { prizeLabel } from '@/lib/prizes';
import { useCurrent } from '@/lib/use-current';
import { useStation } from '@/lib/use-station';
import '@/styles/operator.css';

type Lookup = {
  status: 'WINNER' | 'PENDING' | 'NOT_A_WINNER' | 'NO_SUCH_NUMBER';
  number?: number; name?: string; outlet?: string; department?: string | null; draw_id?: string;
  prize?: { name: string; tier: string | null };
};

/** Backup screen. Same actions as the MC screen; whichever tap lands first wins and a repeat is harmless. */
export default function PrizesStation() {
  const { me } = useStation('prizes');
  const { t } = useI18n();
  const { current, reload } = useCurrent(!!me);
  const [digits, setDigits] = useState('');
  const [found, setFound] = useState<Lookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const lookup = useCallback(async (n: number) => {
    const r = await api<Lookup>('/api/station/prizes/lookup-number', { number: n });
    if (r.ok && r.data) setFound({ ...r.data, status: r.status as Lookup['status'] });
    else setNote(t('draw.error'));
  }, [t]);

  async function find(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(digits);
    if (!Number.isInteger(n) || n < 1) return;
    setNote('');
    setBusy(true);
    await lookup(n);
    setBusy(false);
  }

  async function resolve(drawId: string, outcome: 'confirm' | 'no_show') {
    if (busy) return;
    setBusy(true);
    setNote('');
    const r = await api('/api/station/draw/resolve', { draw_id: drawId, outcome });
    if (!r.ok) setNote(t('draw.error'));
    await reload();
    if (found?.number) await lookup(found.number);
    setBusy(false);
  }

  if (!me) return null;
  const round = current?.round ?? null;
  const pending = round ? pendingDraws(round) : [];
  const prizeLine = round ? prizeLabel(round.prize) : '';

  return (
    <StationShell title={t('verify.title')} me={me}>
      <div className="op">
        <h2>{t('verify.current')}</h2>
        {pending.length === 0 && <p className="op__muted">{t('verify.none')}</p>}
        {pending.map((d) => (
          <WinnerCard key={d.id} compact={pending.length > 1} busy={busy} winner={d} prizeLine={prizeLine}
            confirmLabel={t('draw.confirm_handover')}
            onConfirm={() => resolve(d.id, 'confirm')} onNoShow={() => resolve(d.id, 'no_show')} />
        ))}
        {note && <p role="alert" className="error">{note}</p>}

        <h2>{t('verify.number')}</h2>
        <form className="op__form" onSubmit={find}>
          <input className="field" inputMode="numeric" maxLength={6} autoComplete="off" aria-label={t('verify.number')} placeholder="000"
            value={digits} onChange={(e) => { setDigits(e.target.value.replace(/\D/g, '')); setFound(null); }} />
          <button className="btn--staff" type="submit" disabled={busy || digits === ''}>{t('verify.lookup')}</button>
        </form>

        {found?.status === 'NO_SUCH_NUMBER' && <p className="op__void">{t('verify.no_such')}</p>}
        {found && found.status !== 'NO_SUCH_NUMBER' && found.number !== undefined && (
          <WinnerCard busy={busy} winner={{ number: found.number, name: found.name ?? '', outlet: found.outlet ?? '', department: found.department ?? null }}
            tone={found.status === 'WINNER' ? 'green' : found.status === 'PENDING' ? 'gold' : 'pink'}
            tag={t(found.status === 'WINNER' ? 'verify.winner' : found.status === 'PENDING' ? 'verify.pending' : 'verify.not_winner')}
            prizeLine={found.prize ? t('verify.prize_for', { prize: prizeLabel(found.prize) }) : undefined}
            confirmLabel={t('draw.confirm_handover')}
            onConfirm={found.status === 'PENDING' && found.draw_id ? () => resolve(found.draw_id!, 'confirm') : undefined}
            onNoShow={found.status === 'PENDING' && found.draw_id ? () => resolve(found.draw_id!, 'no_show') : undefined} />
        )}
      </div>
    </StationShell>
  );
}
```

- [ ] **Step 7: Let the two roles log in**

In `src/app/station/page.tsx`, replace
```ts
const HOME: Record<string, string | undefined> = {
  checkin: '/station/check-in',
  merchandise: '/station/merchandise',
  // draw and prizes screens are added in Plan 2
};
```
with
```ts
const HOME: Record<string, string | undefined> = {
  checkin: '/station/check-in',
  merchandise: '/station/merchandise',
  draw: '/station/draw',
  prizes: '/station/prizes',
};
```

- [ ] **Step 8: Typecheck and try it**

Run: `npx tsc --noEmit && npm run lint && npm run test:unit`
Expected: no errors; all unit tests pass.

Then with the local stack running (`npm run dev`) and a rehearsal event that has a prize, two checked-in guests and a stage key (Task 27 Step 8):
1. On a phone-sized window, open `/station`, log in with the **draw** PIN, pick "Meja 1" or any label. Expected: the draw screen with the grey/green/pink stage dot and the prize picker.
2. Open `/stage?key=…` in a second window. Expected: the dot turns green within about 5 seconds.
3. Tap **TAMPILKAN HADIAH**. Expected: the stage shows the prize banner. Tap **UNDI SEKARANG**. Expected: the phone shows number, **name** and outlet with a 60-second countdown; the stage rolls for about 5 seconds and lands on the **number only**.
4. Tap **KONFIRMASI**. Expected: the stage shows the name; the phone shows **TERCATAT** and **UNDIAN BERIKUTNYA**. Tap **LAYAR KOSONG**: the stage returns to the idle board (the name otherwise stays until the next prize is shown or drawn).
5. Repeat and tap **TIDAK HADIR**. Expected: the stage shows "TIDAK HADIR — UNDI ULANG" for about 3 seconds; the phone shows the picker with the same prize selected.
6. Log out, log in with the **prizes** PIN. Expected: the verification screen; type a winner's number and tap **CARI** — a green "PEMENANG TERKONFIRMASI" card; type a number that did not win — a pink "BUKAN PEMENANG" card.

- [ ] **Step 9: Commit**

```bash
git add src/lib/prizes.ts src/lib/operator.ts src/lib/use-current.ts src/styles/operator.css src/components/station/WinnerCard.tsx src/app/station tests/unit/operator.test.ts
git commit -m "feat: MC draw screen and prize verification screen"
```

## Task 29: Admin console — dashboard, prizes, draw history, reports, audit, stage key and options

**Files:**
- Create: `src/lib/admin-draw-text.ts`, `src/styles/admin-draw.css`
- Create: `src/components/admin/PrizeManager.tsx`, `DrawHistory.tsx`, `StagePanel.tsx`, `ReportsPanel.tsx`, `AuditTable.tsx`, `OutletTable.tsx`
- Create: `src/app/admin/(console)/prizes/page.tsx`, `draws/page.tsx`, `reports/page.tsx`, `audit/page.tsx`
- Modify (whole file): `src/app/admin/(console)/page.tsx`, `src/app/admin/(console)/settings/page.tsx`, `src/app/admin/(console)/layout.tsx`, `src/components/admin/AdminNav.tsx`
- Test: `tests/unit/admin-draw-text.test.ts`

**Interfaces:**
- Consumes (Task 26): `GET/POST /api/admin/prizes`, `POST /api/admin/prizes/[id]/delete`, `GET /api/admin/draws`, `POST /api/admin/draws/[id]/void`, `GET /api/admin/dashboard` (`{counts, outlets, prizes, draw, stage, recent}`), `GET /api/admin/stage` (`{stage, heartbeat_age, key_set}`), `POST /api/admin/settings/stage-key` (`{key, url}`), `POST /api/admin/settings/stage-options`, `GET /api/admin/reports/[name]`, `GET /api/admin/audit?before=&limit=`, Plan 1's `GET /api/admin/invitations.csv`. Task 28: `PrizeRow`, `prizeLabel`. Task 24: `heartbeatState`, `StageOptions`. Plan 1: `useLoad`, `api`, `formatTimeWita`, admin CSS classes.
- Produces: the four new admin pages, the richer dashboard, a stage panel on the Settings page, and four new links in the admin navigation.

The admin console is English and plain on purpose (Plan 1's rule): it is used by HR at a desk, not by the room.

- [ ] **Step 1: Write the failing test**

`tests/unit/admin-draw-text.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { auditSummary, describePrize, describeVoid, drawStatus, formatStampWita, percent, stageLinkText } from '@/lib/admin-draw-text';

describe('messages', () => {
  it('explain every prize refusal in words', () => {
    expect(describePrize('NAME_IN_USE')).toBe('Another prize already has that name.');
    expect(describePrize('QUANTITY_TOO_LOW')).toBe('The quantity cannot be lower than the slots already drawn.');
    expect(describePrize('LOCKED_BY_DRAWS')).toBe('Batch mode cannot be changed once this prize has been drawn.');
    expect(describePrize('HAS_DRAWS')).toBe('A prize that has been drawn cannot be deleted.');
    expect(describePrize('BAD_INPUT')).toBe(describePrize('INVALID'));
    expect(describePrize('SOMETHING_NEW')).toBe('Could not save. Try again.');
  });
  it('explain every void refusal', () => {
    expect(describeVoid('REASON_REQUIRED')).toBe('Give a reason of at least 5 characters.');
    expect(describeVoid('NOT_VOIDABLE')).toBe('That draw is already void.');
    expect(describeVoid('SOMETHING_NEW')).toBe('Could not void. Refresh and try again.');
  });
});

describe('drawStatus', () => {
  it('names and colours each draw status', () => {
    expect(drawStatus('drawn')).toEqual({ label: 'waiting for MC', tone: 'gold' });
    expect(drawStatus('confirmed')).toEqual({ label: 'confirmed', tone: 'green' });
    expect(drawStatus('void_no_show')).toEqual({ label: 'not here', tone: 'pink' });
    expect(drawStatus('void_admin')).toEqual({ label: 'voided by admin', tone: 'pink' });
    expect(drawStatus('odd')).toEqual({ label: 'odd', tone: 'plain' });
  });
});

describe('stageLinkText', () => {
  it('describes the projector connection from the heartbeat age', () => {
    expect(stageLinkText(null)).toBe('Never connected');
    expect(stageLinkText(3.2)).toBe('Connected, seen 3 s ago');
    expect(stageLinkText(14.9)).toBe('Connected, seen 15 s ago');
    expect(stageLinkText(15)).toBe('Not seen for 15 s');
    expect(stageLinkText(42)).toBe('Not seen for 42 s');
    expect(stageLinkText(300)).toBe('Not seen for 5 min');
  });
});

describe('formatting', () => {
  it('prints times in WITA with the date', () => {
    expect(formatStampWita('2026-12-10T09:42:05Z')).toBe('2026-12-10 17:42:05');
    expect(formatStampWita(null)).toBe('');
  });
  it('summarises audit details on one short line', () => {
    expect(auditSummary({ reason: 'wrong person', slot: 2 })).toBe('reason: wrong person · slot: 2');
    expect(auditSummary({ fields: ['name', 'tier'] })).toBe('fields: ["name","tier"]');
    expect(auditSummary(null)).toBe('');
    expect(auditSummary({ note: 'x'.repeat(300) })).toHaveLength(140);
    expect(auditSummary({ note: 'x'.repeat(300) }).endsWith('…')).toBe(true);
  });
  it('rounds percentages and survives an empty outlet', () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(3, 3)).toBe(100);
    expect(percent(0, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- admin-draw-text`
Expected: FAIL — `Cannot find module '@/lib/admin-draw-text'`.

- [ ] **Step 3: Write the text helpers and run the test**

`src/lib/admin-draw-text.ts`:
```ts
const PRIZE_PROBLEM: Record<string, string> = {
  INVALID: 'Check the fields: a name is required, the quantity is 1 to 500, and the tier is at most 30 characters.',
  BAD_INPUT: 'Check the fields: a name is required, the quantity is 1 to 500, and the tier is at most 30 characters.',
  NAME_IN_USE: 'Another prize already has that name.',
  QUANTITY_TOO_LOW: 'The quantity cannot be lower than the slots already drawn.',
  LOCKED_BY_DRAWS: 'Batch mode cannot be changed once this prize has been drawn.',
  NOT_FOUND: 'That prize no longer exists. Refresh the page.',
  HAS_DRAWS: 'A prize that has been drawn cannot be deleted.',
};
export const describePrize = (status: string): string => PRIZE_PROBLEM[status] ?? 'Could not save. Try again.';

const VOID_PROBLEM: Record<string, string> = {
  REASON_REQUIRED: 'Give a reason of at least 5 characters.',
  NOT_VOIDABLE: 'That draw is already void.',
  NOT_FOUND: 'That draw no longer exists. Refresh the page.',
};
export const describeVoid = (status: string): string => VOID_PROBLEM[status] ?? 'Could not void. Refresh and try again.';

export type Tone = 'green' | 'gold' | 'pink' | 'plain';
const DRAW_STATUS: Record<string, { label: string; tone: Tone }> = {
  drawn: { label: 'waiting for MC', tone: 'gold' },
  confirmed: { label: 'confirmed', tone: 'green' },
  void_no_show: { label: 'not here', tone: 'pink' },
  void_admin: { label: 'voided by admin', tone: 'pink' },
};
export const drawStatus = (s: string): { label: string; tone: Tone } => DRAW_STATUS[s] ?? { label: s, tone: 'plain' };

/** Projector connection from the age (seconds) of its last heartbeat. Green below 15 seconds, as on the MC screen. */
export function stageLinkText(age: number | null | undefined): string {
  if (age === null || age === undefined) return 'Never connected';
  if (age < 15) return `Connected, seen ${Math.round(age)} s ago`;
  return age >= 120 ? `Not seen for ${Math.round(age / 60)} min` : `Not seen for ${Math.round(age)} s`;
}

const STAMP = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Makassar', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
/** "2026-12-10 17:42:05" in WITA, the same shape as the CSV exports. */
export const formatStampWita = (iso: string | null | undefined): string => (iso ? STAMP.format(new Date(iso)) : '');

/** One short line for the audit table. Audit details never hold names or tokens (checked in the API tests). */
export function auditSummary(details: unknown, max = 140): string {
  if (!details || typeof details !== 'object') return '';
  const text = Object.entries(details as Record<string, unknown>)
    .map(([k, v]) => `${k.replaceAll('_', ' ')}: ${typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}`)
    .join(' · ');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export const percent = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 100) : 0);
```

Run: `npm run test:unit -- admin-draw-text`
Expected: PASS (7 tests).

- [ ] **Step 4: Add the stylesheet and the small components**

`src/styles/admin-draw.css`:
```css
.adm-dot { display: inline-block; width: 12px; height: 12px; margin-right: 8px; border-radius: 50%; vertical-align: middle; background: var(--nf-line-dash); }
.adm-dot--ok { background: var(--nf-green); }
.adm-dot--down { background: var(--nf-pink); }
.adm-key { display: block; margin: 8px 0; padding: 10px 12px; border: 1px dashed var(--nf-gold); border-radius: 8px; background: var(--nf-surface); font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 14px; word-break: break-all; }
.adm-bar { min-width: 80px; height: 8px; border-radius: 999px; overflow: hidden; background: var(--nf-line); }
.adm-bar > i { display: block; height: 100%; background: var(--nf-green); }
.adm-narrow { width: 90px; }
.adm-checks { display: flex; flex-direction: column; gap: 10px; margin: 10px 0; }
.adm-check { display: flex; align-items: center; gap: 10px; }
.adm-links { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); margin-bottom: 20px; }
.adm-link { display: block; padding: 14px; border: 1px solid var(--nf-line); border-radius: 12px; background: var(--nf-card); color: var(--nf-text); text-decoration: none; }
.adm-link:hover { border-color: var(--nf-gold); }
.adm-link b { display: block; font-family: var(--nf-font-heading); font-weight: 400; font-size: 18px; text-transform: uppercase; color: var(--nf-gold); }
.adm-link span { color: var(--nf-text-soft); font-size: 13px; }
```

`src/components/admin/OutletTable.tsx`:
```tsx
import { percent } from '@/lib/admin-draw-text';

export type OutletRow = { outlet: string; total: number; rsvp_yes: number; checked_in: number; redeemed: number };

export function OutletTable({ rows }: { rows: OutletRow[] }) {
  return (
    <div className="adm-table-wrap">
      <table className="adm-table">
        <thead><tr><th>Outlet</th><th>Employees</th><th>RSVP yes</th><th>Checked in</th><th>Attendance</th><th>Merchandise</th></tr></thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.outlet}>
              <td>{o.outlet}</td>
              <td>{o.total}</td>
              <td>{o.rsvp_yes}</td>
              <td>{o.checked_in}</td>
              <td><div className="adm-bar" role="img" aria-label={`${percent(o.checked_in, o.total)} percent checked in`}><i style={{ width: `${percent(o.checked_in, o.total)}%` }} /></div></td>
              <td>{o.redeemed}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} className="adm-muted">No employees imported yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
```

`src/components/admin/ReportsPanel.tsx`:
```tsx
const REPORTS: { href: string; title: string; text: string }[] = [
  { href: '/api/admin/reports/guests', title: 'Guests', text: 'Every employee: outlet, RSVP, check-in time, Door Prize number, merchandise.' },
  { href: '/api/admin/reports/check-ins', title: 'Check-ins', text: 'One row per check-in with time, method and desk.' },
  { href: '/api/admin/reports/merchandise', title: 'Merchandise', text: 'Every hand-over and void, with booth and staff.' },
  { href: '/api/admin/reports/draws', title: 'Draw history', text: 'Every draw: prize, slot, winner, outcome, who resolved it, void reasons.' },
  { href: '/api/admin/reports/audit', title: 'Audit log', text: 'Every recorded action, oldest first.' },
  { href: '/api/admin/reports/rsvp-pending', title: 'RSVP not answered', text: 'Employees who have not answered, with phone numbers, for a reminder.' },
  { href: '/api/admin/invitations.csv', title: 'Invitation links', text: 'Personal pass link per employee, for the WhatsApp broadcast.' },
];

export function ReportsPanel() {
  return (
    <div className="adm-links">
      {REPORTS.map((r) => (
        <a key={r.href} className="adm-link" href={r.href} download>
          <b>{r.title}</b>
          <span>{r.text}</span>
        </a>
      ))}
    </div>
  );
}
```

`src/components/admin/AuditTable.tsx`:
```tsx
'use client';
import { useCallback, useEffect, useState } from 'react';
import { auditSummary, formatStampWita } from '@/lib/admin-draw-text';
import { api } from '@/lib/client';

type AuditRow = { id: number; at: string; actor_type: string; actor: string; action: string; entity: string | null; entity_id: string | null; details: unknown };
const PAGE = 100;

export function AuditTable() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(true);
  const [msg, setMsg] = useState('');

  const load = useCallback(async (before?: number) => {
    setBusy(true);
    const r = await api<{ rows: AuditRow[] }>(`/api/admin/audit?limit=${PAGE}${before ? `&before=${before}` : ''}`);
    setBusy(false);
    if (r.http === 401) { window.location.href = '/admin/login'; return; }
    if (!r.ok || !r.data) { setMsg('Could not load the audit log.'); return; }
    setMsg('');
    const got = r.data.rows;
    setRows((prev) => (before ? [...prev, ...got] : got));
    setMore(got.length === PAGE);
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="adm-row">
        <button className="btn" onClick={() => load()} disabled={busy}>Refresh</button>
        {msg && <span className="adm-msg adm-msg--error">{msg}</span>}
      </div>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Time (WITA)</th><th>Who</th><th>Action</th><th>About</th><th>Details</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{formatStampWita(r.at)}</td>
                <td>{r.actor_type}: {r.actor}</td>
                <td>{r.action.replaceAll('_', ' ')}</td>
                <td>{r.entity}{r.entity_id ? ` ${r.entity_id.slice(0, 8)}` : ''}</td>
                <td className="adm-muted">{auditSummary(r.details)}</td>
              </tr>
            ))}
            {!busy && rows.length === 0 && <tr><td colSpan={5} className="adm-muted">Nothing recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {more && <div className="adm-row" style={{ marginTop: 14 }}><button className="btn" disabled={busy} onClick={() => load(rows[rows.length - 1]?.id)}>Load older</button></div>}
    </>
  );
}
```

- [ ] **Step 5: Write the prize manager and the draw history**

`src/components/admin/PrizeManager.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { describePrize } from '@/lib/admin-draw-text';
import { api } from '@/lib/client';
import type { PrizeRow } from '@/lib/prizes';
import { useLoad } from '@/lib/use-load';

type Draft = { name: string; tier: string; quantity: string; sort_order: string; draw_as_batch: boolean };
const EMPTY: Draft = { name: '', tier: '', quantity: '1', sort_order: '', draw_as_batch: false };
const toDraft = (p: PrizeRow): Draft => ({
  name: p.name, tier: p.tier ?? '', quantity: String(p.quantity), sort_order: String(p.sort_order), draw_as_batch: p.draw_as_batch,
});

function Fields({ d, set, batchLocked }: { d: Draft; set: (d: Draft) => void; batchLocked?: boolean }) {
  return (
    <>
      <input className="adm-input" placeholder="Prize name" aria-label="Prize name" value={d.name} onChange={(e) => set({ ...d, name: e.target.value })} />
      <input className="adm-input adm-narrow" placeholder="Tier (optional)" aria-label="Tier" value={d.tier} onChange={(e) => set({ ...d, tier: e.target.value })} />
      <input className="adm-input adm-narrow" type="number" min={1} max={500} aria-label="Quantity" value={d.quantity} onChange={(e) => set({ ...d, quantity: e.target.value })} />
      <input className="adm-input adm-narrow" type="number" min={0} placeholder="Order" aria-label="Order" value={d.sort_order} onChange={(e) => set({ ...d, sort_order: e.target.value })} />
      <label className="adm-check">
        <input type="checkbox" checked={d.draw_as_batch} disabled={batchLocked} onChange={(e) => set({ ...d, draw_as_batch: e.target.checked })} />
        Draw all at once
      </label>
    </>
  );
}

export function PrizeManager() {
  const { data, loading, reload } = useLoad<{ prizes: PrizeRow[] }>('/api/admin/prizes', 10_000);
  const [adding, setAdding] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<{ id: string; draft: Draft } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(id: string | null, d: Draft): Promise<boolean> {
    const quantity = Number(d.quantity);
    if (!d.name.trim() || !Number.isInteger(quantity) || quantity < 1) { setMsg({ ok: false, text: describePrize('INVALID') }); return false; }
    const body = {
      ...(id ? { id } : {}),
      name: d.name.trim(),
      tier: d.tier.trim() || null,
      quantity,
      draw_as_batch: d.draw_as_batch,
      ...(d.sort_order.trim() !== '' ? { sort_order: Number(d.sort_order) } : {}),
    };
    const r = await api('/api/admin/prizes', body);
    if (r.status === 'OK') { setMsg({ ok: true, text: id ? 'Saved.' : 'Prize added.' }); reload(); return true; }
    setMsg({ ok: false, text: describePrize(r.status) });
    return false;
  }

  async function remove(id: string) {
    const r = await api(`/api/admin/prizes/${id}/delete`, {});
    setDeleting(null);
    if (r.status === 'OK') { setMsg({ ok: true, text: 'Prize deleted.' }); reload(); }
    else setMsg({ ok: false, text: describePrize(r.status) });
  }

  const rows = data?.prizes ?? [];
  return (
    <>
      <div className="adm-card">
        <h2 className="adm-sub" style={{ marginTop: 0 }}>Add a prize</h2>
        <div className="adm-row">
          <Fields d={adding} set={setAdding} />
          <button className="btn btn--gold" onClick={async () => { if (await save(null, adding)) setAdding(EMPTY); }}>Add prize</button>
        </div>
        <p className="adm-muted">Quantity is the number of winners for this prize. &ldquo;Draw all at once&rdquo; is for voucher-style prizes: the MC draws every free slot in one tap and confirms them together or one by one.</p>
      </div>
      {msg && <p className={`adm-msg ${msg.ok ? 'adm-msg--ok' : 'adm-msg--error'}`}>{msg.text}</p>}
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Order</th><th>Prize</th><th>Slots</th><th>Mode</th><th>Confirmed</th><th>Waiting</th><th>Not here</th><th>Left</th><th /></tr></thead>
          <tbody>
            {rows.map((p) => {
              const isEditing = editing?.id === p.id;
              if (isEditing && editing) {
                return (
                  <tr key={p.id}>
                    <td colSpan={8}>
                      <span className="adm-row" style={{ margin: 0 }}>
                        <Fields d={editing.draft} set={(draft) => setEditing({ id: p.id, draft })} batchLocked={p.has_draws} />
                      </span>
                    </td>
                    <td>
                      <span className="adm-row" style={{ margin: 0 }}>
                        <button className="btn btn--gold" onClick={async () => { if (await save(p.id, editing.draft)) setEditing(null); }}>Save</button>
                        <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
                      </span>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={p.id}>
                  <td>{p.sort_order}</td>
                  <td><b>{p.name}</b>{p.tier ? <> <span className="adm-badge adm-badge--gold">{p.tier}</span></> : null}</td>
                  <td>{p.quantity}</td>
                  <td>{p.draw_as_batch ? 'all at once' : 'one by one'}</td>
                  <td>{p.confirmed}</td>
                  <td>{p.pending}</td>
                  <td>{p.no_shows}</td>
                  <td>{p.remaining}</td>
                  <td>
                    <span className="adm-row" style={{ margin: 0 }}>
                      <button className="btn" onClick={() => { setEditing({ id: p.id, draft: toDraft(p) }); setMsg(null); }}>Edit</button>
                      {deleting === p.id ? (
                        <>
                          <button className="btn btn--danger" onClick={() => remove(p.id)}>Confirm delete</button>
                          <button className="btn" onClick={() => setDeleting(null)}>Cancel</button>
                        </>
                      ) : (
                        <button className="btn btn--danger" disabled={p.has_draws} title={p.has_draws ? 'This prize has been drawn' : undefined} onClick={() => setDeleting(p.id)}>Delete</button>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && <tr><td colSpan={9} className="adm-muted">No prizes yet. Add the first one above.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
```

`src/components/admin/DrawHistory.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { describeVoid, drawStatus } from '@/lib/admin-draw-text';
import { api } from '@/lib/client';
import { formatTimeWita } from '@/lib/time';
import { useLoad } from '@/lib/use-load';

type DrawRow = {
  id: string; prize: string; slot: number; quantity: number; number: number; name: string; outlet: string; department: string | null;
  status: string; drawn_at: string; resolved_at: string | null; resolved_by: string | null; void_reason: string | null; redraw_of: string | null;
};

export function DrawHistory() {
  const { data, loading, reload } = useLoad<{ draws: DrawRow[] }>('/api/admin/draws', 5_000);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');

  async function confirmVoid(id: string) {
    const r = await api(`/api/admin/draws/${id}/void`, { reason });
    if (r.status === 'OK') { setVoiding(null); setReason(''); setMsg(''); reload(); }
    else setMsg(describeVoid(r.status));
  }

  const rows = data?.draws ?? [];
  return (
    <>
      {msg && <p className="adm-msg adm-msg--error">{msg}</p>}
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Drawn</th><th>Prize</th><th>No.</th><th>Winner</th><th>Outlet</th><th>Status</th><th>Resolved by</th><th /></tr></thead>
          <tbody>
            {rows.map((d) => {
              const st = drawStatus(d.status);
              const live = d.status === 'drawn' || d.status === 'confirmed';
              return (
                <tr key={d.id} className={live ? '' : 'is-dim'}>
                  <td>{formatTimeWita(d.drawn_at)}</td>
                  <td>{d.prize} <span className="adm-muted">{d.slot}/{d.quantity}</span></td>
                  <td>{String(d.number).padStart(3, '0')}</td>
                  <td>{d.name}</td>
                  <td>{d.outlet}</td>
                  <td>
                    <span className={st.tone === 'plain' ? 'adm-badge' : `adm-badge adm-badge--${st.tone}`}>{st.label}</span>
                    {d.void_reason ? <div className="adm-muted">{d.void_reason}</div> : null}
                  </td>
                  <td>{d.resolved_by ?? ''}</td>
                  <td>
                    {live && voiding !== d.id && <button className="btn btn--danger" onClick={() => { setVoiding(d.id); setMsg(''); }}>Void</button>}
                    {voiding === d.id && (
                      <span className="adm-row" style={{ margin: 0 }}>
                        <input className="adm-input" placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
                        <button className="btn btn--danger" onClick={() => confirmVoid(d.id)}>Confirm void</button>
                        <button className="btn" onClick={() => setVoiding(null)}>Cancel</button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && <tr><td colSpan={8} className="adm-muted">No draws yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
```

- [ ] **Step 6: Write the stage panel**

`src/components/admin/StagePanel.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { stageLinkText } from '@/lib/admin-draw-text';
import { api } from '@/lib/client';
import { heartbeatState } from '@/lib/draw-ui';
import type { StageOptions } from '@/lib/stage';
import { useLoad } from '@/lib/use-load';

type StageInfo = { stage: { rev: number; phase: string; options: StageOptions }; heartbeat_age: number | null; key_set: boolean };

export function StagePanel() {
  const { data, reload } = useLoad<StageInfo>('/api/admin/stage', 3_000);
  const [fresh, setFresh] = useState<{ key: string; url: string } | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const [msg, setMsg] = useState('');

  async function makeKey() {
    const r = await api<{ key: string; url: string }>('/api/admin/settings/stage-key', {});
    setConfirmNew(false);
    if (r.ok && r.data) { setFresh(r.data); setMsg(''); reload(); }
    else setMsg('Could not create a key. Try again.');
  }
  async function setOption(change: Partial<StageOptions>) {
    const r = await api('/api/admin/settings/stage-options', change);
    if (r.status === 'OK') { setMsg(''); reload(); } else setMsg('Could not change that option. Try again.');
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setMsg('Copied.'); } catch { setMsg('Copy failed: select the text and copy it by hand.'); }
  }

  const o = data?.stage.options;
  const link = heartbeatState(data?.heartbeat_age);
  return (
    <>
      <h2 className="adm-sub">Stage display</h2>
      <p className="adm-muted">The projector opens a private link with a display key. Anyone with the link can watch the stage, but cannot change anything. Making a new key signs out every open display.</p>
      <div className="adm-card">
        <p>
          <span className={`adm-dot ${link === 'ok' ? 'adm-dot--ok' : link === 'down' ? 'adm-dot--down' : ''}`} />
          {data ? stageLinkText(data.heartbeat_age) : 'Loading…'}
          {data ? <span className="adm-muted"> · showing {data.stage.phase}</span> : null}
        </p>
        <p className="adm-muted">{data?.key_set ? 'A display key is set.' : 'No display key yet. Create one before the rehearsal.'}</p>
        {fresh && (
          <div className="adm-msg adm-msg--ok">
            This link is shown only once. Open it on the projector laptop, or copy it somewhere safe.
            <code className="adm-key">{fresh.url}</code>
            <button className="btn" onClick={() => copy(fresh.url)}>Copy link</button>
          </div>
        )}
        <div className="adm-row">
          {confirmNew ? (
            <>
              <span>Every open display will be signed out.</span>
              <button className="btn btn--danger" onClick={makeKey}>Yes, make a new key</button>
              <button className="btn" onClick={() => setConfirmNew(false)}>Cancel</button>
            </>
          ) : (
            <button className="btn btn--gold" onClick={() => (data?.key_set ? setConfirmNew(true) : makeKey())}>{data?.key_set ? 'Make a new key' : 'Create display key'}</button>
          )}
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-checks">
          <label className="adm-check">
            <input type="checkbox" checked={!!o?.safe_mode} disabled={!o} onChange={(e) => setOption({ safe_mode: e.target.checked })} />
            Projector-safe look (flat black, no glows or halftone, white names, no sound)
          </label>
          <label className="adm-check">
            <input type="checkbox" checked={!!o?.reduce_effects} disabled={!o} onChange={(e) => setOption({ reduce_effects: e.target.checked })} />
            Reduced effects (no number roll, no flashing; fades only)
          </label>
          <label className="adm-check">
            Language on the stage
            <select className="adm-select" value={o?.language ?? 'id'} disabled={!o} onChange={(e) => setOption({ language: e.target.value === 'en' ? 'en' : 'id' })}>
              <option value="id">Bahasa Indonesia</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>
        <p className="adm-muted">Changes reach the projector within a second or two. These options survive the rehearsal reset.</p>
      </div>
      {msg && <p className="adm-msg adm-msg--ok">{msg}</p>}
    </>
  );
}
```

- [ ] **Step 7: Write the pages and replace the four Plan 1 files**

`src/app/admin/(console)/prizes/page.tsx`:
```tsx
import { PrizeManager } from '@/components/admin/PrizeManager';

export default function PrizesPage() {
  return (
    <>
      <h1 className="adm-title">Prizes</h1>
      <p className="adm-muted">The list the MC draws from. After a prize has been drawn, its batch setting is locked and its quantity can only grow (or shrink down to the highest slot in play).</p>
      <PrizeManager />
    </>
  );
}
```

`src/app/admin/(console)/draws/page.tsx`:
```tsx
import { DrawHistory } from '@/components/admin/DrawHistory';

export default function DrawsPage() {
  return (
    <>
      <h1 className="adm-title">Draws</h1>
      <p className="adm-muted">Voiding reverses a draw (even a confirmed one), frees the slot for a redraw and returns the stage to idle if it is showing that draw. The winner stays eligible for other prizes. The reason is kept in the audit log.</p>
      <DrawHistory />
    </>
  );
}
```

`src/app/admin/(console)/reports/page.tsx`:
```tsx
import { ReportsPanel } from '@/components/admin/ReportsPanel';

export default function ReportsPage() {
  return (
    <>
      <h1 className="adm-title">Reports</h1>
      <p className="adm-muted">CSV files that open in Excel. Every download is written to the audit log. Download all of them on the evening of 9 December as a backup.</p>
      <ReportsPanel />
    </>
  );
}
```

`src/app/admin/(console)/audit/page.tsx`:
```tsx
import { AuditTable } from '@/components/admin/AuditTable';

export default function AuditPage() {
  return (
    <>
      <h1 className="adm-title">Audit log</h1>
      <p className="adm-muted">Newest first. Once the event is live, entries can no longer be deleted.</p>
      <AuditTable />
    </>
  );
}
```

`src/app/admin/(console)/page.tsx` (replace the whole file):
```tsx
'use client';
import { OutletTable, type OutletRow } from '@/components/admin/OutletTable';
import { stageLinkText } from '@/lib/admin-draw-text';
import { heartbeatState } from '@/lib/draw-ui';
import type { PrizeRow } from '@/lib/prizes';
import { useLoad } from '@/lib/use-load';

type Dash = {
  counts: { total: number; checked_in: number; redeemed: number; rsvp_yes: number; rsvp_no: number; rsvp_pending: number; opened: number; mode: string };
  outlets: OutletRow[];
  prizes: PrizeRow[];
  draw: { confirmed: number; pending: number; no_shows: number; admin_voids: number; eligible: number };
  stage: { phase: string; rev: number; heartbeat_age: number | null };
  recent: { at: string; actor: string; action: string }[];
};

export default function Dashboard() {
  const { data, loading, status } = useLoad<Dash>('/api/admin/dashboard', 5_000);
  if (loading) return <p className="adm-muted">Loading…</p>;
  if (!data) return <p className="adm-msg adm-msg--error">Could not load the dashboard ({status}). It retries every 5 seconds.</p>;
  const c = data.counts;
  const stats: [string, number | string][] = [
    ['Employees', c.total],
    ['Opened their invitation', `${c.opened} / ${c.total}`],
    ['Coming (RSVP yes)', c.rsvp_yes],
    ['Not coming (RSVP no)', c.rsvp_no],
    ['No answer yet', c.rsvp_pending],
    ['Checked in', `${c.checked_in} / ${c.total}`],
    ['Merchandise handed over', `${c.redeemed} / ${c.checked_in}`],
  ];
  const d = data.draw;
  const drawStats: [string, number][] = [
    ['Prizes confirmed', d.confirmed],
    ['Waiting for the MC', d.pending],
    ['Not here', d.no_shows],
    ['Voided by admin', d.admin_voids],
    ['Still eligible to win', d.eligible],
  ];
  const link = heartbeatState(data.stage.heartbeat_age);
  return (
    <>
      <h1 className="adm-title">Dashboard <span className={`adm-badge ${c.mode === 'live' ? 'adm-badge--green' : 'adm-badge--gold'}`}>{c.mode}</span></h1>
      <div className="adm-grid">
        {stats.map(([label, n]) => (
          <div className="adm-stat" key={label}>
            <div className="adm-stat__n">{n}</div>
            <div className="adm-stat__l">{label}</div>
          </div>
        ))}
      </div>

      <h2 className="adm-sub">Door prize</h2>
      <div className="adm-grid">
        {drawStats.map(([label, n]) => (
          <div className="adm-stat" key={label}>
            <div className="adm-stat__n">{n}</div>
            <div className="adm-stat__l">{label}</div>
          </div>
        ))}
        <div className="adm-stat">
          <div className="adm-stat__n" style={{ fontSize: 20, paddingTop: 8 }}>
            <span className={`adm-dot ${link === 'ok' ? 'adm-dot--ok' : link === 'down' ? 'adm-dot--down' : ''}`} />{data.stage.phase}
          </div>
          <div className="adm-stat__l">Stage: {stageLinkText(data.stage.heartbeat_age)}</div>
        </div>
      </div>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Prize</th><th>Slots</th><th>Confirmed</th><th>Waiting</th><th>Not here</th><th>Left</th></tr></thead>
          <tbody>
            {data.prizes.map((p) => (
              <tr key={p.id}>
                <td>{p.tier ? `${p.tier} · ` : ''}{p.name}</td>
                <td>{p.quantity}</td>
                <td>{p.confirmed}</td>
                <td>{p.pending}</td>
                <td>{p.no_shows}</td>
                <td>{p.remaining}</td>
              </tr>
            ))}
            {data.prizes.length === 0 && <tr><td colSpan={6} className="adm-muted">No prizes yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2 className="adm-sub">Attendance by outlet</h2>
      <OutletTable rows={data.outlets} />

      <h2 className="adm-sub">Recent activity</h2>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Time (WITA)</th><th>Who</th><th>What</th></tr></thead>
          <tbody>
            {data.recent.map((r, i) => (
              <tr key={i}>
                <td>{new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(r.at))}</td>
                <td>{r.actor}</td>
                <td>{r.action.replaceAll('_', ' ')}</td>
              </tr>
            ))}
            {data.recent.length === 0 && <tr><td colSpan={3} className="adm-muted">Nothing yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
```

`src/app/admin/(console)/settings/page.tsx` (replace the whole file):
```tsx
'use client';
import { RehearsalPanel } from '@/components/admin/RehearsalPanel';
import { StagePanel } from '@/components/admin/StagePanel';
import { StationSettings, type PinRow } from '@/components/admin/StationSettings';
import { useLoad } from '@/lib/use-load';

type Settings = { event: { name: string; event_date: string }; mode: string; station_labels: string[]; pins: PinRow[] };

export default function SettingsPage() {
  const { data, loading, reload } = useLoad<Settings>('/api/admin/settings');
  if (loading) return <p className="adm-muted">Loading…</p>;
  if (!data) return <p className="adm-msg adm-msg--error">Could not load settings.</p>;
  return (
    <>
      <h1 className="adm-title">Settings</h1>
      <p className="adm-muted">{data.event.name} · {data.event.event_date}</p>
      <StationSettings key={data.station_labels.join('|')} pins={data.pins} labels={data.station_labels} reload={reload} />
      <StagePanel />
      <RehearsalPanel mode={data.mode} reload={reload} />
    </>
  );
}
```

`src/app/admin/(console)/layout.tsx` (replace the whole file):
```tsx
import { AdminNav } from '@/components/admin/AdminNav';
import { requireAdminPage } from '@/lib/admin-page';
import '@/styles/admin.css';
import '@/styles/admin-draw.css';

export const dynamic = 'force-dynamic';

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { email } = await requireAdminPage();
  return (
    <div className="adm">
      <AdminNav email={email} />
      {children}
    </div>
  );
}
```

`src/components/admin/AdminNav.tsx` (replace the whole file):
```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/client';

const LINKS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/guests', label: 'Guests' },
  { href: '/admin/merchandise', label: 'Merchandise' },
  { href: '/admin/prizes', label: 'Prizes' },
  { href: '/admin/draws', label: 'Draws' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/audit', label: 'Audit' },
  { href: '/admin/settings', label: 'Settings' },
];

export function AdminNav({ email }: { email: string }) {
  const path = usePathname();
  async function signOut() {
    await api('/api/admin/logout', {});
    window.location.href = '/admin/login';
  }
  return (
    <nav className="adm-nav" aria-label="Admin">
      <span className="adm-nav__brand">NOURISHFEST</span>
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={path === l.href ? 'page' : undefined}>{l.label}</Link>
      ))}
      <span className="adm-nav__spacer" />
      <span className="adm-nav__who">{email}</span>
      <button className="btn" onClick={signOut}>Sign out</button>
    </nav>
  );
}
```

- [ ] **Step 8: Typecheck and walk through it**

Run: `npx tsc --noEmit && npm run lint && npm run test:unit && npm run build`
Expected: no errors; all unit tests pass; the build lists the new routes (`/admin/prizes`, `/admin/draws`, `/admin/reports`, `/admin/audit`, `/stage`, `/station/draw`, `/station/prizes`).

Then a manual walk-through as an admin on the local stack (`npm run dev`), with a rehearsal event that has a few checked-in guests:
1. **Prizes:** add "Smart TV", tier "HADIAH UTAMA", quantity 1; add "Voucher 100K", quantity 5, tick "Draw all at once". Expected: both rows appear with Left = quantity. Try the same name again: "Another prize already has that name."
2. **Settings → Stage display:** "Create display key". Expected: a link appears once; reloading the page no longer shows it. Open it in another window: the idle board. The dot turns green within 5 seconds. Tick "Projector-safe look": the board goes flat black within a second or two.
3. Draw and confirm one prize from the MC screen (Task 28). **Dashboard:** the Door prize tiles and the prize table update within 5 seconds; the outlet table shows attendance bars.
4. **Draws:** the confirmed draw shows a green "confirmed" badge. Void it with the reason "test"; expected: "Give a reason of at least 5 characters."; with "wrong person" it turns pink "voided by admin", and the stage returns to idle. The prize's Left goes back up by one.
5. **Reports:** download each file; open "Draw history" in Excel. Expected: UTF-8 text reads correctly and a header row is present even with no rows.
6. **Audit:** the newest actions appear first (`draw`, `draw void admin`, `report exported`, …); "Load older" appears only when there are 100 or more entries.

- [ ] **Step 9: Commit**

```bash
git add src/lib/admin-draw-text.ts src/styles/admin-draw.css src/components/admin src/app/admin tests/unit/admin-draw-text.test.ts
git commit -m "feat: admin dashboard, prizes, draw history, reports, audit and stage panel"
```

## Task 30: Security tests, end-to-end tests (MC + stage in two browsers) and the stage latency check

**Files:**
- Modify (whole file): `tests/api/security.test.ts`
- Create: `tests/e2e/draw-helpers.ts`, `tests/e2e/draw.spec.ts`, `tests/e2e/stage.spec.ts`
- Create: `scripts/load/stage-latency.mjs`

**Interfaces:**
- Consumes: Plan 1 `tests/api/helpers.ts` (`EVENT`, `svc`, `resetEvent`, `seedGuests`), Task 25 `tests/api/draw-helpers.ts` (`arrive`, `newPrize`, `clearPrizes`, `stageRow`), Plan 1 `tests/e2e/helpers.ts` (`prepare`, `checkInViaDb`, `stationLogin`, `noHorizontalScroll`, `PINS`, `svc`, `EVENT`), the screens from Tasks 27–28, `scripts/load/util.mjs` (`finish`, `percentile`).
- Produces: `prepareDraw(guestCount, prizes, options?)` and `STAGE_KEY` in `tests/e2e/draw-helpers.ts`; `npm run e2e -- draw` and `npm run e2e -- stage`; `node --env-file=.env.test scripts/load/stage-latency.mjs`.

These are the tests that prove the two promises the room depends on: **no browser can reach a table or a function except the one stage row**, and **the winner's name is not on the projector, in its page or in its network traffic until the MC confirms.**

- [ ] **Step 1: Extend the security test**

Replace the whole of `tests/api/security.test.ts` with:
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { arrive, clearPrizes, newPrize } from './draw-helpers';
import { EVENT, resetEvent, seedGuests, svc } from './helpers';

const mk = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
// `stage_state` is not in this list: it is the one table a browser may read (see the last two blocks).
const TABLES = [
  'events', 'admins', 'station_pins', 'auth_attempts', 'import_batches', 'guests', 'check_ins', 'merchandise_redemptions',
  'attempt_log', 'audit_log', 'prizes', 'draws', 'stage_heartbeat',
];
const NIL = '00000000-0000-4000-8000-000000000000';
const FUNCTIONS: [string, Record<string, unknown>][] = [
  ['get_pass', { p_token: 'AAAAAAAAAAAAAAAAAAAAAA' }],
  ['verify_pin', { p_event: EVENT, p_pin: '111111', p_device_key: 'x', p_ip_key: 'x' }],
  ['check_in', { p_event: EVENT, p_token: 'AAAAAAAAAAAAAAAAAAAAAA', p_guest_id: null, p_method: 'scan', p_station_label: 'x', p_actor: 'x' }],
  ['redeem_merchandise', { p_event: EVENT, p_token: 'AAAAAAAAAAAAAAAAAAAAAA', p_guest_id: null, p_station_label: 'x', p_actor: 'x' }],
  ['void_redemption', { p_event: EVENT, p_redemption_id: NIL, p_reason: 'none', p_actor: 'x' }],
  ['import_guests', { p_event: EVENT, p_rows: [], p_filename: 'x', p_actor: 'x' }],
  ['set_station_pin', { p_event: EVENT, p_role: 'checkin', p_pin: '123456', p_actor: 'x' }],
  ['is_admin', { p_event: EVENT, p_email: 'dev-admin@example.com' }],
  ['go_live', { p_event: EVENT, p_actor: 'x' }],
  ['reset_rehearsal_data', { p_event: EVENT, p_actor: 'x' }],
  ['event_counts', { p_event: EVENT }],
  // Plan 2. Every function, including the internal helpers: a browser must not be able to write a name to the stage.
  ['prize_list', { p_event: EVENT }],
  ['admin_save_prize', { p_event: EVENT, p_id: null, p_data: { name: 'x' }, p_actor: 'x' }],
  ['admin_delete_prize', { p_event: EVENT, p_id: NIL, p_actor: 'x' }],
  ['get_stage', { p_event: EVENT }],
  ['set_stage', { p_event: EVENT, p_phase: 'idle', p_prize_id: null, p_actor: 'x' }],
  ['set_stage_options', { p_event: EVENT, p_options: { safe_mode: true }, p_actor: 'x' }],
  ['touch_stage_heartbeat', { p_event: EVENT }],
  ['stage_heartbeat_age', { p_event: EVENT }],
  ['set_stage_key', { p_event: EVENT, p_key: 'x'.repeat(24), p_actor: 'x' }],
  ['stage_key_tag', { p_event: EVENT }],
  ['verify_stage_key', { p_event: EVENT, p_key: 'x', p_ip_key: 'x' }],
  ['draw_prize', { p_event: EVENT, p_prize_id: NIL, p_request_id: NIL, p_actor: 'x' }],
  ['draw_current', { p_event: EVENT }],
  ['lookup_prize_number', { p_event: EVENT, p_number: 1 }],
  ['resolve_draw', { p_event: EVENT, p_draw_id: NIL, p_outcome: 'confirm', p_actor: 'x' }],
  ['resolve_round', { p_event: EVENT, p_round: NIL, p_actor: 'x' }],
  ['admin_void_draw', { p_event: EVENT, p_draw_id: NIL, p_reason: 'none', p_actor: 'x' }],
  ['admin_dashboard', { p_event: EVENT }],
  ['admin_draw_list', { p_event: EVENT }],
  ['admin_audit_list', { p_event: EVENT, p_before: null, p_limit: 10 }],
  ['report_rows', { p_event: EVENT, p_report: 'guests' }],
  ['round_json', { p_event: EVENT, p_round: NIL }],
  ['stage_write', { p_event: EVENT, p_phase: 'idle', p_payload: {} }],
  ['stage_payload', { p_event: EVENT, p_round: NIL }],
  ['stage_publish', { p_event: EVENT, p_round: NIL }],
  ['actor_type_of', { p_actor: 'x' }],
];

const EMAIL = 'security-test@example.com';
const PASSWORD = 'Sec-test-pass-12345';
let anonClient: SupabaseClient;
let authedClient: SupabaseClient;
let userId: string | undefined;

beforeAll(async () => {
  anonClient = mk();
  const admin = svc().auth.admin;
  const created = await admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
  userId = created.data.user?.id ?? (await admin.listUsers()).data.users.find((u) => u.email === EMAIL)?.id;
  authedClient = mk();
  const { error } = await authedClient.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  expect(error).toBeNull(); // a signed-in Google admin is the `authenticated` role, so it must be locked out too
});
afterAll(async () => {
  if (userId) await svc().auth.admin.deleteUser(userId);
  await resetEvent();
  await clearPrizes();
});

const roles = [['anon', () => anonClient], ['authenticated', () => authedClient]] as const;

describe.each(roles)('%s role', (_name, client) => {
  it.each(TABLES)('cannot read %s', async (table) => {
    const { data, error } = await client().from(table).select('*').limit(1);
    expect(error?.code).toBe('42501');
    expect(data).toBeNull();
  });
  it.each(TABLES)('cannot write %s', async (table) => {
    const { error } = await client().from(table).insert({});
    expect(error?.code).toBe('42501');
  });
  it.each(FUNCTIONS)('cannot call %s', async (fn, args) => {
    const { error } = await client().rpc(fn, args);
    expect(error?.code).toBe('42501');
  });
});

describe.each(roles)('%s role and stage_state', (_name, client) => {
  it('can read the stage row (the projector does this with the anon key)', async () => {
    const { data, error } = await client().from('stage_state').select('rev, phase, payload, options').eq('event_id', EVENT);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
  it('cannot insert, change or delete it', async () => {
    expect((await client().from('stage_state').insert({ event_id: EVENT })).error?.code).toBe('42501');
    expect((await client().from('stage_state').update({ rev: 999 }).eq('event_id', EVENT)).error?.code).toBe('42501');
    expect((await client().from('stage_state').delete().eq('event_id', EVENT)).error?.code).toBe('42501');
  });
});

describe('what the one readable row contains', () => {
  beforeEach(async () => {
    await resetEvent();
    await clearPrizes();
  });

  it('holds the number but no name, outlet or department until the draw is confirmed', async () => {
    const guests = await seedGuests(3);
    await arrive(guests);
    const prize = await newPrize({ name: 'Smart TV', quantity: 1 });
    const drawn = await svc().rpc('draw_prize', { p_event: EVENT, p_prize_id: prize, p_request_id: crypto.randomUUID(), p_actor: 'test' });
    expect(drawn.data.status).toBe('DRAWN');
    const winner = drawn.data.draws[0] as { id: string; name: string; number: number };

    const read = () => anonClient.from('stage_state').select('*').eq('event_id', EVENT).single();
    const before = await read();
    const text = JSON.stringify(before.data).toLowerCase();
    expect(text).not.toContain(winner.name.toLowerCase());
    expect(text).not.toContain('test guest');
    expect(text).not.toContain('outlet a');
    const slot = before.data!.payload.slots[0];
    expect(slot).toMatchObject({ number: winner.number, state: 'rolling' });
    expect(slot).not.toHaveProperty('name');
    expect(slot).not.toHaveProperty('outlet');
    expect(slot).not.toHaveProperty('department');

    const done = await svc().rpc('resolve_draw', { p_event: EVENT, p_draw_id: winner.id, p_outcome: 'confirm', p_actor: 'test' });
    expect(done.data.status).toBe('CONFIRMED');
    const after = await read();
    expect(after.data!.rev).toBeGreaterThan(before.data!.rev);
    expect(after.data!.payload.slots[0]).toMatchObject({ number: winner.number, state: 'revealed', name: winner.name });
  });

  it('never holds a no-show winner’s name either', async () => {
    const guests = await seedGuests(3);
    await arrive(guests);
    const prize = await newPrize({ name: 'Smart TV', quantity: 1 });
    const drawn = await svc().rpc('draw_prize', { p_event: EVENT, p_prize_id: prize, p_request_id: crypto.randomUUID(), p_actor: 'test' });
    const winner = drawn.data.draws[0] as { id: string; name: string };
    await svc().rpc('resolve_draw', { p_event: EVENT, p_draw_id: winner.id, p_outcome: 'no_show', p_actor: 'test' });
    const { data } = await anonClient.from('stage_state').select('*').eq('event_id', EVENT).single();
    expect(JSON.stringify(data).toLowerCase()).not.toContain(winner.name.toLowerCase());
    expect(data!.phase).toBe('void');
  });
});
```

- [ ] **Step 2: Run the security test**

Run: `npm run test:api -- security`
Expected: PASS. If a `cannot call …` row fails with a code other than `42501`, either the argument names in the list do not match that function's signature (PostgREST answers 404 `PGRST202`) or the function was created without `select public.lock_down_public();` at the end of its migration. Fix the migration, not the test.

- [ ] **Step 3: Write the end-to-end helpers and the MC tests**

`tests/e2e/draw-helpers.ts`:
```ts
import { checkInViaDb, EVENT, prepare, svc, type E2eGuest } from './helpers';

export const STAGE_KEY = 'e2e-stage-key-0123456789abcdef';
export type PrizeSpec = { name: string; tier?: string; quantity?: number; draw_as_batch?: boolean };
export type StageOpts = { safe_mode: boolean; reduce_effects: boolean; language: 'id' | 'en' };

/**
 * An empty rehearsal event with `guestCount` guests already checked in (prize numbers 1..n), the given prizes,
 * a known stage key and default stage options. Returns the guests.
 */
export async function prepareDraw(guestCount: number, prizes: PrizeSpec[], options: Partial<StageOpts> = {}): Promise<E2eGuest[]> {
  const guests = await prepare(guestCount); // resets the event: no draws, no check-ins, stage back to idle
  const s = svc();
  const del = await s.from('prizes').delete().eq('event_id', EVENT);
  if (del.error) throw del.error;
  for (const g of guests) await checkInViaDb(g);
  for (const p of prizes) {
    const r = await s.rpc('admin_save_prize', { p_event: EVENT, p_id: null, p_data: p, p_actor: 'e2e' });
    if (r.error || r.data?.status !== 'OK') throw new Error(`prize setup failed: ${p.name}`);
  }
  const key = await s.rpc('set_stage_key', { p_event: EVENT, p_key: STAGE_KEY, p_actor: 'e2e' });
  if (key.error || key.data?.status !== 'OK') throw new Error('stage key setup failed');
  const opts: StageOpts = { safe_mode: false, reduce_effects: false, language: 'id', ...options };
  const set = await s.rpc('set_stage_options', { p_event: EVENT, p_options: opts, p_actor: 'e2e' });
  if (set.error || set.data?.status !== 'OK') throw new Error('stage options setup failed');
  return guests;
}
```

`tests/e2e/draw.spec.ts`:
```ts
import { expect, test, type Page } from '@playwright/test';
import { prepareDraw } from './draw-helpers';
import { noHorizontalScroll, PINS, stationLogin } from './helpers';

const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const openMc = (page: Page) => stationLogin(page, PINS.draw, 'Meja 1', '/station/draw');
const recorded = (page: Page) => expect(page.getByText('TERCATAT', { exact: true })).toBeVisible();

test('MC draws, sees the winner’s name, confirms and moves to the next prize', async ({ page }) => {
  await prepareDraw(3, [{ name: 'Smart TV', tier: 'HADIAH UTAMA' }, { name: 'Voucher' }]);
  await openMc(page);
  await expect(page.getByText('SISA 1 DARI 1').first()).toBeVisible();
  await noHorizontalScroll(page);

  await btn(page, 'UNDI SEKARANG').click();
  // The operator sees the name even though the stage does not yet.
  await expect(page.locator('.winner__name')).toHaveText(/Test Guest \d/i);
  await expect(page.getByText('PEMENANG HARUS HADIR · 60 DETIK')).toBeVisible();
  await noHorizontalScroll(page);

  await btn(page, 'EN').click();
  await expect(btn(page, 'CONFIRM')).toBeVisible();
  await noHorizontalScroll(page);
  await btn(page, 'ID').click();

  await btn(page, 'KONFIRMASI').click();
  await recorded(page);
  await btn(page, 'UNDIAN BERIKUTNYA').click();
  await expect(page.getByRole('button', { name: /Voucher/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(btn(page, 'UNDI SEKARANG')).toBeEnabled();
});

test('a no-show frees the slot and the redraw picks somebody else', async ({ page }) => {
  await prepareDraw(3, [{ name: 'Smart TV' }]);
  await openMc(page);
  await btn(page, 'UNDI SEKARANG').click();
  const first = await page.locator('.winner__number').innerText();

  await btn(page, 'TIDAK HADIR').click();
  await expect(page.getByText('TIDAK HADIR — UNDI ULANG')).toBeVisible();
  await btn(page, 'UNDI SEKARANG').click();
  await expect(page.locator('.winner__number')).not.toHaveText(first);

  await btn(page, 'KONFIRMASI').click();
  await recorded(page);
});

test('a batch prize draws every slot at once; tiles confirm one by one or all together', async ({ page }) => {
  await prepareDraw(4, [{ name: 'Voucher 100K', quantity: 3, draw_as_batch: true }]);
  await openMc(page);
  await btn(page, 'UNDI 3 PEMENANG').click();
  await expect(page.locator('.winner')).toHaveCount(3);
  await noHorizontalScroll(page);

  await btn(page, 'KONFIRMASI').first().click(); // one tile
  await expect(btn(page, 'KONFIRMASI')).toHaveCount(2); // the confirmed tile loses its buttons
  await btn(page, 'KONFIRMASI SEMUA').click();
  await recorded(page);
});

test('Prize Verification confirms for the MC, and looks numbers up', async ({ page, browser, baseURL }) => {
  await prepareDraw(3, [{ name: 'Smart TV' }]);
  await openMc(page);
  await btn(page, 'UNDI SEKARANG').click();
  const number = await page.locator('.winner__number').innerText(); // "002"

  const ctx = await browser.newContext({ baseURL, viewport: { width: 360, height: 780 }, locale: 'id-ID', timezoneId: 'Asia/Makassar' });
  try {
    const desk = await ctx.newPage();
    await stationLogin(desk, PINS.prizes, 'Meja 1', '/station/prizes');
    await expect(desk.locator('.winner__number')).toHaveText(number);
    await noHorizontalScroll(desk);

    await desk.getByRole('button', { name: 'KONFIRMASI & SERAHKAN', exact: true }).click();
    await expect(desk.getByText('Tidak ada undian yang menunggu.')).toBeVisible();
    await recorded(page); // the MC screen follows within its 2-second poll

    const lookup = async (n: number) => {
      await desk.getByLabel('Nomor Door Prize').fill(String(n));
      await desk.getByRole('button', { name: 'CARI', exact: true }).click();
    };
    await lookup(Number(number));
    await expect(desk.getByText('PEMENANG TERKONFIRMASI')).toBeVisible();
    await lookup(Number(number) === 1 ? 2 : 1);
    await expect(desk.getByText('BUKAN PEMENANG')).toBeVisible();
    await lookup(999);
    await expect(desk.getByText('NOMOR TIDAK DITEMUKAN')).toBeVisible();
  } finally {
    await ctx.close();
  }
});
```

- [ ] **Step 4: Run the MC tests**

Run: `npm run e2e -- draw`
Expected: 4 passed. (Playwright starts its own dev server with `NEXT_PUBLIC_E2E=1`; stop any dev server that is already running.)

- [ ] **Step 5: Write the stage tests**

`tests/e2e/stage.spec.ts`:
```ts
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { prepareDraw, STAGE_KEY } from './draw-helpers';
import { EVENT, PINS, stationLogin, svc } from './helpers';

const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const ROLL = { timeout: 12_000 }; // the number roll takes about 5 seconds

/** A projector: desktop-sized window, no touch, Indonesian locale. */
async function openStageContext(browser: Browser, baseURL: string | undefined): Promise<BrowserContext> {
  return browser.newContext({ baseURL, viewport: { width: 1280, height: 720 }, locale: 'id-ID', timezoneId: 'Asia/Makassar' });
}
const stageUrl = (key = STAGE_KEY) => `/stage?key=${encodeURIComponent(key)}`;

test('the stage shows the number only until the MC confirms, then the name', async ({ page, browser, baseURL }) => {
  await prepareDraw(3, [{ name: 'Smart TV', tier: 'HADIAH UTAMA' }]);
  const ctx = await openStageContext(browser, baseURL);
  try {
    const stage = await ctx.newPage();
    const frames: string[] = [];
    stage.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));

    // Entering with the key: the cookie is set and the key disappears from the address bar.
    await stage.goto(stageUrl());
    await expect(stage).toHaveURL(/\/stage$/);
    await expect(stage.getByText('UNDIAN DIMULAI SEBENTAR LAGI')).toBeVisible();
    expect(await stage.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await stationLogin(page, PINS.draw, 'Meja 1', '/station/draw');
    await btn(page, 'TAMPILKAN HADIAH').click();
    await expect(stage.getByText('HADIAH UTAMA · SMART TV')).toBeVisible();

    await btn(page, 'UNDI SEKARANG').click();
    const name = (await page.locator('.winner__name').innerText()).trim(); // operator sees it
    const number = (await page.locator('.winner__number').innerText()).trim();

    // Rolling, then landed: the number and "waiting", never the name.
    await expect(stage.getByText('NOMOR PEMENANG')).toBeVisible();
    await expect(stage.locator('.num')).toHaveText(number, ROLL);
    await expect(stage.getByText('MENUNGGU PEMENANG...')).toBeVisible(ROLL);

    const visible = (await stage.locator('body').innerText()).toLowerCase();
    expect(visible).not.toContain(name.toLowerCase());
    expect(visible).not.toContain('test guest');
    const state = await (await ctx.request.get('/api/stage/state')).json();
    expect(JSON.stringify(state).toLowerCase()).not.toContain('test guest');
    expect(frames.join('\n').toLowerCase()).not.toContain('test guest'); // nothing on the Realtime socket either

    await btn(page, 'KONFIRMASI').click();
    await expect(stage.getByText(name)).toBeVisible();
    await expect(stage.getByText('UNDIAN 1 DARI 1')).toBeVisible();
    await expect(stage.locator('.num')).toHaveClass(/num--small/);
    expect(await stage.getByText('Congratulations').count()).toBe(0);

    // A reload rebuilds the same picture from the database.
    await stage.reload();
    await expect(stage.getByText(name)).toBeVisible();
  } finally {
    await ctx.close();
  }
});

test('a no-show shows the void message, then the banner, and the redraw rolls again', async ({ page, browser, baseURL }) => {
  await prepareDraw(3, [{ name: 'Smart TV', tier: 'HADIAH UTAMA' }], { reduce_effects: true });
  const ctx = await openStageContext(browser, baseURL);
  try {
    const stage = await ctx.newPage();
    await stage.goto(stageUrl());
    await stationLogin(page, PINS.draw, 'Meja 1', '/station/draw');
    await btn(page, 'UNDI SEKARANG').click();
    await expect(stage.getByText('NOMOR PEMENANG')).toBeVisible();

    await btn(page, 'TIDAK HADIR').click();
    await expect(stage.getByText('TIDAK HADIR — UNDI ULANG')).toBeVisible();
    await expect(stage.getByText('TIDAK HADIR — UNDI ULANG')).toBeHidden({ timeout: 8_000 }); // brief, then the banner returns
    await expect(stage.getByText('HADIAH UTAMA · SMART TV')).toBeVisible();

    await btn(page, 'UNDI SEKARANG').click();
    await expect(stage.getByText('MENUNGGU PEMENANG...')).toBeVisible();
    await btn(page, 'KONFIRMASI').click();
    await expect(stage.locator('.name')).toBeVisible();
  } finally {
    await ctx.close();
  }
});

test('a batch reveals tile by tile and the operator can blank the screen', async ({ page, browser, baseURL }) => {
  await prepareDraw(4, [{ name: 'Voucher 100K', tier: 'HIBURAN', quantity: 3, draw_as_batch: true }], { reduce_effects: true });
  const ctx = await openStageContext(browser, baseURL);
  try {
    const stage = await ctx.newPage();
    await stage.goto(stageUrl());
    await stationLogin(page, PINS.draw, 'Meja 1', '/station/draw');
    await btn(page, 'UNDI 3 PEMENANG').click();
    await expect(stage.locator('.tile')).toHaveCount(3);
    await expect(stage.getByText('3 PEMENANG')).toBeVisible();
    expect(await stage.locator('.tile__name').count()).toBe(0);

    await btn(page, 'KONFIRMASI').first().click();
    await expect(stage.locator('.tile__name')).toHaveCount(1);
    await btn(page, 'KONFIRMASI SEMUA').click();
    await expect(stage.locator('.tile__name')).toHaveCount(3);

    await btn(page, 'LAYAR KOSONG').click();
    await expect(stage.getByText('UNDIAN DIMULAI SEBENTAR LAGI')).toBeVisible();
  } finally {
    await ctx.close();
  }
});

test('stage options apply live; the projector-safe look hides the sound button', async ({ browser, baseURL }) => {
  await prepareDraw(1, [{ name: 'Smart TV' }]);
  const ctx = await openStageContext(browser, baseURL);
  try {
    const stage = await ctx.newPage();
    await stage.goto(stageUrl());
    await expect(stage.locator('.stage')).not.toHaveClass(/stage--safe/);
    await expect(stage.getByRole('button', { name: 'Aktifkan suara' })).toHaveCount(1);

    await svc().rpc('set_stage_options', { p_event: EVENT, p_options: { safe_mode: true }, p_actor: 'e2e' });
    await expect(stage.locator('.stage')).toHaveClass(/stage--safe/, { timeout: 10_000 });
    await expect(stage.getByRole('button', { name: 'Aktifkan suara' })).toHaveCount(0);

    await svc().rpc('set_stage_options', { p_event: EVENT, p_options: { language: 'en' }, p_actor: 'e2e' });
    await expect(stage.getByText('THE DRAW STARTS SOON')).toBeVisible({ timeout: 10_000 });
  } finally {
    await ctx.close();
  }
});

test('a wrong key is refused, and a new key signs the open display out', async ({ browser, baseURL }) => {
  await prepareDraw(1, [{ name: 'Smart TV' }]);
  const ctx = await openStageContext(browser, baseURL);
  try {
    const stage = await ctx.newPage();
    await stage.goto(stageUrl('not-the-key'));
    await expect(stage.getByText('Kunci layar tidak valid.')).toBeVisible();
    await expect(stage.getByText('UNDIAN DIMULAI SEBENTAR LAGI')).toHaveCount(0);

    await stage.goto(stageUrl());
    await expect(stage.getByText('UNDIAN DIMULAI SEBENTAR LAGI')).toBeVisible();
    const rotate = await svc().rpc('set_stage_key', { p_event: EVENT, p_key: 'another-key-0123456789abcdef-xyz', p_actor: 'e2e' });
    expect(rotate.data.status).toBe('OK');
    await expect(stage.getByText('Kunci layar sudah diganti. Buka link layar yang baru.')).toBeVisible({ timeout: 12_000 }); // next heartbeat
    await stage.reload();
    await expect(stage.getByText('Buka link layar panggung dari Admin → Settings.')).toBeVisible();
  } finally {
    await ctx.close();
  }
});

test('polling takes over when Realtime is blocked', async ({ browser, baseURL }) => {
  await prepareDraw(2, [{ name: 'Smart TV' }], { reduce_effects: true });
  const ctx = await openStageContext(browser, baseURL);
  try {
    const stage = await ctx.newPage();
    await stage.routeWebSocket(/\/realtime\//, (ws) => ws.close()); // the socket never opens
    await stage.goto(stageUrl());
    await expect(stage.getByText('UNDIAN DIMULAI SEBENTAR LAGI')).toBeVisible();

    const { data: prizes } = await svc().from('prizes').select('id').eq('event_id', EVENT).limit(1);
    const drawn = await svc().rpc('draw_prize', { p_event: EVENT, p_prize_id: prizes![0].id, p_request_id: crypto.randomUUID(), p_actor: 'e2e' });
    expect(drawn.data.status).toBe('DRAWN');
    // 5 s before polling starts, then a 3 s interval.
    await expect(stage.getByText('NOMOR PEMENANG')).toBeVisible({ timeout: 20_000 });
  } finally {
    await ctx.close();
  }
});
```

- [ ] **Step 6: Run the stage tests**

Run: `npm run e2e -- stage`
Expected: 6 passed (about 2 minutes). If "polling takes over" fails because `routeWebSocket` is not available in your Playwright version, upgrade `@playwright/test` to 1.48 or newer.

Then run the whole end-to-end suite once: `npm run e2e`. Expected: Plan 1's tests and these all pass.

- [ ] **Step 7: Write the stage latency check**

`scripts/load/stage-latency.mjs`:
```js
// Usage: node --env-file=.env.test scripts/load/stage-latency.mjs
// Spec: a draw and a confirm reach the projector quickly. Measures database call -> Realtime event on the anon key.
// Run on STAGING (and again at the venue on Rehearsal 2 day). Needs the fake guests (seed-fake-guests.mjs).
// WARNING: resets rehearsal data and adds, then removes, a test prize. Refuses to run on a live event.
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { finish, percentile } from './util.mjs';

const EVENT = process.env.EVENT_ID;
const N = 8;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (sql, params = []) => (await pool.query(sql, params)).rows;

const reset = await q("select public.reset_rehearsal_data($1, 'latency') as r", [EVENT]);
if (reset[0].r.status !== 'OK') { console.error('Event is not in rehearsal mode. Aborting.'); process.exit(2); }
const guests = await q("select invite_token from guests where event_id = $1 and employee_id like 'L%' order by employee_id limit $2", [EVENT, N + 4]);
if (guests.length < N + 4) { console.error(`Seed first: need ${N + 4} fake guests.`); process.exit(2); }
for (const g of guests) await q("select public.check_in($1, $2, null, 'scan', 'Latency', 'latency')", [EVENT, g.invite_token]);
const prize = (await q("select public.admin_save_prize($1, null, $2::jsonb, 'latency') as r", [EVENT, JSON.stringify({ name: 'Latency test', quantity: N })]))[0].r;
if (prize.status !== 'OK') { console.error('Could not create the test prize', prize); process.exit(2); }

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const waiters = [];
const channel = sb.channel('latency').on('postgres_changes', { event: '*', schema: 'public', table: 'stage_state', filter: `event_id=eq.${EVENT}` }, (p) => {
  for (const w of [...waiters]) {
    if (w.test(p.new)) { waiters.splice(waiters.indexOf(w), 1); w.done(performance.now()); }
  }
});
await new Promise((resolve, reject) => {
  channel.subscribe((s) => {
    if (s === 'SUBSCRIBED') resolve();
    if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') reject(new Error(`Realtime ${s}`));
  });
});
const nextEvent = (test, ms = 10_000) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    waiters.push({ test, done: (at) => { clearTimeout(timer); resolve(at); } });
  });

const drawMs = [];
const confirmMs = [];
let lost = 0;
try {
  for (let i = 0; i < N; i++) {
    const rolling = nextEvent((row) => row.phase === 'rolling');
    const t0 = performance.now();
    const [{ r: drawn }] = await q('select public.draw_prize($1, $2, $3, $4) as r', [EVENT, prize.id, randomUUID(), 'latency']);
    const seenDraw = await rolling;
    if (drawn.status !== 'DRAWN' || seenDraw === null) { lost++; continue; }
    drawMs.push(seenDraw - t0);

    const revealed = nextEvent((row) => row.phase === 'revealed');
    const t1 = performance.now();
    await q("select public.resolve_draw($1, $2, 'confirm', 'latency') as r", [EVENT, drawn.draws[0].id]);
    const seenConfirm = await revealed;
    if (seenConfirm === null) { lost++; continue; }
    confirmMs.push(seenConfirm - t1);
  }
} finally {
  await sb.removeChannel(channel);
  await q("select public.reset_rehearsal_data($1, 'latency')", [EVENT]);
  await q('delete from prizes where id = $1', [prize.id]);
  await pool.end();
}

finish('stage-latency', [
  [`all ${N} draws and confirms reached the display`, lost === 0 && drawMs.length === N && confirmMs.length === N, `${lost} lost`],
  ['draw -> display p95 under 2 s', percentile(drawMs, 95) < 2000, `${Math.round(percentile(drawMs, 95))} ms`],
  ['confirm -> display p95 under 2 s', percentile(confirmMs, 95) < 2000, `${Math.round(percentile(confirmMs, 95))} ms`],
]);
```
Run it on staging after seeding fake guests: `node --env-file=.env.test scripts/load/stage-latency.mjs`.
Expected: `stage-latency: all checks passed`. A failure here does not block the event (the display falls back to polling every 3 s) but tells you the Realtime path is slow on that network; note the numbers in the Rehearsal 2 record.

- [ ] **Step 8: Full run and commit**

Run: `npx tsc --noEmit && npm run lint && npm run test:api && npm run e2e`
Expected: everything passes.

```bash
git add tests scripts/load/stage-latency.mjs
git commit -m "test: security matrix for the draw and stage objects, MC and stage end-to-end tests, stage latency check"
```

## Task 31: Rehearsal scripts, runbooks, spec patch and go-live

**Files:**
- Create: `scripts/rehearsal/seed-rehearsal.mjs`, `scripts/rehearsal/simulate-arrivals.mjs`
- Create: `docs/runbooks/stage-setup.md`, `docs/runbooks/failure-playbook.md`, `docs/runbooks/rehearsal-1.md`, `docs/runbooks/rehearsal-2.md`, `docs/runbooks/day-before.md`, `docs/runbooks/event-day.md`, `docs/runbooks/go-live.md`
- Modify: `docs/spec.md` (the Technical Design Spec copy in the repo)

**Interfaces:**
- Consumes: everything from Tasks 17–30; Plan 1's `docs/runbooks/production-setup.md` and `invitation-gate-checklist.md`; the SQL functions `admin_save_prize`, `admin_delete_prize`, `check_in`; the admin console from Task 29.
- Produces: `node --env-file=.env.test scripts/rehearsal/seed-rehearsal.mjs prizes|remove-prizes`; `node --env-file=.env.test scripts/rehearsal/simulate-arrivals.mjs <count> [--per-minute N]`; seven printable runbooks; a spec that matches what was built.

Nothing in this task changes how the system behaves. It prepares the people. The two rehearsals exist to find the problems that code cannot: a projector that washes out gold, a Wi-Fi that drops at the check-in desk, an MC who does not know what to do when a winner is missing.

- [ ] **Step 1: Write the rehearsal scripts**

`scripts/rehearsal/seed-rehearsal.mjs`:
```js
// Usage: node --env-file=.env.test scripts/rehearsal/seed-rehearsal.mjs prizes
//        node --env-file=.env.test scripts/rehearsal/seed-rehearsal.mjs remove-prizes
// Adds placeholder prizes named "[TEST] …" so the MC can practise before HR has entered the real list,
// and removes them again. Refuses to run once the event is live.
import pg from 'pg';

const EVENT = process.env.EVENT_ID;
const command = process.argv[2];
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (sql, params = []) => (await pool.query(sql, params)).rows;

const [{ mode }] = await q('select mode from public.events where id = $1', [EVENT]);
if (mode !== 'rehearsal') {
  console.error('The event is live. Placeholder prizes are for rehearsal only.');
  process.exit(2);
}

const PLACEHOLDERS = [
  { name: '[TEST] Hadiah Utama', tier: 'HADIAH UTAMA', quantity: 1, sort_order: 10 },
  { name: '[TEST] Hadiah Kedua', tier: 'HADIAH KEDUA', quantity: 2, sort_order: 20 },
  { name: '[TEST] Hiburan', tier: 'HIBURAN', quantity: 5, sort_order: 30 },
  { name: '[TEST] Voucher (sekaligus)', tier: 'VOUCHER', quantity: 5, sort_order: 40, draw_as_batch: true },
];

try {
  if (command === 'prizes') {
    for (const p of PLACEHOLDERS) {
      const [{ r }] = await q('select public.admin_save_prize($1, null, $2::jsonb, $3) as r', [EVENT, JSON.stringify(p), 'rehearsal']);
      console.log(`${r.status === 'OK' ? 'added  ' : r.status === 'NAME_IN_USE' ? 'exists ' : 'FAILED '} ${p.name}`);
    }
  } else if (command === 'remove-prizes') {
    const rows = await q("select id, name from public.prizes where event_id = $1 and name like '[TEST] %' order by sort_order", [EVENT]);
    for (const p of rows) {
      const [{ r }] = await q('select public.admin_delete_prize($1, $2, $3) as r', [EVENT, p.id, 'rehearsal']);
      console.log(`${r.status === 'OK' ? 'removed' : r.status === 'HAS_DRAWS' ? 'kept   ' : 'FAILED '} ${p.name}${r.status === 'HAS_DRAWS' ? ' (has draws: reset rehearsal data first)' : ''}`);
    }
    if (rows.length === 0) console.log('No placeholder prizes found.');
  } else {
    console.error('Usage: seed-rehearsal.mjs prizes | remove-prizes');
    process.exit(1);
  }
} finally {
  await pool.end();
}
```

`scripts/rehearsal/simulate-arrivals.mjs`:
```js
// Usage: node --env-file=.env.test scripts/rehearsal/simulate-arrivals.mjs <count> [--per-minute 60]
// Checks in <count> not-yet-checked-in employees through the real check_in function, so a draw rehearsal has a
// full pool without 150 people queuing at a desk. They get real Door Prize numbers. Rehearsal mode only; undo it
// with Settings > Reset rehearsal data.
import pg from 'pg';

const EVENT = process.env.EVENT_ID;
const count = Number(process.argv[2]);
const flag = process.argv.indexOf('--per-minute');
const perMinute = flag > -1 ? Number(process.argv[flag + 1]) : 60;
if (!Number.isInteger(count) || count < 1 || !(perMinute > 0)) {
  console.error('Usage: simulate-arrivals.mjs <count> [--per-minute 60]');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (sql, params = []) => (await pool.query(sql, params)).rows;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const [{ mode }] = await q('select mode from public.events where id = $1', [EVENT]);
  if (mode !== 'rehearsal') {
    console.error('The event is live. Refusing to simulate arrivals.');
    process.exit(2);
  }
  const guests = await q(
    `select g.invite_token, g.employee_id
       from public.guests g
      where g.event_id = $1 and g.active
        and not exists (select 1 from public.check_ins c where c.guest_id = g.id)
      order by random() limit $2`,
    [EVENT, count],
  );
  if (guests.length < count) console.warn(`Only ${guests.length} employees are not checked in yet.`);

  let done = 0;
  for (const g of guests) {
    const [{ r }] = await q("select public.check_in($1, $2, null, 'scan', 'Simulasi', 'simulator') as r", [EVENT, g.invite_token]);
    if (r.status === 'CHECKED_IN') done++;
    else console.warn(`${g.employee_id}: ${r.status}`);
    if (done % 10 === 0 && r.status === 'CHECKED_IN') console.log(`${done} / ${guests.length} checked in`);
    if (done < guests.length) await sleep(60_000 / perMinute);
  }
  const [{ n }] = await q('select count(*)::int as n from public.check_ins where event_id = $1', [EVENT]);
  console.log(`Done. ${done} simulated arrivals; ${n} check-ins in total.`);
} finally {
  await pool.end();
}
```

- [ ] **Step 2: Try the scripts on the local stack**

Run (local stack up, `.env.test` present, rehearsal event with fake guests from `seed-fake-guests.mjs`):
```bash
node --env-file=.env.test scripts/rehearsal/seed-rehearsal.mjs prizes
node --env-file=.env.test scripts/rehearsal/simulate-arrivals.mjs 12 --per-minute 600
node --env-file=.env.test scripts/rehearsal/seed-rehearsal.mjs remove-prizes
```
Expected: four lines starting `added`; `12 / 12 checked in` and `Done. 12 simulated arrivals; 12 check-ins in total.`; the removal prints four `removed` lines (a prize that was drawn prints `kept`). Run `prizes` twice to see `exists`. Then clean up with the admin console's Reset rehearsal data (or `select public.reset_rehearsal_data('<EVENT_ID>', 'dev');`).

- [ ] **Step 3: Write the stage setup runbook and the failure playbook**

`docs/runbooks/stage-setup.md`:
````markdown
# Stage display setup (projector laptop)

Used at Rehearsal 2 (at the venue) and on 10 December. About 15 minutes.

## What you need

- A laptop with Chrome or Edge and a cable to the projector.
- **Its own internet connection**, separate from guest Wi-Fi: a phone hotspot or a cable. A crowded venue Wi-Fi is the most likely thing to slow the stage down.
- Power, and the laptop's sleep and screensaver turned off (the page also asks the screen to stay awake, but do both).
- A second device (tablet or laptop) charged and ready as a spare display. Two displays can be open at once; both are read-only.

## Steps

1. **Get the link.** Admin, Settings, Stage display, **Create display key**. The link is shown once. Copy it and keep it in the HR password manager. Making a new key signs out every open display.
2. **Open the link on the projector laptop.** The address bar changes to `…/stage` (the key disappears). The board shows the wordmark and "UNDIAN DIMULAI SEBENTAR LAGI". The cookie lasts 36 hours; opening the link again is always safe.
3. **Full screen.** Press **F** (or move the mouse and click "Layar penuh"). Set the laptop display to 1920 × 1080 or 1280 × 720, mirrored to the projector. The picture scales to any 16:9 screen; it is never cropped.
4. **Sound.** Press **S** (or click "Aktifkan suara") once; you hear a short beep. Browsers refuse audio until someone clicks, so this must be done on the day. Sound is off in the projector-safe look.
5. **Look.** If the projector is dim or washes out colours, tick **Projector-safe look** in Admin, Settings, Stage display (flat black, white names, no glows, no sound). Decide at Rehearsal 2, on the real projector, and leave it.
6. **Connection check.** On the MC phone, open the draw screen. The dot at the top turns green ("LAYAR PANGGUNG TERHUBUNG") within about 15 seconds. Pink means no heartbeat for 15 seconds or more.
7. **Test a draw** (rehearsal mode only, never after Go live): MC taps TAMPILKAN HADIAH, then UNDI SEKARANG, then KONFIRMASI. Check that the number is readable from the back row, the name appears only after KONFIRMASI, and nothing says "selamat" or "congratulations".

## Messages on a black page

| Message | Meaning | Do this |
| :---- | :---- | :---- |
| Buka link layar panggung dari Admin → Settings. | No valid cookie | Open the display link from the password manager |
| Kunci layar tidak valid. | Wrong or old key | Open the current link; if lost, make a new key |
| Terlalu banyak percobaan. Tunggu beberapa menit. | 20 wrong keys from this network | Wait 5 minutes, then use the right link |
| Kunci layar belum dibuat. | No key yet | Admin, Settings, Create display key |
| Koneksi bermasalah. Muat ulang halaman. | Database did not answer | Reload (F5) |
| Kunci layar sudah diganti. (over the board) | Someone made a new key | Open the new link |

## Good to know

- Reloading the page is harmless: it rebuilds the screen from the database. A winner already confirmed stays on screen.
- If the stage lags, the MC phone is unaffected. The MC can read the number and name from the phone.
- If Realtime is blocked on the network, the page polls every 3 seconds on its own; the delay is a few seconds, not a failure.
````

`docs/runbooks/failure-playbook.md`:
````markdown
# Failure playbook (print two copies: HR and the technical contact)

Decide in 30 seconds, fix properly afterwards. Every action below is safe to repeat.

| # | What you see | First 30 seconds | Then |
| :---- | :---- | :---- | :---- |
| 1 | **App will not load / "KONEKSI BERMASALAH"** on every device (Supabase or Vercel down) | Switch to the **paper guest list**. Write each arrival's name and the time. Tell the MC the draw is on hold | Technical contact checks Vercel and Supabase status pages. When back, an admin checks the people in using Cari Manual, in the order of the paper times, and keeps the paper. See open decision A below for the draw |
| 2 | **Camera will not scan** a guest's QR | Use **CARI MANUAL** on the check-in screen: type the name or employee ID | If many phones fail, raise the guest's screen brightness; if the desk camera is the problem, swap to the second staff phone |
| 3 | **Projector shows nothing or freezes** | MC keeps going from the **phone**: it shows number, name and outlet. MC reads them aloud | Press F5 on the projector laptop. Still nothing: open the link on the spare device. The draw is unaffected |
| 4 | **Projector shows the number but the name never appears** | Check the MC phone: did KONFIRMASI register ("TERCATAT")? If yes, press F5 on the projector | If the phone does not show TERCATAT, tap KONFIRMASI again (a repeat is harmless) |
| 5 | **MC phone loses connection or dies** | Second staff member logs into `/station` with the draw PIN on another phone. The current draw appears within 2 seconds | Or use the **Prize Verification** phone: it shows the same draw with KONFIRMASI & SERAHKAN and TIDAK HADIR |
| 6 | **Winner is not present** (60 seconds passed) | MC taps **TIDAK HADIR**. The stage says "TIDAK HADIR — UNDI ULANG". Tap UNDI SEKARANG again | The absent person stays eligible for other prizes |
| 7 | **A winner was confirmed by mistake** (wrong person came up, or a tap was too early) | Tell HR. Admin console, **Draws**, **Void** on that draw, with a reason of 5 or more characters. The stage returns to idle | MC draws again for the freed slot. The reason is kept in the audit log |
| 8 | **Merchandise was handed over by mistake** | Admin console, **Merchandise**, **Void** with a reason | The person can collect again |
| 9 | **A device is locked out / forgot the PIN** | Admin console, Settings, Station PINs: set a new PIN for that role (or turn it off and on). Every device on that role is signed out | Give the new PIN to the desk lead in person, not in a group chat |
| 10 | **Guest has no phone or lost the link** | Cari Manual at the check-in desk. The check-in screen shows their number; write it on paper or on their hand | Admin, Reports, **Invitation links** lists every personal pass link, to re-send later |
| 11 | **Guest is not on the list** | Admin console, Guests, **Add walk-in**. Then check in as normal | Walk-ins have a "Walk-in" column in the Guests report |
| 12 | **Two people claim the same Door Prize number** | Prize Verification, type the number, **CARI**: the card shows who the number belongs to. Ask for the name | Each person has exactly one number; the system never issues a number twice |
| 13 | **The draw says "Belum ada tamu yang memenuhi syarat"** | Everyone checked in has already won, or nobody has checked in. Check the dashboard "Still eligible to win" count | Do not reset anything. HR decides: wait for more arrivals, or skip the prize |
| 14 | **The stage shows a name before KONFIRMASI** | This must never happen. Press the **LAYAR KOSONG** button, photograph the screen, tell the technical contact | Do not continue the draw until the cause is found. Keep the photo and the time |
| 15 | **Any screen shows something odd** | Do not guess. Take a photo of the screen with the clock visible and tell the technical contact | The audit log has the sequence of actions |

## Open decision A (HR to decide before Rehearsal 2)

If the app is down at the time the draw is scheduled, do we (a) postpone the draw until it is back, or (b) draw on paper from the numbers already issued? There is no paper draw procedure in this plan. Choose one and write it here: ______________________

## Who to call

| Role | Name | Phone |
| :---- | :---- | :---- |
| HR lead | | |
| Technical contact (open decision 13) | | |
| Venue AV | | |
````

- [ ] **Step 4: Write the two rehearsal runbooks**

`docs/runbooks/rehearsal-1.md`:
````markdown
# Rehearsal 1 — staff on real devices (1–3 December)

Goal: every person who will work on 10 December has used their own screen on a real phone, and every scenario below has been run once. Production, still in **rehearsal mode**, with test data.

## Before (by 27 November)

- [ ] Automated checks pass on the commit that is deployed (record the commit): `supabase test db`, `npm run test:unit`, `npm run test:api`, `node --env-file=.env.test scripts/concurrency/draw.mjs`, `npm run e2e`.
- [ ] On staging: `scripts/load/stage-latency.mjs` passes (p95 under 2 s).
- [ ] Supabase dashboard, Advisors, Security: no errors on production.
- [ ] Prizes entered in Admin, Prizes (or placeholders: `scripts/rehearsal/seed-rehearsal.mjs prizes`; remove them afterwards).
- [ ] Stage display key created (see `stage-setup.md`).
- [ ] Event is in **rehearsal** mode. The four station PINs are set. Staff are told the PINs one by one (not in a group chat).
- [ ] 12–15 committee members will play guests: each opens their **own** real pass link. Their check-ins are real rows, wiped at the end.

## People and devices

| Who | Device | Screen |
| :---- | :---- | :---- |
| 2 check-in staff | their own phones (Android and iPhone) | `/station/check-in` |
| 1 merchandise staff | phone | `/station/merchandise` |
| MC | phone or tablet | `/station/draw` |
| Prize desk | phone | `/station/prizes` |
| Technical contact | laptop | Admin console |
| Projector laptop | laptop (any screen is fine at Rehearsal 1) | `/stage` |

## Scenarios (tick each; write what happened)

| # | Scenario | Pass when | Result / notes |
| :---- | :---- | :---- | :---- |
| 1 | 15 people check in at two desks | Every scan gives CHECK-IN BERHASIL in under 2 seconds; numbers 1 to 15, no gaps, no repeats | |
| 2 | One person is scanned twice | SUDAH CHECK-IN with the first time; same number | |
| 3 | One person has no phone | Found with Cari Manual, checked in | |
| 4 | Merchandise: hand over, then repeat | TERCATAT, then SUDAH DIAMBIL with time and booth | |
| 5 | Admin voids the merchandise | Person can collect again; reason is in the audit log | |
| 6 | Single prize: TAMPILKAN HADIAH, UNDI, KONFIRMASI | Stage: banner, rolling number, landed number with no name, then the name. Operator saw the name from the start | |
| 7 | A winner is absent: TIDAK HADIR, then redraw | Stage shows the void message then the banner; a different person is drawn | |
| 8 | Batch prize, confirm tile by tile and then all | Tiles flip one at a time; "3 PEMENANG" counter | |
| 9 | Prize desk confirms for the MC | MC screen shows TERCATAT within 2 seconds | |
| 10 | Number lookup at the prize desk | Confirmed winner is green; non-winner pink; unknown number pink | |
| 11 | Admin voids a **confirmed** draw | Stage returns to idle; the slot is free; the person is back in the pool | |
| 12 | Projector page reloaded in the middle of a draw | Same picture comes back; no name before KONFIRMASI | |
| 13 | MC phone in airplane mode for 20 seconds in the middle of a draw | After reconnecting, the draw is still there and the buttons work | |
| 14 | Projector disconnected; MC reads from the phone | The draw can finish without the projector | |
| 15 | PIN changed in Admin while a phone is logged in | That phone is signed out at its next tap and returns to the PIN screen | |
| 16 | Indonesian and English on every staff screen at 360 px | No text is cut off; no sideways scroll | |
| 17 | All reports downloaded and opened in Excel | Names and accents are correct; header row present | |
| 18 | Dashboard watched during the run | Counters move within 5 seconds; outlet bars fill | |

## After

- [ ] Write every problem in the table below with an owner and a due date (before the 8 December freeze).
- [ ] Remove placeholder prizes if used (`remove-prizes`).
- [ ] Admin, Settings: **Reset rehearsal data** (type RESET). Dashboard shows 0 checked in, 0 merchandise, 0 draws. Guests, RSVPs and PINs are unchanged.

| Problem | Owner | Due | Done |
| :---- | :---- | :---- | :---- |
| | | | |

Signed off by: ____________  Date: ____________
````

`docs/runbooks/rehearsal-2.md`:
````markdown
# Rehearsal 2 — at the venue (about 7 December)

Goal: the real projector, the real Wi-Fi and the real room, with a full draw. Production, still in **rehearsal mode**.

## Arrive two hours early with

Projector laptop and its cable, the phone hotspot SIM, staff phones, the spare display device, chargers and extension cords, the printed `failure-playbook.md` (2 copies), the display link and PINs from the password manager.

## 1. Network (30 minutes)

- [ ] The projector laptop runs on its **own** connection (hotspot or cable), not guest Wi-Fi. Note which: ____________
- [ ] From the projector laptop, on that connection, run the latency check against **staging**: `node --env-file=.env.test scripts/load/stage-latency.mjs` (with the staging URLs in `.env.test`). Result: draw ____ ms, confirm ____ ms (p95 under 2000).
- [ ] Walk to each place where a desk or booth will stand (check-in 1 and 2, merchandise, prize desk, MC position). On a staff phone, open `/station`, log in, and load one result. Note any spot with no signal: ____________
- [ ] If Wi-Fi is the only option for staff, test at full load: 10 phones on the SSID at once.

## 2. Projector (30 minutes)

Follow `stage-setup.md` steps 1 to 7 on the real projector.

- [ ] Number and name readable from the back row of the seating.
- [ ] Gold, pink and green are distinguishable. If not, tick **Projector-safe look** and look again. Decision: normal / projector-safe.
- [ ] Sound audible in the room at a normal volume. Decision: sound on / off.
- [ ] 16:9 fills the screen; nothing is cut off; no scrollbars; cursor hidden after 3 seconds.
- [ ] The MC's dot turns green and stays green for 10 minutes.

## 3. Scanning in the room's light (15 minutes)

- [ ] Three guest phones (at least one iPhone, one low-end Android) scan in under 2 seconds at the real check-in position, in the room's lighting.

## 4. Full draw (60 minutes)

1. Enter the **real** prize list in Admin, Prizes, in the real order. (Or use placeholders and replace them later.)
2. Create a full pool without 150 people queuing: `node --env-file=.env.test scripts/rehearsal/simulate-arrivals.mjs 150 --per-minute 600`.
3. The MC runs the whole prize list from the stage position, reading the real script, including: one no-show, one batch, one confirm from the prize desk, and one admin void.
4. HR stands at the back of the room and checks the projector for the whole run.

- [ ] Every prize can be drawn to the end. Total time of the draw: ______ minutes (plan the programme around it).
- [ ] The MC knows the 60-second rule and the TIDAK HADIR flow without looking.
- [ ] The prize desk knows what to do when a name is called.
- [ ] Everyone has read the failure playbook row for their own role.

## 5. After

- [ ] Remove placeholder prizes if used. Admin, Settings: **Reset rehearsal data** (type RESET). Dashboard shows zeros.
- [ ] Confirm the PINs still work (they are rotated the day before the event, not now).
- [ ] Record the decisions: look ____________, sound ____________, projector connection ____________, MC position ____________.
- [ ] Write the problem list (owner, due date) and send it to the technical contact. After 8 December only critical fixes go out, each tested on staging first.

Signed off by: ____________  Date: ____________
````

- [ ] **Step 5: Write the day-before, event-day and go-live runbooks**

`docs/runbooks/day-before.md`:
````markdown
# Day before — 9 December

Nothing new is deployed today. If a critical fix is needed, it runs on staging first.

## Morning

- [ ] Freeze is in force since 8 December; the deployed commit is the one that passed Rehearsal 2: ____________
- [ ] Supabase and Vercel status pages are green. Supabase daily backup is on and today's backup is listed.
- [ ] Event is still in **rehearsal** mode and the dashboard shows zero check-ins, zero merchandise, zero draws.
- [ ] The technical contact has confirmed they are reachable on 10 December from ______ to ______ (open decision 13).

## PINs and keys

- [ ] Admin, Settings, Station PINs: **set a new PIN for all four roles**. Write them in the password manager. This signs out every device used in the rehearsals.
- [ ] Tell each desk lead their PIN **in person or in a private message**, never in a group chat: check-in, merchandise, MC, prize desk.
- [ ] Admin, Settings, Stage display: **Make a new key** and store the link in the password manager. Open it on the day (the cookie lasts 36 hours; you may also test it once tonight).

## Backups (evening)

- [ ] Admin, Reports: download all seven files. They open in Excel.
  - Guests, Check-ins, Merchandise, Draw history, Audit log, RSVP not answered, Invitation links.
- [ ] Save them to the HR drive (restricted access) and to a USB stick that comes to the venue. Delete the copies from Downloads.
- [ ] **Print the guest list**: open the Guests file, sort by outlet then name, print two copies. This is the paper fallback.

## Devices and kit

- [ ] Charge: all staff phones, MC phone, spare display device, projector laptop, two power banks.
- [ ] Packed: printed guest lists (2), failure playbooks (2), PIN card for each desk lead, extension cords, hotspot SIM, laptop-to-projector cable and adapters, tape, pens, spare charger cables.
- [ ] Staff briefing sent: where to be, at what time, who is on which desk, and where the failure playbook is.

Signed off by: ____________  Time: ____________
````

`docs/runbooks/event-day.md`:
````markdown
# Event day — 10 December

Times are relative to doors opening (T). Fill in the real times once the venue and start time are fixed.

| When | Who | Do |
| :---- | :---- | :---- |
| T minus 3 h | Technical contact, HR | Arrive. Projector laptop on its own connection. Open the display link; F for full screen, S for sound. Follow `stage-setup.md` |
| T minus 2.5 h | Desk leads | Set up desks and booths. Each phone: `/station`, PIN, choose its desk name. The MC phone shows a green stage dot |
| T minus 2 h | HR | **Test scans**: scan two HR passes at check-in and at the merchandise booth; run one test draw with a placeholder prize and confirm it on the stage. Everything works? Go on |
| T minus 1 h | HR | Remove any placeholder prizes. Check Admin, Prizes against the final list. Admin, Settings: **Reset rehearsal data** (type RESET). The dashboard must show zeros |
| T minus 45 min | HR + technical contact | Walk through `go-live.md`. **Go live is the last step.** The dashboard badge changes from `rehearsal` to `live` |
| T minus 30 min | All | Staff in position. Paper guest lists at the check-in desk. Failure playbooks at HR and the technical contact |
| Doors | Check-in | Scan. Watch the dashboard: "Checked in" climbs; outlet bars fill. Chase unopened invitations only if there is a queue problem, not during the event |
| Programme | MC | Run the draw from the MC phone. 60 seconds per winner. TIDAK HADIR if absent. Prize desk confirms hand-overs |
| Throughout | Technical contact | Watch the dashboard and the stage dot. Keep the failure playbook open |
| Close | HR | Download all seven reports again (Admin, Reports) and save them to the HR drive as the final record |

## After the event

- Next working day: HR reviews the reports. Retention schedule applies (open decision 5).
- Do not try to reset anything: after Go live the reset is locked and the audit log cannot be deleted.
- Write down what went wrong and what went well, with times, in the project folder.
````

`docs/runbooks/go-live.md`:
````markdown
# Go live

**Go live is one-way.** After it, "Reset rehearsal data" is locked and audit rows can no longer be deleted. It is the last thing you do before doors open, never earlier.

## Check each line out loud (two people)

- [ ] It is 10 December, and the doors are within the hour.
- [ ] Dashboard: **0** checked in, **0** merchandise handed over, **0** draws, **0** confirmed prizes. If not, Settings, Reset rehearsal data first.
- [ ] Admin, Prizes lists exactly the final prizes, quantities and order. No "[TEST]" prize.
- [ ] Admin, Guests: the count matches the final HR headcount. The walk-ins list is empty or intended.
- [ ] Four station PINs are the ones rotated yesterday and every desk lead has theirs.
- [ ] The stage shows "UNDIAN DIMULAI SEBENTAR LAGI" and the MC's dot is green.
- [ ] The reports from yesterday's backup are saved in two places.
- [ ] The technical contact is on site or on the phone.

## Then

Admin, Settings, Event mode: type **GO LIVE** and press Go live. The dashboard badge changes to `live`; the Settings page says "The event is LIVE".

## If you clicked too early

Test check-ins and redemptions made before the real start cannot be removed any more. Export the reports now, note the time of the click, and tell the technical contact. The audit log timestamps show which rows are tests. Do not try to edit the database by hand.
````

- [ ] **Step 6: Patch the spec so it matches what was built**

In `docs/spec.md` make these edits. Each "Replace" line is the text as it stands now (copy it exactly; every one occurs once).

1. §3.1, the `draws` row. Replace
```
| `draws` | `prize_id`, `slot`, `sequence` (identity), `winner_guest_id`, `status`, `request_id` (unique), `redraw_of`, `drawn_at`, `resolved_at`, `resolved_by` | `status`: `drawn`, `confirmed`, `void_no_show`, `void_admin` |
```
with
```
| `draws` | `prize_id`, `slot`, `sequence` (identity), `round_id`, `request_group`, `winner_guest_id`, `status`, `request_id` (unique), `redraw_of`, `drawn_at`, `drawn_by`, `resolved_at`, `resolved_by`, `void_reason` | `status`: `drawn`, `confirmed`, `void_no_show`, `void_admin`. `round_id` groups a batch and keeps a redraw in the round it replaces |
```
2. §4.2, the three draw rows. Replace
```
| `draw_prize(event, prize_id, request_id, role)` | MC | `DRAWN`, `DRAW_IN_PROGRESS`, `PRIZE_COMPLETE`, `NO_ELIGIBLE_GUESTS` |
| `resolve_draw(draw_id, outcome, role, actor)` | MC (draw) or Prize Verification | `CONFIRMED`, `VOIDED`, `ALREADY_CONFIRMED`, `DRAW_VOID` |
| `set_stage(event, phase, payload)` | MC | `OK` |
```
with
```
| `draw_prize(event, prize_id, request_id, actor)` | MC | `DRAWN` (a batch also returns `short_by`), `DRAW_IN_PROGRESS` (any draw is unresolved), `PRIZE_COMPLETE`, `NO_ELIGIBLE_GUESTS`, `PRIZE_NOT_FOUND`, `INVALID` |
| `resolve_draw(event, draw_id, outcome, actor)` | MC (draw) or Prize Verification | `CONFIRMED`, `VOIDED`, `ALREADY_CONFIRMED`, `DRAW_VOID`, `NOT_FOUND`, `INVALID`. `actor` is the role, or the admin's e-mail |
| `resolve_round(event, round, actor)` | MC or Prize Verification ("confirm all" on a batch) | `CONFIRMED` (with the count), `NOTHING_TO_CONFIRM` |
| `set_stage(event, phase, prize_id, actor)` | MC | `OK`, `DRAW_IN_PROGRESS`, `PRIZE_NOT_FOUND`, `INVALID_PHASE`. Phases `idle` and `intro` only; the payload is built in the database |
| `draw_current(event)`, `lookup_prize_number(event, number)` | MC, Prize Verification | `draw_current`: `OK`. `lookup_prize_number`: `WINNER`, `PENDING`, `NOT_A_WINNER`, `NO_SUCH_NUMBER` |
| `prize_list(event)`, `admin_save_prize(event, id, data, actor)`, `admin_delete_prize(event, id, actor)` | Station screens, Admin | `OK`, `INVALID`, `NAME_IN_USE`, `NOT_FOUND`, `QUANTITY_TOO_LOW`, `LOCKED_BY_DRAWS`, `HAS_DRAWS` |
```
3. §4.2, the admin row. Replace
```
| `add_walk_in`, `void_redemption`, `admin_void_draw`, `set_station_pin` | Admin | `OK` (a reason is required where records change) |
```
with
```
| `add_walk_in`, `void_redemption`, `admin_void_draw`, `set_station_pin`, `set_stage_key`, `set_stage_options` | Admin | `OK` (a reason is required where records change; `REASON_REQUIRED`, `NOT_VOIDABLE`, `NOT_FOUND` otherwise) |
```
4. §4.5 step 2. Replace
```
2. Lock the prize row. If any **other** prize has an unresolved winner, return `DRAW_IN_PROGRESS`.
```
with
```
2. Take the event's draw lock, then lock the prize row. If **any** draw is unresolved (this prize or another), return `DRAW_IN_PROGRESS`.
```
5. §4.6, after the `no_show` bullet add
```
- **confirm all (batch):** `resolve_round` confirms every `drawn` slot of one round in a single transaction.
```
6. §5.3, the Stage line. Replace
```
**Stage:** `GET /api/stage/state`, `POST /api/stage/heartbeat` (cookie `nf_stage`).
```
with
```
**Stage:** `GET /api/stage/enter?key=` (verifies the display key, sets the cookie `nf_stage`, redirects to `/stage`); `GET /api/stage/state`, `POST /api/stage/heartbeat` (cookie `nf_stage`). The `/stage` page forwards `?key=` to the enter route because a server component cannot set a cookie.
```
7. §5.3, the Admin paragraph. Replace `GET/POST/PATCH /api/admin/prizes` with `GET/POST /api/admin/prizes` (a body with `id` updates) and `POST …/prizes/[id]/delete`; replace `GET /api/admin/reports/[name].csv` with `GET /api/admin/reports/[name]` (returns `text/csv`; names `guests`, `check-ins`, `merchandise`, `draws`, `audit`, `rsvp-pending`); add `GET /api/admin/stage` (display key set, heartbeat age) before `GET /api/admin/audit`.

Check: `grep -n "resolve_round\|reports/\[name\]\|api/stage/enter" docs/spec.md` shows the new text, and `grep -c "reports/\[name\].csv" docs/spec.md` prints `0`.

- [ ] **Step 7: Final verification of Plan 2**

Run the whole chain on a fresh local stack:
```bash
npm run db:reset && ./scripts/make-env.sh
npx tsc --noEmit && npm run lint
supabase test db
npm run test:unit && npm run test:api
node --env-file=.env.test scripts/concurrency/checkin.mjs
node --env-file=.env.test scripts/concurrency/redeem.mjs
node --env-file=.env.test scripts/concurrency/draw.mjs
npm run build && npm run e2e
```
Expected: type check and lint clean; `supabase test db` passes every file (`001` to `012`); all unit and API tests pass; each concurrency script ends with `all checks passed` or its last `ok` line; the production build succeeds; Playwright passes every Plan 1 and Plan 2 test.

Then on **staging**, with the staging URLs in `.env.test`: `node scripts/load/seed-fake-guests.mjs 215`, `scripts/load/pass-pages.mjs`, `scripts/load/scans.mjs`, `scripts/load/stage-latency.mjs`. Expected: all four report `all checks passed`.

Finally, apply the new migrations to production in rehearsal mode (`npx supabase db push`; expected: the six Plan 2 migrations applied). Open the Supabase dashboard, Advisors, Security, on production and staging: expected **no errors** (the spec requires a clean security advisor; the new tables are covered by `lock_down_public()`, and `stage_state` is the one table with a read policy). Then run `docs/runbooks/rehearsal-1.md`.

- [ ] **Step 8: Commit**

```bash
git add scripts/rehearsal docs/runbooks docs/spec.md
git commit -m "docs: rehearsal scripts, stage setup, failure playbook, rehearsal, day-before, event-day and go-live runbooks; spec matches the build"
```

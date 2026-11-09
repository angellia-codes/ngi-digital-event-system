# NourishFest 2026 — MC Cue Card: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One tabbed MC screen at `/station/mc` (Rundown · VIP · Pax · Draw) on a new `mc` PIN: a live run-sheet driven by NEXT with planned-vs-actual timing, BOD/HOD in protocol order with live arrival, live attendance by outlet and department, and the existing door-prize draw limited to the current rundown segment's prizes. Admin gets a rundown editor, VIP tagging, per-prize MC lines, a printable cue card and a rundown report.

**Architecture:** Same pattern as every earlier module. All rules live in `SECURITY DEFINER` Postgres functions; the current segment is the one open row in `rundown_runs`, so NEXT is a single serialised transaction (`mc_next`, advisory lock) and "first tap wins" falls out of comparing the device's `from_segment_id` with the live one. MC phones poll (`mc_state` every 2 s, VIP/pax every 10 s) and never depend on Realtime. The draw page body is extracted into a `DrawOperator` component that both `/station/draw` and the MC Draw tab render. The stage display is not touched.

**Tech Stack:** Next.js 15 (App Router) + React 19, Supabase Postgres with pgTAP, zod 4, vitest. No new dependencies.

**Spec:** `engineering/2026-11-09-nourishfest-mc-cue-card-design.md` in the NourishFest 2026 project (approved 9 Nov 2026). Task 1 copies it into the repo as `docs/2026-11-09-nourishfest-mc-cue-card-design.md`.

**Verified:** every file and edit in this plan was built and run against the current `main` (`5851597`) before the plan was written: `tsc` clean, `eslint` clean apart from the two warnings already in `Scanner.tsx`, **232 unit tests** (216 existing + 16 new) and **257 pgTAP tests** (154 existing + 103 new) passing. The pgTAP run used a local PostgreSQL 16 + pgTAP 1.3.5 with the Supabase roles (`anon`, `authenticated`, `service_role`) and `extensions` schema recreated, all 22 migrations applied in order. **Not run here:** `next build` (the sandbox cannot reach Google Fonts, which `next/font` needs) and the screens in a real browser — Task 11 covers both.

## Global Constraints

- **Do not run `npm run db:push` or deploy until Task 11.** `db:push` targets the production Supabase project. Migrations 17–19 and the app go live together.
- **Database rules (same as every earlier migration):** functions are `SECURITY DEFINER` with `set search_path = public, extensions`; every migration ends with `select public.lock_down_public();` so `anon` and `authenticated` cannot execute anything and RLS is on for the new tables.
- **Wrapped functions:** `admin_guest_list` becomes a wrapper around `admin_guest_list_core`; `report_rows` becomes a wrapper around `report_rows_merch` (which still wraps `report_rows_core`). A later migration that redefines either must keep calling the inner function. Both migrations say so in a comment.
- **Status names:** `OK`, `INVALID`, `NOT_FOUND`, `REASON_REQUIRED` (reason under 5 characters, the beverage convention), plus new `ALREADY_ADVANCED`, `SHOW_ENDED`, `NO_SEGMENTS`, `ALREADY_CURRENT`, `LOCKED`, `PRIZE_TAKEN`, `HAS_RUNS`.
- **Show order:** segments are ordered by `(sort_order, planned_start, id)` everywhere (SQL and UI). NEXT always moves exactly one segment forward. There is no back or skip on the MC screen; an admin uses **Make current** (reason required, audited).
- **Times:** segment start is entered as `HH:MM` WITA and stored as that time on `events.event_date` in `Asia/Makassar`. A segment cannot start after midnight.
- **Roles:** new role `mc`. It is accepted on `/api/station/mc/*` and on every existing draw route (`/api/station/prizes`, `/prizes/lookup-number`, `/draw`, `/draw/current`, `/draw/resolve`, `/draw/stage`). Rundown edits are admin-only.
- **Copy:** every new string exists in both `id` and `en` with the same `{placeholders}` (`tests/unit/strings.test.ts` enforces this). Script text written by HR is shown as entered and never translated. No congratulations wording (existing rule).
- **Stage display:** no changes. No new stage states.
- **Tests:** unit tests run with `npm run test:unit`. Database tests run on a local Supabase stack (Docker): `npx supabase start` once, then `npx supabase db reset && npx supabase test db` after each SQL change.

## Deviations from the spec (decided while building, all minor)

| Spec | Plan | Why |
|:--|:--|:--|
| §4.1 unique `(event_id, sort_order)` | No unique constraint; order by `(sort_order, planned_start, id)` | Reordering two segments would need a deferrable constraint and a swap; the tie-break keeps the order deterministic |
| §4.1 `segment_prizes (segment_id, prize_id)` unique `prize_id` | `prize_id` is the primary key; `on delete cascade` from both prizes and segments | Same rule, one index; deleting a prize or segment cleans up |
| §4.3 `mc_next` returns `OK` / `SHOW_ENDED` / `ALREADY_ADVANCED` | Adds `NO_SEGMENTS`; a stale **start** tap after the show ended returns `SHOW_ENDED` instead of restarting | Empty rundown and "restart by accident" both needed an answer |
| §4.3 `mc_set_current` | Adds `ALREADY_CURRENT`; stores the reason on the run row as well as in the audit log | Avoids restarting the clock by accident; the rundown report shows the reason |
| §5 `PATCH /api/admin/guests` extended with VIP fields | New `POST /api/admin/guests/[id]/vip` → `admin_set_guest_vip` | Same shape as the beverage and T-shirt size corrections; `admin_update_guest` stays untouched |
| §5 `/api/admin/prizes` extended with `mc_script` | New `POST /api/admin/prizes/[id]/script` → `admin_set_prize_script` | `admin_save_prize` (100 lines) stays untouched; the Prizes form calls both |
| §3.2 "Filter by VIP tier" on the guests page | Dropped | The printable cue card lists every BOD/HOD in protocol order, which is the check HR needs |
| §3.5 rundown report columns | Adds `Kind` and `Correction reason`; minutes columns are plain integers (new CSV kind `int`) | A negative drift `-3` would otherwise be escaped as `'-3` by the formula-injection guard |
| §7 API tests for role guards | No route tests; role lists are one-line literals reviewed in Task 5 and exercised in the rehearsal checklist | The repo has no route-test harness (routes need Supabase); adding one is out of scope |
| §7 `mc_next` "two concurrent calls" | pgTAP checks a repeat with the same stale `from` (one connection); real concurrency is serialised by `pg_advisory_xact_lock` and checked with two phones in rehearsal | pgTAP runs in one transaction |
| — | Hub launcher gains an **MC** card | Every other station has one |

## File map

| File | Task | Responsibility |
|:--|:--|:--|
| `supabase/migrations/20261115000017_mc_rundown.sql` | 1 | Columns, `rundown_segments`, `segment_prizes`, `rundown_runs`, role `mc`, `mc_state`, `mc_next`, `mc_set_current` |
| `supabase/migrations/20261115000018_mc_people.sql` | 2 | `mc_vip`, `mc_pax`, `admin_set_guest_vip`, `admin_set_prize_script`, `prize_list` + `mc_script`, `admin_guest_list` wrapper |
| `supabase/migrations/20261115000019_mc_admin.sql` | 3 | `admin_save_segment`, `admin_delete_segment`, `report_rows` + `rundown`, `reset_rehearsal_data` + runs |
| `supabase/tests/database/008…010_mc_*.test.sql` | 1–3 | pgTAP for each migration |
| `src/lib/session.ts`, `admin-text.ts`, `src/app/station/page.tsx`, `src/components/Hub.tsx` | 4 | Role `mc`, login routing, launcher card |
| `src/lib/i18n/mc-strings.ts`, `strings.ts` | 4 | `mc.*` and `hub.mc*` strings |
| `src/lib/mc.ts` | 4 | Types and pure logic (status, drift, clock, pax grouping, VIP groups) |
| `src/app/api/station/mc/{state,next,vip,pax}/route.ts`, draw routes | 5 | MC endpoints; draw routes accept `mc` |
| `src/components/station/DrawOperator.tsx`, `src/app/station/draw/page.tsx`, `src/lib/prizes.ts`, `operator.css` | 6 | Draw controls as a component, prize filter, MC line |
| `src/lib/use-mc.ts`, `src/components/mc/*`, `src/app/station/mc/page.tsx`, `src/styles/mc.css` | 7 | The MC screen |
| `src/app/api/admin/rundown/…`, `guests/[id]/vip`, `prizes/[id]/script` | 8 | Admin endpoints |
| `src/lib/admin-mc-text.ts`, `RundownEditor.tsx`, rundown page, `AdminNav.tsx`, `GuestEditor.tsx`, `PrizeManager.tsx` | 9 | Admin UI |
| `CueCardPrint.tsx`, cue-card page, `cue-card.css`, `reports.ts`, `ReportsPanel.tsx` | 10 | Printable cue card, rundown CSV |
| `docs/runbooks/mc-cue-card.md` | 11 | Setup and rehearsal checklist |

---

### Task 1: Rundown state, NEXT and the `mc` role (database)

**Files:**
- Create: `docs/2026-11-09-nourishfest-mc-cue-card-design.md`, `docs/plans/Nourishfest-plan-mc-cue-card.md`
- Create: `supabase/tests/database/008_mc_rundown.test.sql`
- Create: `supabase/migrations/20261115000017_mc_rundown.sql`

**Interfaces:**
- Consumes: `public.audit`, `public.actor_type_of`, `public.lock_down_public` (existing).
- Produces:
  - Columns `guests.vip_tier` (`BOD`/`HOD`/null), `vip_title`, `protocol_order` (0–999), `phonetic`; `prizes.mc_script`.
  - Tables `rundown_segments`, `segment_prizes (prize_id pk, segment_id, event_id)`, `rundown_runs (…, started_by, reason)` with unique index `one_open_run`.
  - Role `mc` in `station_pins` and `set_station_pin`.
  - `mc_state(p_event uuid) → {status, server_now, phase: not_started|running|ended, current_segment_id, current_started_at, segments: [{id, sort_order, title, planned_start, duration_min, pic, script, kind, started_at, ended_at, prizes: [{id, name, tier, quantity, mc_script, confirmed, remaining, winners[]}]}]}`
  - `mc_next(p_event uuid, p_from uuid, p_actor text) → {status: OK|ALREADY_ADVANCED|SHOW_ENDED|NO_SEGMENTS, state}`
  - `mc_set_current(p_event uuid, p_segment uuid, p_reason text, p_actor text) → {status: OK|REASON_REQUIRED|NOT_FOUND|ALREADY_CURRENT, state?}`

- [ ] **Step 1: Copy the spec and this plan into the repo**

Read `engineering/2026-11-09-nourishfest-mc-cue-card-design.md` and `engineering/2026-11-09-nourishfest-plan-mc-cue-card.md` from the NourishFest 2026 project and save them unchanged as `docs/2026-11-09-nourishfest-mc-cue-card-design.md` and `docs/plans/Nourishfest-plan-mc-cue-card.md`.

- [ ] **Step 2: Write the failing test**

Create `supabase/tests/database/008_mc_rundown.test.sql`:

```sql
-- pgTAP: MC cue card, part 1 (role, mc_state, mc_next, mc_set_current). Run with `supabase test db`.
begin;
select plan(40);

insert into public.events (id, name, event_date, mode, doors_at)
values ('00000000-0000-0000-0000-0000000000dd', 'T', '2026-12-08', 'rehearsal', now() + interval '30 days');

insert into public.guests (id, event_id, employee_id, full_name, outlet) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000dd', 'E1', 'Ayu', 'A'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000dd', 'E2', 'Budi', 'A');
insert into public.check_ins (event_id, guest_id, method, prize_number) values
  ('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-000000000001', 'scan', 1);

insert into public.prizes (id, event_id, name, sort_order, quantity, mc_script) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000dd', 'Voucher', 10, 2, 'Sponsored by X'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000dd', 'TV', 20, 1, null);

insert into public.rundown_segments (id, event_id, sort_order, title, planned_start, duration_min, kind, script) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000dd', 10, 'Opening', '2026-12-08 17:00+08', 10, 'normal', 'Selamat sore'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000dd', 20, 'Door prize 1', '2026-12-08 17:10+08', 15, 'door_prize', null),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000dd', 30, 'Closing', '2026-12-08 17:25+08', 5, 'normal', null);
insert into public.segment_prizes (prize_id, segment_id, event_id) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000dd');

-- one confirmed winner for the voucher
insert into public.draws (event_id, prize_id, slot, winner_guest_id, status, request_id, request_group, round_id) values
  ('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-0000000000a1', 1,
   '00000000-0000-0000-0000-000000000001', 'confirmed', gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

-- role 'mc'
select is(public.set_station_pin('00000000-0000-0000-0000-0000000000dd', 'mc', '4321', 'admin') ->> 'status', 'OK', 'mc PIN can be set');
select is(public.set_station_pin('00000000-0000-0000-0000-0000000000dd', 'nope', '1111', 'admin') ->> 'status', 'INVALID_ROLE', 'unknown role refused');

-- mc_state before the show
select is(public.mc_state('00000000-0000-0000-0000-0000000000dd') ->> 'phase', 'not_started', 'not started');
select is(public.mc_state('00000000-0000-0000-0000-0000000000dd') ->> 'current_segment_id', null, 'no current segment');
select is(jsonb_array_length(public.mc_state('00000000-0000-0000-0000-0000000000dd') -> 'segments'), 3, 'three segments');
select is(public.mc_state('00000000-0000-0000-0000-0000000000dd') #>> '{segments,0,title}', 'Opening', 'show order');
select is(public.mc_state('00000000-0000-0000-0000-0000000000dd') #>> '{segments,1,prizes,0,name}', 'Voucher', 'segment prizes listed');
select is(public.mc_state('00000000-0000-0000-0000-0000000000dd') #>> '{segments,1,prizes,0,mc_script}', 'Sponsored by X', 'prize script included');
select is((public.mc_state('00000000-0000-0000-0000-0000000000dd') #>> '{segments,1,prizes,0,remaining}')::int, 1, 'one voucher left');
select is(public.mc_state('00000000-0000-0000-0000-0000000000dd') #>> '{segments,1,prizes,0,winners,0}', 'Ayu', 'confirmed winner named');
select is(jsonb_array_length(public.mc_state('00000000-0000-0000-0000-0000000000dd') #> '{segments,0,prizes}'), 0, 'normal segment has no prizes');
select ok(public.mc_state('00000000-0000-0000-0000-0000000000dd') ? 'server_now', 'server clock included');

-- start the show
select is(public.mc_next('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-0000000000c2', 'mc') ->> 'status', 'ALREADY_ADVANCED', 'wrong from before start');
select is(public.mc_next('00000000-0000-0000-0000-0000000000dd', null, 'mc') ->> 'status', 'OK', 'show started');
select is(public.mc_state('00000000-0000-0000-0000-0000000000dd') ->> 'phase', 'running', 'running');
select is(public.mc_state('00000000-0000-0000-0000-0000000000dd') ->> 'current_segment_id', '00000000-0000-0000-0000-0000000000c1', 'first segment current');
select isnt(public.mc_state('00000000-0000-0000-0000-0000000000dd') #>> '{segments,0,started_at}', null, 'start recorded');
select is((select started_by from public.rundown_runs where segment_id = '00000000-0000-0000-0000-0000000000c1'), 'mc', 'actor recorded');
select is(public.mc_next('00000000-0000-0000-0000-0000000000dd', null, 'mc') ->> 'status', 'ALREADY_ADVANCED', 'second start tap is harmless');
select is((select count(*)::int from public.rundown_runs where event_id = '00000000-0000-0000-0000-0000000000dd'), 1, 'still one run');

-- NEXT from the right segment
select is(public.mc_next('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-0000000000c1', 'mc') ->> 'status', 'OK', 'next');
select is(public.mc_state('00000000-0000-0000-0000-0000000000dd') ->> 'current_segment_id', '00000000-0000-0000-0000-0000000000c2', 'second segment current');
select isnt(public.mc_state('00000000-0000-0000-0000-0000000000dd') #>> '{segments,0,ended_at}', null, 'first segment closed');
-- a second device still on segment 1 taps NEXT: nothing changes
select is(public.mc_next('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-0000000000c1', 'mc') ->> 'status', 'ALREADY_ADVANCED', 'stale device refused');
select is(public.mc_next('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-0000000000c1', 'mc') #>> '{state,current_segment_id}', '00000000-0000-0000-0000-0000000000c2', 'refusal returns live state');
select is((select count(*)::int from public.rundown_runs where ended_at is null and event_id = '00000000-0000-0000-0000-0000000000dd'), 1, 'one open run');
select throws_ok($$insert into public.rundown_runs (event_id, segment_id) values ('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-0000000000c3')$$,
                 '23505', null, 'a second open run is impossible');

-- admin correction
select is(public.mc_set_current('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-0000000000c1', 'oops', 'admin') ->> 'status', 'REASON_REQUIRED', 'reason required');
select is(public.mc_set_current('00000000-0000-0000-0000-0000000000dd', gen_random_uuid(), 'wrong tap', 'admin') ->> 'status', 'NOT_FOUND', 'unknown segment');
select is(public.mc_set_current('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-0000000000c2', 'wrong tap', 'admin') ->> 'status', 'ALREADY_CURRENT', 'already current');
select is(public.mc_set_current('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-0000000000c1', 'wrong tap', 'admin') ->> 'status', 'OK', 'jumped back');
select is(public.mc_state('00000000-0000-0000-0000-0000000000dd') ->> 'current_segment_id', '00000000-0000-0000-0000-0000000000c1', 'segment 1 current again');
select is((select reason from public.rundown_runs where ended_at is null and event_id = '00000000-0000-0000-0000-0000000000dd'), 'wrong tap', 'reason stored on the run');
select ok(exists (select 1 from public.audit_log where action = 'mc_set_current' and details ->> 'reason' = 'wrong tap'), 'correction audited');

-- run to the end
select is(public.mc_next('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-0000000000c1', 'mc') ->> 'status', 'OK', 'to segment 2');
select is(public.mc_next('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-0000000000c2', 'mc') ->> 'status', 'OK', 'to segment 3');
select is(public.mc_next('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-0000000000c3', 'mc') ->> 'status', 'SHOW_ENDED', 'last NEXT ends the show');
select is(public.mc_state('00000000-0000-0000-0000-0000000000dd') ->> 'phase', 'ended', 'ended');
select is(public.mc_next('00000000-0000-0000-0000-0000000000dd', null, 'mc') ->> 'status', 'SHOW_ENDED', 'a stale start tap cannot restart the show');

select ok(not has_function_privilege('anon', 'public.mc_next(uuid,uuid,text)', 'execute')
      and not has_function_privilege('authenticated', 'public.mc_state(uuid)', 'execute'),
  'anon and authenticated cannot execute');

select * from finish();
rollback;
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `npx supabase db reset && npx supabase test db`
Expected: `008_mc_rundown.test.sql` FAILS at the first insert with `column "mc_script" of relation "prizes" does not exist`. Files 003–007 still pass.

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/20261115000017_mc_rundown.sql`:

```sql
-- MC cue card (spec 2026-11-09), part 1: role 'mc', rundown tables, live run state and NEXT.
-- The current segment is the one open run (ended_at is null). No job runs on a timer: drift is worked out on read.

alter table public.guests
  add column vip_tier text check (vip_tier in ('BOD', 'HOD')),
  add column vip_title text check (length(vip_title) <= 30),
  add column protocol_order int check (protocol_order between 0 and 999),
  add column phonetic text check (length(phonetic) <= 80);

alter table public.prizes add column mc_script text check (length(mc_script) <= 500);

create table public.rundown_segments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  sort_order int not null default 0 check (sort_order >= 0),
  title text not null check (length(title) between 1 and 80),
  planned_start timestamptz not null,
  duration_min int not null check (duration_min between 1 and 600),
  pic text check (length(pic) <= 80),
  script text check (length(script) <= 4000),
  kind text not null default 'normal' check (kind in ('normal', 'door_prize')),
  updated_at timestamptz not null default now()
);
create index rundown_segments_order on public.rundown_segments (event_id, sort_order, planned_start, id);

-- A prize belongs to at most one door-prize segment (the primary key is the prize).
create table public.segment_prizes (
  prize_id uuid primary key references public.prizes (id) on delete cascade,
  segment_id uuid not null references public.rundown_segments (id) on delete cascade,
  event_id uuid not null references public.events (id)
);
create index segment_prizes_segment on public.segment_prizes (segment_id);

create table public.rundown_runs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  segment_id uuid not null references public.rundown_segments (id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  started_by text,
  reason text
);
-- At most one open run per event: that run is the current segment.
create unique index one_open_run on public.rundown_runs (event_id) where ended_at is null;
create index rundown_runs_segment on public.rundown_runs (segment_id, started_at desc);

-- New role 'mc'.
do $$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.station_pins'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%checkin%' loop
    execute format('alter table public.station_pins drop constraint %I', c);
  end loop;
end $$;
alter table public.station_pins
  add constraint station_pins_role_check check (role in ('checkin', 'merchandise', 'draw', 'prizes', 'admin', 'bar', 'mc'));

create or replace function public.set_station_pin(p_event uuid, p_role text, p_pin text, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if p_role not in ('checkin', 'merchandise', 'draw', 'prizes', 'admin', 'bar', 'mc') then
    return jsonb_build_object('status', 'INVALID_ROLE');
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('status', 'INVALID_PIN');
  end if;
  if exists (select 1 from public.station_pins
              where event_id = p_event and role <> p_role and pin_hash = crypt(p_pin, pin_hash)) then
    return jsonb_build_object('status', 'PIN_IN_USE');
  end if;

  insert into public.station_pins (event_id, role, pin_hash, active)
  values (p_event, p_role, crypt(p_pin, gen_salt('bf')), true)
  on conflict (event_id, role) do update
    set pin_hash = excluded.pin_hash, active = true,
        session_version = public.station_pins.session_version + 1, updated_at = now();

  perform public.audit(p_event, 'admin', p_actor, 'set_pin', 'station_pin', p_role, '{}'::jsonb);
  return jsonb_build_object('status', 'OK');
end $$;

-- Everything the MC screen and the rundown editor need, in one read. Segments come in show order
-- (sort_order, planned_start, id); started_at/ended_at are the latest run of each segment.
create function public.mc_state(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  with cur as (
    select segment_id, started_at from public.rundown_runs where event_id = p_event and ended_at is null
  ), last_run as (
    select distinct on (segment_id) segment_id, started_at, ended_at
      from public.rundown_runs where event_id = p_event
     order by segment_id, started_at desc
  ), seg as (
    select s.id, s.sort_order, s.title, s.planned_start, s.duration_min, s.pic, s.script, s.kind,
           lr.started_at as run_started_at, lr.ended_at as run_ended_at,
           (select coalesce(jsonb_agg(jsonb_build_object(
                'id', p.id, 'name', p.name, 'tier', p.tier, 'quantity', p.quantity, 'mc_script', p.mc_script,
                'confirmed', (select count(*) from public.draws d where d.prize_id = p.id and d.status = 'confirmed'),
                'remaining', p.quantity - (select count(*) from public.draws d
                                            where d.prize_id = p.id and d.status in ('drawn', 'confirmed')),
                'winners', (select coalesce(jsonb_agg(g.full_name order by d.slot), '[]'::jsonb)
                              from public.draws d join public.guests g on g.id = d.winner_guest_id
                             where d.prize_id = p.id and d.status = 'confirmed'))
                order by p.sort_order, p.name), '[]'::jsonb)
              from public.segment_prizes sp join public.prizes p on p.id = sp.prize_id
             where sp.segment_id = s.id) as prizes
      from public.rundown_segments s
      left join last_run lr on lr.segment_id = s.id
     where s.event_id = p_event
  )
  select jsonb_build_object(
    'status', 'OK',
    'server_now', now(),
    'phase', case when exists (select 1 from cur) then 'running'
                  when exists (select 1 from public.rundown_runs where event_id = p_event) then 'ended'
                  else 'not_started' end,
    'current_segment_id', (select segment_id from cur),
    'current_started_at', (select started_at from cur),
    'segments', coalesce((select jsonb_agg(jsonb_build_object(
        'id', seg.id, 'sort_order', seg.sort_order, 'title', seg.title, 'planned_start', seg.planned_start,
        'duration_min', seg.duration_min, 'pic', seg.pic, 'script', seg.script, 'kind', seg.kind,
        'started_at', seg.run_started_at, 'ended_at', seg.run_ended_at, 'prizes', seg.prizes)
        order by seg.sort_order, seg.planned_start, seg.id) from seg), '[]'::jsonb))
$$;

-- NEXT. p_from is the segment the device believes is current (null before the show).
-- If another device moved the show on first, nothing changes and the caller gets ALREADY_ADVANCED with the live state.
create function public.mc_next(p_event uuid, p_from uuid, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_cur public.rundown_runs%rowtype;
  v_started boolean;
  v_next uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('mc_rundown:' || p_event::text, 0));
  select * into v_cur from public.rundown_runs where event_id = p_event and ended_at is null;
  v_started := exists (select 1 from public.rundown_runs where event_id = p_event);

  if v_cur.id is null and v_started then
    return jsonb_build_object('status', 'SHOW_ENDED', 'state', public.mc_state(p_event));
  end if;
  if v_cur.segment_id is distinct from p_from then
    return jsonb_build_object('status', 'ALREADY_ADVANCED', 'state', public.mc_state(p_event));
  end if;

  if v_cur.id is null then
    select id into v_next from public.rundown_segments where event_id = p_event
     order by sort_order, planned_start, id limit 1;
    if v_next is null then
      return jsonb_build_object('status', 'NO_SEGMENTS', 'state', public.mc_state(p_event));
    end if;
  else
    select s.id into v_next
      from public.rundown_segments s
      join public.rundown_segments c on c.id = v_cur.segment_id
     where s.event_id = p_event
       and (s.sort_order, s.planned_start, s.id) > (c.sort_order, c.planned_start, c.id)
     order by s.sort_order, s.planned_start, s.id
     limit 1;
    update public.rundown_runs set ended_at = now() where id = v_cur.id;
  end if;

  if v_next is not null then
    insert into public.rundown_runs (event_id, segment_id, started_by) values (p_event, v_next, p_actor);
  end if;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'mc_next', 'segment',
                       coalesce(v_next, v_cur.segment_id)::text, jsonb_build_object('from', p_from, 'to', v_next));
  return jsonb_build_object('status', case when v_next is null then 'SHOW_ENDED' else 'OK' end,
                            'state', public.mc_state(p_event));
end $$;

-- Admin correction: make any segment current (after a mistaken NEXT, or to jump). Reason required, audited.
create function public.mc_set_current(p_event uuid, p_segment uuid, p_reason text, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if length(trim(coalesce(p_reason, ''))) < 5 then
    return jsonb_build_object('status', 'REASON_REQUIRED');
  end if;
  if not exists (select 1 from public.rundown_segments where id = p_segment and event_id = p_event) then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('mc_rundown:' || p_event::text, 0));
  if exists (select 1 from public.rundown_runs where event_id = p_event and ended_at is null and segment_id = p_segment) then
    return jsonb_build_object('status', 'ALREADY_CURRENT', 'state', public.mc_state(p_event));
  end if;
  update public.rundown_runs set ended_at = now() where event_id = p_event and ended_at is null;
  insert into public.rundown_runs (event_id, segment_id, started_by, reason)
  values (p_event, p_segment, p_actor, trim(p_reason));
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'mc_set_current', 'segment', p_segment::text,
                       jsonb_build_object('reason', trim(p_reason)));
  return jsonb_build_object('status', 'OK', 'state', public.mc_state(p_event));
end $$;

select public.lock_down_public();
```

- [ ] **Step 5: Run the tests**

Run: `npx supabase db reset && npx supabase test db`
Expected: PASS, `008_mc_rundown.test.sql .. ok` (40 tests), all earlier files still ok.

- [ ] **Step 6: Commit**

```bash
git add docs/2026-11-09-nourishfest-mc-cue-card-design.md docs/plans/Nourishfest-plan-mc-cue-card.md \
  supabase/migrations/20261115000017_mc_rundown.sql supabase/tests/database/008_mc_rundown.test.sql
git commit -m "feat(mc): rundown tables, mc role, mc_state and NEXT"
```

---

### Task 2: VIP list, attendance and prize MC lines (database)

**Files:**
- Create: `supabase/tests/database/009_mc_people.test.sql`
- Create: `supabase/migrations/20261115000018_mc_people.sql`

**Interfaces:**
- Consumes: Task 1 columns.
- Produces:
  - `mc_vip(p_event) → {status, vips: [{id, tier, title, full_name, phonetic, position, outlet, protocol_order, arrived, arrived_at}]}` (active guests only; BOD first, then `protocol_order` nulls last, then name)
  - `mc_pax(p_event) → {status, rows: [{outlet, department (null when blank), invited, checked_in}]}` (active guests, walk-ins included)
  - `admin_set_guest_vip(p_event, p_guest_id, p_data jsonb {vip_tier, vip_title, protocol_order (string digits), phonetic}, p_actor) → {status: OK|INVALID|NOT_FOUND}` (tier null clears all four)
  - `admin_set_prize_script(p_event, p_prize_id, p_script, p_actor) → {status: OK|INVALID|NOT_FOUND}`
  - `prize_list` rows gain `mc_script`; `admin_guest_list` rows gain `vip_tier`, `vip_title`, `protocol_order`, `phonetic`.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/database/009_mc_people.test.sql`:

```sql
-- pgTAP: MC cue card, part 2 (VIP list, pax, prize MC lines, admin guest list). Run with `supabase test db`.
begin;
select plan(30);

insert into public.events (id, name, event_date, mode, doors_at)
values ('00000000-0000-0000-0000-0000000000ee', 'T', '2026-12-08', 'rehearsal', now() + interval '30 days');

insert into public.guests (id, event_id, employee_id, full_name, outlet, department, position, active, is_walk_in) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000ee', 'E1', 'Ayu',   'Ungasan', 'FOH',     'GM',        true,  false),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000ee', 'E2', 'Budi',  'Ungasan', 'Kitchen', 'Chef',      true,  false),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000ee', 'E3', 'Citra', 'Ungasan', 'FOH',     'Server',    true,  true),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000ee', 'E4', 'Dewi',  'Berawa',  null,      'Director',  true,  false),
  ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000ee', 'E5', 'Eka',   'Berawa',  'FOH',     'Director',  false, false),
  ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000ee', 'E6', 'Fajar', 'Berawa',  '  ',      'Owner',     true,  false);
insert into public.check_ins (event_id, guest_id, method, prize_number) values
  ('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000001', 'scan', 1),
  ('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000003', 'scan', 2),
  ('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000006', 'scan', 3);
insert into public.prizes (id, event_id, name) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000ee', 'Voucher');

-- admin_set_guest_vip
select is(public.admin_set_guest_vip('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000004',
  '{"vip_tier":"BOD","vip_title":"Ibu","protocol_order":"2","phonetic":"DEH-wee"}', 'admin') ->> 'status', 'OK', 'BOD tagged');
select is(public.admin_set_guest_vip('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000006',
  '{"vip_tier":"BOD","vip_title":"Bapak","protocol_order":"1"}', 'admin') ->> 'status', 'OK', 'second BOD');
select is(public.admin_set_guest_vip('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000001',
  '{"vip_tier":"HOD","vip_title":"Ibu"}', 'admin') ->> 'status', 'OK', 'HOD without order');
select is(public.admin_set_guest_vip('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000002',
  '{"vip_tier":"HOD","protocol_order":"1"}', 'admin') ->> 'status', 'OK', 'HOD with order');
select is(public.admin_set_guest_vip('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000005',
  '{"vip_tier":"BOD"}', 'admin') ->> 'status', 'OK', 'inactive guest can be tagged');
select is(public.admin_set_guest_vip('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000003',
  '{"vip_tier":"CEO"}', 'admin') ->> 'status', 'INVALID', 'unknown tier');
select is(public.admin_set_guest_vip('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000003',
  '{"vip_tier":"HOD","protocol_order":"-1"}', 'admin') ->> 'status', 'INVALID', 'bad order');
select is(public.admin_set_guest_vip('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000003',
  jsonb_build_object('vip_tier', 'HOD', 'vip_title', repeat('x', 31)), 'admin') ->> 'status', 'INVALID', 'title too long');
select is(public.admin_set_guest_vip('00000000-0000-0000-0000-0000000000ee', gen_random_uuid(),
  '{"vip_tier":"HOD"}', 'admin') ->> 'status', 'NOT_FOUND', 'unknown guest');
select is(public.admin_set_guest_vip('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000003',
  '[]', 'admin') ->> 'status', 'INVALID', 'array refused');

-- mc_vip
select is(jsonb_array_length(public.mc_vip('00000000-0000-0000-0000-0000000000ee') -> 'vips'), 4, 'active VIPs only');
select is(public.mc_vip('00000000-0000-0000-0000-0000000000ee') #>> '{vips,0,full_name}', 'Fajar', 'BOD order 1 first');
select is(public.mc_vip('00000000-0000-0000-0000-0000000000ee') #>> '{vips,1,full_name}', 'Dewi', 'BOD order 2 second');
select is(public.mc_vip('00000000-0000-0000-0000-0000000000ee') #>> '{vips,2,full_name}', 'Budi', 'HOD with order before HOD without');
select is(public.mc_vip('00000000-0000-0000-0000-0000000000ee') #>> '{vips,3,full_name}', 'Ayu', 'HOD without order last');
select is(public.mc_vip('00000000-0000-0000-0000-0000000000ee') #>> '{vips,0,arrived}', 'true', 'arrived flag');
select is(public.mc_vip('00000000-0000-0000-0000-0000000000ee') #>> '{vips,1,arrived}', 'false', 'not arrived');
select is(public.mc_vip('00000000-0000-0000-0000-0000000000ee') #>> '{vips,1,phonetic}', 'DEH-wee', 'phonetic note');

-- clearing the tier clears the rest
select is(public.admin_set_guest_vip('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000004',
  '{"vip_tier":null,"vip_title":"Ibu"}', 'admin') ->> 'status', 'OK', 'tier cleared');
select is((select vip_title from public.guests where employee_id = 'E4'), null, 'title cleared with the tier');
select is(jsonb_array_length(public.mc_vip('00000000-0000-0000-0000-0000000000ee') -> 'vips'), 3, 'removed from the list');

-- mc_pax: Ungasan FOH 2 invited (one walk-in) 2 in; Kitchen 1/0; Berawa no department 2 invited (blank counts as none) 1 in
select is(jsonb_array_length(public.mc_pax('00000000-0000-0000-0000-0000000000ee') -> 'rows'), 3, 'three outlet/department rows');
select is(public.mc_pax('00000000-0000-0000-0000-0000000000ee') #>> '{rows,0,outlet}', 'Berawa', 'ordered by outlet');
select is(public.mc_pax('00000000-0000-0000-0000-0000000000ee') #>> '{rows,0,department}', null, 'blank department is none');
select is((public.mc_pax('00000000-0000-0000-0000-0000000000ee') #>> '{rows,0,invited}')::int, 2, 'inactive guest not invited');
select is((public.mc_pax('00000000-0000-0000-0000-0000000000ee') #>> '{rows,0,checked_in}')::int, 1, 'Berawa checked in');
select is((public.mc_pax('00000000-0000-0000-0000-0000000000ee') #>> '{rows,1,checked_in}')::int, 2, 'Ungasan FOH incl. walk-in');

-- prize script
select is(public.admin_set_prize_script('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-0000000000a1', '  Sponsored by X ', 'admin') ->> 'status', 'OK', 'script saved');
select is(public.prize_list('00000000-0000-0000-0000-0000000000ee') #>> '{prizes,0,mc_script}', 'Sponsored by X', 'prize_list carries the trimmed script');

-- admin guest list carries VIP fields
select is((select x ->> 'vip_tier' from jsonb_array_elements(public.admin_guest_list('00000000-0000-0000-0000-0000000000ee', '', '') -> 'guests') x
            where x ->> 'employee_id' = 'E6'), 'BOD', 'guest list shows the tier');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx supabase db reset && npx supabase test db`
Expected: `009_mc_people.test.sql` FAILS with `function public.admin_set_guest_vip(...) does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261115000018_mc_people.sql`:

```sql
-- MC cue card (spec 2026-11-09), part 2: BOD/HOD list, attendance by outlet and department, prize MC lines.

-- Active BOD and HOD guests in protocol order (BOD first), with arrival from check_ins.
create function public.mc_vip(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object('status', 'OK', 'vips', coalesce(jsonb_agg(jsonb_build_object(
      'id', g.id, 'tier', g.vip_tier, 'title', g.vip_title, 'full_name', g.full_name, 'phonetic', g.phonetic,
      'position', g.position, 'outlet', g.outlet, 'protocol_order', g.protocol_order,
      'arrived', c.guest_id is not null, 'arrived_at', c.checked_in_at)
      order by case g.vip_tier when 'BOD' then 0 else 1 end, g.protocol_order nulls last, g.full_name), '[]'::jsonb))
  from public.guests g
  left join public.check_ins c on c.guest_id = g.id
  where g.event_id = p_event and g.active and g.vip_tier is not null
$$;

-- Invited (active guests, walk-ins included) and checked in, per outlet and department.
create function public.mc_pax(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object('status', 'OK', 'rows', coalesce(jsonb_agg(jsonb_build_object(
      'outlet', x.outlet, 'department', x.department, 'invited', x.invited, 'checked_in', x.checked_in)
      order by x.outlet, x.department nulls last), '[]'::jsonb))
  from (
    select g.outlet, nullif(trim(g.department), '') as department,
           count(*) as invited, count(c.guest_id) as checked_in
      from public.guests g
      left join public.check_ins c on c.guest_id = g.id
     where g.event_id = p_event and g.active
     group by g.outlet, nullif(trim(g.department), '')
  ) x
$$;

-- Admin tags a guest as BOD or HOD. All four fields are replaced together; tier null clears the others.
create function public.admin_set_guest_vip(p_event uuid, p_guest_id uuid, p_data jsonb, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_tier text;
  v_title text;
  v_order int;
  v_phonetic text;
begin
  if jsonb_typeof(p_data) is distinct from 'object' then
    return jsonb_build_object('status', 'INVALID');
  end if;
  v_tier := nullif(trim(coalesce(p_data ->> 'vip_tier', '')), '');
  if v_tier is not null and v_tier not in ('BOD', 'HOD') then
    return jsonb_build_object('status', 'INVALID');
  end if;
  if v_tier is not null then
    v_title := nullif(trim(coalesce(p_data ->> 'vip_title', '')), '');
    v_phonetic := nullif(trim(coalesce(p_data ->> 'phonetic', '')), '');
    if length(coalesce(v_title, '')) > 30 or length(coalesce(v_phonetic, '')) > 80 then
      return jsonb_build_object('status', 'INVALID');
    end if;
    if p_data ->> 'protocol_order' is not null then
      if (p_data ->> 'protocol_order') !~ '^[0-9]{1,3}$' then
        return jsonb_build_object('status', 'INVALID');
      end if;
      v_order := (p_data ->> 'protocol_order')::int;
    end if;
  end if;

  update public.guests
     set vip_tier = v_tier, vip_title = v_title, protocol_order = v_order, phonetic = v_phonetic
   where id = p_guest_id and event_id = p_event;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'guest_vip_set', 'guest', p_guest_id::text,
                       jsonb_build_object('tier', v_tier));
  return jsonb_build_object('status', 'OK');
end $$;

-- Optional line the MC reads for a prize (sponsor mention). Empty clears it.
create function public.admin_set_prize_script(p_event uuid, p_prize_id uuid, p_script text, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_script text := nullif(trim(coalesce(p_script, '')), '');
begin
  if length(coalesce(v_script, '')) > 500 then
    return jsonb_build_object('status', 'INVALID');
  end if;
  update public.prizes set mc_script = v_script where id = p_prize_id and event_id = p_event;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'prize_script_set', 'prize', p_prize_id::text,
                       jsonb_build_object('cleared', v_script is null));
  return jsonb_build_object('status', 'OK');
end $$;

-- prize_list gains mc_script (same body as 20261115000002 otherwise).
create or replace function public.prize_list(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object('status', 'OK', 'prizes', coalesce(jsonb_agg(s.x order by s.sort_order, s.name), '[]'::jsonb))
  from (
    select p.sort_order, p.name, jsonb_build_object(
      'id', p.id, 'name', p.name, 'tier', p.tier, 'sort_order', p.sort_order, 'quantity', p.quantity,
      'draw_as_batch', p.draw_as_batch, 'mc_script', p.mc_script,
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

-- The admin guest list keeps its body under admin_guest_list_core and gains the VIP fields here.
-- A later migration that redefines admin_guest_list must keep calling the _core function (or fold it in).
alter function public.admin_guest_list(uuid, text, text) rename to admin_guest_list_core;

create function public.admin_guest_list(p_event uuid, p_q text, p_outlet text) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object('status', 'OK', 'guests', coalesce((
    select jsonb_agg(t.x || jsonb_build_object(
             'vip_tier', g.vip_tier, 'vip_title', g.vip_title, 'protocol_order', g.protocol_order, 'phonetic', g.phonetic)
             order by t.ord)
      from jsonb_array_elements(public.admin_guest_list_core(p_event, p_q, p_outlet) -> 'guests') with ordinality as t(x, ord)
      join public.guests g on g.id = (t.x ->> 'id')::uuid), '[]'::jsonb))
$$;

select public.lock_down_public();
```

- [ ] **Step 4: Run the tests**

Run: `npx supabase db reset && npx supabase test db`
Expected: PASS, `009_mc_people.test.sql .. ok` (30 tests); 003–008 still ok (007 checks `admin_guest_list` and must stay green through the wrapper).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261115000018_mc_people.sql supabase/tests/database/009_mc_people.test.sql
git commit -m "feat(mc): VIP list, pax by outlet, prize MC lines"
```

---

### Task 3: Rundown editor, report and reset (database)

**Files:**
- Create: `supabase/tests/database/010_mc_admin.test.sql`
- Create: `supabase/migrations/20261115000019_mc_admin.sql`

**Interfaces:**
- Consumes: Tasks 1–2; `mc_next` (used by the test).
- Produces:
  - `admin_save_segment(p_event, p_id uuid|null, p_data jsonb {title, planned_time 'HH:MM', duration_min, sort_order, pic, script, kind, prize_ids[]}, p_actor) → {status: OK|INVALID|NOT_FOUND|LOCKED|PRIZE_TAKEN, id?, prize?}`
  - `admin_delete_segment(p_event, p_id, p_actor) → {status: OK|NOT_FOUND|HAS_RUNS}`
  - `report_rows(p_event, 'rundown') → {status, rows: [{segment, kind, planned_start, planned_min, actual_start, actual_end, actual_min, drift_min, started_by, reason}]}`
  - `reset_rehearsal_data` also deletes `rundown_runs`.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/database/010_mc_admin.test.sql`:

```sql
-- pgTAP: MC cue card, part 3 (rundown editor, report, reset). Run with `supabase test db`.
begin;
select plan(33);

insert into public.events (id, name, event_date, mode, doors_at)
values ('00000000-0000-0000-0000-0000000000ff', 'T', '2026-12-08', 'rehearsal', now() + interval '30 days');
insert into public.prizes (id, event_id, name, sort_order) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000ff', 'Voucher', 10),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000ff', 'TV', 20);

create temp table ids (k text primary key, id uuid);

-- create
select is(public.admin_save_segment('00000000-0000-0000-0000-0000000000ff', null, '{"title":"Opening"}', 'admin') ->> 'status',
          'INVALID', 'title, time and duration required');
select is(public.admin_save_segment('00000000-0000-0000-0000-0000000000ff', null,
          '{"title":"Opening","planned_time":"25:00","duration_min":10}', 'admin') ->> 'status', 'INVALID', 'bad time');
select is(public.admin_save_segment('00000000-0000-0000-0000-0000000000ff', null,
          '{"title":"Opening","planned_time":"17:00","duration_min":0}', 'admin') ->> 'status', 'INVALID', 'zero duration');
insert into ids select 'open', (public.admin_save_segment('00000000-0000-0000-0000-0000000000ff', null,
  '{"title":"Opening","planned_time":"17:00","duration_min":10,"pic":"Komang","script":"Selamat sore"}', 'admin') ->> 'id')::uuid;
select isnt((select id from ids where k = 'open'), null, 'segment created');
select is((select planned_start from public.rundown_segments where id = (select id from ids where k = 'open')),
          '2026-12-08 17:00+08'::timestamptz, 'time is WITA on the event date');
select is((select sort_order from public.rundown_segments where id = (select id from ids where k = 'open')), 10, 'first sort order 10');
select is((select kind from public.rundown_segments where id = (select id from ids where k = 'open')), 'normal', 'kind defaults to normal');

select is(public.admin_save_segment('00000000-0000-0000-0000-0000000000ff', null,
  '{"title":"Draw","planned_time":"17:10","duration_min":15,"prize_ids":["00000000-0000-0000-0000-0000000000a1"]}', 'admin') ->> 'status',
  'INVALID', 'prizes need a door_prize segment');
select is(public.admin_save_segment('00000000-0000-0000-0000-0000000000ff', null,
  '{"title":"Draw","planned_time":"17:10","duration_min":15,"kind":"door_prize","prize_ids":["nope"]}', 'admin') ->> 'status',
  'INVALID', 'bad prize id');
select is(public.admin_save_segment('00000000-0000-0000-0000-0000000000ff', null,
  jsonb_build_object('title', 'Draw', 'planned_time', '17:10', 'duration_min', 15, 'kind', 'door_prize', 'prize_ids', jsonb_build_array(gen_random_uuid())), 'admin') ->> 'status',
  'INVALID', 'prize of another event refused');
insert into ids select 'draw', (public.admin_save_segment('00000000-0000-0000-0000-0000000000ff', null,
  '{"title":"Draw 1","planned_time":"17:10","duration_min":15,"kind":"door_prize","prize_ids":["00000000-0000-0000-0000-0000000000a1"]}', 'admin') ->> 'id')::uuid;
select is((select count(*)::int from public.segment_prizes where segment_id = (select id from ids where k = 'draw')), 1, 'prize assigned');
select is((select sort_order from public.rundown_segments where id = (select id from ids where k = 'draw')), 20, 'next sort order +10');

select is(public.admin_save_segment('00000000-0000-0000-0000-0000000000ff', null,
  '{"title":"Draw 2","planned_time":"18:00","duration_min":15,"kind":"door_prize","prize_ids":["00000000-0000-0000-0000-0000000000a1"]}', 'admin') ->> 'status',
  'PRIZE_TAKEN', 'a prize belongs to one segment');
insert into ids select 'close', (public.admin_save_segment('00000000-0000-0000-0000-0000000000ff', null,
  '{"title":"Closing","planned_time":"18:30","duration_min":5}', 'admin') ->> 'id')::uuid;

-- update
select is(public.admin_save_segment('00000000-0000-0000-0000-0000000000ff', (select id from ids where k = 'draw'),
  '{"prize_ids":["00000000-0000-0000-0000-0000000000a1","00000000-0000-0000-0000-0000000000a2"]}', 'admin') ->> 'status', 'OK', 'prizes replaced');
select is((select count(*)::int from public.segment_prizes where segment_id = (select id from ids where k = 'draw')), 2, 'two prizes now');
select is(public.admin_save_segment('00000000-0000-0000-0000-0000000000ff', (select id from ids where k = 'open'),
  '{"pic":""}', 'admin') ->> 'status', 'OK', 'pic cleared');
select is((select pic from public.rundown_segments where id = (select id from ids where k = 'open')), null, 'pic is null');
select is((select script from public.rundown_segments where id = (select id from ids where k = 'open')), 'Selamat sore', 'untouched keys stay');
select is(public.admin_save_segment('00000000-0000-0000-0000-0000000000ff', gen_random_uuid(), '{"title":"X"}', 'admin') ->> 'status',
          'NOT_FOUND', 'unknown segment');

-- run the show: finished segments lock, the current one stays editable
select is(public.mc_next('00000000-0000-0000-0000-0000000000ff', null, 'mc') ->> 'status', 'OK', 'show started');
select is(public.admin_save_segment('00000000-0000-0000-0000-0000000000ff', (select id from ids where k = 'open'),
  '{"script":"Halo"}', 'admin') ->> 'status', 'OK', 'current segment editable');
select is(public.mc_next('00000000-0000-0000-0000-0000000000ff', (select id from ids where k = 'open'), 'mc') ->> 'status', 'OK', 'next');
select is(public.admin_save_segment('00000000-0000-0000-0000-0000000000ff', (select id from ids where k = 'open'),
  '{"script":"Later"}', 'admin') ->> 'status', 'LOCKED', 'finished segment locked');
select is(public.admin_delete_segment('00000000-0000-0000-0000-0000000000ff', (select id from ids where k = 'open'), 'admin') ->> 'status',
          'HAS_RUNS', 'finished segment cannot be deleted');
select is(public.admin_delete_segment('00000000-0000-0000-0000-0000000000ff', (select id from ids where k = 'draw'), 'admin') ->> 'status',
          'HAS_RUNS', 'current segment cannot be deleted');

-- switching the current door-prize segment to normal drops its prizes
select is(public.admin_save_segment('00000000-0000-0000-0000-0000000000ff', (select id from ids where k = 'draw'),
  '{"kind":"normal"}', 'admin') ->> 'status', 'OK', 'kind changed');
select is((select count(*)::int from public.segment_prizes where segment_id = (select id from ids where k = 'draw')), 0, 'prizes dropped');

-- delete an upcoming segment; deleting a prize removes its assignment
select is(public.admin_delete_segment('00000000-0000-0000-0000-0000000000ff', (select id from ids where k = 'close'), 'admin') ->> 'status',
          'OK', 'upcoming segment deleted');

-- report
select is(jsonb_array_length(public.report_rows('00000000-0000-0000-0000-0000000000ff', 'rundown') -> 'rows'), 2, 'one row per run');
select is(public.report_rows('00000000-0000-0000-0000-0000000000ff', 'rundown') #>> '{rows,0,segment}', 'Opening', 'show order');
select is(public.report_rows('00000000-0000-0000-0000-0000000000ff', 'draws') ->> 'status', 'OK', 'older reports still work');

-- reset keeps the rundown, clears the runs
select is(public.reset_rehearsal_data('00000000-0000-0000-0000-0000000000ff', 'admin') ->> 'status', 'OK', 'reset');
select ok((select count(*) from public.rundown_runs where event_id = '00000000-0000-0000-0000-0000000000ff') = 0
      and (select count(*) from public.rundown_segments where event_id = '00000000-0000-0000-0000-0000000000ff') = 2,
  'runs cleared, segments kept');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx supabase db reset && npx supabase test db`
Expected: `010_mc_admin.test.sql` FAILS with `function public.admin_save_segment(...) does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261115000019_mc_admin.sql`:

```sql
-- MC cue card (spec 2026-11-09), part 3: rundown editor, rundown report, rehearsal reset.

-- Creates (p_id null) or updates a segment. Only the keys present in p_data change on update.
-- planned_time is 'HH:MM' WITA on the event date. prize_ids replaces the segment's prizes (door_prize segments only).
-- A finished segment (run and closed, not current) is read-only.
create function public.admin_save_segment(p_event uuid, p_id uuid, p_data jsonb, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  s public.rundown_segments%rowtype;
  e public.events%rowtype;
  v_title text;
  v_start timestamptz;
  v_dur int;
  v_sort int;
  v_pic text;
  v_script text;
  v_kind text;
  v_prizes uuid[];
  v_taken text;
begin
  if jsonb_typeof(p_data) is distinct from 'object' then
    return jsonb_build_object('status', 'INVALID');
  end if;
  select * into e from public.events where id = p_event;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;

  if jsonb_exists(p_data, 'title') then
    v_title := nullif(trim(coalesce(p_data ->> 'title', '')), '');
    if v_title is null or length(v_title) > 80 then
      return jsonb_build_object('status', 'INVALID');
    end if;
  end if;
  if jsonb_exists(p_data, 'planned_time') then
    if coalesce(p_data ->> 'planned_time', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      return jsonb_build_object('status', 'INVALID');
    end if;
    v_start := ((e.event_date::text || ' ' || (p_data ->> 'planned_time'))::timestamp at time zone 'Asia/Makassar');
  end if;
  if jsonb_exists(p_data, 'duration_min') then
    if coalesce(p_data ->> 'duration_min', '') !~ '^[0-9]{1,3}$' or (p_data ->> 'duration_min')::int not between 1 and 600 then
      return jsonb_build_object('status', 'INVALID');
    end if;
    v_dur := (p_data ->> 'duration_min')::int;
  end if;
  if jsonb_exists(p_data, 'sort_order') then
    if coalesce(p_data ->> 'sort_order', '') !~ '^[0-9]{1,6}$' then
      return jsonb_build_object('status', 'INVALID');
    end if;
    v_sort := (p_data ->> 'sort_order')::int;
  end if;
  if jsonb_exists(p_data, 'pic') then
    v_pic := nullif(trim(coalesce(p_data ->> 'pic', '')), '');
    if length(coalesce(v_pic, '')) > 80 then
      return jsonb_build_object('status', 'INVALID');
    end if;
  end if;
  if jsonb_exists(p_data, 'script') then
    v_script := nullif(trim(coalesce(p_data ->> 'script', '')), '');
    if length(coalesce(v_script, '')) > 4000 then
      return jsonb_build_object('status', 'INVALID');
    end if;
  end if;
  if jsonb_exists(p_data, 'kind') then
    v_kind := p_data ->> 'kind';
    if v_kind is null or v_kind not in ('normal', 'door_prize') then
      return jsonb_build_object('status', 'INVALID');
    end if;
  end if;
  if jsonb_exists(p_data, 'prize_ids') then
    if jsonb_typeof(p_data -> 'prize_ids') is distinct from 'array'
       or exists (select 1 from jsonb_array_elements(p_data -> 'prize_ids') x
                   where jsonb_typeof(x) <> 'string'
                      or (x #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
      return jsonb_build_object('status', 'INVALID');
    end if;
    select coalesce(array_agg(distinct (x #>> '{}')::uuid), '{}') into v_prizes
      from jsonb_array_elements(p_data -> 'prize_ids') x;
    if (select count(*) from public.prizes where event_id = p_event and id = any (v_prizes)) <> cardinality(v_prizes) then
      return jsonb_build_object('status', 'INVALID');
    end if;
  end if;

  if p_id is null then
    if v_title is null or v_start is null or v_dur is null then
      return jsonb_build_object('status', 'INVALID');
    end if;
    if cardinality(coalesce(v_prizes, '{}')) > 0 and coalesce(v_kind, 'normal') <> 'door_prize' then
      return jsonb_build_object('status', 'INVALID');
    end if;
    select sp_name into v_taken from (
      select p.name as sp_name from public.segment_prizes sp join public.prizes p on p.id = sp.prize_id
       where sp.prize_id = any (coalesce(v_prizes, '{}')) limit 1) t;
    if v_taken is not null then
      return jsonb_build_object('status', 'PRIZE_TAKEN', 'prize', v_taken);
    end if;
    insert into public.rundown_segments (event_id, sort_order, title, planned_start, duration_min, pic, script, kind)
    values (p_event,
            coalesce(v_sort, (select coalesce(max(sort_order), 0) + 10 from public.rundown_segments where event_id = p_event)),
            v_title, v_start, v_dur, v_pic, v_script, coalesce(v_kind, 'normal'))
    returning * into s;
    insert into public.segment_prizes (prize_id, segment_id, event_id)
    select unnest(coalesce(v_prizes, '{}')), s.id, p_event;
    perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'segment_created', 'segment', s.id::text,
                         jsonb_build_object('title', s.title));
    return jsonb_build_object('status', 'OK', 'id', s.id);
  end if;

  select * into s from public.rundown_segments where id = p_id and event_id = p_event for update;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  if exists (select 1 from public.rundown_runs r where r.segment_id = s.id and r.ended_at is not null)
     and not exists (select 1 from public.rundown_runs r where r.segment_id = s.id and r.ended_at is null) then
    return jsonb_build_object('status', 'LOCKED');
  end if;
  if coalesce(v_kind, s.kind) = 'normal' and cardinality(coalesce(v_prizes, '{}')) > 0 then
    return jsonb_build_object('status', 'INVALID');
  end if;
  select sp_name into v_taken from (
    select p.name as sp_name from public.segment_prizes sp join public.prizes p on p.id = sp.prize_id
     where sp.prize_id = any (coalesce(v_prizes, '{}')) and sp.segment_id <> s.id limit 1) t;
  if v_taken is not null then
    return jsonb_build_object('status', 'PRIZE_TAKEN', 'prize', v_taken);
  end if;

  update public.rundown_segments set
    title         = coalesce(v_title, title),
    planned_start = coalesce(v_start, planned_start),
    duration_min  = coalesce(v_dur, duration_min),
    sort_order    = coalesce(v_sort, sort_order),
    pic           = case when jsonb_exists(p_data, 'pic') then v_pic else pic end,
    script        = case when jsonb_exists(p_data, 'script') then v_script else script end,
    kind          = coalesce(v_kind, kind),
    updated_at    = now()
   where id = s.id;
  if coalesce(v_kind, s.kind) = 'normal' then
    delete from public.segment_prizes where segment_id = s.id;
  elsif v_prizes is not null then
    delete from public.segment_prizes where segment_id = s.id;
    insert into public.segment_prizes (prize_id, segment_id, event_id) select unnest(v_prizes), s.id, p_event;
  end if;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'segment_updated', 'segment', s.id::text,
                       jsonb_build_object('fields', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(p_data) k)));
  return jsonb_build_object('status', 'OK', 'id', s.id);
end $$;

-- A segment that has ever run (current or finished) cannot be deleted.
create function public.admin_delete_segment(p_event uuid, p_id uuid, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  s public.rundown_segments%rowtype;
begin
  select * into s from public.rundown_segments where id = p_id and event_id = p_event for update;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  if exists (select 1 from public.rundown_runs where segment_id = s.id) then
    return jsonb_build_object('status', 'HAS_RUNS');
  end if;
  delete from public.rundown_segments where id = s.id;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'segment_deleted', 'segment', s.id::text,
                       jsonb_build_object('title', s.title));
  return jsonb_build_object('status', 'OK');
end $$;

-- Report list gains 'rundown' (one row per run; a segment never run gets one row with empty actual times).
-- The previous report_rows keeps its body under report_rows_merch, which still calls report_rows_core.
-- A later migration that redefines report_rows must keep calling report_rows_merch (or fold it in).
alter function public.report_rows(uuid, text) rename to report_rows_merch;

create function public.report_rows(p_event uuid, p_report text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  v jsonb;
begin
  if p_report <> 'rundown' then
    return public.report_rows_merch(p_event, p_report);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'segment', s.title, 'kind', s.kind, 'planned_start', s.planned_start, 'planned_min', s.duration_min,
      'actual_start', r.started_at, 'actual_end', r.ended_at,
      'actual_min', case when r.ended_at is not null
                         then round(extract(epoch from r.ended_at - r.started_at) / 60)::int end,
      'drift_min', case when r.started_at is not null
                        then round(extract(epoch from r.started_at - s.planned_start) / 60)::int end,
      'started_by', r.started_by, 'reason', r.reason)
      order by s.sort_order, s.planned_start, s.id, r.started_at), '[]'::jsonb) into v
    from public.rundown_segments s
    left join public.rundown_runs r on r.segment_id = s.id
   where s.event_id = p_event;
  return jsonb_build_object('status', 'OK', 'rows', v);
end $$;

-- Rehearsal reset also clears the show log. Segments, prize assignments, VIP tags and scripts stay.
create or replace function public.reset_rehearsal_data(p_event uuid, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not exists (select 1 from public.events where id = p_event and mode = 'rehearsal') then
    return jsonb_build_object('status', 'NOT_REHEARSAL');
  end if;
  delete from public.rundown_runs where event_id = p_event;
  delete from public.draws where event_id = p_event;
  delete from public.merchandise_redemptions where event_id = p_event;
  delete from public.beverage_redemptions where event_id = p_event;
  delete from public.check_ins where event_id = p_event;
  delete from public.attempt_log where event_id = p_event;
  delete from public.auth_attempts where true; -- PostgREST safeupdate needs a WHERE
  delete from public.stage_heartbeat where event_id = p_event;
  delete from public.audit_log where event_id = p_event;
  update public.stage_state
     set rev = rev + 1, phase = 'idle', payload = '{}'::jsonb, updated_at = now()
   where event_id = p_event;
  update public.events set next_prize_number = 1 where id = p_event;
  perform public.audit(p_event, 'admin', p_actor, 'rehearsal_reset', 'event', p_event::text, '{}'::jsonb);
  return jsonb_build_object('status', 'OK');
end $$;

select public.lock_down_public();
```

- [ ] **Step 4: Run the tests**

Run: `npx supabase db reset && npx supabase test db`
Expected: PASS, `010_mc_admin.test.sql .. ok` (33 tests). Total across 003–010: 257.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261115000019_mc_admin.sql supabase/tests/database/010_mc_admin.test.sql
git commit -m "feat(mc): rundown editor functions, rundown report, reset clears runs"
```

---

### Task 4: Role, strings and MC logic (shared TypeScript)

**Files:**
- Modify: `src/lib/session.ts`, `src/lib/admin-text.ts`, `tests/unit/admin-text.test.ts`, `src/app/station/page.tsx`, `src/components/Hub.tsx`, `src/lib/i18n/strings.ts`
- Create: `src/lib/i18n/mc-strings.ts`, `src/lib/mc.ts`, `tests/unit/mc.test.ts`

**Interfaces:**
- Consumes: SQL shapes from Tasks 1–2.
- Produces:
  - `Role` includes `'mc'`; `ROLE_NAME.mc = 'MC cue card'`; login sends role `mc` to `/station/mc`.
  - String keys `hub.mc`, `hub.mc_sub`, `mc.*` (see `mc-strings.ts`).
  - From `@/lib/mc`: types `SegmentPrize`, `Segment`, `McPhase`, `McState`, `SegmentStatus`, `VipRow`, `PaxRow`, `PaxCount`, `PaxOutlet`; functions `segmentStatus(seg, currentId)`, `currentSegment(state)`, `nextSegment(state)`, `driftMinutes(plannedIso, startedIso)`, `formatDrift(min)`, `clockOffset(serverNowIso, clientNowMs)`, `elapsedSeconds(startedIso, clientNowMs, offsetMs)`, `formatClock(sec)`, `pct(part, whole)`, `undrawnCount(seg)`, `groupPax(rows) → {total, outlets}`, `vipGroups(rows, presentOnly) → {BOD, HOD}`, `vipName(row)`.

- [ ] **Step 1: Write the failing tests**

Update the role list expectation in `tests/unit/admin-text.test.ts`:

```diff
diff --git a/tests/unit/admin-text.test.ts b/tests/unit/admin-text.test.ts
--- a/tests/unit/admin-text.test.ts
+++ b/tests/unit/admin-text.test.ts
@@ -28,6 +28,6 @@ describe('randomPin', () => {
 
 describe('ROLE_NAME', () => {
   it('names every role', () => {
-    expect(Object.keys(ROLE_NAME).sort()).toEqual(['admin', 'bar', 'checkin', 'draw', 'merchandise', 'prizes']);
+    expect(Object.keys(ROLE_NAME).sort()).toEqual(['admin', 'bar', 'checkin', 'draw', 'mc', 'merchandise', 'prizes']);
   });
 });
```

Create `tests/unit/mc.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  clockOffset, currentSegment, driftMinutes, elapsedSeconds, formatClock, formatDrift, groupPax, nextSegment, pct,
  segmentStatus, undrawnCount, vipGroups, vipName, type McState, type Segment, type VipRow,
} from '@/lib/mc';

const seg = (id: string, extra: Partial<Segment> = {}): Segment => ({
  id, sort_order: 0, title: id, planned_start: '2026-12-08T09:00:00Z', duration_min: 10, pic: null, script: null,
  kind: 'normal', started_at: null, ended_at: null, prizes: [], ...extra,
});
const state = (extra: Partial<McState>): McState => ({
  server_now: '2026-12-08T09:00:00Z', phase: 'running', current_segment_id: 'b', current_started_at: null,
  segments: [seg('a', { started_at: 'x', ended_at: 'y' }), seg('b', { started_at: 'z' }), seg('c')], ...extra,
});

describe('segments', () => {
  it('labels done, current and upcoming', () => {
    const s = state({});
    expect(s.segments.map((x) => segmentStatus(x, s.current_segment_id))).toEqual(['done', 'current', 'upcoming']);
  });
  it('finds the current and next segment', () => {
    expect(currentSegment(state({}))?.id).toBe('b');
    expect(nextSegment(state({}))?.id).toBe('c');
    expect(nextSegment(state({ current_segment_id: 'c' }))).toBeNull();
    expect(nextSegment(state({ phase: 'not_started', current_segment_id: null }))?.id).toBe('a');
    expect(nextSegment(state({ phase: 'ended', current_segment_id: null }))).toBeNull();
    expect(currentSegment(state({ phase: 'not_started', current_segment_id: null }))).toBeNull();
  });
  it('counts undrawn prize slots and ignores negatives', () => {
    const s = seg('d', { kind: 'door_prize', prizes: [
      { id: 'p1', name: 'V', tier: null, quantity: 3, mc_script: null, confirmed: 1, remaining: 2, winners: ['Ayu'] },
      { id: 'p2', name: 'T', tier: null, quantity: 1, mc_script: null, confirmed: 1, remaining: 0, winners: ['Budi'] },
      { id: 'p3', name: 'X', tier: null, quantity: 1, mc_script: null, confirmed: 2, remaining: -1, winners: [] },
    ] });
    expect(undrawnCount(s)).toBe(2);
  });
});

describe('timing', () => {
  it('works out drift in whole minutes', () => {
    expect(driftMinutes('2026-12-08T09:00:00Z', '2026-12-08T09:07:20Z')).toBe(7);
    expect(driftMinutes('2026-12-08T09:00:00Z', '2026-12-08T08:57:00Z')).toBe(-3);
    expect(formatDrift(7)).toBe('+7');
    expect(formatDrift(-3)).toBe('-3');
    expect(formatDrift(0)).toBe('0');
  });
  it('follows the server clock', () => {
    const offset = clockOffset('2026-12-08T09:00:00Z', Date.parse('2026-12-08T08:59:00Z')); // phone 60 s slow
    expect(offset).toBe(60_000);
    expect(elapsedSeconds('2026-12-08T08:58:00Z', Date.parse('2026-12-08T08:59:00Z'), offset)).toBe(120);
    expect(elapsedSeconds('2026-12-08T09:30:00Z', Date.parse('2026-12-08T08:59:00Z'), offset)).toBe(0);
  });
  it('formats the clock', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(187)).toBe('3:07');
    expect(formatClock(4530)).toBe('75:30');
  });
});

describe('pax', () => {
  it('groups by outlet, sorted by most present', () => {
    const g = groupPax([
      { outlet: 'Berawa', department: null, invited: 2, checked_in: 1 },
      { outlet: 'Ungasan', department: 'FOH', invited: 2, checked_in: 2 },
      { outlet: 'Ungasan', department: 'Kitchen', invited: 4, checked_in: 3 },
    ]);
    expect(g.total).toEqual({ invited: 8, checked_in: 6 });
    expect(g.outlets.map((o) => o.outlet)).toEqual(['Ungasan', 'Berawa']);
    expect(g.outlets[0]).toMatchObject({ invited: 6, checked_in: 5 });
    expect(g.outlets[0].departments.map((d) => d.department)).toEqual(['Kitchen', 'FOH']);
    expect(g.outlets[0].departments[0]).toEqual({ outlet: 'Ungasan', department: 'Kitchen', invited: 4, checked_in: 3 });
  });
  it('breaks ties by name and handles zero', () => {
    const g = groupPax([
      { outlet: 'B', department: null, invited: 1, checked_in: 0 },
      { outlet: 'A', department: null, invited: 1, checked_in: 0 },
    ]);
    expect(g.outlets.map((o) => o.outlet)).toEqual(['A', 'B']);
    expect(groupPax([])).toEqual({ total: { invited: 0, checked_in: 0 }, outlets: [] });
  });
  it('rounds percentages and never divides by zero', () => {
    expect(pct(2, 3)).toBe(67);
    expect(pct(0, 0)).toBe(0);
  });
});

describe('vip', () => {
  const v = (id: string, tier: 'BOD' | 'HOD', arrived: boolean): VipRow => ({
    id, tier, title: 'Ibu', full_name: id, phonetic: null, position: null, outlet: 'A', protocol_order: null, arrived, arrived_at: null,
  });
  it('splits BOD and HOD and filters to those present', () => {
    const rows = [v('a', 'BOD', true), v('b', 'BOD', false), v('c', 'HOD', true)];
    expect(vipGroups(rows, false).BOD.map((r) => r.id)).toEqual(['a', 'b']);
    expect(vipGroups(rows, true).BOD.map((r) => r.id)).toEqual(['a']);
    expect(vipGroups(rows, true).HOD.map((r) => r.id)).toEqual(['c']);
  });
  it('joins title and name', () => {
    expect(vipName({ title: 'Ibu', full_name: 'Dewi' })).toBe('Ibu Dewi');
    expect(vipName({ title: null, full_name: 'Dewi' })).toBe('Dewi');
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npm run test:unit`
Expected: FAIL — `mc.test.ts` cannot resolve `@/lib/mc`; `admin-text.test.ts` role list misses `mc`.

- [ ] **Step 3: Add the role, login routing and launcher card**

```diff
diff --git a/src/lib/session.ts b/src/lib/session.ts
--- a/src/lib/session.ts
+++ b/src/lib/session.ts
@@ -5,7 +5,7 @@ import { parseCookies } from './api';
 
 export const STATION_COOKIE = 'nf_station';
 export const DEVICE_COOKIE = 'nf_device';
-export const ROLES = ['checkin', 'merchandise', 'draw', 'prizes', 'admin', 'bar'] as const;
+export const ROLES = ['checkin', 'merchandise', 'draw', 'prizes', 'admin', 'bar', 'mc'] as const;
 export type Role = (typeof ROLES)[number];
 export type StationSession = { role: Role; label: string; v: number };
```

```diff
diff --git a/src/lib/admin-text.ts b/src/lib/admin-text.ts
--- a/src/lib/admin-text.ts
+++ b/src/lib/admin-text.ts
@@ -20,6 +20,7 @@ export const ROLE_NAME: Record<Role, string> = {
   prizes: 'Prize table',
   admin: 'Admin console',
   bar: 'Bar',
+  mc: 'MC cue card',
 };
 
 /** Four random digits from the browser or Node crypto source. */
```

```diff
diff --git a/src/app/station/page.tsx b/src/app/station/page.tsx
--- a/src/app/station/page.tsx
+++ b/src/app/station/page.tsx
@@ -12,6 +12,7 @@ const HOME: Record<string, string | undefined> = {
   draw: '/station/draw',
   prizes: '/station/prizes',
   bar: '/station/bar',
+  mc: '/station/mc',
   admin: '/admin',
 };
```

```diff
diff --git a/src/components/Hub.tsx b/src/components/Hub.tsx
--- a/src/components/Hub.tsx
+++ b/src/components/Hub.tsx
@@ -4,13 +4,14 @@ import type { ReactNode } from 'react';
 import { useI18n } from '@/lib/i18n';
 import type { StringKey } from '@/lib/i18n/strings';
 
-type Card = { href: string; key: 'checkin' | 'merchandise' | 'bar' | 'draw' | 'prizes' | 'stage' | 'admin'; tint: string; icon: ReactNode };
+type Card = { href: string; key: 'checkin' | 'merchandise' | 'bar' | 'draw' | 'mc' | 'prizes' | 'stage' | 'admin'; tint: string; icon: ReactNode };
 
 const CARDS: Card[] = [
   { href: '/station/check-in', key: 'checkin', tint: '', icon: <><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><path d="m9 12 2 2 4-4" /></> },
   { href: '/station/merchandise', key: 'merchandise', tint: 'pink', icon: <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></> },
   { href: '/station/bar', key: 'bar', tint: 'green', icon: <><path d="M8 22h8M12 15v7M5 3h14l-1 7a6 6 0 0 1-12 0z" /><path d="M5.5 7h13" /></> },
   { href: '/station/draw', key: 'draw', tint: 'green', icon: <><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></> },
+  { href: '/station/mc', key: 'mc', tint: 'pink', icon: <><rect width="6" height="12" x="9" y="2" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" /></> },
   { href: '/station/prizes', key: 'prizes', tint: '', icon: <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16M10 14.7V17c0 .6-.5 1-1.2 1.2C7.8 18.6 7 20.2 7 22M14 14.7V17c0 .6.5 1 1.2 1.2 1 .4 1.8 2 1.8 3.8" /><path d="M18 2H6v7a6 6 0 0 0 12 0z" /></> },
   { href: '/stage', key: 'stage', tint: 'white', icon: <><rect width="20" height="14" x="2" y="3" rx="2" /><path d="M8 21h8M12 17v4" /></> },
   { href: '/admin', key: 'admin', tint: 'pink', icon: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></> },
```

- [ ] **Step 4: Add the strings**

Create `src/lib/i18n/mc-strings.ts`:

```ts
/**
 * MC cue card strings (spec 2026-11-09). Ops styling: short, upper-case labels the MC can read at arm's length.
 * Script text written by HR is shown as entered and is not translated.
 */
export const MC_ID = {
  'hub.mc': 'MC',
  'hub.mc_sub': 'Rundown, VIP, pax & undian',

  'mc.title': 'MC',
  'mc.tab_rundown': 'RUNDOWN',
  'mc.tab_vip': 'VIP',
  'mc.tab_pax': 'PAX',
  'mc.tab_draw': 'UNDIAN',
  'mc.not_started': 'BELUM MULAI',
  'mc.ended': 'ACARA SELESAI',
  'mc.offline': 'OFFLINE — mencoba lagi',
  'mc.clock': '{elapsed} / {planned} mnt',
  'mc.segment_drift': 'mulai {drift} mnt',
  'mc.show_drift': 'Acara berjalan {drift} mnt',
  'mc.on_time': 'Acara tepat waktu',
  'mc.start': 'MULAI ACARA',
  'mc.next': 'NEXT',
  'mc.next_title': 'Berikutnya: {title}',
  'mc.last_segment': 'Ini segmen terakhir',
  'mc.undrawn_confirm': '{n} hadiah belum diundi — lanjut?',
  'mc.yes_next': 'YA, LANJUT',
  'mc.cancel': 'BATAL',
  'mc.already_advanced': 'Sudah dilanjutkan dari perangkat lain.',
  'mc.no_segments': 'Rundown belum diisi. Minta admin mengisi rundown.',
  'mc.error': 'Gagal. Coba lagi.',
  'mc.planned': '{time} · {min} mnt',
  'mc.pic': 'PIC: {pic}',
  'mc.actual': 'Mulai {start} · selesai {end}',
  'mc.door_prize': 'UNDIAN',
  'mc.no_script': 'Tidak ada naskah.',
  'mc.vip_present_only': 'Hanya yang hadir',
  'mc.vip_bod': 'BOD',
  'mc.vip_hod': 'HOD',
  'mc.vip_arrived': 'HADIR',
  'mc.vip_waiting': 'BELUM DATANG',
  'mc.vip_empty': 'Belum ada BOD/HOD yang ditandai.',
  'mc.vip_none_present': 'Belum ada yang hadir.',
  'mc.pax_total': 'TOTAL HADIR',
  'mc.pax_line': '{in} / {of} · {pct}%',
  'mc.pax_no_dept': 'Tanpa departemen',
  'mc.pax_empty': 'Belum ada data tamu.',
  'mc.draw_not_segment': 'Bukan segmen undian',
  'mc.draw_segment_prizes': 'HADIAH SEGMEN INI',
  'mc.prize_done': 'SELESAI',
  'mc.prize_open': 'SISA {n}',
  'mc.prize_script': 'NASKAH MC',
} as const;

export const MC_EN: Record<keyof typeof MC_ID, string> = {
  'hub.mc': 'MC',
  'hub.mc_sub': 'Rundown, VIPs, pax & draw',

  'mc.title': 'MC',
  'mc.tab_rundown': 'RUNDOWN',
  'mc.tab_vip': 'VIP',
  'mc.tab_pax': 'PAX',
  'mc.tab_draw': 'DRAW',
  'mc.not_started': 'NOT STARTED',
  'mc.ended': 'SHOW ENDED',
  'mc.offline': 'OFFLINE — retrying',
  'mc.clock': '{elapsed} / {planned} min',
  'mc.segment_drift': 'started {drift} min',
  'mc.show_drift': 'Show running {drift} min',
  'mc.on_time': 'Show on time',
  'mc.start': 'START SHOW',
  'mc.next': 'NEXT',
  'mc.next_title': 'Next: {title}',
  'mc.last_segment': 'This is the last segment',
  'mc.undrawn_confirm': '{n} prizes not drawn yet — continue?',
  'mc.yes_next': 'YES, CONTINUE',
  'mc.cancel': 'CANCEL',
  'mc.already_advanced': 'Already moved on from another device.',
  'mc.no_segments': 'The rundown is empty. Ask an admin to fill it in.',
  'mc.error': 'Failed. Try again.',
  'mc.planned': '{time} · {min} min',
  'mc.pic': 'PIC: {pic}',
  'mc.actual': 'Started {start} · ended {end}',
  'mc.door_prize': 'DRAW',
  'mc.no_script': 'No script.',
  'mc.vip_present_only': 'Present only',
  'mc.vip_bod': 'BOD',
  'mc.vip_hod': 'HOD',
  'mc.vip_arrived': 'ARRIVED',
  'mc.vip_waiting': 'NOT YET',
  'mc.vip_empty': 'No BOD/HOD tagged yet.',
  'mc.vip_none_present': 'Nobody has arrived yet.',
  'mc.pax_total': 'TOTAL PRESENT',
  'mc.pax_line': '{in} / {of} · {pct}%',
  'mc.pax_no_dept': 'No department',
  'mc.pax_empty': 'No guest data yet.',
  'mc.draw_not_segment': 'Not a draw segment',
  'mc.draw_segment_prizes': 'PRIZES IN THIS SEGMENT',
  'mc.prize_done': 'DONE',
  'mc.prize_open': '{n} LEFT',
  'mc.prize_script': 'MC LINE',
};
```

Wire them into `src/lib/i18n/strings.ts`:

```diff
diff --git a/src/lib/i18n/strings.ts b/src/lib/i18n/strings.ts
--- a/src/lib/i18n/strings.ts
+++ b/src/lib/i18n/strings.ts
@@ -1,5 +1,6 @@
 import { DRAW_EN, DRAW_ID } from './draw-strings';
 import { INVITE_EN, INVITE_ID } from './invite-strings';
+import { MC_EN, MC_ID } from './mc-strings';
 
 export type Lang = 'id' | 'en';
 
@@ -161,6 +162,7 @@ const id = {
   'hub.admin_sub': 'Tamu, hadiah & laporan',
   ...DRAW_ID,
   ...INVITE_ID,
+  ...MC_ID,
 } as const;
 
 export type StringKey = keyof typeof id;
@@ -323,6 +325,7 @@ const en: Record<StringKey, string> = {
   'hub.admin_sub': 'Guests, prizes & reports',
   ...DRAW_EN,
   ...INVITE_EN,
+  ...MC_EN,
 };
 
 export const STRINGS: Record<Lang, Record<StringKey, string>> = { id, en };
```

- [ ] **Step 5: Write the MC logic**

Create `src/lib/mc.ts`:

```ts
/** MC cue card: types for `mc_state`, `mc_vip`, `mc_pax` (SQL) and the pure logic the MC screen runs on them. */

export type SegmentPrize = {
  id: string; name: string; tier: string | null; quantity: number; mc_script: string | null;
  confirmed: number; remaining: number; winners: string[];
};
export type Segment = {
  id: string; sort_order: number; title: string; planned_start: string; duration_min: number;
  pic: string | null; script: string | null; kind: 'normal' | 'door_prize';
  started_at: string | null; ended_at: string | null; prizes: SegmentPrize[];
};
export type McPhase = 'not_started' | 'running' | 'ended';
export type McState = {
  server_now: string; phase: McPhase; current_segment_id: string | null; current_started_at: string | null; segments: Segment[];
};
export type SegmentStatus = 'done' | 'current' | 'upcoming';

export type VipRow = {
  id: string; tier: 'BOD' | 'HOD'; title: string | null; full_name: string; phonetic: string | null;
  position: string | null; outlet: string; protocol_order: number | null; arrived: boolean; arrived_at: string | null;
};
export type PaxRow = { outlet: string; department: string | null; invited: number; checked_in: number };
export type PaxCount = { invited: number; checked_in: number };
export type PaxOutlet = PaxCount & { outlet: string; departments: PaxRow[] };

export function segmentStatus(seg: Segment, currentId: string | null): SegmentStatus {
  if (seg.id === currentId) return 'current';
  return seg.ended_at ? 'done' : 'upcoming';
}

export const currentSegment = (s: McState): Segment | null => s.segments.find((x) => x.id === s.current_segment_id) ?? null;

/** The segment NEXT will open: the first one before the show, the one after the current one while it runs. */
export function nextSegment(s: McState): Segment | null {
  if (s.phase === 'ended') return null;
  if (s.phase === 'not_started') return s.segments[0] ?? null;
  const i = s.segments.findIndex((x) => x.id === s.current_segment_id);
  return i >= 0 ? (s.segments[i + 1] ?? null) : null;
}

/** Whole minutes a segment started after (positive) or before (negative) its planned time. */
export const driftMinutes = (plannedIso: string, startedIso: string): number =>
  Math.round((Date.parse(startedIso) - Date.parse(plannedIso)) / 60_000);

/** "+7", "-3", "0". */
export const formatDrift = (min: number): string => (min > 0 ? `+${min}` : String(min));

/** Server clock minus phone clock, so timers follow the server even when a phone's clock is wrong. */
export const clockOffset = (serverNowIso: string, clientNowMs: number): number => Date.parse(serverNowIso) - clientNowMs;

export const elapsedSeconds = (startedIso: string, clientNowMs: number, offsetMs: number): number =>
  Math.max(0, Math.floor((clientNowMs + offsetMs - Date.parse(startedIso)) / 1000));

/** "3:07", "12:00", "75:30". */
export const formatClock = (sec: number): string => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

export const pct = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Prize slots in a segment that are not yet drawn or waiting (no-shows free their slot again). */
export const undrawnCount = (seg: Segment): number => seg.prizes.reduce((n, p) => n + Math.max(0, p.remaining), 0);

/** Most checked in first, then by name. */
const mostPresent = (name: (x: PaxCount) => string) => (a: PaxCount, b: PaxCount) =>
  b.checked_in - a.checked_in || name(a).localeCompare(name(b));

/** Total, then outlets by most checked in (then name), each with its departments in the same order. */
export function groupPax(rows: PaxRow[]): { total: PaxCount; outlets: PaxOutlet[] } {
  const map = new Map<string, PaxOutlet>();
  for (const r of rows) {
    const o = map.get(r.outlet) ?? { outlet: r.outlet, invited: 0, checked_in: 0, departments: [] };
    o.invited += r.invited;
    o.checked_in += r.checked_in;
    o.departments.push(r);
    map.set(r.outlet, o);
  }
  const outlets = [...map.values()].sort(mostPresent((x) => (x as PaxOutlet).outlet));
  for (const o of outlets) o.departments.sort(mostPresent((x) => (x as PaxRow).department ?? ''));
  const total = outlets.reduce((t, o) => ({ invited: t.invited + o.invited, checked_in: t.checked_in + o.checked_in }), { invited: 0, checked_in: 0 });
  return { total, outlets };
}

/** BOD and HOD in the order the server sent (protocol order), optionally only those who have arrived. */
export function vipGroups(rows: VipRow[], presentOnly: boolean): { BOD: VipRow[]; HOD: VipRow[] } {
  const shown = presentOnly ? rows.filter((r) => r.arrived) : rows;
  return { BOD: shown.filter((r) => r.tier === 'BOD'), HOD: shown.filter((r) => r.tier === 'HOD') };
}

/** "Ibu Dewi" — title and name as the MC says them. */
export const vipName = (r: Pick<VipRow, 'title' | 'full_name'>): string => [r.title, r.full_name].filter(Boolean).join(' ');
```

- [ ] **Step 6: Run the tests and the type check**

Run: `npm run test:unit && npx tsc --noEmit`
Expected: PASS (227 tests), `tsc` prints nothing. The settings page now lists an **MC cue card** PIN row automatically (it maps over `ROLES`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/session.ts src/lib/admin-text.ts tests/unit/admin-text.test.ts src/app/station/page.tsx src/components/Hub.tsx \
  src/lib/i18n/mc-strings.ts src/lib/i18n/strings.ts src/lib/mc.ts tests/unit/mc.test.ts
git commit -m "feat(mc): mc role, MC strings and cue card logic"
```

---

### Task 5: MC station endpoints; draw endpoints accept `mc`

**Files:**
- Create: `src/app/api/station/mc/state/route.ts`, `next/route.ts`, `vip/route.ts`, `pax/route.ts`
- Modify: `src/app/api/station/draw/current/route.ts`, `draw/route.ts`, `draw/resolve/route.ts`, `draw/stage/route.ts`, `src/app/api/station/prizes/route.ts`, `prizes/lookup-number/route.ts`

**Interfaces:**
- Consumes: `mc_state`, `mc_next`, `mc_vip`, `mc_pax` (Tasks 1–2); `stationGet`, `stationPost`, `actorId` (existing).
- Produces:
  - `GET /api/station/mc/state` → `{ok, status: 'OK', data: McState}` (role `mc` or admin)
  - `POST /api/station/mc/next` body `{from_segment_id: uuid | null}` → `{ok, status, data: {status, state}}`
  - `GET /api/station/mc/vip` → `data: {status, vips: VipRow[]}`; `GET /api/station/mc/pax` → `data: {status, rows: PaxRow[]}`
  - Role `mc` accepted on all six draw/prize routes.

- [ ] **Step 1: Create the four MC routes**

`src/app/api/station/mc/state/route.ts`:

```ts
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { stationGet } from '@/lib/routes';

export const GET = stationGet(['mc'], async () => ok('OK', await rpc('mc_state', { p_event: env().EVENT_ID })));
```

`src/app/api/station/mc/next/route.ts`:

```ts
import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, stationPost } from '@/lib/routes';

// from_segment_id is the segment this device shows as current (null before the show). A stale device gets
// ALREADY_ADVANCED with the live state, so two MCs tapping NEXT together never skip a segment.
const schema = z.object({ from_segment_id: z.string().uuid().nullable() });

export const POST = stationPost(['mc'], schema, async ({ actor, body }) => {
  const r = await rpc<{ status: string }>('mc_next', {
    p_event: env().EVENT_ID, p_from: body.from_segment_id, p_actor: actorId(actor),
  });
  return ok(r.status, r);
});
```

`src/app/api/station/mc/vip/route.ts`:

```ts
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { stationGet } from '@/lib/routes';

export const GET = stationGet(['mc'], async () => ok('OK', await rpc('mc_vip', { p_event: env().EVENT_ID })));
```

`src/app/api/station/mc/pax/route.ts`:

```ts
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { stationGet } from '@/lib/routes';

export const GET = stationGet(['mc'], async () => ok('OK', await rpc('mc_pax', { p_event: env().EVENT_ID })));
```

- [ ] **Step 2: Let the MC role use the draw routes**

One literal per file:

```diff
diff --git a/src/app/api/station/draw/current/route.ts b/src/app/api/station/draw/current/route.ts
--- a/src/app/api/station/draw/current/route.ts
+++ b/src/app/api/station/draw/current/route.ts
@@ -3,7 +3,7 @@ import { rpc } from '@/lib/db';
 import { env } from '@/lib/env';
 import { stationGet } from '@/lib/routes';
 
-export const GET = stationGet(['draw', 'prizes'], async () => {
+export const GET = stationGet(['draw', 'prizes', 'mc'], async () => {
   const r = await rpc<Record<string, unknown>>('draw_current', { p_event: env().EVENT_ID });
   return ok('OK', r);
 });
```

```diff
diff --git a/src/app/api/station/draw/route.ts b/src/app/api/station/draw/route.ts
--- a/src/app/api/station/draw/route.ts
+++ b/src/app/api/station/draw/route.ts
@@ -6,7 +6,7 @@ import { actorId, stationPost } from '@/lib/routes';
 
 const schema = z.object({ prize_id: z.string().uuid(), request_id: z.string().uuid() });
 
-export const POST = stationPost(['draw'], schema, async ({ actor, body }) => {
+export const POST = stationPost(['draw', 'mc'], schema, async ({ actor, body }) => {
   const r = await rpc<{ status: string }>('draw_prize', {
     p_event: env().EVENT_ID, p_prize_id: body.prize_id, p_request_id: body.request_id, p_actor: actorId(actor),
   });
```

```diff
diff --git a/src/app/api/station/draw/resolve/route.ts b/src/app/api/station/draw/resolve/route.ts
--- a/src/app/api/station/draw/resolve/route.ts
+++ b/src/app/api/station/draw/resolve/route.ts
@@ -9,7 +9,7 @@ const schema = z.union([
   z.object({ round_id: z.string().uuid(), outcome: z.literal('confirm_all') }),
 ]);
 
-export const POST = stationPost(['draw', 'prizes'], schema, async ({ actor, body }) => {
+export const POST = stationPost(['draw', 'prizes', 'mc'], schema, async ({ actor, body }) => {
   const r =
     'draw_id' in body
       ? await rpc<{ status: string }>('resolve_draw', {
```

```diff
diff --git a/src/app/api/station/draw/stage/route.ts b/src/app/api/station/draw/stage/route.ts
--- a/src/app/api/station/draw/stage/route.ts
+++ b/src/app/api/station/draw/stage/route.ts
@@ -8,7 +8,7 @@ const schema = z
   .object({ phase: z.enum(['idle', 'intro']), prize_id: z.string().uuid().optional() })
   .refine((b) => b.phase === 'idle' || !!b.prize_id);
 
-export const POST = stationPost(['draw'], schema, async ({ actor, body }) => {
+export const POST = stationPost(['draw', 'mc'], schema, async ({ actor, body }) => {
   const r = await rpc<{ status: string }>('set_stage', {
     p_event: env().EVENT_ID, p_phase: body.phase, p_prize_id: body.prize_id ?? null, p_actor: actorId(actor),
   });
```

```diff
diff --git a/src/app/api/station/prizes/route.ts b/src/app/api/station/prizes/route.ts
--- a/src/app/api/station/prizes/route.ts
+++ b/src/app/api/station/prizes/route.ts
@@ -3,7 +3,7 @@ import { rpc } from '@/lib/db';
 import { env } from '@/lib/env';
 import { stationGet } from '@/lib/routes';
 
-export const GET = stationGet(['draw', 'prizes'], async () => {
+export const GET = stationGet(['draw', 'prizes', 'mc'], async () => {
   const r = await rpc<{ prizes: unknown[] }>('prize_list', { p_event: env().EVENT_ID });
   return ok('OK', { prizes: r.prizes });
 });
```

```diff
diff --git a/src/app/api/station/prizes/lookup-number/route.ts b/src/app/api/station/prizes/lookup-number/route.ts
--- a/src/app/api/station/prizes/lookup-number/route.ts
+++ b/src/app/api/station/prizes/lookup-number/route.ts
@@ -6,7 +6,7 @@ import { stationPost } from '@/lib/routes';
 
 const schema = z.object({ number: z.number().int().min(1).max(100_000) });
 
-export const POST = stationPost(['draw', 'prizes'], schema, async ({ body }) => {
+export const POST = stationPost(['draw', 'prizes', 'mc'], schema, async ({ body }) => {
   const r = await rpc<{ status: string }>('lookup_prize_number', { p_event: env().EVENT_ID, p_number: body.number });
   return ok(r.status, r);
 });
```

- [ ] **Step 3: Check**

Run: `npx tsc --noEmit && npx eslint src/app/api/station`
Expected: no output from `tsc`, no eslint problems.

Review by eye: `grep -rn "stationGet(\|stationPost(" src/app/api/station/{draw,prizes,mc}` — every line lists `'mc'`, and `/api/station/mc/*` lists **only** `'mc'` (admin always passes `authStation`).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/station/mc src/app/api/station/draw src/app/api/station/prizes
git commit -m "feat(mc): MC station endpoints; draw endpoints accept the mc role"
```

---

### Task 6: Draw controls as a reusable component

The Draw tab must reuse the existing draw screen unchanged. Today all of it lives in `src/app/station/draw/page.tsx`. Move the body into `DrawOperator`, add an optional prize filter and show the prize's MC line; the page becomes a thin wrapper. Behaviour of `/station/draw` does not change.

**Files:**
- Create: `src/components/station/DrawOperator.tsx`
- Modify: `src/app/station/draw/page.tsx` (replaced), `src/lib/prizes.ts`, `src/styles/operator.css`

**Interfaces:**
- Consumes: everything the draw page used (`useCurrent`, `draw-ui`, `operator`, `prizes`, `WinnerCard`), `mc.prize_script` string (Task 4), `PrizeRow.mc_script` (from `prize_list`, Task 2).
- Produces: `DrawOperator({ prizeFilter?: string[] | null })` — renders `<div className="op">…</div>` without a shell; must only be rendered after the station session has loaded. A change in `prizeFilter` resets the picked prize to the first open one in the filter.

- [ ] **Step 1: Add `mc_script` to `PrizeRow`**

```diff
diff --git a/src/lib/prizes.ts b/src/lib/prizes.ts
--- a/src/lib/prizes.ts
+++ b/src/lib/prizes.ts
@@ -12,6 +12,8 @@ export type PrizeRow = {
   admin_voids: number;
   remaining: number;
   has_draws: boolean;
+  /** Optional line the MC reads for this prize (sponsor mention). */
+  mc_script?: string | null;
 };
 
 export const firstOpenPrize = (prizes: PrizeRow[]): string | null => prizes.find((p) => p.remaining > 0)?.id ?? null;
```

- [ ] **Step 2: Create the component**

Create `src/components/station/DrawOperator.tsx` (the old page body; changes: no `useStation`/`StationShell`, `useCurrent(true)`, the `shown` list replaces `prizes` in the picker and the first-open effect, the filter-reset effect, and the MC line under the picker):

```tsx
'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { padPrize } from '@/components/pass/PrizeNumber';
import { WinnerCard } from '@/components/station/WinnerCard';
import { api } from '@/lib/client';
import { heartbeatState, pendingDraws, requestIds, secondsLeft } from '@/lib/draw-ui';
import { useI18n } from '@/lib/i18n';
import type { StringKey } from '@/lib/i18n/strings';
import { drawProblem, roundKey, screenFor } from '@/lib/operator';
import { firstOpenPrize, prizeLabel, type PrizeRow } from '@/lib/prizes';
import { useCurrent } from '@/lib/use-current';
import '@/styles/operator.css';

type Resolve = { draw_id: string; outcome: 'confirm' | 'no_show' } | { round_id: string; outcome: 'confirm_all' };
const LINK_TEXT: Record<'ok' | 'down' | 'never', StringKey> = { ok: 'draw.stage_ok', down: 'draw.stage_down', never: 'draw.stage_never' };

/**
 * The MC's draw controls. Used by /station/draw and by the Draw tab of the MC cue card (/station/mc).
 * `prizeFilter` limits the prize picker to the current rundown segment's prizes (null: every prize).
 * The parent renders this only once the station session is loaded.
 */
export function DrawOperator({ prizeFilter = null }: { prizeFilter?: string[] | null }) {
  const { t } = useI18n();
  const { current, offline, reload } = useCurrent(true);
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
    loadPrizes();
    const id = setInterval(loadPrizes, 10_000);
    return () => clearInterval(id);
  }, [loadPrizes]);

  // A new rundown segment brings a new prize list: start again on its first open prize.
  const filterKey = prizeFilter ? prizeFilter.join(',') : '';
  const shown = useMemo(
    () => (filterKey ? prizes.filter((p) => filterKey.split(',').includes(p.id)) : prizes),
    [prizes, filterKey],
  );
  useEffect(() => {
    setPrizeId(null);
  }, [filterKey]);

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
    if (prizeId === null && shown.length > 0) setPrizeId(firstOpenPrize(shown) ?? shown[0].id);
  }, [prizeId, shown]);

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

  const link = heartbeatState(current?.heartbeat_age);
  const left = secondsLeft(current?.oldest_pending_at ?? null, now);
  const selected = prizes.find((p) => p.id === prizeId) ?? null;
  const batch = !!round?.prize.batch;
  const prizeLine = round ? prizeLabel(round.prize) : '';

  return (
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
          {shown.length === 0 ? (
            <p className="op__muted">{t('draw.no_prizes')}</p>
          ) : (
            <>
              <h2>{t('draw.pick_prize')}</h2>
              <div className="choices">
                {shown.map((p) => (
                  <button key={p.id} type="button" className="choice" aria-pressed={p.id === prizeId} disabled={p.remaining === 0}
                    onClick={() => setPrizeId(p.id)}>
                    {prizeLabel(p)}
                    <small>{t('draw.prize_left', { n: p.remaining, total: p.quantity })}</small>
                  </button>
                ))}
              </div>
              {selected?.mc_script && (
                <div className="op__script"><b>{t('mc.prize_script')}</b>{selected.mc_script}</div>
              )}
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
  );
}
```

- [ ] **Step 3: Replace the draw page**

Replace the whole of `src/app/station/draw/page.tsx` with:

```tsx
'use client';
import { DrawOperator } from '@/components/station/DrawOperator';
import { StationShell } from '@/components/station/StationShell';
import { useI18n } from '@/lib/i18n';
import { useStation } from '@/lib/use-station';

export default function DrawStation() {
  const { me } = useStation('draw');
  const { t } = useI18n();
  if (!me) return null;
  return (
    <StationShell title={t('draw.title')} me={me}>
      <DrawOperator />
    </StationShell>
  );
}
```

- [ ] **Step 4: Style the MC line**

Append to `src/styles/operator.css`:

```diff
diff --git a/src/styles/operator.css b/src/styles/operator.css
--- a/src/styles/operator.css
+++ b/src/styles/operator.css
@@ -41,3 +41,6 @@
 .btn-confirm:disabled, .btn-noshow:disabled { opacity: .4; }
 .winner--compact .btn-confirm, .winner--compact .btn-noshow { font-size: 18px; }
 .btn-confirm--wide { width: 100%; }
+
+.op__script { padding: 10px 14px; border: 2px dashed var(--nf-gold); border-radius: 12px; color: var(--nf-text); font-size: 16px; line-height: 1.35; white-space: pre-wrap; }
+.op__script b { display: block; font-family: var(--nf-font-label); font-weight: 600; font-size: 12px; letter-spacing: .16em; color: var(--nf-gold); }
```

- [ ] **Step 5: Check**

Run: `npx tsc --noEmit && npx eslint src/components/station src/app/station/draw && npm run test:unit`
Expected: clean; 227 tests pass.

Manual (dev server, `npm run dev`, draw PIN): `/station/draw` looks and behaves exactly as before; a prize with an MC line shows it in a dashed gold box under the prize picker.

- [ ] **Step 6: Commit**

```bash
git add src/components/station/DrawOperator.tsx src/app/station/draw/page.tsx src/lib/prizes.ts src/styles/operator.css
git commit -m "refactor(draw): move the draw controls into DrawOperator; show prize MC lines"
```

---

### Task 7: The MC screen (`/station/mc`)

**Files:**
- Create: `src/lib/use-mc.ts`, `src/components/mc/McHeader.tsx`, `RundownTab.tsx`, `VipTab.tsx`, `PaxTab.tsx`, `DrawTab.tsx`, `src/app/station/mc/page.tsx`, `src/styles/mc.css`

**Interfaces:**
- Consumes: Task 4 (`@/lib/mc`, strings), Task 5 endpoints, Task 6 `DrawOperator`, `StationShell`, `useStation`, `useLoad`, `api`, `formatTimeWita`, `prizeLabel`.
- Produces:
  - `useMcState(enabled, intervalMs = 2000) → {state, offset, offline, reload, apply}` — `apply(state)` is used after NEXT so the tapping phone updates at once.
  - Page `/station/mc`. All four tabs stay mounted (`hidden` when not selected) so the draw keeps its state and polling while the MC reads another tab. When a door-prize segment becomes current, every MC phone switches to the Draw tab once.

- [ ] **Step 1: Polling hook**

Create `src/lib/use-mc.ts`:

```ts
'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from './client';
import { clockOffset, type McState } from './mc';

/**
 * The MC's view of the rundown. Polls every 2 seconds, like the draw operator, and never depends on Realtime.
 * Keeps the last good state when the network drops. `offset` is the server clock minus this phone's clock.
 */
export function useMcState(enabled: boolean, intervalMs = 2_000) {
  const [state, setState] = useState<McState | null>(null);
  const [offset, setOffset] = useState(0);
  const [offline, setOffline] = useState(false);

  const apply = useCallback((s: McState) => {
    setState(s);
    setOffset(clockOffset(s.server_now, Date.now()));
    setOffline(false);
  }, []);

  const reload = useCallback(async () => {
    const r = await api<McState>('/api/station/mc/state');
    if (r.http === 401 || r.http === 403) {
      window.location.href = '/station';
      return;
    }
    if (r.ok && r.data) apply(r.data);
    else setOffline(true);
  }, [apply]);

  useEffect(() => {
    if (!enabled) return;
    reload();
    const id = setInterval(reload, intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, reload]);

  return { state, offset, offline, reload, apply };
}
```

- [ ] **Step 2: Header (every tab)**

Create `src/components/mc/McHeader.tsx`:

```tsx
'use client';
import { useI18n } from '@/lib/i18n';
import { currentSegment, driftMinutes, elapsedSeconds, formatClock, formatDrift, type McState } from '@/lib/mc';

/** Shown on every tab: the current segment, its clock against the plan, and how late it started. */
export function McHeader({ state, offset, now, offline }: { state: McState | null; offset: number; now: number; offline: boolean }) {
  const { t } = useI18n();
  const seg = state ? currentSegment(state) : null;
  const elapsed = state?.current_started_at ? elapsedSeconds(state.current_started_at, now, offset) : 0;
  const over = !!seg && elapsed > seg.duration_min * 60;
  const drift = seg?.started_at ? driftMinutes(seg.planned_start, seg.started_at) : 0;

  return (
    <div className="mc-head">
      {offline && <div className="mc-head__offline" role="status">{t('mc.offline')}</div>}
      {!state || state.phase === 'not_started' ? (
        <div className="mc-head__title">{t('mc.not_started')}</div>
      ) : state.phase === 'ended' || !seg ? (
        <div className="mc-head__title">{t('mc.ended')}</div>
      ) : (
        <>
          <div className="mc-head__title">▶ {seg.title}</div>
          <div className="mc-head__meta">
            <span className={over ? 'mc-head__clock mc-head__clock--over' : 'mc-head__clock'}>
              {t('mc.clock', { elapsed: formatClock(elapsed), planned: seg.duration_min })}
            </span>
            <span className={drift > 0 ? 'mc-head__drift mc-head__drift--late' : 'mc-head__drift'}>
              {t('mc.segment_drift', { drift: formatDrift(drift) })}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Rundown tab**

Create `src/components/mc/RundownTab.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import { useI18n } from '@/lib/i18n';
import {
  currentSegment, driftMinutes, formatDrift, nextSegment, segmentStatus, undrawnCount, type McState, type Segment,
} from '@/lib/mc';
import { formatTimeWita } from '@/lib/time';

function Row({ seg, status, open, onToggle }: { seg: Segment; status: string; open: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  const showScript = status === 'current' || open;
  return (
    <li className={`mc-seg mc-seg--${status}`}>
      <button type="button" className="mc-seg__head" onClick={onToggle} aria-expanded={showScript}>
        <span className="mc-seg__time">{formatTimeWita(seg.planned_start)}</span>
        <span className="mc-seg__title">
          {seg.title}
          {seg.kind === 'door_prize' && <span className="mc-badge">{t('mc.door_prize')}</span>}
        </span>
        <span className="mc-seg__dur">{seg.duration_min}&apos;</span>
      </button>
      {seg.pic && <div className="mc-seg__pic">{t('mc.pic', { pic: seg.pic })}</div>}
      {status === 'done' && seg.started_at && seg.ended_at && (
        <div className="mc-seg__pic">{t('mc.actual', { start: formatTimeWita(seg.started_at), end: formatTimeWita(seg.ended_at) })}</div>
      )}
      {showScript && <div className="mc-seg__script">{seg.script || t('mc.no_script')}</div>}
    </li>
  );
}

/** Live run-sheet. NEXT moves exactly one segment forward; there is no back button (an admin corrects mistakes). */
export function RundownTab({ state, onState }: { state: McState | null; onState: (s: McState) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState('');

  if (!state) return null;
  const cur = currentSegment(state);
  const upcoming = nextSegment(state);
  const undrawn = cur?.kind === 'door_prize' ? undrawnCount(cur) : 0;
  const drift = cur?.started_at ? driftMinutes(cur.planned_start, cur.started_at) : 0;

  async function next() {
    if (busy || !state) return;
    setBusy(true);
    setNote('');
    const r = await api<{ state?: McState }>('/api/station/mc/next', { from_segment_id: state.current_segment_id });
    setBusy(false);
    setConfirming(false);
    if (r.data?.state) onState(r.data.state);
    if (r.status === 'ALREADY_ADVANCED') setNote(t('mc.already_advanced'));
    else if (r.status === 'NO_SEGMENTS') setNote(t('mc.no_segments'));
    else if (!r.ok) setNote(t('mc.error')); // safe to tap again: the server only moves on from this segment once
  }

  function toggle(id: string) {
    setOpen((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  return (
    <div className="mc-tab">
      {state.phase === 'running' && (
        <p className={drift > 0 ? 'mc-drift mc-drift--late' : 'mc-drift'}>
          {drift === 0 ? t('mc.on_time') : t('mc.show_drift', { drift: formatDrift(drift) })}
        </p>
      )}
      {state.segments.length === 0 ? (
        <p className="op__muted">{t('mc.no_segments')}</p>
      ) : (
        <ol className="mc-list">
          {state.segments.map((s) => (
            <Row key={s.id} seg={s} status={segmentStatus(s, state.current_segment_id)} open={open.has(s.id)} onToggle={() => toggle(s.id)} />
          ))}
        </ol>
      )}

      {state.phase !== 'ended' && state.segments.length > 0 && (
        <div className="mc-next">
          {note && <p role="alert" className="error">{note}</p>}
          {confirming ? (
            <div className="mc-confirm">
              <p>{t('mc.undrawn_confirm', { n: undrawn })}</p>
              <div className="op__row">
                <button type="button" className="btn--staff btn--staff-dark" disabled={busy} onClick={() => setConfirming(false)}>{t('mc.cancel')}</button>
                <button type="button" className="btn--staff" disabled={busy} onClick={next}>{t('mc.yes_next')}</button>
              </div>
            </div>
          ) : (
            <>
              <p className="mc-next__hint">{upcoming ? t('mc.next_title', { title: upcoming.title }) : t('mc.last_segment')}</p>
              <button type="button" className="btn--staff mc-next__btn" disabled={busy}
                onClick={() => (undrawn > 0 ? setConfirming(true) : next())}>
                {state.phase === 'not_started' ? t('mc.start') : t('mc.next')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: VIP tab**

Create `src/components/mc/VipTab.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { vipGroups, vipName, type VipRow } from '@/lib/mc';
import { useLoad } from '@/lib/use-load';

function Group({ label, rows }: { label: string; rows: VipRow[] }) {
  const { t } = useI18n();
  if (rows.length === 0) return null;
  return (
    <section>
      <h2>{label}</h2>
      <ul className="mc-list">
        {rows.map((r) => (
          <li key={r.id} className={r.arrived ? 'mc-vip' : 'mc-vip mc-vip--waiting'}>
            <div className="mc-vip__name">{vipName(r)}</div>
            {r.phonetic && <div className="mc-vip__say">“{r.phonetic}”</div>}
            <div className="mc-vip__meta">{[r.position, r.outlet].filter(Boolean).join(' · ')}</div>
            <span className={r.arrived ? 'mc-badge mc-badge--green' : 'mc-badge'}>{r.arrived ? t('mc.vip_arrived') : t('mc.vip_waiting')}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** BOD then HOD, in protocol order. "Present only" is on by default so the MC can read straight down the list. */
export function VipTab() {
  const { t } = useI18n();
  const { data } = useLoad<{ vips: VipRow[] }>('/api/station/mc/vip', 10_000);
  const [presentOnly, setPresentOnly] = useState(true);
  const rows = data?.vips ?? [];
  const g = vipGroups(rows, presentOnly);

  return (
    <div className="mc-tab">
      <label className="mc-toggle">
        <input type="checkbox" checked={presentOnly} onChange={(e) => setPresentOnly(e.target.checked)} />
        {t('mc.vip_present_only')}
      </label>
      {rows.length === 0 ? (
        <p className="op__muted">{t('mc.vip_empty')}</p>
      ) : g.BOD.length + g.HOD.length === 0 ? (
        <p className="op__muted">{t('mc.vip_none_present')}</p>
      ) : (
        <>
          <Group label={t('mc.vip_bod')} rows={g.BOD} />
          <Group label={t('mc.vip_hod')} rows={g.HOD} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Pax tab**

Create `src/components/mc/PaxTab.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { groupPax, pct, type PaxRow } from '@/lib/mc';
import { useLoad } from '@/lib/use-load';

/** Live attendance: total on top, outlets by most present; tap an outlet for its departments. */
export function PaxTab() {
  const { t } = useI18n();
  const { data } = useLoad<{ rows: PaxRow[] }>('/api/station/mc/pax', 10_000);
  const [openOutlet, setOpenOutlet] = useState<string | null>(null);
  const { total, outlets } = groupPax(data?.rows ?? []);
  const line = (c: { invited: number; checked_in: number }) =>
    t('mc.pax_line', { in: c.checked_in, of: c.invited, pct: pct(c.checked_in, c.invited) });

  return (
    <div className="mc-tab">
      <div className="mc-total">
        <b>{t('mc.pax_total')}</b>
        <span>{line(total)}</span>
      </div>
      {outlets.length === 0 ? (
        <p className="op__muted">{t('mc.pax_empty')}</p>
      ) : (
        <ul className="mc-list">
          {outlets.map((o) => (
            <li key={o.outlet} className="mc-pax">
              <button type="button" className="mc-pax__row" aria-expanded={openOutlet === o.outlet}
                onClick={() => setOpenOutlet(openOutlet === o.outlet ? null : o.outlet)}>
                <span className="mc-pax__name">{o.outlet}</span>
                <span className="mc-pax__num">{line(o)}</span>
              </button>
              {openOutlet === o.outlet && (
                <ul className="mc-pax__depts">
                  {o.departments.map((d) => (
                    <li key={d.department ?? '-'}>
                      <span>{d.department ?? t('mc.pax_no_dept')}</span>
                      <span>{line(d)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Draw tab**

Create `src/components/mc/DrawTab.tsx`:

```tsx
'use client';
import { DrawOperator } from '@/components/station/DrawOperator';
import { useI18n } from '@/lib/i18n';
import { currentSegment, type McState } from '@/lib/mc';
import { prizeLabel } from '@/lib/prizes';

/** The existing draw controls, limited to the current door-prize segment's prizes, with that segment's progress above. */
export function DrawTab({ state }: { state: McState | null }) {
  const { t } = useI18n();
  const seg = state ? currentSegment(state) : null;
  const inDraw = seg?.kind === 'door_prize' && seg.prizes.length > 0;

  return (
    <>
      {inDraw ? (
        <div className="mc-tab mc-tab--tight">
          <h2>{t('mc.draw_segment_prizes')}</h2>
          <ul className="mc-list">
            {seg.prizes.map((p) => (
              <li key={p.id} className={p.remaining <= 0 ? 'mc-prize mc-prize--done' : 'mc-prize'}>
                <span className="mc-prize__name">{prizeLabel(p)}</span>
                <span className={p.remaining <= 0 ? 'mc-badge mc-badge--green' : 'mc-badge'}>
                  {p.remaining <= 0 ? t('mc.prize_done') : t('mc.prize_open', { n: p.remaining })}
                </span>
                {p.winners.length > 0 && <div className="mc-prize__winners">{p.winners.join(', ')}</div>}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mc-notice">{t('mc.draw_not_segment')}</p>
      )}
      <DrawOperator prizeFilter={inDraw ? seg.prizes.map((p) => p.id) : null} />
    </>
  );
}
```

- [ ] **Step 7: Page**

Create `src/app/station/mc/page.tsx`:

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { DrawTab } from '@/components/mc/DrawTab';
import { McHeader } from '@/components/mc/McHeader';
import { PaxTab } from '@/components/mc/PaxTab';
import { RundownTab } from '@/components/mc/RundownTab';
import { VipTab } from '@/components/mc/VipTab';
import { StationShell } from '@/components/station/StationShell';
import { useI18n } from '@/lib/i18n';
import type { StringKey } from '@/lib/i18n/strings';
import { currentSegment } from '@/lib/mc';
import { useMcState } from '@/lib/use-mc';
import { useStation } from '@/lib/use-station';
import '@/styles/operator.css';
import '@/styles/mc.css';

type Tab = 'rundown' | 'vip' | 'pax' | 'draw';
const TABS: { id: Tab; label: StringKey }[] = [
  { id: 'rundown', label: 'mc.tab_rundown' },
  { id: 'vip', label: 'mc.tab_vip' },
  { id: 'pax', label: 'mc.tab_pax' },
  { id: 'draw', label: 'mc.tab_draw' },
];

/**
 * MC cue card (spec 2026-11-09). Every tab stays mounted (hidden when not selected) so the draw keeps its state and
 * polling while the MC reads the VIP list. Any number of MC devices share one live state.
 */
export default function McStation() {
  const { me } = useStation('mc');
  const { t } = useI18n();
  const { state, offset, offline, apply } = useMcState(!!me);
  const [tab, setTab] = useState<Tab>('rundown');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  // When a door-prize segment becomes current (on this device or another), jump to the Draw tab once.
  const seen = useRef<string | null>(null);
  const cur = state ? currentSegment(state) : null;
  useEffect(() => {
    const id = cur?.id ?? null;
    if (id === seen.current) return;
    seen.current = id;
    if (cur?.kind === 'door_prize') setTab('draw');
  }, [cur?.id, cur?.kind]);

  if (!me) return null;
  return (
    <StationShell title={t('mc.title')} me={me}>
      <McHeader state={state} offset={offset} now={now} offline={offline} />
      <div className="mc-body">
        <div hidden={tab !== 'rundown'}><RundownTab state={state} onState={apply} /></div>
        <div hidden={tab !== 'vip'}><VipTab /></div>
        <div hidden={tab !== 'pax'}><PaxTab /></div>
        <div hidden={tab !== 'draw'}><DrawTab state={state} /></div>
      </div>
      <nav className="mc-tabs" aria-label="MC">
        {TABS.map((x) => (
          <button key={x.id} type="button" className="mc-tabs__item" aria-pressed={tab === x.id} onClick={() => setTab(x.id)}>
            {t(x.label)}
          </button>
        ))}
      </nav>
    </StationShell>
  );
}
```

- [ ] **Step 8: Styles**

Create `src/styles/mc.css` (uses only existing `--nf-*` tokens):

```css
/* MC cue card (/station/mc). Ops styling on top of station.css and operator.css. */
.mc-head { position: sticky; top: 0; z-index: 2; padding: 10px var(--nf-gutter); background: var(--nf-card); border-bottom: 3px solid var(--nf-gold); }
.mc-head__offline { margin-bottom: 6px; padding: 4px 10px; border-radius: 8px; background: var(--nf-gold); color: var(--nf-black); font-family: var(--nf-font-label); font-weight: 600; font-size: 13px; letter-spacing: .1em; }
.mc-head__title { font-family: var(--nf-font-heading); font-size: 24px; line-height: 1.1; text-transform: uppercase; overflow-wrap: anywhere; }
.mc-head__meta { display: flex; gap: 14px; margin-top: 4px; font-family: var(--nf-font-label); font-weight: 600; font-size: 15px; letter-spacing: .06em; color: var(--nf-text-soft); }
.mc-head__clock--over, .mc-head__drift--late { color: var(--nf-pink); }

.mc-body { flex: 1; padding-bottom: 72px; }
.mc-tab { padding: var(--nf-gutter); display: flex; flex-direction: column; gap: 14px; }
.mc-tab--tight { padding-bottom: 0; }
.mc-tab h2 { margin: 0 0 8px; font-family: var(--nf-font-label); font-weight: 600; font-size: 14px; letter-spacing: .2em; color: var(--nf-gold); }
.mc-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.mc-badge { display: inline-block; margin-left: 8px; padding: 1px 10px; border-radius: 999px; border: 2px solid var(--nf-gold); color: var(--nf-gold); font-family: var(--nf-font-label); font-weight: 600; font-size: 12px; letter-spacing: .12em; vertical-align: middle; }
.mc-badge--green { border-color: var(--nf-green); color: var(--nf-green); }
.mc-notice { margin: var(--nf-gutter) var(--nf-gutter) 0; padding: 8px 12px; border: 2px dashed var(--nf-line-dash); border-radius: 12px; color: var(--nf-text-muted); font-family: var(--nf-font-label); letter-spacing: .1em; }

/* Rundown */
.mc-drift { margin: 0; font-family: var(--nf-font-label); font-weight: 600; letter-spacing: .08em; color: var(--nf-green); }
.mc-drift--late { color: var(--nf-pink); }
.mc-seg { border: 2px solid var(--nf-line-dash); border-radius: 14px; padding: 10px 12px; }
.mc-seg--done { opacity: .55; }
.mc-seg--current { border-color: var(--nf-gold); background: var(--nf-card); }
.mc-seg__head { width: 100%; display: grid; grid-template-columns: 56px 1fr auto; gap: 10px; align-items: baseline; background: none; border: 0; padding: 0; color: inherit; text-align: left; }
.mc-seg__time, .mc-seg__dur { font-family: var(--nf-font-label); font-weight: 600; font-size: 15px; color: var(--nf-text-soft); }
.mc-seg__title { font-family: var(--nf-font-heading); font-size: 20px; line-height: 1.15; text-transform: uppercase; overflow-wrap: anywhere; }
.mc-seg--current .mc-seg__title { color: var(--nf-gold); }
.mc-seg__pic { margin: 4px 0 0 66px; font-size: 13px; color: var(--nf-text-muted); }
.mc-seg__script { margin-top: 10px; font-size: 18px; line-height: 1.45; white-space: pre-wrap; }
.mc-next { position: sticky; bottom: 72px; display: grid; gap: 8px; padding-top: 8px; background: var(--nf-black); }
.mc-next__hint { margin: 0; color: var(--nf-text-muted); font-size: 14px; }
.mc-next__btn { min-height: 72px; font-size: 28px; }
.mc-confirm p { margin: 0 0 10px; padding: 10px 14px; border: 3px solid var(--nf-pink); border-radius: 12px; color: var(--nf-pink); font-family: var(--nf-font-heading); font-size: 20px; }

/* VIP */
.mc-toggle { display: flex; align-items: center; gap: 10px; min-height: 48px; font-family: var(--nf-font-label); font-weight: 600; letter-spacing: .08em; }
.mc-toggle input { width: 24px; height: 24px; }
.mc-vip { padding: 10px 12px; border: 2px solid var(--nf-green); border-radius: 14px; }
.mc-vip--waiting { border-color: var(--nf-line-dash); opacity: .7; }
.mc-vip__name { font-family: var(--nf-font-heading); font-size: 24px; line-height: 1.1; text-transform: uppercase; overflow-wrap: anywhere; }
.mc-vip__say { color: var(--nf-gold); font-size: 16px; font-style: italic; }
.mc-vip__meta { color: var(--nf-text-soft); font-size: 14px; }
.mc-vip .mc-badge { margin: 6px 0 0; }

/* Pax */
.mc-total { display: flex; justify-content: space-between; align-items: baseline; padding: 12px 14px; border: 3px solid var(--nf-gold); border-radius: 14px; }
.mc-total b { font-family: var(--nf-font-label); letter-spacing: .16em; color: var(--nf-gold); }
.mc-total span { font-family: var(--nf-font-heading); font-size: 26px; }
.mc-pax__row { width: 100%; min-height: 52px; display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 8px 12px; border: 2px solid var(--nf-line-dash); border-radius: 12px; background: none; color: inherit; text-align: left; }
.mc-pax__name { font-family: var(--nf-font-heading); font-size: 18px; text-transform: uppercase; }
.mc-pax__num { font-family: var(--nf-font-label); font-weight: 600; white-space: nowrap; }
.mc-pax__depts { list-style: none; margin: 6px 0 0 14px; padding: 0; display: grid; gap: 4px; font-size: 15px; color: var(--nf-text-soft); }
.mc-pax__depts li { display: flex; justify-content: space-between; gap: 10px; }

/* Draw tab prize progress */
.mc-prize { padding: 8px 12px; border: 2px solid var(--nf-gold); border-radius: 12px; }
.mc-prize--done { border-color: var(--nf-green); opacity: .75; }
.mc-prize__name { font-family: var(--nf-font-heading); font-size: 18px; text-transform: uppercase; }
.mc-prize__winners { margin-top: 2px; font-size: 14px; color: var(--nf-text-soft); }

/* Bottom tab bar */
.mc-tabs { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 520px; display: grid; grid-template-columns: repeat(4, 1fr); background: var(--nf-black); border-top: 2px solid var(--nf-gold); z-index: 3; }
.mc-tabs__item { min-height: 64px; background: none; border: 0; color: var(--nf-gold); font-family: var(--nf-font-label); font-weight: 600; font-size: 14px; letter-spacing: .14em; }
.mc-tabs__item[aria-pressed='true'] { background: var(--nf-gold); color: var(--nf-black); }
```

- [ ] **Step 9: Check**

Run: `npx tsc --noEmit && npx eslint src/components/mc src/app/station/mc src/lib/use-mc.ts && npm run test:unit`
Expected: clean; 227 tests pass.

Manual (dev server against the local Supabase stack with a few segments inserted, MC PIN), at 360 px wide:
- NOT STARTED → START SHOW → header shows the first segment, its clock and drift.
- NEXT moves one segment; a second phone follows within 2 s; tapping NEXT on the stale phone shows "Already moved on from another device".
- A door-prize segment opens the Draw tab with only its prizes; drawing works as on `/station/draw`.
- The bottom tab bar never covers the NEXT button.

- [ ] **Step 10: Commit**

```bash
git add src/lib/use-mc.ts src/components/mc src/app/station/mc src/styles/mc.css
git commit -m "feat(mc): MC cue card screen with rundown, VIP, pax and draw tabs"
```

---

### Task 8: Admin endpoints

**Files:**
- Create: `src/app/api/admin/rundown/route.ts`, `src/app/api/admin/rundown/[id]/delete/route.ts`, `src/app/api/admin/rundown/set-current/route.ts`, `src/app/api/admin/guests/[id]/vip/route.ts`, `src/app/api/admin/prizes/[id]/script/route.ts`

**Interfaces:**
- Consumes: `mc_state`, `prize_list`, `admin_save_segment`, `admin_delete_segment`, `mc_set_current`, `admin_set_guest_vip`, `admin_set_prize_script`; `adminGet`, `adminPost`, `actorId`.
- Produces:
  - `GET /api/admin/rundown` → `data: {state: McState, prizes: PrizeRow[]}`
  - `POST /api/admin/rundown` body `{id?, title?, planned_time? 'HH:MM', duration_min?, sort_order?, pic?, script?, kind?, prize_ids?}` → `{status, data: {status, id?, prize?}}`
  - `POST /api/admin/rundown/[id]/delete` `{}` → `status`
  - `POST /api/admin/rundown/set-current` `{segment_id, reason}` → `status`
  - `POST /api/admin/guests/[id]/vip` `{vip_tier, vip_title, protocol_order, phonetic}` (all keys required, nullable) → `status`
  - `POST /api/admin/prizes/[id]/script` `{mc_script: string | null}` → `status`

- [ ] **Step 1: Create the routes**

`src/app/api/admin/rundown/route.ts`:

```ts
import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminGet, adminPost } from '@/lib/routes';

const schema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().max(80).optional(),
  planned_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(), // HH:MM WITA on the event date
  duration_min: z.number().int().min(1).max(600).optional(),
  sort_order: z.number().int().min(0).max(100_000).optional(),
  pic: z.string().max(80).nullable().optional(),
  script: z.string().max(4000).nullable().optional(),
  kind: z.enum(['normal', 'door_prize']).optional(),
  prize_ids: z.array(z.string().uuid()).max(200).optional(),
});

/** The rundown with live run state (same shape the MC screen reads) plus the prize list for assignment. */
export const GET = adminGet(async () => {
  const [state, prizes] = await Promise.all([
    rpc('mc_state', { p_event: env().EVENT_ID }),
    rpc<{ prizes: unknown[] }>('prize_list', { p_event: env().EVENT_ID }),
  ]);
  return ok('OK', { state, prizes: prizes.prizes });
});

export const POST = adminPost(schema, async ({ actor, body }) => {
  const { id, ...data } = body;
  const r = await rpc<{ status: string }>('admin_save_segment', {
    p_event: env().EVENT_ID, p_id: id ?? null, p_data: data, p_actor: actorId(actor),
  });
  return ok(r.status, r);
});
```

`src/app/api/admin/rundown/[id]/delete/route.ts`:

```ts
import { z } from 'zod';
import { fail, ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminPost } from '@/lib/routes';

export const POST = adminPost(z.object({}), async ({ actor, params }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return fail(400, 'BAD_INPUT');
  const r = await rpc<{ status: string }>('admin_delete_segment', { p_event: env().EVENT_ID, p_id: id.data, p_actor: actorId(actor) });
  return ok(r.status);
});
```

`src/app/api/admin/rundown/set-current/route.ts`:

```ts
import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminPost } from '@/lib/routes';

const schema = z.object({ segment_id: z.string().uuid(), reason: z.string().max(200) });

/** Admin correction after a mistaken NEXT, or a jump. Reason required (at least 5 characters, checked in SQL). */
export const POST = adminPost(schema, async ({ actor, body }) => {
  const r = await rpc<{ status: string }>('mc_set_current', {
    p_event: env().EVENT_ID, p_segment: body.segment_id, p_reason: body.reason, p_actor: actorId(actor),
  });
  return ok(r.status, r);
});
```

`src/app/api/admin/guests/[id]/vip/route.ts`:

```ts
import { z } from 'zod';
import { fail, ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminPost } from '@/lib/routes';

const Body = z.object({
  vip_tier: z.enum(['BOD', 'HOD']).nullable(),
  vip_title: z.string().max(30).nullable(),
  protocol_order: z.number().int().min(0).max(999).nullable(),
  phonetic: z.string().max(80).nullable(),
});

export const POST = adminPost(Body, async ({ actor, body, params }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return fail(400, 'BAD_INPUT');
  const r = await rpc<{ status: string }>('admin_set_guest_vip', {
    p_event: env().EVENT_ID, p_guest_id: id.data,
    p_data: { ...body, protocol_order: body.protocol_order === null ? null : String(body.protocol_order) },
    p_actor: actorId(actor),
  });
  return ok(r.status);
});
```

`src/app/api/admin/prizes/[id]/script/route.ts`:

```ts
import { z } from 'zod';
import { fail, ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminPost } from '@/lib/routes';

export const POST = adminPost(z.object({ mc_script: z.string().max(500).nullable() }), async ({ actor, body, params }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return fail(400, 'BAD_INPUT');
  const r = await rpc<{ status: string }>('admin_set_prize_script', {
    p_event: env().EVENT_ID, p_prize_id: id.data, p_script: body.mc_script, p_actor: actorId(actor),
  });
  return ok(r.status);
});
```

- [ ] **Step 2: Check**

Run: `npx tsc --noEmit && npx eslint src/app/api/admin`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/rundown src/app/api/admin/guests src/app/api/admin/prizes
git commit -m "feat(mc): admin endpoints for rundown, VIP tags and prize MC lines"
```

---

### Task 9: Admin UI — rundown editor, VIP tags, MC lines

**Files:**
- Create: `src/lib/admin-mc-text.ts`, `tests/unit/admin-mc-text.test.ts`, `src/components/admin/RundownEditor.tsx`, `src/app/admin/(console)/rundown/page.tsx`
- Modify: `src/components/admin/AdminNav.tsx`, `src/components/admin/GuestEditor.tsx`, `src/components/admin/PrizeManager.tsx`

**Interfaces:**
- Consumes: Task 8 endpoints; `@/lib/mc` types; `segmentStatus`; `formatTimeWita`; `prizeLabel`; `useLoad`.
- Produces: `describeRundown(status, prize?) → string`, `parseTime(s) → 'HH:MM' | null`; pages `/admin/rundown` (nav item **Rundown**); **MC VIP list** control in the guest editor; **MC line** field on prizes.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/admin-mc-text.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { describeRundown, parseTime } from '@/lib/admin-mc-text';

describe('describeRundown', () => {
  it('explains each status', () => {
    expect(describeRundown('LOCKED')).toMatch(/finished/);
    expect(describeRundown('HAS_RUNS')).toMatch(/cannot be deleted/);
    expect(describeRundown('REASON_REQUIRED')).toMatch(/5 characters/);
    expect(describeRundown('SOMETHING_ELSE')).toBe('Could not save. Try again.');
  });
  it('names the taken prize', () => {
    expect(describeRundown('PRIZE_TAKEN', 'TV')).toBe('“TV” already belongs to another segment.');
    expect(describeRundown('PRIZE_TAKEN')).toMatch(/another segment/);
  });
});

describe('parseTime', () => {
  it('accepts HH:MM and pads the hour', () => {
    expect(parseTime('17:05')).toBe('17:05');
    expect(parseTime(' 9:30 ')).toBe('09:30');
  });
  it('refuses anything else', () => {
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('17:60')).toBeNull();
    expect(parseTime('1705')).toBeNull();
    expect(parseTime('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm run test:unit`
Expected: FAIL — cannot resolve `@/lib/admin-mc-text`.

- [ ] **Step 3: Write the helper**

Create `src/lib/admin-mc-text.ts`:

```ts
/** Admin console wording for rundown, VIP and MC-line results (English, like the rest of the console). */
const RUNDOWN: Record<string, string> = {
  INVALID: 'Check the fields: title, start time (HH:MM) and duration (1–600 min) are required; prizes only on a door-prize segment.',
  LOCKED: 'This segment has already finished, so it can no longer be edited.',
  PRIZE_TAKEN: 'A prize you picked already belongs to another segment.',
  HAS_RUNS: 'This segment has already run, so it cannot be deleted.',
  REASON_REQUIRED: 'Give a reason of at least 5 characters.',
  ALREADY_CURRENT: 'That segment is already the current one.',
  NOT_FOUND: 'That segment no longer exists. Reload the page.',
};

export function describeRundown(status: string, prize?: string): string {
  if (status === 'PRIZE_TAKEN' && prize) return `“${prize}” already belongs to another segment.`;
  return RUNDOWN[status] ?? 'Could not save. Try again.';
}

/** "17:05" from a WITA time input; null for anything else. */
export function parseTime(s: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h <= 23 && min <= 59 ? `${String(h).padStart(2, '0')}:${m[2]}` : null;
}
```

- [ ] **Step 4: Run the test**

Run: `npm run test:unit`
Expected: PASS (231 tests).

- [ ] **Step 5: Rundown editor and page**

Create `src/components/admin/RundownEditor.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { describeRundown, parseTime } from '@/lib/admin-mc-text';
import { api } from '@/lib/client';
import { segmentStatus, type McState, type Segment } from '@/lib/mc';
import { prizeLabel, type PrizeRow } from '@/lib/prizes';
import { formatTimeWita } from '@/lib/time';
import { useLoad } from '@/lib/use-load';

type Draft = {
  title: string; planned_time: string; duration_min: string; sort_order: string; pic: string; script: string;
  kind: 'normal' | 'door_prize'; prize_ids: string[];
};
const EMPTY: Draft = { title: '', planned_time: '', duration_min: '10', sort_order: '', pic: '', script: '', kind: 'normal', prize_ids: [] };
const toDraft = (s: Segment): Draft => ({
  title: s.title, planned_time: formatTimeWita(s.planned_start), duration_min: String(s.duration_min), sort_order: String(s.sort_order),
  pic: s.pic ?? '', script: s.script ?? '', kind: s.kind, prize_ids: s.prizes.map((p) => p.id),
});

function Fields({ d, set, prizes, takenBy }: {
  d: Draft; set: (d: Draft) => void; prizes: PrizeRow[]; takenBy: Map<string, string>;
}) {
  const toggle = (id: string) =>
    set({ ...d, prize_ids: d.prize_ids.includes(id) ? d.prize_ids.filter((x) => x !== id) : [...d.prize_ids, id] });
  return (
    <div className="adm-card">
      <div className="adm-row">
        <input className="adm-input adm-narrow" placeholder="17:00" aria-label="Start time (WITA)" value={d.planned_time}
          onChange={(e) => set({ ...d, planned_time: e.target.value })} />
        <input className="adm-input" placeholder="Segment title" aria-label="Title" value={d.title} onChange={(e) => set({ ...d, title: e.target.value })} />
        <input className="adm-input adm-narrow" type="number" min={1} max={600} aria-label="Duration (minutes)" value={d.duration_min}
          onChange={(e) => set({ ...d, duration_min: e.target.value })} />
        <input className="adm-input adm-narrow" type="number" min={0} placeholder="Order" aria-label="Order" value={d.sort_order}
          onChange={(e) => set({ ...d, sort_order: e.target.value })} />
        <input className="adm-input" placeholder="PIC (optional)" aria-label="PIC" value={d.pic} onChange={(e) => set({ ...d, pic: e.target.value })} />
        <select className="adm-select" aria-label="Kind" value={d.kind} onChange={(e) => set({ ...d, kind: e.target.value as Draft['kind'] })}>
          <option value="normal">Normal</option>
          <option value="door_prize">Door prize</option>
        </select>
      </div>
      <label className="adm-field">
        <span>MC script (shown on the MC screen, free text)</span>
        <textarea className="adm-input" rows={4} value={d.script} onChange={(e) => set({ ...d, script: e.target.value })} />
      </label>
      {d.kind === 'door_prize' && (
        <div className="adm-field">
          <span>Prizes drawn in this segment</span>
          <span className="adm-row" style={{ margin: 0 }}>
            {prizes.map((p) => {
              const other = takenBy.get(p.id);
              return (
                <label key={p.id} className="adm-check" title={other ? `In “${other}”` : undefined}>
                  <input type="checkbox" checked={d.prize_ids.includes(p.id)} disabled={!!other} onChange={() => toggle(p.id)} />
                  {prizeLabel(p)}{other ? ` (in ${other})` : ''}
                </label>
              );
            })}
          </span>
        </div>
      )}
    </div>
  );
}

export function RundownEditor() {
  const { data, loading, reload } = useLoad<{ state: McState; prizes: PrizeRow[] }>('/api/admin/rundown', 5_000);
  const [adding, setAdding] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<{ id: string; draft: Draft } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [jump, setJump] = useState<{ id: string; reason: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const state = data?.state;
  const segments = state?.segments ?? [];
  const prizes = data?.prizes ?? [];

  /** prize id → title of the segment that holds it, leaving out the segment being edited. */
  const takenBy = (exceptId: string | null) =>
    new Map(segments.filter((s) => s.id !== exceptId).flatMap((s) => s.prizes.map((p) => [p.id, s.title] as const)));

  async function save(id: string | null, d: Draft): Promise<boolean> {
    const time = parseTime(d.planned_time);
    const duration = Number(d.duration_min);
    if (!d.title.trim() || !time || !Number.isInteger(duration) || duration < 1) { setMsg({ ok: false, text: describeRundown('INVALID') }); return false; }
    const body = {
      ...(id ? { id } : {}),
      title: d.title.trim(), planned_time: time, duration_min: duration, pic: d.pic.trim() || null, script: d.script.trim() || null,
      kind: d.kind, prize_ids: d.kind === 'door_prize' ? d.prize_ids : [],
      ...(d.sort_order.trim() !== '' ? { sort_order: Number(d.sort_order) } : {}),
    };
    const r = await api<{ prize?: string }>('/api/admin/rundown', body);
    if (r.status === 'OK') { setMsg({ ok: true, text: id ? 'Saved.' : 'Segment added.' }); reload(); return true; }
    setMsg({ ok: false, text: describeRundown(r.status, r.data?.prize) });
    return false;
  }

  async function remove(id: string) {
    const r = await api(`/api/admin/rundown/${id}/delete`, {});
    setDeleting(null);
    setMsg(r.status === 'OK' ? { ok: true, text: 'Segment deleted.' } : { ok: false, text: describeRundown(r.status) });
    reload();
  }

  async function setCurrent() {
    if (!jump) return;
    const r = await api('/api/admin/rundown/set-current', { segment_id: jump.id, reason: jump.reason });
    setMsg(r.status === 'OK' ? { ok: true, text: 'Current segment changed. MC screens follow within 2 seconds.' } : { ok: false, text: describeRundown(r.status) });
    if (r.status === 'OK') setJump(null);
    reload();
  }

  const phase = state?.phase === 'running' ? 'Show running' : state?.phase === 'ended' ? 'Show ended' : 'Not started';

  return (
    <>
      <p className="adm-muted">Status: <b>{phase}</b>. Finished segments are read-only. Times are WITA on the event date.</p>
      <h2 className="adm-sub">Add a segment</h2>
      <Fields d={adding} set={setAdding} prizes={prizes} takenBy={takenBy(null)} />
      <div className="adm-row">
        <button className="btn btn--gold" onClick={async () => { if (await save(null, adding)) setAdding(EMPTY); }}>Add segment</button>
      </div>
      {msg && <p className={`adm-msg ${msg.ok ? 'adm-msg--ok' : 'adm-msg--error'}`}>{msg.text}</p>}

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Order</th><th>Time</th><th>Segment</th><th>Min</th><th>PIC</th><th>Prizes</th><th>Status</th><th /></tr></thead>
          <tbody>
            {segments.map((s) => {
              const status = segmentStatus(s, state?.current_segment_id ?? null);
              if (editing?.id === s.id) {
                return (
                  <tr key={s.id}>
                    <td colSpan={8}>
                      <Fields d={editing.draft} set={(draft) => setEditing({ id: s.id, draft })} prizes={prizes} takenBy={takenBy(s.id)} />
                      <span className="adm-row">
                        <button className="btn btn--gold" onClick={async () => { if (await save(s.id, editing.draft)) setEditing(null); }}>Save</button>
                        <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
                      </span>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={s.id}>
                  <td>{s.sort_order}</td>
                  <td>{formatTimeWita(s.planned_start)}</td>
                  <td><b>{s.title}</b>{s.kind === 'door_prize' && <> <span className="adm-badge adm-badge--gold">door prize</span></>}</td>
                  <td>{s.duration_min}</td>
                  <td>{s.pic ?? ''}</td>
                  <td>{s.prizes.map((p) => p.name).join(', ')}</td>
                  <td>
                    {status === 'current' ? <span className="adm-badge adm-badge--green">current</span>
                      : status === 'done' && s.started_at && s.ended_at ? `${formatTimeWita(s.started_at)}–${formatTimeWita(s.ended_at)}` : ''}
                  </td>
                  <td>
                    <span className="adm-row" style={{ margin: 0 }}>
                      <button className="btn" disabled={status === 'done'} onClick={() => { setEditing({ id: s.id, draft: toDraft(s) }); setMsg(null); }}>Edit</button>
                      {status !== 'current' && <button className="btn" onClick={() => setJump({ id: s.id, reason: '' })}>Make current</button>}
                      {deleting === s.id ? (
                        <>
                          <button className="btn btn--danger" onClick={() => remove(s.id)}>Confirm delete</button>
                          <button className="btn" onClick={() => setDeleting(null)}>Cancel</button>
                        </>
                      ) : (
                        <button className="btn btn--danger" disabled={!!s.started_at} title={s.started_at ? 'This segment has run' : undefined}
                          onClick={() => setDeleting(s.id)}>Delete</button>
                      )}
                    </span>
                    {jump?.id === s.id && (
                      <span className="adm-row">
                        <input className="adm-input" placeholder="Reason (required)" value={jump.reason} onChange={(e) => setJump({ id: s.id, reason: e.target.value })} />
                        <button className="btn btn--gold" onClick={setCurrent}>Set current</button>
                        <button className="btn" onClick={() => setJump(null)}>Cancel</button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!loading && segments.length === 0 && <tr><td colSpan={8} className="adm-muted">No segments yet. Add the first one above.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
```

Create `src/app/admin/(console)/rundown/page.tsx`:

```tsx
import { RundownEditor } from '@/components/admin/RundownEditor';

export default function RundownPage() {
  return (
    <>
      <div className="adm-row">
        <h1 className="adm-title" style={{ margin: 0 }}>Rundown</h1>
        <span className="adm-spacer" />
        <a className="btn" href="/admin/cue-card">Print cue card</a>
      </div>
      <p className="adm-muted">The show order the MC runs with NEXT on the MC screen. Door-prize segments own their prizes: opening one takes the MC straight to the draw for those prizes.</p>
      <RundownEditor />
    </>
  );
}
```

Add the nav item:

```diff
diff --git a/src/components/admin/AdminNav.tsx b/src/components/admin/AdminNav.tsx
--- a/src/components/admin/AdminNav.tsx
+++ b/src/components/admin/AdminNav.tsx
@@ -9,6 +9,7 @@ const LINKS = [
   { href: '/admin/merchandise', label: 'Merchandise' },
   { href: '/admin/beverages', label: 'Beverages' },
   { href: '/admin/prizes', label: 'Prizes' },
+  { href: '/admin/rundown', label: 'Rundown' },
   { href: '/admin/draws', label: 'Draws' },
   { href: '/admin/reports', label: 'Reports' },
   { href: '/admin/audit', label: 'Audit' },
```

- [ ] **Step 6: VIP control in the guest editor**

```diff
diff --git a/src/components/admin/GuestEditor.tsx b/src/components/admin/GuestEditor.tsx
--- a/src/components/admin/GuestEditor.tsx
+++ b/src/components/admin/GuestEditor.tsx
@@ -9,6 +9,7 @@ export type AdminGuest = {
   checked_in_at: string | null; prize_number: number | null; merch: string;
   beverage?: 'beer' | 'soft_drink' | null; beverage_source?: string | null; beverage_redeemed?: boolean;
   merch_size?: Size | null; merch_size_source?: string | null; merch_given_size?: Size | null;
+  vip_tier?: 'BOD' | 'HOD' | null; vip_title?: string | null; protocol_order?: number | null; phonetic?: string | null;
 };
 
 const DRINK = { beer: 'Beer', soft_drink: 'Soft Drink' } as const;
@@ -80,6 +81,43 @@ function SizeControl({ guest, onSaved }: { guest: AdminGuest; onSaved: () => voi
   );
 }
 
+/** BOD/HOD tag for the MC's VIP list: title, protocol order (lower is read first) and how to say the name. */
+function VipControl({ guest, onSaved }: { guest: AdminGuest; onSaved: () => void }) {
+  const [tier, setTier] = useState<'' | 'BOD' | 'HOD'>(guest.vip_tier ?? '');
+  const [title, setTitle] = useState(guest.vip_title ?? '');
+  const [order, setOrder] = useState(guest.protocol_order === null || guest.protocol_order === undefined ? '' : String(guest.protocol_order));
+  const [phonetic, setPhonetic] = useState(guest.phonetic ?? '');
+  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
+
+  async function save() {
+    const n = order.trim() === '' ? null : Number(order);
+    if (n !== null && (!Number.isInteger(n) || n < 0 || n > 999)) return setMsg({ ok: false, text: 'Protocol order is a whole number from 0 to 999.' });
+    const r = await api(`/api/admin/guests/${guest.id}/vip`, {
+      vip_tier: tier || null, vip_title: title.trim() || null, protocol_order: n, phonetic: phonetic.trim() || null,
+    });
+    if (r.status === 'OK') { setMsg({ ok: true, text: tier ? `Tagged ${tier}.` : 'VIP tag removed.' }); onSaved(); }
+    else setMsg({ ok: false, text: 'Could not save. Check the lengths (title 30, pronunciation 80) and try again.' });
+  }
+
+  return (
+    <div className="adm-field">
+      <span>MC VIP list</span>
+      <span className="adm-row" style={{ margin: 0 }}>
+        <select className="adm-select" value={tier} onChange={(e) => setTier(e.target.value as '' | 'BOD' | 'HOD')} aria-label="VIP tier">
+          <option value="">Not a VIP</option>
+          <option value="BOD">BOD</option>
+          <option value="HOD">HOD</option>
+        </select>
+        <input className="adm-input adm-narrow" placeholder="Title (Bapak / Ibu)" aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!tier} />
+        <input className="adm-input adm-narrow" type="number" min={0} max={999} placeholder="Order" aria-label="Protocol order" value={order} onChange={(e) => setOrder(e.target.value)} disabled={!tier} />
+        <input className="adm-input" placeholder="Say it as (optional)" aria-label="Pronunciation" value={phonetic} onChange={(e) => setPhonetic(e.target.value)} disabled={!tier} />
+        <button className="btn" onClick={save}>Save VIP</button>
+      </span>
+      {msg && <p className={`adm-msg ${msg.ok ? 'adm-msg--ok' : 'adm-msg--error'}`}>{msg.text}</p>}
+    </div>
+  );
+}
+
 export function GuestEditor({ guest, onClose, onSaved }: { guest: AdminGuest; onClose: () => void; onSaved: () => void }) {
   const [name, setName] = useState(guest.full_name);
   const [outlet, setOutlet] = useState(guest.outlet);
@@ -111,6 +149,7 @@ export function GuestEditor({ guest, onClose, onSaved }: { guest: AdminGuest; on
       <label className="adm-row"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active (inactive employees are not eligible at the desks)</label>
       <DrinkControl guest={guest} onSaved={onSaved} />
       <SizeControl guest={guest} onSaved={onSaved} />
+      <VipControl guest={guest} onSaved={onSaved} />
       {msg && <p className="adm-msg adm-msg--error">{msg}</p>}
       <div className="adm-row">
         <button className="btn btn--gold" onClick={save} disabled={busy}>Save</button>
```

- [ ] **Step 7: MC line on prizes**

```diff
diff --git a/src/components/admin/PrizeManager.tsx b/src/components/admin/PrizeManager.tsx
--- a/src/components/admin/PrizeManager.tsx
+++ b/src/components/admin/PrizeManager.tsx
@@ -5,10 +5,11 @@ import { api } from '@/lib/client';
 import type { PrizeRow } from '@/lib/prizes';
 import { useLoad } from '@/lib/use-load';
 
-type Draft = { name: string; tier: string; quantity: string; sort_order: string; draw_as_batch: boolean };
-const EMPTY: Draft = { name: '', tier: '', quantity: '1', sort_order: '', draw_as_batch: false };
+type Draft = { name: string; tier: string; quantity: string; sort_order: string; draw_as_batch: boolean; mc_script: string };
+const EMPTY: Draft = { name: '', tier: '', quantity: '1', sort_order: '', draw_as_batch: false, mc_script: '' };
 const toDraft = (p: PrizeRow): Draft => ({
   name: p.name, tier: p.tier ?? '', quantity: String(p.quantity), sort_order: String(p.sort_order), draw_as_batch: p.draw_as_batch,
+  mc_script: p.mc_script ?? '',
 });
 
 function Fields({ d, set, batchLocked }: { d: Draft; set: (d: Draft) => void; batchLocked?: boolean }) {
@@ -22,6 +23,8 @@ function Fields({ d, set, batchLocked }: { d: Draft; set: (d: Draft) => void; ba
         <input type="checkbox" checked={d.draw_as_batch} disabled={batchLocked} onChange={(e) => set({ ...d, draw_as_batch: e.target.checked })} />
         Draw all at once
       </label>
+      <input className="adm-input" placeholder="MC line (optional, e.g. sponsor)" aria-label="MC line" maxLength={500} value={d.mc_script}
+        onChange={(e) => set({ ...d, mc_script: e.target.value })} />
     </>
   );
 }
@@ -44,8 +47,19 @@ export function PrizeManager() {
       draw_as_batch: d.draw_as_batch,
       ...(d.sort_order.trim() !== '' ? { sort_order: Number(d.sort_order) } : {}),
     };
-    const r = await api('/api/admin/prizes', body);
-    if (r.status === 'OK') { setMsg({ ok: true, text: id ? 'Saved.' : 'Prize added.' }); reload(); return true; }
+    const r = await api<{ id?: string }>('/api/admin/prizes', body);
+    if (r.status === 'OK') {
+      // The MC line is saved separately (admin_set_prize_script); only when it changed.
+      const prizeId = id ?? r.data?.id;
+      const before = id ? (data?.prizes.find((p) => p.id === id)?.mc_script ?? '') : '';
+      if (prizeId && d.mc_script.trim() !== before) {
+        const s = await api(`/api/admin/prizes/${prizeId}/script`, { mc_script: d.mc_script.trim() || null });
+        if (s.status !== 'OK') { setMsg({ ok: false, text: 'Prize saved, but the MC line could not be saved. Try again.' }); reload(); return false; }
+      }
+      setMsg({ ok: true, text: id ? 'Saved.' : 'Prize added.' });
+      reload();
+      return true;
+    }
     setMsg({ ok: false, text: describePrize(r.status) });
     return false;
   }
@@ -95,7 +109,7 @@ export function PrizeManager() {
               return (
                 <tr key={p.id}>
                   <td>{p.sort_order}</td>
-                  <td><b>{p.name}</b>{p.tier ? <> <span className="adm-badge adm-badge--gold">{p.tier}</span></> : null}</td>
+                  <td><b>{p.name}</b>{p.tier ? <> <span className="adm-badge adm-badge--gold">{p.tier}</span></> : null}{p.mc_script ? <div className="adm-muted">MC: {p.mc_script}</div> : null}</td>
                   <td>{p.quantity}</td>
                   <td>{p.draw_as_batch ? 'all at once' : 'one by one'}</td>
                   <td>{p.confirmed}</td>
```

- [ ] **Step 8: Check**

Run: `npx tsc --noEmit && npx eslint src/components/admin src/app/admin && npm run test:unit`
Expected: clean; 231 tests pass.

Manual (dev server, admin): add three segments (one door-prize with two prizes); a prize already in another segment is greyed out with "(in …)"; Edit and Save; Delete an unrun segment; tag a guest BOD with title, order and pronunciation; add an MC line to a prize and see it under the prize name.

- [ ] **Step 9: Commit**

```bash
git add src/lib/admin-mc-text.ts tests/unit/admin-mc-text.test.ts src/components/admin/RundownEditor.tsx \
  "src/app/admin/(console)/rundown" src/components/admin/AdminNav.tsx src/components/admin/GuestEditor.tsx src/components/admin/PrizeManager.tsx
git commit -m "feat(mc): admin rundown editor, VIP tags and prize MC lines"
```

---

### Task 10: Printable cue card and rundown report

**Files:**
- Create: `src/components/admin/CueCardPrint.tsx`, `src/app/admin/(console)/cue-card/page.tsx`, `src/styles/cue-card.css`
- Modify: `src/lib/reports.ts`, `tests/unit/reports.test.ts`, `src/components/admin/ReportsPanel.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/rundown`, `GET /api/station/mc/vip`, `GET /api/station/mc/pax` (admin passes the station guard), `report_rows(…, 'rundown')`, `groupPax`, `vipName`.
- Produces: page `/admin/cue-card` (linked from the Rundown page as **Print cue card**); report `rundown` → `nourishfest-rundown.csv`; CSV column kind `int`.

- [ ] **Step 1: Write the failing test**

Add to the end of `tests/unit/reports.test.ts` (inside the existing `describe`):

```diff
diff --git a/tests/unit/reports.test.ts b/tests/unit/reports.test.ts
--- a/tests/unit/reports.test.ts
+++ b/tests/unit/reports.test.ts
@@ -72,4 +72,14 @@ describe('buildReportCsv', () => {
     ]);
     expect(parse(csv).data[0].Details).toBe('{"reason":"wrong person"}');
   });
+  it('writes rundown drift as a plain number, early starts included', () => {
+    const csv = buildReportCsv('rundown', [
+      { segment: 'Opening', kind: 'normal', planned_start: '2026-12-08T09:00:00Z', planned_min: 10,
+        actual_start: '2026-12-08T08:57:00Z', actual_end: '2026-12-08T09:09:00Z', actual_min: 12, drift_min: -3, started_by: 'mc', reason: null },
+    ]);
+    const row = parse(csv).data[0];
+    expect(row['Start drift min']).toBe('-3');
+    expect(row['Actual start']).toBe('2026-12-08 16:57:00');
+    expect(row['Correction reason']).toBe('');
+  });
 });
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm run test:unit`
Expected: FAIL — `buildReportCsv('rundown', …)` throws because `REPORTS.rundown` does not exist yet.

- [ ] **Step 3: Add the report**

```diff
diff --git a/src/lib/reports.ts b/src/lib/reports.ts
--- a/src/lib/reports.ts
+++ b/src/lib/reports.ts
@@ -1,7 +1,7 @@
 import Papa from 'papaparse';
 import { csvSafe } from './csv';
 
-type Kind = 'text' | 'time' | 'bool';
+type Kind = 'text' | 'time' | 'bool' | 'int';
 type Col = { key: string; header: string; kind?: Kind };
 type Report = { sql: string; file: string; cols: Col[] };
 
@@ -78,6 +78,16 @@ export const REPORTS = {
       { key: 'void_reason', header: 'Void reason' },
     ],
   },
+  rundown: {
+    sql: 'rundown', file: 'nourishfest-rundown.csv',
+    cols: [
+      { key: 'segment', header: 'Segment' }, { key: 'kind', header: 'Kind' },
+      { key: 'planned_start', header: 'Planned start', kind: 'time' }, { key: 'planned_min', header: 'Planned min' },
+      { key: 'actual_start', header: 'Actual start', kind: 'time' }, { key: 'actual_end', header: 'Actual end', kind: 'time' },
+      { key: 'actual_min', header: 'Actual min', kind: 'int' }, { key: 'drift_min', header: 'Start drift min', kind: 'int' },
+      { key: 'started_by', header: 'Started by' }, { key: 'reason', header: 'Correction reason' },
+    ],
+  },
   audit: {
     sql: 'audit', file: 'nourishfest-audit.csv',
     cols: [
@@ -102,6 +112,7 @@ function cell(value: unknown, kind: Kind = 'text'): string {
   if (value === null || value === undefined) return '';
   if (kind === 'time') return witaStamp(String(value));
   if (kind === 'bool') return value ? 'yes' : 'no';
+  if (kind === 'int') return Number.isFinite(Number(value)) ? String(Math.trunc(Number(value))) : ''; // '-3' is a number, not a formula
   return csvSafe(String(value));
 }
```

```diff
diff --git a/src/components/admin/ReportsPanel.tsx b/src/components/admin/ReportsPanel.tsx
--- a/src/components/admin/ReportsPanel.tsx
+++ b/src/components/admin/ReportsPanel.tsx
@@ -7,6 +7,7 @@ const REPORTS: { href: string; title: string; text: string }[] = [
   { href: '/api/admin/reports/merch-sizes', title: 'T-shirt sizes', text: 'Every guest: reserved size, source, size handed over, substitutions, booth, voids.' },
   { href: '/api/admin/reports/merch-size-pending', title: 'T-shirt size pending', text: 'Guests with no size yet, with phone, for the reminder through the Fonnte sheet.' },
   { href: '/api/admin/reports/draws', title: 'Draw history', text: 'Every draw: prize, slot, winner, outcome, who resolved it, void reasons.' },
+  { href: '/api/admin/reports/rundown', title: 'Rundown', text: 'Every segment: planned vs actual start and end, drift, who moved the show on, correction reasons.' },
   { href: '/api/admin/reports/audit', title: 'Audit log', text: 'Every recorded action, oldest first.' },
   { href: '/api/admin/invitations.csv', title: 'Invitation links', text: 'Personal pass link per employee, for the WhatsApp broadcast.' },
 ];
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:unit`
Expected: PASS (232 tests).

- [ ] **Step 5: Printable cue card**

Create `src/components/admin/CueCardPrint.tsx`:

```tsx
'use client';
import { Fragment } from 'react';
import { groupPax, vipName, type McState, type PaxRow, type VipRow } from '@/lib/mc';
import { prizeLabel, type PrizeRow } from '@/lib/prizes';
import { formatTimeWita } from '@/lib/time';
import { useLoad } from '@/lib/use-load';
import '@/styles/cue-card.css';

/**
 * Paper backup of the MC screen (spec §3.4): rundown with full scripts and prize lines, BOD/HOD in protocol order with
 * pronunciation, and invited pax. Printed from the browser (Print → Save as PDF). Live numbers are not on paper.
 */
export function CueCardPrint() {
  const rundown = useLoad<{ state: McState; prizes: PrizeRow[] }>('/api/admin/rundown');
  const vip = useLoad<{ vips: VipRow[] }>('/api/station/mc/vip');
  const pax = useLoad<{ rows: PaxRow[] }>('/api/station/mc/pax');

  if (rundown.loading || vip.loading || pax.loading) return <p className="adm-muted">Loading…</p>;
  const segments = rundown.data?.state.segments ?? [];
  const vips = vip.data?.vips ?? [];
  const { total, outlets } = groupPax(pax.data?.rows ?? []);
  const byInvited = [...outlets].sort((a, b) => b.invited - a.invited || a.outlet.localeCompare(b.outlet));

  return (
    <div className="cue">
      <div className="cue__actions">
        <button className="btn btn--gold" onClick={() => window.print()}>Print / Save as PDF</button>
        <span className="adm-muted">A4 portrait. Print again after any change to the rundown or the VIP list.</span>
      </div>

      <h1>NourishFest 2026 — MC cue card</h1>

      <h2>1. Rundown</h2>
      {segments.length === 0 && <p>No segments yet.</p>}
      {segments.map((s) => (
        <section key={s.id} className="cue__seg">
          <h3>{formatTimeWita(s.planned_start)} · {s.title} <small>({s.duration_min} min{s.pic ? ` · PIC ${s.pic}` : ''})</small></h3>
          {s.script && <p className="cue__script">{s.script}</p>}
          {s.kind === 'door_prize' && (
            <ol>
              {s.prizes.map((p) => (
                <li key={p.id}><b>{prizeLabel(p)}</b> × {p.quantity}{p.mc_script ? ` — “${p.mc_script}”` : ''}</li>
              ))}
            </ol>
          )}
        </section>
      ))}

      <h2>2. BOD &amp; HOD (protocol order)</h2>
      {(['BOD', 'HOD'] as const).map((tier) => (
        <section key={tier}>
          <h3>{tier}</h3>
          <ol>
            {vips.filter((v) => v.tier === tier).map((v) => (
              <li key={v.id}>
                <b>{vipName(v)}</b>{v.phonetic ? ` (“${v.phonetic}”)` : ''} — {[v.position, v.outlet].filter(Boolean).join(', ')}
              </li>
            ))}
          </ol>
        </section>
      ))}

      <h2>3. Invited pax by outlet</h2>
      <p>Total invited: <b>{total.invited}</b></p>
      <table className="cue__table">
        <thead><tr><th>Outlet / department</th><th>Invited</th></tr></thead>
        <tbody>
          {byInvited.map((o) => (
            <Fragment key={o.outlet}>
              <tr className="cue__outlet"><td>{o.outlet}</td><td>{o.invited}</td></tr>
              {o.departments.map((d) => (
                <tr key={`${o.outlet}/${d.department ?? '-'}`}><td className="cue__dept">{d.department ?? 'No department'}</td><td>{d.invited}</td></tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Create `src/app/admin/(console)/cue-card/page.tsx`:

```tsx
import { CueCardPrint } from '@/components/admin/CueCardPrint';

export default function CueCardPage() {
  return <CueCardPrint />;
}
```

Create `src/styles/cue-card.css`:

```css
/* Printable MC cue card (/admin/cue-card). Readable on screen, black on white on paper. */
.cue { max-width: 820px; }
.cue h1 { font-family: var(--nf-font-heading); font-size: 28px; margin: 16px 0; }
.cue h2 { font-family: var(--nf-font-heading); font-size: 22px; margin: 24px 0 8px; border-bottom: 2px solid currentColor; }
.cue h3 { font-size: 17px; margin: 14px 0 4px; }
.cue h3 small { font-weight: 400; }
.cue__actions { display: flex; align-items: center; gap: 12px; }
.cue__script { white-space: pre-wrap; margin: 4px 0 8px; line-height: 1.45; }
.cue__table { border-collapse: collapse; min-width: 360px; }
.cue__table th, .cue__table td { text-align: left; padding: 3px 12px 3px 0; border-bottom: 1px solid #999; }
.cue__outlet td { font-weight: 700; padding-top: 8px; }
.cue__dept { padding-left: 18px !important; }

@media print {
  @page { size: A4 portrait; margin: 14mm; }
  html, body { background: #fff !important; color: #000 !important; }
  .adm-nav, .cue__actions { display: none !important; }
  .adm { padding: 0 !important; background: #fff !important; }
  .cue, .cue * { color: #000 !important; background: transparent !important; }
  .cue__seg { break-inside: avoid; }
  .cue h2 { break-after: avoid; }
}
```

- [ ] **Step 6: Check**

Run: `npx tsc --noEmit && npx eslint . && npm run test:unit`
Expected: `tsc` clean; eslint shows only the two existing `Scanner.tsx` warnings; 232 tests pass.

Manual: `/admin/cue-card` → **Print / Save as PDF** → the preview is A4 portrait, black on white, no admin nav, segments not split across pages.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/CueCardPrint.tsx "src/app/admin/(console)/cue-card" src/styles/cue-card.css \
  src/lib/reports.ts tests/unit/reports.test.ts src/components/admin/ReportsPanel.tsx
git commit -m "feat(mc): printable cue card and rundown report"
```

---

### Task 11: Runbook, full check, go live

**Files:**
- Create: `docs/runbooks/mc-cue-card.md`

- [ ] **Step 1: Write the runbook**

Create `docs/runbooks/mc-cue-card.md`:

```markdown
# MC cue card — setup and rehearsal

> The screens show **English** by default (tap ID for Indonesian). Indonesian button names: MULAI ACARA = START SHOW, YA, LANJUT = YES, CONTINUE, HANYA YANG HADIR = PRESENT ONLY.

The MC runs the whole show from `/station/mc` on one phone: **Rundown · VIP · Pax · Draw**. The co-MC and the show director can log in with the same **MC PIN** on their own phones and see the same screen. Whoever taps NEXT first moves the show on; a second tap from another phone changes nothing.

## Before rehearsal 1 (admin, about 1 hour)

- [ ] **Settings → Station PINs:** set the **MC cue card** PIN. Write it in the password manager. It is different from the draw operator PIN.
- [ ] **Rundown:** enter every segment in show order: start time (WITA), title, minutes, PIC, MC script. Mark the door-prize segments and tick their prizes. A prize can sit in only one segment.
- [ ] **Prizes:** add an MC line to any prize with a sponsor mention.
- [ ] **Guests:** tag every BOD and HOD (Edit → MC VIP list): title (Bapak / Ibu), protocol order (1 is read first), and how to say the name if it is easy to get wrong.
- [ ] **Rundown → Print cue card:** print two copies (MC + show director). Re-print after any change.

## At each rehearsal (30 minutes, two MC phones + admin laptop)

- [ ] Both phones log in with the MC PIN and show **NOT STARTED**.
- [ ] Phone A taps **START SHOW**; phone B follows within 2 seconds.
- [ ] Both phones tap **NEXT** at the same moment: the show moves on **one** segment, and one phone shows "Already moved on from another device".
- [ ] The header clock turns pink when a segment runs over; the drift line turns pink when a segment starts late.
- [ ] Entering a door-prize segment opens the **Draw** tab on both phones, with only that segment's prizes and their MC lines.
- [ ] Draw at least one prize end to end (DRAW → KONFIRMASI) from the Draw tab; the prize shows **DONE** with the winner's name.
- [ ] Tap NEXT with prizes still undrawn: the "prizes not drawn yet — continue?" warning appears; **CANCEL** keeps you in the segment.
- [ ] **VIP:** checked-in BOD/HOD show **ARRIVED**; untick "Present only" to see who is still missing. Read every name aloud once using the pronunciation notes.
- [ ] **Pax:** the total matches the admin dashboard; tap an outlet to see its departments.
- [ ] Put phone B in airplane mode for one segment: the gold **OFFLINE** banner shows and the clock keeps running. Turn it back on: it catches up within 2 seconds.
- [ ] Admin: **Rundown → Make current** on the previous segment with a reason (practice for a mistaken NEXT). Both phones follow.
- [ ] Download **Reports → Rundown** and check planned vs actual times.
- [ ] Reset rehearsal data (Settings): the rundown, VIP tags and scripts stay; the show is back to **NOT STARTED**.

## On the night

- The MC phone stays on charge between segments. The printed cue card is in the MC's pocket.
- Mistaken NEXT: tell the admin desk. The admin uses **Rundown → Make current** with a reason. The MC does nothing.
- Network down: read from the printed cue card. The draw falls back to the paper procedure in `failure-playbook.md`.
- After the show: download **Reports → Rundown** with the other reports.
```

- [ ] **Step 2: Full check on a machine with internet**

Run: `npx supabase db reset && npx supabase test db && npm run test:unit && npx tsc --noEmit && npm run lint && npm run build`
Expected: 257 pgTAP tests ok (003–010), 232 unit tests pass, `tsc` clean, lint shows only the two `Scanner.tsx` warnings, build succeeds and lists `/station/mc`, `/admin/rundown`, `/admin/cue-card`.

- [ ] **Step 3: Commit and push**

```bash
git add docs/runbooks/mc-cue-card.md
git commit -m "docs(mc): MC cue card setup and rehearsal runbook"
git push
```

- [ ] **Step 4: Deploy (same order as every earlier module)**

1. `npm run db:push` — applies migrations 17, 18, 19 to production. Check in the Supabase dashboard that `rundown_segments`, `segment_prizes` and `rundown_runs` exist with RLS on.
2. Let Vercel deploy `main`. Open `/station` on a phone: the hub shows an **MC** card.
3. Admin → Settings: set the **MC cue card** PIN.

- [ ] **Step 5: Rehearse**

Run the "At each rehearsal" checklist in `docs/runbooks/mc-cue-card.md` in Rehearsal 1 (with test data) and again in Rehearsal 2 at the venue. Must pass before the **6 December code freeze**.

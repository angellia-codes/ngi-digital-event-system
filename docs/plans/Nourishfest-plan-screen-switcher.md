# NourishFest 2026 — Videotron Screen Switcher: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One operator controls the videotron from `/station/screen` on a new `screen` PIN: 12 fixed screens (3 silent ambient loops, the Candid Cam loop, 5 one-off videos with sound, the live draw board, a closing card, blackout), a two-step GO LIVE, an "Up next" card fed by the rundown, and an automatic draw takeover when the MC picks a prize. The stage laptop (`/stage`, same URL and key as today) downloads every video into its own cache and plays from there, so playback survives the venue network dropping. Admin gets a Screens page (upload, preview, end action, closing text, USB fallback list), a suggested screen per rundown segment and a Screens report.

**Architecture:** Same pattern as every earlier module. All rules live in `SECURITY DEFINER` Postgres functions. The live screen is a new `screen` column on the existing `stage_state` row, so the projector keeps its Realtime channel, 3-second polling fallback and display key. A separate `screen_rev` moves only when the screen changes; every switch carries the `screen_rev` the operator saw, and a stale one gets `CHANGED` ("first tap wins"). The draw takeover lives in `stage_write`, the single writer of draw phases, so a number can never roll off-screen. Videos sit in a private Supabase Storage bucket: the admin browser uploads straight to Storage with a signed upload URL, and the stage gets signed download URLs, caches them in Cache Storage and plays blob URLs through two stacked `<video>` layers (hard cut, no black frame). The panel polls every 2 seconds and never depends on Realtime.

**Tech Stack:** Next.js 15 (App Router) + React 19, Supabase Postgres with pgTAP, Supabase Storage, zod 4, vitest. No new dependencies.

**Spec:** `engineering/2026-11-13-nourishfest-screen-switcher-design.md` in the NourishFest 2026 project (approved 13 Nov 2026). Task 1 copies it into the repo as `docs/2026-11-13-nourishfest-screen-switcher-design.md`.

**Verified:** every file and edit in this plan was built and run against the current `main` (`ac0b18f`) before the plan was written:
- `tsc` clean; `eslint` clean apart from the two warnings already in `Scanner.tsx`.
- **259 unit tests** (232 existing + 27 new) and **357 pgTAP tests** (257 existing + 100 new) passing. pgTAP ran on a local PostgreSQL 16 + pgTAP with the Supabase roles (`anon`, `authenticated`, `service_role`), the `extensions` schema and the `supabase_realtime` publication recreated, all 28 migrations applied in order.
- `next build --turbopack` succeeds (with `next/font/google` stubbed, because the sandbox cannot reach Google Fonts).
- **Stage player in real Chrome:** `ScreenVideo` and `syncCache` were bundled into a test page and driven by puppeteer with ffmpeg-made H.264 files. 13 checks passed: cache download and failure report, loop plays muted from a blob URL and keeps looping, one-off cut onto the other layer with the old layer paused, end reported with its `screen_rev`, hold on the last frame, resume mid-video, finished one-off after a reload shows its end, a non-video screen hides the videos at once, a missing file reports failure and the next screen recovers.
- **Screen Control panel in real Chrome** (390 × 844, `next start`, API mocked by request interception). 14 checks passed: header, progress bar, cache count and failures, Up next, missing videos greyed out, sound warning, two-step switch posting `{ key, from_screen_rev }`, replay confirm, `CHANGED` message and refresh, leave-unfinished-draw confirm, one-tap blackout, no page errors.

**Not run here:** real Supabase Storage (signed upload and download URLs, the 300 MB global limit), real Realtime, the admin pages (they need a database session) and the real LED wall and mixer. Task 8 covers all of these on the rehearsal set-up.

## Global Constraints

- **Do not run `npm run db:push` or deploy until Task 8.** `db:push` targets the production Supabase project. Migrations 20–21 and the app go live together.
- **Database rules (same as every earlier migration):** functions are `SECURITY DEFINER` with `set search_path = public, extensions`; every migration ends with `select public.lock_down_public();`, so `anon` and `authenticated` cannot execute anything and RLS is on for the new table. `stage_state` stays the only table the anon key may read.
- **Screen keys are fixed and listed twice:** `screen_keys()` in migration 20 and `SCREEN_KEYS` / `SCREENS` in `src/lib/screens.ts`, same 12 keys, same order: `ambient_arrival, ambient_dinner, ambient_afterparty, candid_cam, welcome, director_gm, award_intro, nominees, doorprize_intro, draw, closing, blackout`. A unit test reads the migration and compares.
- **Kinds:** `loop` (silent, never ends: the three ambients and `candid_cam`), `once` (plays once with sound: `welcome`, `director_gm`, `award_intro`, `nominees`, `doorprize_intro`), `draw`, `card` (`closing`), `black` (`blackout`). `doorprize_intro` always holds its last frame.
- **Wrapped function:** `report_rows` becomes a wrapper around `report_rows_mc` (which still wraps `report_rows_merch` → `report_rows_core`). A later migration that redefines it must keep calling `report_rows_mc`. The migration says so in a comment.
- **Status names:** existing `OK`, `INVALID`, `NOT_FOUND`, `NO_VIDEO`, plus new `CHANGED`, `IGNORED`, `STALE`.
- **Video contract (spec §9):** 16:9 (±1%), H.264 MP4 with fast start (the check looks for `avc1` in the first 8 MB), ≤ 300 MB (314 572 800 bytes), duration > 0 and ≤ 1 hour. Storage path `<key>/v<version>.mp4`; a new upload is always a new version.
- **Roles:** new role `screen`, accepted on `/api/station/screen/*` only (admins too). Uploads and screen settings are admin-only. The stage cookie may call `/api/stage/screens`, `/ended` and `/heartbeat`, never the switch.
- **Copy:** every new station/stage string exists in both `id` and `en` with the same `{placeholders}` (`tests/unit/strings.test.ts` enforces this). The admin console stays English. No congratulations wording.
- **Tests:** unit tests run with `npm run test:unit`. Database tests run on a local Supabase stack (Docker): `npx supabase start` once, then `npx supabase db reset && npx supabase test db` after each SQL change.

## Deviations from the spec (decided while building, all minor)

| Spec | Plan | Why |
|:--|:--|:--|
| §3.2 `rundown_segments.suggested_screen` edited with the segment | New `admin_set_segment_screen` + `POST /api/admin/rundown/[id]/screen`, a **Screen** dropdown in the rundown table that saves on change | Same shape as the VIP and MC-line corrections; the 140-line `admin_save_segment` stays untouched |
| §3.3 `stage_heartbeat` gains `cache` through the heartbeat | New `stage_heartbeat_report(p_event, p_cache)`; `touch_stage_heartbeat` is unchanged and still used when the body has no valid report | An old display tab that is still open keeps counting as alive |
| §3.3 / §5.2 resume uses server time | `get_stage` also returns `server_now`; `/stage` keeps `server − laptop` from every poll. A screen that changes while the page is open always starts at 0; only the screen found on load resumes by the clock | A wrong laptop clock can then only affect a reload, never a normal switch |
| §3.3 `mc_state` unchanged | `mc_state` is redefined (copy of migration 17 + `suggested_screen`) | The rundown editor reads segments through it |
| §3.3 takeover "audited" via the report | `stage_write` writes a `screen_takeover` audit row (actor `draw`, type `system`); end-of-video switches are `screen_auto_end` (actor `stage`) with `auto: true` | The Screens report reads switches from the audit log only |
| §5.1 "largest last" | Smallest first | Same intent (most screens ready soonest), simpler rule |
| §5.2 one-time sound unlock | The **Turn on sound** button and the **S** key now show in projector-safe mode too; safe mode still never plays the draw sound cues | One-off videos need that click for audio, also in safe mode |
| §6 "H.264" check | `ftyp` box + an `avc1` sample entry in the first 8 MB; a file without fast start is refused with a "re-export with fast start" message | No MP4 parser dependency; §9 already requires fast start |
| §3.1 Storage bucket | Created by the app on the first upload URL (`ensureBucket`: private, `video/mp4`, 300 MB). The project's **global** file size limit is a dashboard step in the runbook | Storage is not in the migrations; the global limit cannot be set from SQL |
| §2 closing seed text | Until admin saves, the card shows `stage.closing_1/2` from the strings (EN line 1 "THANK YOU, NOURISH FAMILY") | No seed row content needed |
| §10 API tests for role guards | No route tests; role lists are one-line literals reviewed in Tasks 4 and 7 and exercised in the rehearsal checklist | The repo has no route-test harness (routes need Supabase), as in the MC plan |
| — | Hub launcher gains a **Screen** card | Every other station has one |

## File map

| File | Task | Responsibility |
|:--|:--|:--|
| `supabase/migrations/20261115000020_screen_switcher.sql` | 1 | `screen_keys`, `screen_kind`, `screens` table + trigger, `stage_state.screen/screen_rev`, `stage_heartbeat.cache`, `rundown_segments.suggested_screen`, role `screen`, takeover in `stage_write`, `get_stage`, `screen_state`, `set_screen`, `stage_screen_ended`, `stage_screens`, `stage_heartbeat_report` |
| `supabase/migrations/20261115000021_screen_admin.sql` | 2 | `admin_screen_list`, `admin_save_screen`, `admin_set_screen_video`, `admin_set_segment_screen`, `mc_state` + `suggested_screen`, `report_rows` + `screens`, reset and go-live back to the arrival loop |
| `supabase/tests/database/011…012_screen_*.test.sql` | 1–2 | pgTAP for each migration |
| `src/lib/session.ts`, `admin-text.ts`, `src/app/station/page.tsx`, `src/components/Hub.tsx` | 3 | Role `screen`, login routing, launcher card |
| `src/lib/i18n/screen-strings.ts`, `strings.ts` | 3 | `screen.*`, `stage.cache*`, `stage.closing_*`, `hub.screen*` |
| `src/lib/screens.ts` | 3 | Catalogue and pure logic (parse, start position, confirms, cache flags, file names) |
| `src/lib/mp4-check.ts` | 3 | Upload checks |
| `src/lib/stage.ts`, `src/lib/screen-storage.ts`, `src/app/api/station/screen/*`, `src/app/api/stage/{screens,ended,heartbeat,state}` | 4 | Stage row with the screen, Storage helpers, station and stage endpoints |
| `src/lib/use-screen.ts`, `src/components/screen/*`, `src/app/station/screen/page.tsx`, `src/styles/screen.css` | 5 | Screen Control panel |
| `src/lib/screen-cache.ts`, `use-screen-cache.ts`, `use-stage.ts`, `src/components/stage/{ScreenVideo,ClosingCard}.tsx`, `StageClient.tsx`, `stage.css` | 6 | Stage cache and player |
| `src/lib/admin-screen-text.ts`, `src/app/api/admin/screens/*`, `rundown/[id]/screen`, `ScreenManager.tsx`, screens page, `AdminNav.tsx`, `RundownEditor.tsx`, `mc.ts`, `reports.ts`, `ReportsPanel.tsx` | 7 | Admin |
| `docs/runbooks/screen-switcher.md` | 8 | Setup and rehearsal checklist |

---

### Task 1: Screens, the live screen, takeover and switching (database)

**Files:**
- Create: `docs/2026-11-13-nourishfest-screen-switcher-design.md`, `docs/plans/Nourishfest-plan-screen-switcher.md`
- Create: `supabase/tests/database/011_screen_switcher.test.sql`
- Create: `supabase/migrations/20261115000020_screen_switcher.sql`

**Interfaces:**
- Consumes: `public.audit`, `public.actor_type_of`, `public.lock_down_public`, `public.stage_state`, `public.stage_heartbeat`, `public.rundown_runs`, `public.rundown_segments`, `public.draws`, `public.set_stage`, `public.draw_prize`, `public.resolve_draw` (existing).
- Produces:
  - `screen_keys() → text[]` (12 keys, catalogue order), `screen_kind(text) → 'loop'|'once'|'draw'|'card'|'black'`.
  - Table `screens (event_id, key, video_path, video_version, video_bytes, duration_s, end_action 'hold'|'goto', end_target, card_text, updated_at)`, one row per key per event (trigger on `events`).
  - `stage_state.screen jsonb {key, started_at, by, auto}` (default `ambient_arrival`) and `stage_state.screen_rev bigint`; `stage_heartbeat.cache jsonb`; `rundown_segments.suggested_screen text`.
  - Role `screen` in `station_pins` and `set_station_pin`.
  - `stage_write` sets `screen = draw` (auto) for any phase other than `idle`, bumping `screen_rev` and auditing `screen_takeover`.
  - `get_stage` adds `screen`, `screen_rev`, `server_now`.
  - `screen_state(p_event) → {status, server_now, screen, screen_rev, draw_phase, draw_pending, heartbeat_age, cache, screens: [{key, has_video, duration_s, version}], up_next: {segment_id, title, screen} | null}`
  - `set_screen(p_event, p_key, p_from_screen_rev bigint, p_actor) → {status: OK|CHANGED|NO_VIDEO|INVALID|NOT_FOUND, state?}`
  - `stage_screen_ended(p_event, p_screen_rev bigint) → {status: OK|IGNORED|NO_VIDEO}`
  - `stage_screens(p_event) → {status, videos: [{key, path, version, bytes, duration_s}], closing}`
  - `stage_heartbeat_report(p_event, p_cache jsonb) → void`

- [ ] **Step 1: Copy the spec and this plan into the repo**

Read `engineering/2026-11-13-nourishfest-screen-switcher-design.md` and `engineering/2026-11-13-nourishfest-plan-screen-switcher.md` from the NourishFest 2026 project and save them unchanged as `docs/2026-11-13-nourishfest-screen-switcher-design.md` and `docs/plans/Nourishfest-plan-screen-switcher.md`.

- [ ] **Step 2: Write the failing test**

Create `supabase/tests/database/011_screen_switcher.test.sql`:

````sql
-- pgTAP: screen switcher, part 1 (screens, role, takeover, set_screen, end of video, panel read, manifest, heartbeat).
-- Run with `supabase test db`.
begin;
select plan(57);

insert into public.events (id, name, event_date, mode, doors_at)
values ('00000000-0000-0000-0000-0000000000ee', 'T', '2026-12-08', 'rehearsal', now() + interval '30 days');
insert into public.prizes (id, event_id, name, sort_order, quantity) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000ee', 'Voucher', 10, 1);

-- rows and keys
select is((select count(*)::int from public.screens where event_id = '00000000-0000-0000-0000-0000000000ee'), 12,
          'a new event gets all 12 screen rows');
select is(public.screen_kind('ambient_dinner'), 'loop', 'ambient is a loop');
select is(public.screen_kind('welcome'), 'once', 'welcome plays once');
select is(public.screen_kind('draw'), 'draw', 'draw kind');
select is(public.screen_kind('closing'), 'card', 'closing is a card');
select is(public.screen_kind('blackout'), 'black', 'blackout kind');
select is((select screen ->> 'key' from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'),
          'ambient_arrival', 'stage starts on the arrival loop');
select is((select screen_rev from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), 0::bigint,
          'screen_rev starts at 0');
select throws_ok($$insert into public.screens (event_id, key) values ('00000000-0000-0000-0000-0000000000ee', 'karaoke')$$,
                 '23514', null, 'unknown screen key refused');
insert into public.rundown_segments (id, event_id, sort_order, title, planned_start, duration_min, suggested_screen) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000ee', 10, 'Welcome', '2026-12-08 17:00+08', 10, 'welcome');
select throws_ok($$update public.rundown_segments set suggested_screen = 'karaoke' where id = '00000000-0000-0000-0000-0000000000c1'$$,
                 '23514', null, 'suggested screen must be a known key');

-- role 'screen'
select is(public.set_station_pin('00000000-0000-0000-0000-0000000000ee', 'screen', '5678', 'admin') ->> 'status', 'OK',
          'screen PIN can be set');

-- set_screen
select is(public.set_screen('00000000-0000-0000-0000-0000000000ee', 'karaoke', 0, 'screen') ->> 'status', 'INVALID', 'unknown key');
select is(public.set_screen('00000000-0000-0000-0000-0000000000ee', 'welcome', 0, 'screen') ->> 'status', 'NO_VIDEO',
          'a video screen without a file cannot go live');
select is(public.set_screen('00000000-0000-0000-0000-0000000000ee', 'closing', 0, 'screen') ->> 'status', 'OK', 'closing card goes live');
select is((select screen ->> 'key' from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), 'closing', 'screen is closing');
select is((select screen_rev from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), 1::bigint, 'screen_rev moved');
select is((select (screen ->> 'auto')::boolean from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), false,
          'manual switch is not auto');
select is((select screen ->> 'by' from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), 'screen', 'by the operator');
select is(public.set_screen('00000000-0000-0000-0000-0000000000ee', 'blackout', 0, 'screen') ->> 'status', 'CHANGED',
          'a stale screen_rev gets CHANGED');
select is(public.set_screen('00000000-0000-0000-0000-0000000000ee', 'blackout', 0, 'screen') #>> '{state,screen,key}', 'closing',
          'CHANGED carries the live state');
select is((select count(*)::int from public.audit_log where event_id = '00000000-0000-0000-0000-0000000000ee' and action = 'screen_set'), 1,
          'one switch audited');
select is((select details ->> 'from' from public.audit_log where event_id = '00000000-0000-0000-0000-0000000000ee' and action = 'screen_set'),
          'ambient_arrival', 'audit keeps the previous screen');

-- draw takeover in stage_write
select is(public.set_stage('00000000-0000-0000-0000-0000000000ee', 'idle', null, 'mc') ->> 'status', 'OK', 'idle phase written');
select is((select screen ->> 'key' from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), 'closing',
          'idle does not take the screen');
select is(public.set_stage('00000000-0000-0000-0000-0000000000ee', 'intro', '00000000-0000-0000-0000-0000000000a1', 'mc') ->> 'status', 'OK',
          'MC picks a prize');
select is((select screen ->> 'key' from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), 'draw',
          'the draw board takes over');
select is((select (screen ->> 'auto')::boolean from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), true,
          'takeover is marked auto');
select is((select screen_rev from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), 2::bigint,
          'takeover moves screen_rev');
select is((select count(*)::int from public.audit_log where event_id = '00000000-0000-0000-0000-0000000000ee' and action = 'screen_takeover'), 1,
          'takeover audited');
-- a phase change on the draw board does not bump screen_rev
select lives_ok($$select public.stage_write('00000000-0000-0000-0000-0000000000ee', 'intro', '{}'::jsonb)$$, 'another phase write');
select is((select screen_rev from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), 2::bigint,
          'screen_rev unchanged while already on draw');
insert into public.guests (id, event_id, employee_id, full_name, outlet) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000ee', 'E1', 'Ayu', 'A');
insert into public.check_ins (event_id, guest_id, method, prize_number) values
  ('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000001', 'scan', 1);
select is(public.draw_prize('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-0000000000a1', gen_random_uuid(), 'mc') ->> 'status',
          'DRAWN', 'a real draw still works through the new stage_write');
select is((select phase from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), 'rolling', 'stage is rolling');
select is(public.resolve_draw('00000000-0000-0000-0000-0000000000ee',
          (select id from public.draws where event_id = '00000000-0000-0000-0000-0000000000ee'), 'confirm', 'mc') ->> 'status', 'CONFIRMED', 'confirmed');
select is(public.set_stage('00000000-0000-0000-0000-0000000000ee', 'idle', null, 'mc') ->> 'status', 'OK', 'Layar kosong');
select is((select screen ->> 'key' from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), 'draw',
          'the board stays until the operator moves on');

-- videos and end of video
update public.screens set video_path = 'welcome/v1.mp4', video_version = 1, video_bytes = 1000, duration_s = 30
 where event_id = '00000000-0000-0000-0000-0000000000ee' and key in ('welcome');
update public.screens set video_path = 'ambient_dinner/v1.mp4', video_version = 1, video_bytes = 1000, duration_s = 60
 where event_id = '00000000-0000-0000-0000-0000000000ee' and key = 'ambient_dinner';
select is(public.set_screen('00000000-0000-0000-0000-0000000000ee', 'welcome', 2, 'screen') ->> 'status', 'OK', 'welcome goes live');
select is(public.stage_screen_ended('00000000-0000-0000-0000-0000000000ee', 3) ->> 'status', 'IGNORED', 'hold: end of video changes nothing');
update public.screens set end_action = 'goto', end_target = 'ambient_dinner'
 where event_id = '00000000-0000-0000-0000-0000000000ee' and key = 'welcome';
select is(public.stage_screen_ended('00000000-0000-0000-0000-0000000000ee', 2) ->> 'status', 'IGNORED', 'stale screen_rev ignored');
select is(public.stage_screen_ended('00000000-0000-0000-0000-0000000000ee', 3) ->> 'status', 'OK', 'goto applies');
select is((select screen ->> 'key' from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), 'ambient_dinner',
          'now on the dinner loop');
select is((select screen ->> 'by' from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), 'stage', 'by the stage');
select is(public.stage_screen_ended('00000000-0000-0000-0000-0000000000ee', 4) ->> 'status', 'IGNORED', 'a loop never ends');
select is((select count(*)::int from public.audit_log where event_id = '00000000-0000-0000-0000-0000000000ee' and action = 'screen_auto_end'), 1,
          'auto end audited');

-- panel read
select is(public.screen_state('00000000-0000-0000-0000-0000000000ee') #>> '{screen,key}', 'ambient_dinner', 'panel sees the live screen');
select is((public.screen_state('00000000-0000-0000-0000-0000000000ee') ->> 'screen_rev')::int, 4, 'panel gets screen_rev');
select is(jsonb_array_length(public.screen_state('00000000-0000-0000-0000-0000000000ee') -> 'screens'), 12, 'twelve screens listed');
select is(public.screen_state('00000000-0000-0000-0000-0000000000ee') #>> '{screens,0,key}', 'ambient_arrival', 'in catalogue order');
select is(jsonb_typeof(public.screen_state('00000000-0000-0000-0000-0000000000ee') -> 'up_next'), 'null', 'no up-next before the show');
insert into public.rundown_runs (event_id, segment_id) values
  ('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-0000000000c1');
select is(public.screen_state('00000000-0000-0000-0000-0000000000ee') #>> '{up_next,screen}', 'welcome', 'up next follows the current segment');

-- manifest and heartbeat
select is(jsonb_array_length(public.stage_screens('00000000-0000-0000-0000-0000000000ee') -> 'videos'), 2, 'manifest lists screens with a file');
select is(public.stage_screens('00000000-0000-0000-0000-0000000000ee') #>> '{videos,0,path}', 'ambient_dinner/v1.mp4', 'manifest order');
select lives_ok($$select public.stage_heartbeat_report('00000000-0000-0000-0000-0000000000ee',
                  '{"ready": 1, "total": 2, "failed": ["welcome"], "sound_on": false}')$$, 'heartbeat with a cache report');
select is(public.screen_state('00000000-0000-0000-0000-0000000000ee') #>> '{cache,failed,0}', 'welcome', 'panel sees failed items');
select lives_ok($$select public.stage_heartbeat_report('00000000-0000-0000-0000-0000000000ee', '{"ready": "x"}')$$, 'malformed report');
select is(public.screen_state('00000000-0000-0000-0000-0000000000ee') -> 'cache', '{}'::jsonb, 'a malformed report is stored as {}');
select is((public.get_stage('00000000-0000-0000-0000-0000000000ee') ->> 'screen_rev')::int, 4, 'projector read carries screen_rev');

select * from finish();
rollback;
````


- [ ] **Step 3: Run it to make sure it fails**

Run: `npx supabase db reset && npx supabase test db`
Expected: `011_screen_switcher.test.sql` FAILS (`relation "public.screens" does not exist`); 003–010 still pass.

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/20261115000020_screen_switcher.sql`:

````sql
-- Videotron screen switcher (spec 2026-11-13), part 1: screens, the live screen on stage_state, role 'screen',
-- the draw takeover in stage_write, switching, end-of-video, the panel read, the stage manifest and the cache heartbeat.
-- The screen keys are fixed: screen_keys() here and SCREENS in src/lib/screens.ts must list the same 12 keys.

create function public.screen_keys() returns text[]
language sql immutable
as $$ select array['ambient_arrival', 'ambient_dinner', 'ambient_afterparty', 'candid_cam', 'welcome', 'director_gm',
                   'award_intro', 'nominees', 'doorprize_intro', 'draw', 'closing', 'blackout'] $$;

-- loop: silent looping video · once: plays once with sound · draw: the live draw board · card: in-app card · black.
create function public.screen_kind(p_key text) returns text
language sql immutable
as $$
  select case
    when p_key in ('ambient_arrival', 'ambient_dinner', 'ambient_afterparty', 'candid_cam') then 'loop'
    when p_key in ('welcome', 'director_gm', 'award_intro', 'nominees', 'doorprize_intro') then 'once'
    when p_key = 'draw' then 'draw'
    when p_key = 'closing' then 'card'
    when p_key = 'blackout' then 'black'
  end
$$;

create table public.screens (
  event_id uuid not null references public.events (id),
  key text not null check (key = any (public.screen_keys())),
  video_path text check (video_path ~ '^[a-z_]+/v[0-9]+\.mp4$'),
  video_version int not null default 0 check (video_version >= 0),
  video_bytes bigint check (video_bytes > 0),
  duration_s numeric(8, 2) check (duration_s > 0),
  end_action text not null default 'hold' check (end_action in ('hold', 'goto')),
  end_target text check (end_target = any (public.screen_keys())),
  card_text jsonb,
  updated_at timestamptz not null default now(),
  primary key (event_id, key)
);

insert into public.screens (event_id, key)
select e.id, k from public.events e cross join unnest(public.screen_keys()) k
on conflict do nothing;

create function public.create_screen_rows() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.screens (event_id, key) select new.id, k from unnest(public.screen_keys()) k on conflict do nothing;
  return new;
end $$;
create trigger events_create_screen_rows after insert on public.events
for each row execute function public.create_screen_rows();

-- The live screen. screen_rev moves only when the screen changes; rev also moves on draw phases and options,
-- so screen_rev is what "the operator saw the latest screen" is checked against.
alter table public.stage_state
  add column screen jsonb not null default '{"key": "ambient_arrival", "started_at": null, "by": null, "auto": false}'::jsonb,
  add column screen_rev bigint not null default 0;

-- What the stage laptop last reported about its video cache and sound unlock.
alter table public.stage_heartbeat add column cache jsonb not null default '{}'::jsonb;

alter table public.rundown_segments
  add column suggested_screen text check (suggested_screen = any (public.screen_keys()));

-- New role 'screen'.
do $$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.station_pins'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%checkin%' loop
    execute format('alter table public.station_pins drop constraint %I', c);
  end loop;
end $$;
alter table public.station_pins
  add constraint station_pins_role_check check (role in ('checkin', 'merchandise', 'draw', 'prizes', 'admin', 'bar', 'mc', 'screen'));

create or replace function public.set_station_pin(p_event uuid, p_role text, p_pin text, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if p_role not in ('checkin', 'merchandise', 'draw', 'prizes', 'admin', 'bar', 'mc', 'screen') then
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

-- Draw takeover. stage_write is the only writer of draw phases, so this is the one place it can happen:
-- any phase other than 'idle' puts the draw board on the videotron in the same statement. 'idle' leaves the screen alone.
create or replace function public.stage_write(p_event uuid, p_phase text, p_payload jsonb) returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_old text;
  v_take boolean;
begin
  select screen ->> 'key' into v_old from public.stage_state where event_id = p_event for update;
  v_take := p_phase <> 'idle' and coalesce(v_old, '') <> 'draw';
  insert into public.stage_state (event_id, rev, phase, payload)
  values (p_event, 1, p_phase, coalesce(p_payload, '{}'::jsonb))
  on conflict (event_id) do update
    set rev = public.stage_state.rev + 1, phase = excluded.phase, payload = excluded.payload, updated_at = now(),
        screen = case when v_take then jsonb_build_object('key', 'draw', 'started_at', now(), 'by', 'draw', 'auto', true)
                      else public.stage_state.screen end,
        screen_rev = public.stage_state.screen_rev + case when v_take then 1 else 0 end;
  if v_take then
    perform public.audit(p_event, 'system', 'draw', 'screen_takeover', 'screen', 'draw', jsonb_build_object('from', v_old));
  end if;
end $$;

-- The projector read gains the live screen.
create or replace function public.get_stage(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object(
    'status', 'OK',
    'rev', coalesce(s.rev, 0),
    'phase', coalesce(s.phase, 'idle'),
    'payload', coalesce(s.payload, '{}'::jsonb),
    'options', coalesce(s.options, '{"safe_mode": false, "reduce_effects": false, "language": "en"}'::jsonb),
    'screen', coalesce(s.screen, '{"key": "ambient_arrival", "started_at": null, "by": null, "auto": false}'::jsonb),
    'screen_rev', coalesce(s.screen_rev, 0),
    'server_now', now(),
    'updated_at', s.updated_at)
  from (select 1) one
  left join public.stage_state s on s.event_id = p_event
$$;

-- Everything the Screen Control panel shows, in one read.
create function public.screen_state(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object(
    'status', 'OK',
    'server_now', now(),
    'screen', s.screen,
    'screen_rev', s.screen_rev,
    'draw_phase', s.phase,
    'draw_pending', exists (select 1 from public.draws d where d.event_id = p_event and d.status = 'drawn'),
    'heartbeat_age', (select extract(epoch from (now() - h.seen_at))::int from public.stage_heartbeat h where h.event_id = p_event),
    'cache', coalesce((select h.cache from public.stage_heartbeat h where h.event_id = p_event), '{}'::jsonb),
    'screens', (select coalesce(jsonb_agg(jsonb_build_object(
                    'key', sc.key, 'has_video', sc.video_path is not null, 'duration_s', sc.duration_s, 'version', sc.video_version)
                  order by array_position(public.screen_keys(), sc.key)), '[]'::jsonb)
                  from public.screens sc where sc.event_id = p_event),
    'up_next', (select jsonb_build_object('segment_id', rs.id, 'title', rs.title, 'screen', rs.suggested_screen)
                  from public.rundown_runs r join public.rundown_segments rs on rs.id = r.segment_id
                 where r.event_id = p_event and r.ended_at is null and rs.suggested_screen is not null))
  from public.stage_state s
  where s.event_id = p_event
$$;

-- The operator puts a screen live. p_from_screen_rev is the screen_rev the panel last showed: if anything changed
-- the screen since (another operator, a draw takeover, the end of a video), nothing happens and the caller gets CHANGED.
-- Picking the screen that is already live replays it from the start.
create function public.set_screen(p_event uuid, p_key text, p_from_screen_rev bigint, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  st public.stage_state%rowtype;
begin
  if p_key is null or not (p_key = any (public.screen_keys())) or p_from_screen_rev is null then
    return jsonb_build_object('status', 'INVALID');
  end if;
  select * into st from public.stage_state where event_id = p_event for update;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  if st.screen_rev <> p_from_screen_rev then
    return jsonb_build_object('status', 'CHANGED', 'state', public.screen_state(p_event));
  end if;
  if public.screen_kind(p_key) in ('loop', 'once')
     and (select video_path from public.screens where event_id = p_event and key = p_key) is null then
    return jsonb_build_object('status', 'NO_VIDEO');
  end if;
  update public.stage_state
     set screen = jsonb_build_object('key', p_key, 'started_at', now(), 'by', p_actor, 'auto', false),
         screen_rev = screen_rev + 1, rev = rev + 1, updated_at = now()
   where event_id = p_event;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'screen_set', 'screen', p_key,
                       jsonb_build_object('from', st.screen ->> 'key'));
  return jsonb_build_object('status', 'OK', 'state', public.screen_state(p_event));
end $$;

-- The stage laptop reports that a one-off video reached its end. Only a 'goto' end action does anything, and only
-- if the screen has not changed since the laptop started that video.
create function public.stage_screen_ended(p_event uuid, p_screen_rev bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  st public.stage_state%rowtype;
  sc public.screens%rowtype;
  v_key text;
begin
  select * into st from public.stage_state where event_id = p_event for update;
  if not found or st.screen_rev <> p_screen_rev then
    return jsonb_build_object('status', 'IGNORED');
  end if;
  v_key := st.screen ->> 'key';
  if public.screen_kind(v_key) <> 'once' or v_key = 'doorprize_intro' then
    return jsonb_build_object('status', 'IGNORED');
  end if;
  select * into sc from public.screens where event_id = p_event and key = v_key;
  if sc.end_action <> 'goto' or sc.end_target is null then
    return jsonb_build_object('status', 'IGNORED');
  end if;
  if public.screen_kind(sc.end_target) in ('loop', 'once')
     and (select video_path from public.screens where event_id = p_event and key = sc.end_target) is null then
    return jsonb_build_object('status', 'NO_VIDEO');
  end if;
  update public.stage_state
     set screen = jsonb_build_object('key', sc.end_target, 'started_at', now(), 'by', 'stage', 'auto', true),
         screen_rev = screen_rev + 1, rev = rev + 1, updated_at = now()
   where event_id = p_event;
  perform public.audit(p_event, 'system', 'stage', 'screen_auto_end', 'screen', sc.end_target, jsonb_build_object('from', v_key));
  return jsonb_build_object('status', 'OK');
end $$;

-- What the stage laptop downloads: every screen that has a video, plus the closing card text.
create function public.stage_screens(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object(
    'status', 'OK',
    'videos', coalesce((select jsonb_agg(jsonb_build_object(
                  'key', sc.key, 'path', sc.video_path, 'version', sc.video_version, 'bytes', sc.video_bytes, 'duration_s', sc.duration_s)
                order by array_position(public.screen_keys(), sc.key))
                from public.screens sc where sc.event_id = p_event and sc.video_path is not null), '[]'::jsonb),
    'closing', (select sc.card_text from public.screens sc where sc.event_id = p_event and sc.key = 'closing'))
$$;

-- Heartbeat with the cache report: { ready, total, failed: [key], sound_on }. A malformed report is stored as {}.
create function public.stage_heartbeat_report(p_event uuid, p_cache jsonb) returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v jsonb := '{}'::jsonb;
begin
  if jsonb_typeof(p_cache) = 'object'
     and jsonb_typeof(p_cache -> 'ready') = 'number' and jsonb_typeof(p_cache -> 'total') = 'number'
     and jsonb_typeof(p_cache -> 'failed') = 'array' and jsonb_typeof(p_cache -> 'sound_on') = 'boolean'
     and not exists (select 1 from jsonb_array_elements(p_cache -> 'failed') f
                      where jsonb_typeof(f) <> 'string' or not ((f #>> '{}') = any (public.screen_keys()))) then
    v := jsonb_build_object('ready', p_cache -> 'ready', 'total', p_cache -> 'total',
                            'failed', p_cache -> 'failed', 'sound_on', p_cache -> 'sound_on');
  end if;
  insert into public.stage_heartbeat (event_id, seen_at, cache) values (p_event, now(), v)
  on conflict (event_id) do update set seen_at = now(), cache = v;
end $$;

select public.lock_down_public();
````


- [ ] **Step 5: Run the tests**

Run: `npx supabase db reset && npx supabase test db`
Expected: all files `ok`, `011_screen_switcher.test.sql` 57 tests.

- [ ] **Step 6: Commit**

```bash
git add docs/2026-11-13-nourishfest-screen-switcher-design.md docs/plans/Nourishfest-plan-screen-switcher.md \
  supabase/migrations/20261115000020_screen_switcher.sql supabase/tests/database/011_screen_switcher.test.sql
git commit -m "feat(db): screens, live screen on stage_state, draw takeover, set_screen"
```

### Task 2: Admin settings, uploads, suggested screen, report, reset (database)

**Files:**
- Create: `supabase/tests/database/012_screen_admin.test.sql`
- Create: `supabase/migrations/20261115000021_screen_admin.sql`

**Interfaces:**
- Consumes: Task 1 (`screen_keys`, `screen_kind`, `screens`, `stage_state.screen/screen_rev`, `set_screen`, `stage_screens`); `report_rows` (wrapper chain from migration 19), `reset_rehearsal_data` (migration 19 body), `go_live` (migration 6 body).
- Produces:
  - `admin_screen_list(p_event) → {status, screens: [{key, kind, video_path, video_version, video_bytes, duration_s, end_action, end_target, card_text, updated_at}]}`
  - `admin_save_screen(p_event, p_key, p_data jsonb, p_actor) → {status: OK|INVALID|NOT_FOUND}`; `p_data` keys `end_action` (+ `end_target`) and/or `card_text {id: [l1, l2], en: [l1, l2]}`.
  - `admin_set_screen_video(p_event, p_key, p_path, p_bytes bigint, p_duration numeric, p_actor) → {status: OK|INVALID|STALE|NOT_FOUND, version?}`
  - `admin_set_segment_screen(p_event, p_segment uuid, p_screen text|null, p_actor) → {status: OK|INVALID|NOT_FOUND}`
  - `mc_state` segments gain `suggested_screen`.
  - `report_rows(p_event, 'screens') → {status, rows: [{at, screen, from, by, how: manual|draw takeover|end of video}]}`; `report_rows_mc` keeps the old body.
  - `reset_rehearsal_data` and `go_live` set the screen back to `ambient_arrival`.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/database/012_screen_admin.test.sql`:

````sql
-- pgTAP: screen switcher, part 2 (admin settings and uploads, suggested screen, report, reset, go-live).
-- Run with `supabase test db`.
begin;
select plan(43);

insert into public.events (id, name, event_date, mode, doors_at)
values ('00000000-0000-0000-0000-0000000000ef', 'T', '2026-12-08', 'rehearsal', now() + interval '30 days');
insert into public.rundown_segments (id, event_id, sort_order, title, planned_start, duration_min) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000ef', 10, 'Award', '2026-12-08 19:00+08', 20);

-- list
select is(jsonb_array_length(public.admin_screen_list('00000000-0000-0000-0000-0000000000ef') -> 'screens'), 12, 'all screens listed');
select is(public.admin_screen_list('00000000-0000-0000-0000-0000000000ef') #>> '{screens,4,key}', 'welcome', 'catalogue order');
select is(public.admin_screen_list('00000000-0000-0000-0000-0000000000ef') #>> '{screens,4,kind}', 'once', 'kind included');
select is(public.admin_screen_list('00000000-0000-0000-0000-0000000000ef') #>> '{screens,4,end_action}', 'hold', 'hold by default');

-- end action
select is(public.admin_save_screen('00000000-0000-0000-0000-0000000000ef', 'welcome', '{"end_action": "goto", "end_target": "ambient_dinner"}', 'admin') ->> 'status',
          'OK', 'goto saved');
select is((select end_target from public.screens where event_id = '00000000-0000-0000-0000-0000000000ef' and key = 'welcome'), 'ambient_dinner', 'target stored');
select is(public.admin_save_screen('00000000-0000-0000-0000-0000000000ef', 'welcome', '{"end_action": "goto", "end_target": "draw"}', 'admin') ->> 'status',
          'INVALID', 'cannot end into the draw');
select is(public.admin_save_screen('00000000-0000-0000-0000-0000000000ef', 'welcome', '{"end_action": "goto", "end_target": "welcome"}', 'admin') ->> 'status',
          'INVALID', 'cannot end into itself');
select is(public.admin_save_screen('00000000-0000-0000-0000-0000000000ef', 'welcome', '{"end_action": "goto"}', 'admin') ->> 'status',
          'INVALID', 'goto needs a target');
select is(public.admin_save_screen('00000000-0000-0000-0000-0000000000ef', 'welcome', '{"end_action": "loop"}', 'admin') ->> 'status',
          'INVALID', 'unknown action');
select is(public.admin_save_screen('00000000-0000-0000-0000-0000000000ef', 'doorprize_intro', '{"end_action": "goto", "end_target": "closing"}', 'admin') ->> 'status',
          'INVALID', 'door prize intro always holds');
select is(public.admin_save_screen('00000000-0000-0000-0000-0000000000ef', 'ambient_dinner', '{"end_action": "hold"}', 'admin') ->> 'status',
          'INVALID', 'loops have no end action');
select is(public.admin_save_screen('00000000-0000-0000-0000-0000000000ef', 'welcome', '{"end_action": "hold", "end_target": "closing"}', 'admin') ->> 'status',
          'OK', 'back to hold');
select is((select end_target from public.screens where event_id = '00000000-0000-0000-0000-0000000000ef' and key = 'welcome'), null, 'hold clears the target');
select is(public.admin_save_screen('00000000-0000-0000-0000-0000000000ef', 'karaoke', '{}', 'admin') ->> 'status', 'NOT_FOUND', 'unknown screen');

-- closing text
select is(public.admin_save_screen('00000000-0000-0000-0000-0000000000ef', 'closing',
          '{"card_text": {"id": ["TERIMA KASIH", "Sampai jumpa"], "en": ["THANK YOU", "See you"]}}', 'admin') ->> 'status', 'OK', 'closing text saved');
select is(public.stage_screens('00000000-0000-0000-0000-0000000000ef') #>> '{closing,en,0}', 'THANK YOU', 'manifest carries the closing text');
select is(public.admin_save_screen('00000000-0000-0000-0000-0000000000ef', 'closing',
          '{"card_text": {"id": ["TERIMA KASIH"], "en": ["THANK YOU", "See you"]}}', 'admin') ->> 'status', 'INVALID', 'two lines per language');
select is(public.admin_save_screen('00000000-0000-0000-0000-0000000000ef', 'closing',
          jsonb_build_object('card_text', jsonb_build_object('id', jsonb_build_array(repeat('x', 61), ''), 'en', jsonb_build_array('a', 'b'))), 'admin') ->> 'status',
          'INVALID', 'lines up to 60 characters');
select is(public.admin_save_screen('00000000-0000-0000-0000-0000000000ef', 'welcome',
          '{"card_text": {"id": ["a", "b"], "en": ["a", "b"]}}', 'admin') ->> 'status', 'INVALID', 'card text only on closing');

-- uploads
select is(public.admin_set_screen_video('00000000-0000-0000-0000-0000000000ef', 'welcome', 'welcome/v1.mp4', 50000000, 92.5, 'admin') ->> 'status',
          'OK', 'upload recorded');
select is((select video_version from public.screens where event_id = '00000000-0000-0000-0000-0000000000ef' and key = 'welcome'), 1, 'version 1');
select is(public.admin_set_screen_video('00000000-0000-0000-0000-0000000000ef', 'welcome', 'welcome/v1.mp4', 50000000, 92.5, 'admin') ->> 'status',
          'STALE', 'same version again is stale');
select is(public.admin_set_screen_video('00000000-0000-0000-0000-0000000000ef', 'welcome', 'nominees/v2.mp4', 50000000, 92.5, 'admin') ->> 'status',
          'INVALID', 'path must belong to the key');
select is(public.admin_set_screen_video('00000000-0000-0000-0000-0000000000ef', 'welcome', 'welcome/v2.mp4', 314572801, 92.5, 'admin') ->> 'status',
          'INVALID', 'over 300 MB refused');
select is(public.admin_set_screen_video('00000000-0000-0000-0000-0000000000ef', 'welcome', 'welcome/v2.mp4', 1000, 0, 'admin') ->> 'status',
          'INVALID', 'zero duration refused');
select is(public.admin_set_screen_video('00000000-0000-0000-0000-0000000000ef', 'closing', 'closing/v1.mp4', 1000, 5, 'admin') ->> 'status',
          'INVALID', 'no video on a card screen');
select is(public.admin_set_screen_video('00000000-0000-0000-0000-0000000000ef', 'welcome', 'welcome/v3.mp4', 60000000, 95, 'admin') ->> 'status',
          'OK', 'a newer upload replaces the file');
select is((select video_path from public.screens where event_id = '00000000-0000-0000-0000-0000000000ef' and key = 'welcome'), 'welcome/v3.mp4', 'new path');
select is(public.admin_set_screen_video('00000000-0000-0000-0000-0000000000ef', 'welcome', 'welcome/v2.mp4', 60000000, 95, 'admin') ->> 'status',
          'STALE', 'an older upload finishing late does not win');

-- suggested screen
select is(public.admin_set_segment_screen('00000000-0000-0000-0000-0000000000ef', '00000000-0000-0000-0000-0000000000c1', 'award_intro', 'admin') ->> 'status',
          'OK', 'suggested screen saved');
select is(public.mc_state('00000000-0000-0000-0000-0000000000ef') #>> '{segments,0,suggested_screen}', 'award_intro', 'mc_state carries it');
select is(public.admin_set_segment_screen('00000000-0000-0000-0000-0000000000ef', '00000000-0000-0000-0000-0000000000c1', 'karaoke', 'admin') ->> 'status',
          'INVALID', 'unknown screen refused');
select is(public.admin_set_segment_screen('00000000-0000-0000-0000-0000000000ef', gen_random_uuid(), null, 'admin') ->> 'status',
          'NOT_FOUND', 'unknown segment');

-- report
select is(public.set_screen('00000000-0000-0000-0000-0000000000ef', 'welcome', 0, 'screen') ->> 'status', 'OK', 'a switch to report');
select is(public.report_rows('00000000-0000-0000-0000-0000000000ef', 'screens') #>> '{rows,0,how}', 'manual', 'screens report row');
select is(public.report_rows('00000000-0000-0000-0000-0000000000ef', 'rundown') ->> 'status', 'OK', 'older reports still answer');

-- reset and go-live
select is(public.reset_rehearsal_data('00000000-0000-0000-0000-0000000000ef', 'admin') ->> 'status', 'OK', 'rehearsal reset');
select is((select screen ->> 'key' from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ef'), 'ambient_arrival',
          'reset puts the arrival loop back');
select is((select video_path from public.screens where event_id = '00000000-0000-0000-0000-0000000000ef' and key = 'welcome'), 'welcome/v3.mp4',
          'reset keeps the videos');
select is(public.set_screen('00000000-0000-0000-0000-0000000000ef', 'closing',
          (select screen_rev from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ef'), 'screen') ->> 'status', 'OK', 'switch before going live');
select is(public.go_live('00000000-0000-0000-0000-0000000000ef', 'admin') ->> 'status', 'OK', 'go live');
select is((select screen ->> 'key' from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ef'), 'ambient_arrival',
          'go-live starts from the arrival loop');

select * from finish();
rollback;
````


- [ ] **Step 2: Run it to make sure it fails**

Run: `npx supabase db reset && npx supabase test db`
Expected: `012_screen_admin.test.sql` FAILS (`function public.admin_screen_list(unknown) does not exist`).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261115000021_screen_admin.sql`:

````sql
-- Videotron screen switcher (spec 2026-11-13), part 2: admin settings and uploads, suggested screen per rundown segment,
-- the screens report, and rehearsal reset / go-live putting the arrival loop back.

-- Every screen row for the admin page, in catalogue order.
create function public.admin_screen_list(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object('status', 'OK', 'screens', coalesce(jsonb_agg(jsonb_build_object(
      'key', sc.key, 'kind', public.screen_kind(sc.key), 'video_path', sc.video_path, 'video_version', sc.video_version,
      'video_bytes', sc.video_bytes, 'duration_s', sc.duration_s, 'end_action', sc.end_action, 'end_target', sc.end_target,
      'card_text', sc.card_text, 'updated_at', sc.updated_at)
      order by array_position(public.screen_keys(), sc.key)), '[]'::jsonb))
    from public.screens sc
   where sc.event_id = p_event
$$;

-- Settings: end_action + end_target (one-off videos only; the door prize intro always holds) and card_text (closing only).
-- card_text is { "id": [line1, line2], "en": [line1, line2] }, each line 0–60 characters.
create function public.admin_save_screen(p_event uuid, p_key text, p_data jsonb, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  sc public.screens%rowtype;
  v_action text;
  v_target text;
  v_lang text;
begin
  if jsonb_typeof(p_data) is distinct from 'object' then
    return jsonb_build_object('status', 'INVALID');
  end if;
  select * into sc from public.screens where event_id = p_event and key = p_key for update;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;

  if jsonb_exists(p_data, 'end_action') then
    if public.screen_kind(p_key) <> 'once' then
      return jsonb_build_object('status', 'INVALID');
    end if;
    v_action := p_data ->> 'end_action';
    v_target := nullif(p_data ->> 'end_target', '');
    if v_action = 'hold' then
      v_target := null;
    elsif v_action = 'goto' then
      if p_key = 'doorprize_intro' or v_target is null or not (v_target = any (public.screen_keys()))
         or v_target in ('draw', p_key) then
        return jsonb_build_object('status', 'INVALID');
      end if;
    else
      return jsonb_build_object('status', 'INVALID');
    end if;
  end if;

  if jsonb_exists(p_data, 'card_text') then
    if p_key <> 'closing' or jsonb_typeof(p_data -> 'card_text') is distinct from 'object' then
      return jsonb_build_object('status', 'INVALID');
    end if;
    foreach v_lang in array array['id', 'en'] loop
      if jsonb_typeof(p_data #> array['card_text', v_lang]) is distinct from 'array'
         or jsonb_array_length(p_data #> array['card_text', v_lang]) <> 2
         or exists (select 1 from jsonb_array_elements(p_data #> array['card_text', v_lang]) l
                     where jsonb_typeof(l) <> 'string' or length(l #>> '{}') > 60) then
        return jsonb_build_object('status', 'INVALID');
      end if;
    end loop;
  end if;

  update public.screens set
    end_action = case when jsonb_exists(p_data, 'end_action') then v_action else end_action end,
    end_target = case when jsonb_exists(p_data, 'end_action') then v_target else end_target end,
    card_text  = case when jsonb_exists(p_data, 'card_text')
                      then jsonb_build_object('id', p_data #> '{card_text,id}', 'en', p_data #> '{card_text,en}') else card_text end,
    updated_at = now()
   where event_id = p_event and key = p_key;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'screen_settings', 'screen', p_key,
                       jsonb_build_object('fields', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(p_data) k)));
  return jsonb_build_object('status', 'OK');
end $$;

-- Records a finished upload. The path is '<key>/v<n>.mp4' where n must be newer than the stored version, so an old
-- upload finishing late never replaces a newer file. Size ≤ 300 MB, duration ≤ 1 hour.
create function public.admin_set_screen_video(p_event uuid, p_key text, p_path text, p_bytes bigint, p_duration numeric,
                                              p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  sc public.screens%rowtype;
  v_version int;
begin
  select * into sc from public.screens where event_id = p_event and key = p_key for update;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  if public.screen_kind(p_key) not in ('loop', 'once')
     or p_path is null or p_path !~ ('^' || p_key || '/v[0-9]{1,6}\.mp4$')
     or p_bytes is null or p_bytes not between 1 and 314572800
     or p_duration is null or p_duration <= 0 or p_duration > 3600 then
    return jsonb_build_object('status', 'INVALID');
  end if;
  v_version := substring(p_path from '/v([0-9]+)\.mp4$')::int;
  if v_version <= sc.video_version then
    return jsonb_build_object('status', 'STALE');
  end if;
  update public.screens
     set video_path = p_path, video_version = v_version, video_bytes = p_bytes, duration_s = round(p_duration, 2), updated_at = now()
   where event_id = p_event and key = p_key;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'screen_video', 'screen', p_key,
                       jsonb_build_object('path', p_path, 'bytes', p_bytes, 'duration_s', round(p_duration, 2)));
  return jsonb_build_object('status', 'OK', 'version', v_version);
end $$;

-- The suggested screen of a rundown segment (null clears it). Shown as "Up next" on the Screen Control panel.
create function public.admin_set_segment_screen(p_event uuid, p_segment uuid, p_screen text, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if p_screen is not null and not (p_screen = any (public.screen_keys())) then
    return jsonb_build_object('status', 'INVALID');
  end if;
  update public.rundown_segments set suggested_screen = p_screen, updated_at = now()
   where id = p_segment and event_id = p_event;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'segment_screen', 'segment', p_segment::text,
                       jsonb_build_object('screen', p_screen));
  return jsonb_build_object('status', 'OK');
end $$;

-- mc_state (migration 17) gains each segment's suggested_screen; everything else is unchanged.
create or replace function public.mc_state(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  with cur as (
    select segment_id, started_at from public.rundown_runs where event_id = p_event and ended_at is null
  ), last_run as (
    select distinct on (segment_id) segment_id, started_at, ended_at
      from public.rundown_runs where event_id = p_event
     order by segment_id, started_at desc
  ), seg as (
    select s.id, s.sort_order, s.title, s.planned_start, s.duration_min, s.pic, s.script, s.kind, s.suggested_screen,
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
        'suggested_screen', seg.suggested_screen,
        'started_at', seg.run_started_at, 'ended_at', seg.run_ended_at, 'prizes', seg.prizes)
        order by seg.sort_order, seg.planned_start, seg.id) from seg), '[]'::jsonb))
$$;

-- Report list gains 'screens': every switch from the audit log, oldest first.
-- The previous report_rows keeps its body under report_rows_mc, which still calls report_rows_merch → report_rows_core.
-- A later migration that redefines report_rows must keep calling report_rows_mc (or fold it in).
alter function public.report_rows(uuid, text) rename to report_rows_mc;

create function public.report_rows(p_event uuid, p_report text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  v jsonb;
begin
  if p_report <> 'screens' then
    return public.report_rows_mc(p_event, p_report);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'at', a.at, 'screen', a.entity_id, 'from', a.details ->> 'from', 'by', a.actor,
      'how', case a.action when 'screen_set' then 'manual' when 'screen_takeover' then 'draw takeover' else 'end of video' end)
      order by a.at, a.id), '[]'::jsonb) into v
    from public.audit_log a
   where a.event_id = p_event and a.action in ('screen_set', 'screen_takeover', 'screen_auto_end');
  return jsonb_build_object('status', 'OK', 'rows', v);
end $$;

-- Rehearsal reset also puts the arrival loop back on the videotron. Videos and screen settings stay.
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
     set rev = rev + 1, phase = 'idle', payload = '{}'::jsonb, updated_at = now(),
         screen = jsonb_build_object('key', 'ambient_arrival', 'started_at', now(), 'by', 'admin', 'auto', false),
         screen_rev = screen_rev + 1
   where event_id = p_event;
  update public.events set next_prize_number = 1 where id = p_event;
  perform public.audit(p_event, 'admin', p_actor, 'rehearsal_reset', 'event', p_event::text, '{}'::jsonb);
  return jsonb_build_object('status', 'OK');
end $$;

-- Going live also starts from the arrival loop.
create or replace function public.go_live(p_event uuid, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  update public.events set mode = 'live' where id = p_event and mode = 'rehearsal';
  if not found then
    return jsonb_build_object('status', 'NOT_REHEARSAL');
  end if;
  update public.stage_state
     set rev = rev + 1, updated_at = now(),
         screen = jsonb_build_object('key', 'ambient_arrival', 'started_at', now(), 'by', 'admin', 'auto', false),
         screen_rev = screen_rev + 1
   where event_id = p_event;
  perform public.audit(p_event, 'admin', p_actor, 'go_live', 'event', p_event::text, '{}'::jsonb);
  return jsonb_build_object('status', 'OK');
end $$;

select public.lock_down_public();
````


- [ ] **Step 4: Run the tests**

Run: `npx supabase db reset && npx supabase test db`
Expected: all files `ok`, `012_screen_admin.test.sql` 43 tests, total 357.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261115000021_screen_admin.sql supabase/tests/database/012_screen_admin.test.sql
git commit -m "feat(db): screen admin, uploads, suggested screen, screens report, reset to arrival loop"
```

### Task 3: Role, strings, catalogue and upload checks (shared TypeScript)

**Files:**
- Modify: `src/lib/session.ts`, `src/lib/admin-text.ts`, `src/app/station/page.tsx`, `src/components/Hub.tsx`, `src/lib/i18n/strings.ts`, `tests/unit/admin-text.test.ts`
- Create: `src/lib/i18n/screen-strings.ts`, `src/lib/screens.ts`, `src/lib/mp4-check.ts`
- Test: `tests/unit/screens.test.ts`, `tests/unit/mp4-check.test.ts`

**Interfaces:**
- Consumes: `StringKey`, `STRINGS` from `@/lib/i18n/strings`; migration 20 file (read by the test).
- Produces:
  - Role `'screen'` in `ROLES`; `ROLE_NAME.screen`; login lands on `/station/screen`.
  - From `@/lib/screens`: `SCREEN_KEYS`, `ScreenKey`, `ScreenKind`, `ScreenGroup`, `ScreenDef`, `SCREENS`, `SCREEN_GROUPS`, `isScreenKey(x)`, `screenDef(k)`, `hasVideo(k)`, `screenLabel(k): StringKey`, `LiveScreen`, `DEFAULT_SCREEN`, `parseScreen(raw)`, `startPosition(screen, durationS, live, clientNowMs, offsetMs) → {at, ended}`, `ScreenInfo`, `CacheReport`, `ScreenState`, `drawUnfinished(s)`, `switchConfirm(s, target) → 'replay'|'leave_draw'|null`, `secondsSince(iso, nowMs, offsetMs)`, `cacheIncomplete(c)`, `videoPath(key, version)`, `usbName(key)`.
  - From `@/lib/mp4-check`: `MAX_VIDEO_BYTES`, `HEAD_BYTES`, `VideoMeta`, `VideoProblem`, `isMp4(head)`, `hasAvc1(head)`, `checkVideo(head, meta) → VideoProblem[]`, `describeVideoProblems(problems, meta)`.
  - Strings `hub.screen`, `hub.screen_sub`, `screen.*`, `screen.k.<key>`, `stage.cache`, `stage.cache_failed`, `stage.closing_1`, `stage.closing_2`.

- [ ] **Step 1: Write the failing catalogue test**

Create `tests/unit/screens.test.ts`:

````ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { STRINGS } from '@/lib/i18n/strings';
import {
  cacheIncomplete, drawUnfinished, hasVideo, parseScreen, SCREEN_KEYS, SCREENS, screenLabel, secondsSince, startPosition,
  switchConfirm, usbName, videoPath, type ScreenState,
} from '@/lib/screens';

const state = (extra: Partial<ScreenState>): ScreenState => ({
  server_now: '2026-12-08T10:00:00Z', screen: { key: 'ambient_dinner', started_at: '2026-12-08T09:59:00Z', by: 'screen', auto: false },
  screen_rev: 3, draw_phase: 'idle', draw_pending: false, heartbeat_age: 2, cache: {}, screens: [], up_next: null, ...extra,
});

describe('catalogue', () => {
  it('lists the same 12 keys, in order, as screen_keys() in migration 20', () => {
    const sql = readFileSync(path.resolve(__dirname, '../../supabase/migrations/20261115000020_screen_switcher.sql'), 'utf8');
    const body = /screen_keys\(\) returns text\[\][\s\S]*?array\[([\s\S]*?)\]/.exec(sql)![1];
    expect([...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])).toEqual([...SCREEN_KEYS]);
    expect(SCREENS.map((s) => s.key)).toEqual([...SCREEN_KEYS]);
  });
  it('has a label in both languages for every screen', () => {
    for (const k of SCREEN_KEYS) {
      expect(STRINGS.id[screenLabel(k)], k).toBeTruthy();
      expect(STRINGS.en[screenLabel(k)], k).toBeTruthy();
    }
  });
  it('marks which screens need a video and which carry sound', () => {
    expect(SCREEN_KEYS.filter(hasVideo)).toHaveLength(9);
    expect(SCREENS.filter((s) => s.audio).map((s) => s.key)).toEqual(['welcome', 'director_gm', 'award_intro', 'nominees', 'doorprize_intro']);
  });
  it('names files', () => {
    expect(videoPath('welcome', 3)).toBe('welcome/v3.mp4');
    expect(usbName('welcome')).toBe('05_welcome.mp4');
    expect(usbName('ambient_arrival')).toBe('01_ambient_arrival.mp4');
  });
});

describe('parseScreen', () => {
  it('reads a stored screen', () => {
    expect(parseScreen({ key: 'draw', started_at: 'x', by: 'draw', auto: true })).toEqual({ key: 'draw', started_at: 'x', by: 'draw', auto: true });
  });
  it('falls back to the arrival loop', () => {
    expect(parseScreen(null).key).toBe('ambient_arrival');
    expect(parseScreen({ key: 'karaoke' }).key).toBe('ambient_arrival');
    expect(parseScreen({ key: 'closing', started_at: 5, auto: 'yes' })).toEqual({ key: 'closing', started_at: null, by: null, auto: false });
  });
});

describe('startPosition', () => {
  const now = Date.parse('2026-12-08T10:00:30Z');
  const once = { key: 'welcome' as const, started_at: '2026-12-08T10:00:00Z', by: 'screen', auto: false };
  it('starts at 0 when the switch happened while watching', () => {
    expect(startPosition(once, 60, true, now, 0)).toEqual({ at: 0, ended: false });
  });
  it('resumes on reload using the server clock', () => {
    expect(startPosition(once, 60, false, now, 0)).toEqual({ at: 30, ended: false });
    expect(startPosition(once, 60, false, now, 10_000)).toEqual({ at: 40, ended: false });
  });
  it('shows the end state when the one-off video is over', () => {
    expect(startPosition(once, 20, false, now, 0)).toEqual({ at: 19.95, ended: true });
  });
  it('wraps loops', () => {
    expect(startPosition({ ...once, key: 'ambient_dinner' }, 20, false, now, 0)).toEqual({ at: 10, ended: false });
  });
  it('starts at 0 without a start time or duration', () => {
    expect(startPosition({ ...once, started_at: null }, 60, false, now, 0)).toEqual({ at: 0, ended: false });
    expect(startPosition(once, null, false, now, 0)).toEqual({ at: 0, ended: false });
  });
});

describe('panel logic', () => {
  it('asks before a replay', () => {
    expect(switchConfirm(state({}), 'ambient_dinner')).toBe('replay');
  });
  it('asks before leaving an unfinished draw', () => {
    const onDraw = { key: 'draw' as const, started_at: null, by: 'draw', auto: true };
    expect(switchConfirm(state({ screen: onDraw, draw_phase: 'rolling' }), 'ambient_dinner')).toBe('leave_draw');
    expect(switchConfirm(state({ screen: onDraw, draw_phase: 'revealed', draw_pending: true }), 'ambient_dinner')).toBe('leave_draw');
    expect(switchConfirm(state({ screen: onDraw, draw_phase: 'revealed' }), 'ambient_dinner')).toBeNull();
    expect(switchConfirm(state({ screen: onDraw, draw_phase: 'idle' }), 'closing')).toBeNull();
  });
  it('switches straight away otherwise', () => {
    expect(switchConfirm(state({}), 'closing')).toBeNull();
    expect(drawUnfinished({ draw_phase: 'intro', draw_pending: false })).toBe(true);
  });
  it('counts seconds by the server clock', () => {
    expect(secondsSince('2026-12-08T10:00:00Z', Date.parse('2026-12-08T10:01:05Z'), 0)).toBe(65);
    expect(secondsSince('2026-12-08T10:00:00Z', Date.parse('2026-12-08T10:00:00Z'), -5_000)).toBe(0);
    expect(secondsSince(null, 0, 0)).toBe(0);
  });
  it('flags a missing or failed cache', () => {
    expect(cacheIncomplete({})).toBe(true);
    expect(cacheIncomplete({ ready: 8, total: 9, failed: [], sound_on: true })).toBe(true);
    expect(cacheIncomplete({ ready: 9, total: 9, failed: ['welcome'], sound_on: true })).toBe(true);
    expect(cacheIncomplete({ ready: 9, total: 9, failed: [], sound_on: false })).toBe(false);
  });
});
````


- [ ] **Step 2: Write the failing upload-check test**

Create `tests/unit/mp4-check.test.ts`:

````ts
import { describe, expect, it } from 'vitest';
import { checkVideo, describeVideoProblems, hasAvc1, isMp4, MAX_VIDEO_BYTES } from '@/lib/mp4-check';

const bytes = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
const mp4Head = (withAvc1: boolean) => bytes(`\0\0\0\x20ftypisom....moov....trak${withAvc1 ? '....avc1' : '....hev1'}....`);
const meta = { bytes: 50_000_000, width: 1920, height: 1080, duration: 92.5 };

describe('mp4 check', () => {
  it('recognises the ftyp box and the H.264 sample entry', () => {
    expect(isMp4(mp4Head(true))).toBe(true);
    expect(isMp4(bytes('RIFF....AVI '))).toBe(false);
    expect(hasAvc1(mp4Head(true))).toBe(true);
    expect(hasAvc1(mp4Head(false))).toBe(false);
  });
  it('accepts a 1080p H.264 MP4', () => {
    expect(checkVideo(mp4Head(true), meta)).toEqual([]);
    expect(checkVideo(mp4Head(true), { ...meta, width: 3840, height: 2160 })).toEqual([]);
  });
  it('lists every problem', () => {
    expect(checkVideo(bytes('RIFF....AVI '), meta)).toEqual(['NOT_MP4']);
    expect(checkVideo(mp4Head(false), meta)).toEqual(['NOT_H264']);
    expect(checkVideo(mp4Head(true), { ...meta, bytes: MAX_VIDEO_BYTES + 1 })).toEqual(['TOO_BIG']);
    expect(checkVideo(mp4Head(true), { ...meta, width: 1080, height: 1920 })).toEqual(['NOT_16_9']);
    expect(checkVideo(mp4Head(true), { ...meta, duration: NaN })).toEqual(['NO_DURATION']);
  });
  it('allows 1% ratio tolerance only', () => {
    expect(checkVideo(mp4Head(true), { ...meta, width: 1920, height: 1088 })).toEqual([]);
    expect(checkVideo(mp4Head(true), { ...meta, width: 1920, height: 1200 })).toEqual(['NOT_16_9']);
  });
  it('describes problems with the actual values', () => {
    expect(describeVideoProblems(['NOT_16_9', 'TOO_BIG'], { ...meta, width: 1080, height: 1920, bytes: 400 * 1024 * 1024 }))
      .toBe('Not 16:9 (1080 × 1920). Larger than 300 MB (400 MB).');
  });
});
````


- [ ] **Step 3: Expect the new role name**

Apply this change to `tests/unit/admin-text.test.ts`:

````diff
diff --git a/tests/unit/admin-text.test.ts b/tests/unit/admin-text.test.ts
index 6bb7d40..d22eee6 100644
--- a/tests/unit/admin-text.test.ts
+++ b/tests/unit/admin-text.test.ts
@@ -28,6 +28,6 @@ describe('randomPin', () => {
 
 describe('ROLE_NAME', () => {
   it('names every role', () => {
-    expect(Object.keys(ROLE_NAME).sort()).toEqual(['admin', 'bar', 'checkin', 'draw', 'mc', 'merchandise', 'prizes']);
+    expect(Object.keys(ROLE_NAME).sort()).toEqual(['admin', 'bar', 'checkin', 'draw', 'mc', 'merchandise', 'prizes', 'screen']);
   });
 });
````


- [ ] **Step 4: Run the tests to make sure they fail**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module '@/lib/screens'`, `Cannot find module '@/lib/mp4-check'`, and `names every role` misses `screen`.

- [ ] **Step 5: Add the strings**

Create `src/lib/i18n/screen-strings.ts`:

````ts
/**
 * Videotron screen switcher strings (spec 2026-11-13). Ops styling like the MC screen: short labels read at arm's length.
 * `screen.k.<key>` names each of the 12 screens (src/lib/screens.ts).
 */
export const SCREEN_ID = {
  'hub.screen': 'Layar',
  'hub.screen_sub': 'Kontrol videotron',

  'screen.title': 'LAYAR',
  'screen.on_air': 'TAYANG',
  'screen.loop': 'LOOP',
  'screen.auto': 'OTOMATIS',
  'screen.laptop_ok': 'Laptop stage terhubung',
  'screen.laptop_down': 'Laptop stage TIDAK terhubung',
  'screen.laptop_never': 'Laptop stage belum dibuka',
  'screen.ready': 'Video siap {ready}/{total}',
  'screen.failed': 'Gagal: {names}',
  'screen.sound_off': '⚠ Suara stage belum aktif',
  'screen.offline': 'OFFLINE — mencoba lagi',
  'screen.up_next': 'BERIKUTNYA',
  'screen.go': 'TAYANGKAN',
  'screen.pick': 'Pilih layar, lalu TAYANGKAN.',
  'screen.group_ambient': 'AMBIENT',
  'screen.group_video': 'VIDEO',
  'screen.group_live': 'LIVE',
  'screen.group_card': 'KARTU',
  'screen.no_video': 'Belum ada video',
  'screen.replay_confirm': 'Putar ulang dari awal?',
  'screen.leave_draw_confirm': 'Undian belum selesai — pindah layar?',
  'screen.yes': 'YA',
  'screen.cancel': 'BATAL',
  'screen.changed': 'Layar sudah diganti — cek lagi.',
  'screen.error': 'Gagal. Coba lagi.',

  'screen.k.ambient_arrival': 'Ambient — Kedatangan',
  'screen.k.ambient_dinner': 'Ambient — Makan Malam',
  'screen.k.ambient_afterparty': 'Ambient — After-party',
  'screen.k.candid_cam': 'Cara pakai Candid Cam',
  'screen.k.welcome': 'Selamat Datang',
  'screen.k.director_gm': 'Pesan Direktur & GM',
  'screen.k.award_intro': 'Nourish Award — Intro',
  'screen.k.nominees': 'Nominasi Nourish Award',
  'screen.k.doorprize_intro': 'Door Prize — Intro',
  'screen.k.draw': 'Undian Door Prize',
  'screen.k.closing': 'Penutup',
  'screen.k.blackout': 'Layar hitam',

  'stage.cache': 'Video {ready}/{total}',
  'stage.cache_failed': 'Gagal unduh: {names}',
  'stage.closing_1': 'TERIMA KASIH, NOURISH FAMILY',
  'stage.closing_2': 'MOVE IN UNITY. Together, We Make a Difference',
} as const;

export const SCREEN_EN: Record<keyof typeof SCREEN_ID, string> = {
  'hub.screen': 'Screen',
  'hub.screen_sub': 'Videotron control',

  'screen.title': 'SCREEN',
  'screen.on_air': 'ON SCREEN',
  'screen.loop': 'LOOP',
  'screen.auto': 'AUTO',
  'screen.laptop_ok': 'Stage laptop connected',
  'screen.laptop_down': 'Stage laptop NOT connected',
  'screen.laptop_never': 'Stage laptop not opened yet',
  'screen.ready': 'Videos ready {ready}/{total}',
  'screen.failed': 'Failed: {names}',
  'screen.sound_off': '⚠ Stage sound is off',
  'screen.offline': 'OFFLINE — retrying',
  'screen.up_next': 'UP NEXT',
  'screen.go': 'GO LIVE',
  'screen.pick': 'Pick a screen, then GO LIVE.',
  'screen.group_ambient': 'AMBIENT',
  'screen.group_video': 'VIDEO',
  'screen.group_live': 'LIVE',
  'screen.group_card': 'CARDS',
  'screen.no_video': 'No video yet',
  'screen.replay_confirm': 'Replay from the start?',
  'screen.leave_draw_confirm': 'Draw not finished — switch screen?',
  'screen.yes': 'YES',
  'screen.cancel': 'CANCEL',
  'screen.changed': 'Screen already changed — check again.',
  'screen.error': 'Failed. Try again.',

  'screen.k.ambient_arrival': 'Ambient — Arrival',
  'screen.k.ambient_dinner': 'Ambient — Dinner',
  'screen.k.ambient_afterparty': 'Ambient — After-party',
  'screen.k.candid_cam': 'Candid Cam how-to',
  'screen.k.welcome': 'Welcome',
  'screen.k.director_gm': 'Director & GM message',
  'screen.k.award_intro': 'Nourish Award — Intro',
  'screen.k.nominees': 'Nourish Award nominees',
  'screen.k.doorprize_intro': 'Door Prize — Intro',
  'screen.k.draw': 'Door Prize draw',
  'screen.k.closing': 'Closing',
  'screen.k.blackout': 'Blackout',

  'stage.cache': 'Videos {ready}/{total}',
  'stage.cache_failed': 'Download failed: {names}',
  'stage.closing_1': 'THANK YOU, NOURISH FAMILY',
  'stage.closing_2': 'MOVE IN UNITY. Together, We Make a Difference',
};
````


- [ ] **Step 6: Merge them into the string table**

Apply this change to `src/lib/i18n/strings.ts`:

````diff
diff --git a/src/lib/i18n/strings.ts b/src/lib/i18n/strings.ts
index d7c7f1e..540fc31 100644
--- a/src/lib/i18n/strings.ts
+++ b/src/lib/i18n/strings.ts
@@ -1,6 +1,7 @@
 import { DRAW_EN, DRAW_ID } from './draw-strings';
 import { INVITE_EN, INVITE_ID } from './invite-strings';
 import { MC_EN, MC_ID } from './mc-strings';
+import { SCREEN_EN, SCREEN_ID } from './screen-strings';
 
 export type Lang = 'id' | 'en';
 
@@ -163,6 +164,7 @@ const id = {
   ...DRAW_ID,
   ...INVITE_ID,
   ...MC_ID,
+  ...SCREEN_ID,
 } as const;
 
 export type StringKey = keyof typeof id;
@@ -326,6 +328,7 @@ const en: Record<StringKey, string> = {
   ...DRAW_EN,
   ...INVITE_EN,
   ...MC_EN,
+  ...SCREEN_EN,
 };
 
 export const STRINGS: Record<Lang, Record<StringKey, string>> = { id, en };
````


- [ ] **Step 7: Write the catalogue**

Create `src/lib/screens.ts`:

````ts
/**
 * Videotron screens (spec 2026-11-13): the fixed catalogue and the pure logic the panel and the stage run on.
 * SCREENS must list the same 12 keys, in the same order, as `screen_keys()` in migration 20.
 */
import type { StringKey } from './i18n/strings';

export const SCREEN_KEYS = [
  'ambient_arrival', 'ambient_dinner', 'ambient_afterparty', 'candid_cam', 'welcome', 'director_gm',
  'award_intro', 'nominees', 'doorprize_intro', 'draw', 'closing', 'blackout',
] as const;
export type ScreenKey = (typeof SCREEN_KEYS)[number];
export type ScreenKind = 'loop' | 'once' | 'draw' | 'card' | 'black';
export type ScreenGroup = 'ambient' | 'video' | 'live' | 'card';
export type ScreenDef = { key: ScreenKey; kind: ScreenKind; group: ScreenGroup; audio: boolean };

export const SCREENS: readonly ScreenDef[] = [
  { key: 'ambient_arrival', kind: 'loop', group: 'ambient', audio: false },
  { key: 'ambient_dinner', kind: 'loop', group: 'ambient', audio: false },
  { key: 'ambient_afterparty', kind: 'loop', group: 'ambient', audio: false },
  { key: 'candid_cam', kind: 'loop', group: 'video', audio: false },
  { key: 'welcome', kind: 'once', group: 'video', audio: true },
  { key: 'director_gm', kind: 'once', group: 'video', audio: true },
  { key: 'award_intro', kind: 'once', group: 'video', audio: true },
  { key: 'nominees', kind: 'once', group: 'video', audio: true },
  { key: 'doorprize_intro', kind: 'once', group: 'video', audio: true },
  { key: 'draw', kind: 'draw', group: 'live', audio: false },
  { key: 'closing', kind: 'card', group: 'card', audio: false },
  { key: 'blackout', kind: 'black', group: 'card', audio: false },
];
export const SCREEN_GROUPS: readonly ScreenGroup[] = ['ambient', 'video', 'live', 'card'];

const BY_KEY = new Map(SCREENS.map((s) => [s.key, s]));
export const isScreenKey = (k: unknown): k is ScreenKey => typeof k === 'string' && BY_KEY.has(k as ScreenKey);
export const screenDef = (k: ScreenKey): ScreenDef => BY_KEY.get(k)!;
export const hasVideo = (k: ScreenKey): boolean => ['loop', 'once'].includes(screenDef(k).kind);
export const screenLabel = (k: ScreenKey): StringKey => `screen.k.${k}` as StringKey;

/** The live screen as stored on stage_state.screen. */
export type LiveScreen = { key: ScreenKey; started_at: string | null; by: string | null; auto: boolean };
export const DEFAULT_SCREEN: LiveScreen = { key: 'ambient_arrival', started_at: null, by: null, auto: false };

/** Normalises stage_state.screen from any source (state route, Realtime). Anything unreadable is the arrival loop. */
export function parseScreen(raw: unknown): LiveScreen {
  if (!raw || typeof raw !== 'object') return DEFAULT_SCREEN;
  const r = raw as Record<string, unknown>;
  if (!isScreenKey(r.key)) return DEFAULT_SCREEN;
  return {
    key: r.key,
    started_at: typeof r.started_at === 'string' ? r.started_at : null,
    by: typeof r.by === 'string' ? r.by : null,
    auto: r.auto === true,
  };
}

/**
 * Where a video should start. A screen that changed while the stage was watching starts at 0. On the first row after
 * a load or reload (`live` false) it resumes at server-now minus started_at. Past the end of a one-off video → ended.
 */
export function startPosition(
  screen: LiveScreen, durationS: number | null, live: boolean, clientNowMs: number, offsetMs: number,
): { at: number; ended: boolean } {
  if (live || !screen.started_at) return { at: 0, ended: false };
  const elapsed = Math.max(0, (clientNowMs + offsetMs - Date.parse(screen.started_at)) / 1000);
  if (!durationS || !(durationS > 0)) return { at: 0, ended: false };
  if (screenDef(screen.key).kind === 'loop') return { at: elapsed % durationS, ended: false };
  return elapsed >= durationS ? { at: Math.max(0, durationS - 0.05), ended: true } : { at: elapsed, ended: false };
}

/** What the Screen Control panel reads (`screen_state`). */
export type ScreenInfo = { key: ScreenKey; has_video: boolean; duration_s: number | null; version: number };
export type CacheReport = { ready: number; total: number; failed: ScreenKey[]; sound_on: boolean };
export type ScreenState = {
  server_now: string;
  screen: LiveScreen;
  screen_rev: number;
  draw_phase: string;
  draw_pending: boolean;
  heartbeat_age: number | null;
  cache: Partial<CacheReport>;
  screens: ScreenInfo[];
  up_next: { segment_id: string; title: string; screen: ScreenKey } | null;
};

/** The draw is mid-way: a prize is on screen, a number is rolling or void, or a winner is not yet confirmed. */
export const drawUnfinished = (s: Pick<ScreenState, 'draw_phase' | 'draw_pending'>): boolean =>
  s.draw_pending || ['intro', 'rolling', 'void'].includes(s.draw_phase);

/** The confirmation a switch needs before it is sent, or null when it can go straight away. */
export function switchConfirm(s: ScreenState, target: ScreenKey): 'replay' | 'leave_draw' | null {
  if (target === s.screen.key) return 'replay';
  if (s.screen.key === 'draw' && drawUnfinished(s)) return 'leave_draw';
  return null;
}

/** Seconds into the live screen by the server clock (offset = server minus phone). */
export const secondsSince = (startedIso: string | null, clientNowMs: number, offsetMs: number): number =>
  startedIso ? Math.max(0, Math.floor((clientNowMs + offsetMs - Date.parse(startedIso)) / 1000)) : 0;

/** True when the stage laptop is missing videos, so the panel shows the count in red. */
export const cacheIncomplete = (c: Partial<CacheReport>): boolean =>
  typeof c.ready !== 'number' || typeof c.total !== 'number' || c.ready < c.total || (c.failed?.length ?? 0) > 0;

/** Video files under this name in storage: '<key>/v<version>.mp4'. */
export const videoPath = (key: ScreenKey, version: number): string => `${key}/v${version}.mp4`;

/** USB fallback file name in show order: '05_welcome.mp4'. */
export const usbName = (key: ScreenKey): string =>
  `${String(SCREEN_KEYS.indexOf(key) + 1).padStart(2, '0')}_${key}.mp4`;
````


- [ ] **Step 8: Write the upload checks**

Create `src/lib/mp4-check.ts`:

````ts
/**
 * Upload checks for videotron videos (spec 2026-11-13 §6, §9). Pure functions: the admin page reads the first bytes and
 * the <video> metadata of the chosen file and passes them in, so nothing here touches the DOM.
 */
export const MAX_VIDEO_BYTES = 300 * 1024 * 1024;
export const HEAD_BYTES = 8 * 1024 * 1024; // with +faststart the moov box, and so 'avc1', is near the start
const RATIO = 16 / 9;

export type VideoMeta = { bytes: number; width: number; height: number; duration: number };
export type VideoProblem = 'NOT_MP4' | 'NOT_H264' | 'TOO_BIG' | 'NOT_16_9' | 'NO_DURATION';

const ascii = (b: Uint8Array, at: number, s: string) => [...s].every((c, i) => b[at + i] === c.charCodeAt(0));

/** MP4 files start with a 'ftyp' box: 4 size bytes, then the type. */
export const isMp4 = (head: Uint8Array): boolean => head.length >= 8 && ascii(head, 4, 'ftyp');

/** An H.264 track has an 'avc1' sample entry in the moov box. Only the head is searched (exports need +faststart). */
export function hasAvc1(head: Uint8Array): boolean {
  for (let i = 0; i + 4 <= head.length; i++) if (head[i] === 0x61 && ascii(head, i, 'avc1')) return true;
  return false;
}

/** Every problem with the file, in the order they should be fixed. Empty means it may be uploaded. */
export function checkVideo(head: Uint8Array, meta: VideoMeta): VideoProblem[] {
  const out: VideoProblem[] = [];
  if (!isMp4(head)) out.push('NOT_MP4');
  else if (!hasAvc1(head)) out.push('NOT_H264');
  if (meta.bytes > MAX_VIDEO_BYTES) out.push('TOO_BIG');
  if (!(meta.width > 0 && meta.height > 0) || Math.abs(meta.width / meta.height - RATIO) / RATIO > 0.01) out.push('NOT_16_9');
  if (!(meta.duration > 0) || !Number.isFinite(meta.duration)) out.push('NO_DURATION');
  return out;
}

const PROBLEM_TEXT: Record<VideoProblem, string> = {
  NOT_MP4: 'Not an MP4 file.',
  NOT_H264: 'Not H.264, or exported without “fast start” (moov at the front). Re-export as H.264 MP4 with fast start.',
  TOO_BIG: 'Larger than 300 MB.',
  NOT_16_9: 'Not 16:9.',
  NO_DURATION: 'The browser could not read the length of this video.',
};

/** Admin wording, with the actual values where they help. */
export function describeVideoProblems(problems: VideoProblem[], meta: VideoMeta): string {
  return problems.map((p) => {
    if (p === 'TOO_BIG') return `Larger than 300 MB (${Math.round(meta.bytes / 1024 / 1024)} MB).`;
    if (p === 'NOT_16_9') return `Not 16:9 (${meta.width} × ${meta.height}).`;
    return PROBLEM_TEXT[p];
  }).join(' ');
}
````


- [ ] **Step 9: Add the role**

Apply this change to `src/lib/session.ts`:

````diff
diff --git a/src/lib/session.ts b/src/lib/session.ts
index 3dcb3a4..d92aeb1 100644
--- a/src/lib/session.ts
+++ b/src/lib/session.ts
@@ -5,7 +5,7 @@ import { parseCookies } from './api';
 
 export const STATION_COOKIE = 'nf_station';
 export const DEVICE_COOKIE = 'nf_device';
-export const ROLES = ['checkin', 'merchandise', 'draw', 'prizes', 'admin', 'bar', 'mc'] as const;
+export const ROLES = ['checkin', 'merchandise', 'draw', 'prizes', 'admin', 'bar', 'mc', 'screen'] as const;
 export type Role = (typeof ROLES)[number];
 export type StationSession = { role: Role; label: string; v: number };
 
````


- [ ] **Step 10: Name it in the console**

Apply this change to `src/lib/admin-text.ts`:

````diff
diff --git a/src/lib/admin-text.ts b/src/lib/admin-text.ts
index 4a54a12..c75c052 100644
--- a/src/lib/admin-text.ts
+++ b/src/lib/admin-text.ts
@@ -21,6 +21,7 @@ export const ROLE_NAME: Record<Role, string> = {
   admin: 'Admin console',
   bar: 'Bar',
   mc: 'MC cue card',
+  screen: 'Screen control (videotron)',
 };
 
 /** Four random digits from the browser or Node crypto source. */
````


- [ ] **Step 11: Send the role to its screen after login**

Apply this change to `src/app/station/page.tsx`:

````diff
diff --git a/src/app/station/page.tsx b/src/app/station/page.tsx
index 0b66b9d..f76eb00 100644
--- a/src/app/station/page.tsx
+++ b/src/app/station/page.tsx
@@ -13,6 +13,7 @@ const HOME: Record<string, string | undefined> = {
   prizes: '/station/prizes',
   bar: '/station/bar',
   mc: '/station/mc',
+  screen: '/station/screen',
   admin: '/admin',
 };
 
````


- [ ] **Step 12: Add the launcher card**

Apply this change to `src/components/Hub.tsx`:

````diff
diff --git a/src/components/Hub.tsx b/src/components/Hub.tsx
index 4310df4..de6173b 100644
--- a/src/components/Hub.tsx
+++ b/src/components/Hub.tsx
@@ -4,7 +4,7 @@ import type { ReactNode } from 'react';
 import { useI18n } from '@/lib/i18n';
 import type { StringKey } from '@/lib/i18n/strings';
 
-type Card = { href: string; key: 'checkin' | 'merchandise' | 'bar' | 'draw' | 'mc' | 'prizes' | 'stage' | 'admin'; tint: string; icon: ReactNode };
+type Card = { href: string; key: 'checkin' | 'merchandise' | 'bar' | 'draw' | 'mc' | 'screen' | 'prizes' | 'stage' | 'admin'; tint: string; icon: ReactNode };
 
 const CARDS: Card[] = [
   { href: '/station/check-in', key: 'checkin', tint: '', icon: <><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><path d="m9 12 2 2 4-4" /></> },
@@ -12,6 +12,7 @@ const CARDS: Card[] = [
   { href: '/station/bar', key: 'bar', tint: 'green', icon: <><path d="M8 22h8M12 15v7M5 3h14l-1 7a6 6 0 0 1-12 0z" /><path d="M5.5 7h13" /></> },
   { href: '/station/draw', key: 'draw', tint: 'green', icon: <><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></> },
   { href: '/station/mc', key: 'mc', tint: 'pink', icon: <><rect width="6" height="12" x="9" y="2" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" /></> },
+  { href: '/station/screen', key: 'screen', tint: 'green', icon: <><rect width="20" height="12" x="2" y="4" rx="2" /><path d="m10 8 4 2-4 2z" /><path d="M7 20h10" /></> },
   { href: '/station/prizes', key: 'prizes', tint: '', icon: <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16M10 14.7V17c0 .6-.5 1-1.2 1.2C7.8 18.6 7 20.2 7 22M14 14.7V17c0 .6.5 1 1.2 1.2 1 .4 1.8 2 1.8 3.8" /><path d="M18 2H6v7a6 6 0 0 0 12 0z" /></> },
   { href: '/stage', key: 'stage', tint: 'white', icon: <><rect width="20" height="14" x="2" y="3" rx="2" /><path d="M8 21h8M12 17v4" /></> },
   { href: '/admin', key: 'admin', tint: 'pink', icon: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></> },
````


- [ ] **Step 13: Run the checks**

Run: `npm run test:unit && npx tsc --noEmit && npx eslint src tests`
Expected: all unit tests pass (`strings.test.ts` confirms every new key exists in both languages with the same placeholders); tsc clean; eslint only the two existing `Scanner.tsx` warnings.

- [ ] **Step 14: Commit**

```bash
git add src/lib/session.ts src/lib/admin-text.ts src/app/station/page.tsx src/components/Hub.tsx src/lib/i18n \
  src/lib/screens.ts src/lib/mp4-check.ts tests/unit/screens.test.ts tests/unit/mp4-check.test.ts tests/unit/admin-text.test.ts
git commit -m "feat: screen role, catalogue, strings and upload checks"
```

### Task 4: Station and stage endpoints

**Files:**
- Modify: `src/lib/stage.ts`, `tests/unit/stage.test.ts`, `src/app/api/stage/state/route.ts`
- Replace: `src/app/api/stage/heartbeat/route.ts`
- Create: `src/lib/screen-storage.ts`, `src/app/api/station/screen/state/route.ts`, `src/app/api/station/screen/set/route.ts`, `src/app/api/stage/screens/route.ts`, `src/app/api/stage/ended/route.ts`

**Interfaces:**
- Consumes: Task 1 SQL (`screen_state`, `set_screen`, `stage_screens`, `stage_screen_ended`, `stage_heartbeat_report`, `get_stage`); Task 3 (`parseScreen`, `LiveScreen`, `SCREEN_KEYS`, `MAX_VIDEO_BYTES`); existing `stationGet`, `stationPost`, `guard`, `readStage`, `readJson`, `sameOrigin`, `db`, `rpc`.
- Produces:
  - `StageRow` gains `screen: LiveScreen` and `screen_rev: number` (`parseRow` fills defaults).
  - From `@/lib/screen-storage` (server only): `BUCKET = 'screens'`, `ensureBucket()`, `signedDownloads(paths, download?) → Record<path, url>`, `signedUpload(path) → url`.
  - `GET /api/station/screen/state` (`screen`, admin) → `ScreenState`.
  - `POST /api/station/screen/set` (`screen`, admin) `{ key, from_screen_rev }` → `OK` / `CHANGED` / `NO_VIDEO` with `{ state }`.
  - `GET /api/stage/screens` (stage cookie) → `{ videos: [{key, path, version, bytes, duration_s, url}], closing }`.
  - `POST /api/stage/ended` (stage cookie) `{ screen_rev }` → `OK` / `IGNORED` / `NO_VIDEO`.
  - `POST /api/stage/heartbeat` (stage cookie) `{ cache?: {ready, total, failed, sound_on} }`.
  - `GET /api/stage/state` adds `screen`, `screen_rev`, `server_now`.

- [ ] **Step 1: Write the failing stage-row test**

Apply this change to `tests/unit/stage.test.ts`:

````diff
diff --git a/tests/unit/stage.test.ts b/tests/unit/stage.test.ts
index 5d0c262..94ea074 100644
--- a/tests/unit/stage.test.ts
+++ b/tests/unit/stage.test.ts
@@ -3,10 +3,11 @@ import {
   DEFAULT_OPTIONS, REVEAL_STEP_MS, ROLL_MS, acceptRow, bannerText, noteRolls, parseRow, revealDelays, slotViews,
   type StageRow, type StageSlot,
 } from '@/lib/stage';
+import { DEFAULT_SCREEN } from '@/lib/screens';
 
 const prize = { id: 'p1', name: 'Smart TV', tier: 'Hadiah Utama', quantity: 3 };
 const row = (rev: number, slots: StageSlot[], over: Partial<StageRow> = {}): StageRow => ({
-  rev, phase: 'rolling', options: DEFAULT_OPTIONS, payload: { round_id: 'r1', batch: false, prize, slots }, ...over,
+  rev, phase: 'rolling', options: DEFAULT_OPTIONS, screen: { ...DEFAULT_SCREEN, key: 'draw' }, screen_rev: 1, payload: { round_id: 'r1', batch: false, prize, slots }, ...over,
 });
 const rolling = (slot: number, number: number): StageSlot => ({ slot, number, state: 'rolling' });
 const revealed = (slot: number, number: number, name: string): StageSlot =>
@@ -15,7 +16,12 @@ const revealed = (slot: number, number: number, name: string): StageSlot =>
 describe('parseRow', () => {
   it('accepts the database shape and fills default options', () => {
     const r = parseRow({ rev: 4, phase: 'idle', payload: {}, options: {} });
-    expect(r).toEqual({ rev: 4, phase: 'idle', payload: {}, options: DEFAULT_OPTIONS });
+    expect(r).toEqual({ rev: 4, phase: 'idle', payload: {}, options: DEFAULT_OPTIONS, screen: DEFAULT_SCREEN, screen_rev: 0 });
+  });
+  it('reads the live screen', () => {
+    const r = parseRow({ rev: 9, phase: 'idle', screen: { key: 'welcome', started_at: 't', by: 'screen', auto: false }, screen_rev: '5' });
+    expect(r?.screen.key).toBe('welcome');
+    expect(r?.screen_rev).toBe(5);
   });
   it('accepts a Realtime row with extra columns and a string revision', () => {
     const r = parseRow({ event_id: 'e', rev: '7', phase: 'rolling', payload: { slots: [] }, options: { safe_mode: true, language: 'en' }, updated_at: 'x' });
````


- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/stage.test.ts`
Expected: FAIL — `parseRow` result has no `screen` / `screen_rev`.

- [ ] **Step 3: Carry the screen on the stage row**

Apply this change to `src/lib/stage.ts`:

````diff
diff --git a/src/lib/stage.ts b/src/lib/stage.ts
index 12b0bcd..162a078 100644
--- a/src/lib/stage.ts
+++ b/src/lib/stage.ts
@@ -1,4 +1,5 @@
 import type { Lang } from './i18n/strings';
+import { parseScreen, type LiveScreen } from './screens';
 
 export type StagePhase = 'idle' | 'intro' | 'rolling' | 'revealed' | 'void';
 export type StageSlot = {
@@ -12,7 +13,8 @@ export type StageSlot = {
 export type StagePrize = { id: string; name: string; tier: string | null; quantity: number };
 export type StagePayload = { round_id?: string | null; batch?: boolean; prize?: StagePrize; slots?: StageSlot[] };
 export type StageOptions = { safe_mode: boolean; reduce_effects: boolean; language: Lang };
-export type StageRow = { rev: number; phase: StagePhase; payload: StagePayload; options: StageOptions };
+/** `screen` / `screen_rev` (spec 2026-11-13): what the videotron shows. The draw board is the `draw` screen. */
+export type StageRow = { rev: number; phase: StagePhase; payload: StagePayload; options: StageOptions; screen: LiveScreen; screen_rev: number };
 
 export type SlotKind = 'rolling' | 'landed' | 'revealed' | 'void';
 export type SlotView = { slot: number; number: number; kind: SlotKind; name?: string; outlet?: string; department?: string };
@@ -35,6 +37,8 @@ export function parseRow(raw: unknown): StageRow | null {
     phase: r.phase as StagePhase,
     payload,
     options: { ...DEFAULT_OPTIONS, ...o, language: o.language === 'id' ? 'id' : 'en' },
+    screen: parseScreen(r.screen),
+    screen_rev: Number.isFinite(Number(r.screen_rev)) ? Number(r.screen_rev) : 0,
   };
 }
 
````


- [ ] **Step 4: Storage helpers**

Create `src/lib/screen-storage.ts`:

````ts
import { db } from './db';
import { MAX_VIDEO_BYTES } from './mp4-check';

/**
 * Videotron videos live in a private Storage bucket. Browsers never get a key for it: the admin page gets a signed
 * upload URL, the stage laptop gets signed download URLs. Server-only.
 */
export const BUCKET = 'screens';
const DOWNLOAD_TTL_S = 6 * 3600; // the stage re-fetches the manifest every 60 s, so a long TTL is only for slow downloads

let bucketReady = false;

/** Creates the bucket on first use (private, MP4 only, 300 MB per file). */
export async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  const storage = db().storage;
  const { data } = await storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await storage.createBucket(BUCKET, { public: false, fileSizeLimit: MAX_VIDEO_BYTES, allowedMimeTypes: ['video/mp4'] });
    if (error && !/already exists/i.test(error.message)) throw new Error('bucket_create_failed');
  }
  bucketReady = true;
}

/** path → signed download URL. A path that cannot be signed is left out (the stage shows it as failed). */
export async function signedDownloads(paths: string[], download?: (path: string) => string): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const out: Record<string, string> = {};
  if (download) {
    // Signed URLs with a file name, for the admin "USB fallback" list.
    await Promise.all(paths.map(async (p) => {
      const { data } = await db().storage.from(BUCKET).createSignedUrl(p, DOWNLOAD_TTL_S, { download: download(p) });
      if (data?.signedUrl) out[p] = data.signedUrl;
    }));
    return out;
  }
  const { data, error } = await db().storage.from(BUCKET).createSignedUrls(paths, DOWNLOAD_TTL_S);
  if (error) throw new Error('sign_failed');
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

/** A one-time upload URL for exactly this path (valid 2 hours). */
export async function signedUpload(path: string): Promise<string> {
  await ensureBucket();
  const { data, error } = await db().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error('sign_upload_failed');
  return data.signedUrl;
}
````


- [ ] **Step 5: Panel read**

Create `src/app/api/station/screen/state/route.ts`:

````ts
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { stationGet } from '@/lib/routes';

export const GET = stationGet(['screen'], async () => ok('OK', await rpc('screen_state', { p_event: env().EVENT_ID })));
````


- [ ] **Step 6: Panel switch**

Create `src/app/api/station/screen/set/route.ts`:

````ts
import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, stationPost } from '@/lib/routes';
import { SCREEN_KEYS } from '@/lib/screens';

// from_screen_rev is the screen_rev this panel last showed. If anything changed the screen since, the server answers
// CHANGED with the live state and nothing switches.
const schema = z.object({ key: z.enum(SCREEN_KEYS), from_screen_rev: z.number().int().min(0) });

export const POST = stationPost(['screen'], schema, async ({ actor, body }) => {
  const r = await rpc<{ status: string }>('set_screen', {
    p_event: env().EVENT_ID, p_key: body.key, p_from_screen_rev: body.from_screen_rev, p_actor: actorId(actor),
  });
  return ok(r.status, r);
});
````


- [ ] **Step 7: Stage manifest**

Create `src/app/api/stage/screens/route.ts`:

````ts
import { fail, guard, ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { signedDownloads } from '@/lib/screen-storage';
import { readStage } from '@/lib/stage-session';

type Video = { key: string; path: string; version: number; bytes: number; duration_s: number };

/** The stage laptop's download list: every screen with a video, a signed URL each, and the closing card text. */
export const GET = guard(async (req: Request) => {
  if (!(await readStage(req))) return fail(401, 'NO_SESSION');
  const r = await rpc<{ videos: Video[]; closing: unknown }>('stage_screens', { p_event: env().EVENT_ID });
  const urls = await signedDownloads(r.videos.map((v) => v.path));
  return ok('OK', { videos: r.videos.map((v) => ({ ...v, url: urls[v.path] ?? null })), closing: r.closing });
});
````


- [ ] **Step 8: End of a one-off video**

Create `src/app/api/stage/ended/route.ts`:

````ts
import { z } from 'zod';
import { fail, guard, ok, readJson, sameOrigin } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { readStage } from '@/lib/stage-session';

/** A one-off video reached its end on the stage. Only a 'goto' end action changes the screen (stage_screen_ended). */
export const POST = guard(async (req: Request) => {
  if (!sameOrigin(req)) return fail(403, 'BAD_ORIGIN');
  if (!(await readStage(req))) return fail(401, 'NO_SESSION');
  const body = await readJson(req, z.object({ screen_rev: z.number().int().min(0) }));
  if (!body) return fail(400, 'BAD_INPUT');
  const r = await rpc<{ status: string }>('stage_screen_ended', { p_event: env().EVENT_ID, p_screen_rev: body.screen_rev });
  return ok(r.status);
});
````


- [ ] **Step 9: Heartbeat with the cache report**

Replace the whole of `src/app/api/stage/heartbeat/route.ts` with:

````ts
import { z } from 'zod';
import { fail, guard, ok, sameOrigin } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { SCREEN_KEYS } from '@/lib/screens';
import { readStage } from '@/lib/stage-session';

// The video cache report (spec 2026-11-13 §5.1). Older displays send {}: that still counts as a heartbeat.
const cacheSchema = z.object({
  ready: z.number().int().min(0).max(99), total: z.number().int().min(0).max(99),
  failed: z.array(z.enum(SCREEN_KEYS)).max(12), sound_on: z.boolean(),
});

export const POST = guard(async (req: Request) => {
  if (!sameOrigin(req)) return fail(403, 'BAD_ORIGIN');
  if (!(await readStage(req))) return fail(401, 'NO_SESSION');
  const raw = await req.json().catch(() => ({}));
  const cache = cacheSchema.safeParse((raw as { cache?: unknown })?.cache);
  if (cache.success) await rpc('stage_heartbeat_report', { p_event: env().EVENT_ID, p_cache: cache.data });
  else await rpc('touch_stage_heartbeat', { p_event: env().EVENT_ID });
  return ok('OK');
});
````


- [ ] **Step 10: Projector read with the screen and server time**

Apply this change to `src/app/api/stage/state/route.ts`:

````diff
diff --git a/src/app/api/stage/state/route.ts b/src/app/api/stage/state/route.ts
index ea2ba55..5625d23 100644
--- a/src/app/api/stage/state/route.ts
+++ b/src/app/api/stage/state/route.ts
@@ -5,6 +5,9 @@ import { readStage } from '@/lib/stage-session';
 
 export const GET = guard(async (req: Request) => {
   if (!(await readStage(req))) return fail(401, 'NO_SESSION');
-  const r = await rpc<{ rev: number; phase: string; payload: unknown; options: unknown }>('get_stage', { p_event: env().EVENT_ID });
-  return ok('OK', { rev: r.rev, phase: r.phase, payload: r.payload, options: r.options });
+  const r = await rpc<{ rev: number; phase: string; payload: unknown; options: unknown; screen: unknown; screen_rev: number; server_now: string }>(
+    'get_stage', { p_event: env().EVENT_ID });
+  return ok('OK', {
+    rev: r.rev, phase: r.phase, payload: r.payload, options: r.options, screen: r.screen, screen_rev: r.screen_rev, server_now: r.server_now,
+  });
 });
````


- [ ] **Step 11: Run the checks**

Run: `npm run test:unit && npx tsc --noEmit && npx eslint src tests`
Expected: all pass. Review the role lists by eye: `/api/station/screen/*` accept `['screen']` only (admins pass through `authStation`); the stage routes check `readStage`; `/ended` and `/heartbeat` also check `sameOrigin`.

- [ ] **Step 12: Commit**

```bash
git add src/lib/stage.ts src/lib/screen-storage.ts tests/unit/stage.test.ts src/app/api/station/screen src/app/api/stage
git commit -m "feat: screen station and stage endpoints"
```

### Task 5: The Screen Control panel (`/station/screen`)

**Files:**
- Create: `src/lib/use-screen.ts`, `src/components/screen/ScreenHeader.tsx`, `src/components/screen/ScreenGrid.tsx`, `src/app/station/screen/page.tsx`, `src/styles/screen.css`

**Interfaces:**
- Consumes: Task 3 (`ScreenState`, `SCREENS`, `SCREEN_GROUPS`, `screenDef`, `screenLabel`, `switchConfirm`, `secondsSince`, `cacheIncomplete`, `parseScreen`); Task 4 routes; existing `clockOffset`, `formatClock` from `@/lib/mc`, `heartbeatState` from `@/lib/draw-ui`, `StationShell`, `useStation`, `useI18n`, `api`, `mc.css` (`mc-badge`, `mc-confirm`), `station.css` (`btn--staff`, `btn--staff-dark`).
- Produces: `useScreenState(enabled, intervalMs = 2000) → { state, offset, offline, reload, apply }`; `<ScreenHeader state offset now offline />`; `<ScreenGrid state onState />`.

- [ ] **Step 1: Polling hook**

Create `src/lib/use-screen.ts`:

````ts
'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from './client';
import { clockOffset } from './mc';
import { parseScreen, type ScreenState } from './screens';

/**
 * The Screen Control panel's view. Polls every 2 seconds like the MC and draw screens and never depends on Realtime.
 * Keeps the last good state when the network drops. `offset` is the server clock minus this phone's clock.
 */
export function useScreenState(enabled: boolean, intervalMs = 2_000) {
  const [state, setState] = useState<ScreenState | null>(null);
  const [offset, setOffset] = useState(0);
  const [offline, setOffline] = useState(false);

  const apply = useCallback((s: ScreenState) => {
    setState({ ...s, screen: parseScreen(s.screen) });
    setOffset(clockOffset(s.server_now, Date.now()));
    setOffline(false);
  }, []);

  const reload = useCallback(async () => {
    const r = await api<ScreenState>('/api/station/screen/state');
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
````


- [ ] **Step 2: Header (live screen, progress, laptop and cache status)**

Create `src/components/screen/ScreenHeader.tsx`:

````tsx
'use client';
import { heartbeatState } from '@/lib/draw-ui';
import { useI18n } from '@/lib/i18n';
import { formatClock } from '@/lib/mc';
import { cacheIncomplete, screenDef, screenLabel, secondsSince, type ScreenState } from '@/lib/screens';

/** What is on the videotron now, how far into it, and whether the stage laptop is alive and has every video. */
export function ScreenHeader({ state, offset, now, offline }: { state: ScreenState | null; offset: number; now: number; offline: boolean }) {
  const { t } = useI18n();
  if (!state) return <div className="scr-head">{offline && <div className="scr-head__offline" role="status">{t('screen.offline')}</div>}</div>;

  const def = screenDef(state.screen.key);
  const info = state.screens.find((s) => s.key === state.screen.key);
  const elapsed = secondsSince(state.screen.started_at, now, offset);
  const duration = info?.duration_s ? Math.round(info.duration_s) : null;
  const link = heartbeatState(state.heartbeat_age);
  const cache = state.cache;
  const failed = (cache.failed ?? []).map((k) => t(screenLabel(k))).join(', ');

  return (
    <div className="scr-head">
      {offline && <div className="scr-head__offline" role="status">{t('screen.offline')}</div>}
      <div className="scr-head__label">{t('screen.on_air')}</div>
      <div className="scr-head__title">
        {t(screenLabel(state.screen.key))}
        {state.screen.auto && <span className="mc-badge mc-badge--green">{t('screen.auto')}</span>}
      </div>
      {def.kind === 'once' && duration ? (
        <div className="scr-progress" aria-label={`${formatClock(Math.min(elapsed, duration))} / ${formatClock(duration)}`}>
          <div className="scr-progress__bar" style={{ width: `${Math.min(100, (elapsed / duration) * 100)}%` }} />
          <span>{formatClock(Math.min(elapsed, duration))} / {formatClock(duration)}</span>
        </div>
      ) : def.kind === 'loop' ? (
        <div className="scr-head__meta">{t('screen.loop')}</div>
      ) : null}
      <div className="scr-head__status">
        <span className={`scr-dot scr-dot--${link}`} aria-hidden="true" />
        <span>{t(link === 'ok' ? 'screen.laptop_ok' : link === 'down' ? 'screen.laptop_down' : 'screen.laptop_never')}</span>
        {typeof cache.ready === 'number' && typeof cache.total === 'number' && (
          <span className={cacheIncomplete(cache) ? 'scr-head__bad' : 'scr-head__good'}>{t('screen.ready', { ready: cache.ready, total: cache.total })}</span>
        )}
      </div>
      {failed && <div className="scr-head__bad">{t('screen.failed', { names: failed })}</div>}
    </div>
  );
}
````


- [ ] **Step 3: Up next, the 12 buttons and GO LIVE**

Create `src/components/screen/ScreenGrid.tsx`:

````tsx
'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import { useI18n } from '@/lib/i18n';
import type { StringKey } from '@/lib/i18n/strings';
import { SCREEN_GROUPS, SCREENS, screenDef, screenLabel, switchConfirm, type ScreenKey, type ScreenState } from '@/lib/screens';

const GROUP_LABEL: Record<string, StringKey> = {
  ambient: 'screen.group_ambient', video: 'screen.group_video', live: 'screen.group_live', card: 'screen.group_card',
};

/**
 * Up next + the 12 buttons. Two steps: tap selects, TAYANGKAN puts it live. Blackout is one tap.
 * Every switch carries the screen_rev this panel showed; CHANGED means someone else moved the screen first.
 */
export function ScreenGrid({ state, onState }: { state: ScreenState; onState: (s: ScreenState) => void }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<ScreenKey | null>(null);
  const [confirm, setConfirm] = useState<{ key: ScreenKey; kind: 'replay' | 'leave_draw' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const hasFile = (k: ScreenKey) => {
    const kind = screenDef(k).kind;
    return (kind !== 'loop' && kind !== 'once') || !!state.screens.find((s) => s.key === k)?.has_video;
  };
  const soundOff = state.cache.sound_on === false;

  async function send(key: ScreenKey) {
    setBusy(true);
    setMsg('');
    const r = await api<{ state?: ScreenState }>('/api/station/screen/set', { key, from_screen_rev: state.screen_rev });
    setBusy(false);
    setConfirm(null);
    if (r.data?.state) onState(r.data.state);
    if (r.status === 'OK') setSelected(null);
    else setMsg(t(r.status === 'CHANGED' ? 'screen.changed' : r.status === 'NO_VIDEO' ? 'screen.no_video' : 'screen.error'));
  }

  function go(key: ScreenKey) {
    const ask = switchConfirm(state, key);
    if (ask) setConfirm({ key, kind: ask });
    else send(key);
  }

  const up = state.up_next;
  return (
    <div className="scr-body">
      {up && up.screen !== state.screen.key && (
        <section className="scr-next">
          <h2>{t('screen.up_next')}</h2>
          <div className="scr-next__line">{up.title} → <b>{t(screenLabel(up.screen))}</b>{screenDef(up.screen).audio && ' 🔊'}</div>
          <button type="button" className="btn--staff" disabled={busy || !hasFile(up.screen)} onClick={() => go(up.screen)}>{t('screen.go')}</button>
        </section>
      )}

      {SCREEN_GROUPS.map((g) => (
        <section key={g} className="scr-group">
          <h2>{t(GROUP_LABEL[g])}</h2>
          <div className="scr-grid">
            {SCREENS.filter((s) => s.group === g).map((s) => {
              const live = state.screen.key === s.key;
              const ready = hasFile(s.key);
              return (
                <button key={s.key} type="button" disabled={!ready || busy}
                  className={['scr-btn', live && 'scr-btn--live', selected === s.key && 'scr-btn--selected', s.key === 'blackout' && 'scr-btn--black'].filter(Boolean).join(' ')}
                  aria-pressed={selected === s.key}
                  onClick={() => (s.key === 'blackout' ? go('blackout') : setSelected(s.key))}>
                  <span>{t(screenLabel(s.key))}{s.audio && ' 🔊'}</span>
                  {!ready && <small>{t('screen.no_video')}</small>}
                  {live && <small>● {t('screen.on_air')}</small>}
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <div className="scr-go">
        {confirm ? (
          <div className="mc-confirm">
            <p>{t(confirm.kind === 'replay' ? 'screen.replay_confirm' : 'screen.leave_draw_confirm')}</p>
            <div className="scr-go__row">
              <button type="button" className="btn--staff" disabled={busy} onClick={() => send(confirm.key)}>{t('screen.yes')}</button>
              <button type="button" className="btn--staff btn--staff-dark" onClick={() => setConfirm(null)}>{t('screen.cancel')}</button>
            </div>
          </div>
        ) : (
          <>
            {selected && screenDef(selected).audio && soundOff && <p className="scr-warn" role="alert">{t('screen.sound_off')}</p>}
            {msg && <p className="scr-warn" role="alert">{msg}</p>}
            <button type="button" className="btn--staff scr-go__btn" disabled={!selected || busy} onClick={() => selected && go(selected)}>
              {selected ? `${t('screen.go')}: ${t(screenLabel(selected))}` : t('screen.pick')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
````


- [ ] **Step 4: The page**

Create `src/app/station/screen/page.tsx`:

````tsx
'use client';
import { useEffect, useState } from 'react';
import { ScreenGrid } from '@/components/screen/ScreenGrid';
import { ScreenHeader } from '@/components/screen/ScreenHeader';
import { StationShell } from '@/components/station/StationShell';
import { useI18n } from '@/lib/i18n';
import { useScreenState } from '@/lib/use-screen';
import { useStation } from '@/lib/use-station';
import '@/styles/mc.css';
import '@/styles/screen.css';

/** Screen Control (spec 2026-11-13): one operator puts screens live on the videotron. Any number of devices share one state. */
export default function ScreenStation() {
  const { me } = useStation('screen');
  const { t } = useI18n();
  const { state, offset, offline, apply } = useScreenState(!!me);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  if (!me) return null;
  return (
    <StationShell title={t('screen.title')} me={me}>
      <ScreenHeader state={state} offset={offset} now={now} offline={offline} />
      {state && <ScreenGrid state={state} onState={apply} />}
    </StationShell>
  );
}
````


- [ ] **Step 5: Styles**

Create `src/styles/screen.css`:

````css
/* Screen Control (/station/screen). Ops styling on top of station.css and mc.css. */
.scr-head { position: sticky; top: 0; z-index: 2; padding: 10px var(--nf-gutter); background: var(--nf-card); border-bottom: 3px solid var(--nf-gold); display: grid; gap: 4px; }
.scr-head__offline { padding: 4px 10px; border-radius: 8px; background: var(--nf-gold); color: var(--nf-black); font-family: var(--nf-font-label); font-weight: 600; font-size: 13px; letter-spacing: .1em; }
.scr-head__label { font-family: var(--nf-font-label); font-weight: 600; font-size: 13px; letter-spacing: .2em; color: var(--nf-green); }
.scr-head__title { font-family: var(--nf-font-heading); font-size: 26px; line-height: 1.1; text-transform: uppercase; overflow-wrap: anywhere; }
.scr-head__meta { font-family: var(--nf-font-label); font-weight: 600; letter-spacing: .12em; color: var(--nf-text-soft); }
.scr-head__status { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; font-size: 14px; color: var(--nf-text-soft); }
.scr-head__good { color: var(--nf-green); font-weight: 600; }
.scr-head__bad { color: var(--nf-pink); font-weight: 600; }
.scr-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--nf-text-muted); }
.scr-dot--ok { background: var(--nf-green); }
.scr-dot--down { background: var(--nf-pink); }
.scr-progress { position: relative; height: 26px; border-radius: 8px; background: var(--nf-black); overflow: hidden; }
.scr-progress__bar { position: absolute; inset: 0 auto 0 0; background: var(--nf-gold); }
.scr-progress span { position: relative; display: block; text-align: center; line-height: 26px; font-family: var(--nf-font-label); font-weight: 600; color: var(--nf-text); mix-blend-mode: difference; }

.scr-body { padding: var(--nf-gutter); display: grid; gap: 16px; padding-bottom: 150px; }
.scr-body h2 { margin: 0 0 8px; font-family: var(--nf-font-label); font-weight: 600; font-size: 14px; letter-spacing: .2em; color: var(--nf-gold); }
.scr-next { padding: 12px; border: 3px solid var(--nf-gold); border-radius: 14px; display: grid; gap: 10px; }
.scr-next__line { font-size: 18px; }
.scr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.scr-btn { min-height: 76px; padding: 8px 10px; display: flex; flex-direction: column; justify-content: center; gap: 4px; border-radius: 14px; border: 2px solid var(--nf-line-dash); background: transparent; color: var(--nf-text); font-family: var(--nf-font-heading); font-size: 17px; line-height: 1.1; text-align: left; text-transform: uppercase; }
.scr-btn small { font-family: var(--nf-font-label); font-weight: 600; font-size: 12px; letter-spacing: .1em; text-transform: none; color: var(--nf-text-muted); }
.scr-btn:disabled { opacity: .45; }
.scr-btn--selected { border-color: var(--nf-gold); box-shadow: 0 0 0 3px var(--nf-gold) inset; }
.scr-btn--live { border-color: var(--nf-green); }
.scr-btn--live small { color: var(--nf-green); }
.scr-btn--black { background: #000; border-color: var(--nf-pink); }
.scr-go { position: fixed; left: 0; right: 0; bottom: 0; padding: 10px var(--nf-gutter) calc(10px + env(safe-area-inset-bottom)); background: var(--nf-black); border-top: 2px solid var(--nf-line-dash); display: grid; gap: 8px; }
.scr-go__btn { min-height: 72px; font-size: 24px; }
.scr-go__row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.scr-warn { margin: 0; color: var(--nf-pink); font-weight: 600; }
````


- [ ] **Step 6: Run the checks**

Run: `npx tsc --noEmit && npx eslint src`
Expected: clean (apart from the two `Scanner.tsx` warnings).

- [ ] **Step 7: Check it on a phone-sized screen**

Run `npm run dev` against the dev Supabase project with Task 1–2 migrations applied (`npx supabase db reset` on the local stack and `.env.local` pointing at it), set a `screen` PIN in SQL (`select public.set_station_pin('<EVENT_ID>', 'screen', '5678', 'dev');`), log in at `/station` in a 390 px-wide window. Expected: header **ON SCREEN · Ambient — Arrival · LOOP**, the four groups, video buttons greyed **No video yet** (nothing uploaded), **Closing → GO LIVE** switches and the header follows; **Blackout** switches in one tap.

- [ ] **Step 8: Commit**

```bash
git add src/lib/use-screen.ts src/components/screen src/app/station/screen src/styles/screen.css
git commit -m "feat: Screen Control panel"
```

### Task 6: The stage plays the screens from a local cache

**Files:**
- Create: `src/lib/screen-cache.ts`, `src/lib/use-screen-cache.ts`, `src/components/stage/ScreenVideo.tsx`, `src/components/stage/ClosingCard.tsx`
- Modify: `src/lib/use-stage.ts`, `src/styles/stage.css`
- Replace: `src/app/stage/StageClient.tsx`
- Test: `tests/unit/screen-cache.test.ts`

**Interfaces:**
- Consumes: Task 3 (`ScreenKey`, `screenDef`, `screenLabel`, `startPosition`), Task 4 (`/api/stage/screens`, `/api/stage/ended`, heartbeat body, `StageRow.screen/screen_rev`, `server_now`); existing `StageView`, `createSound`, `fitScale`, `api`, `translate`, `.board` / `.idle__mark` / `.idle__theme` styles.
- Produces:
  - From `@/lib/screen-cache`: `ManifestVideo`, `ClosingText`, `Manifest`, `CacheProgress`, `CACHE_NAME = 'nf-screens'`, `cacheKey(path)`, `pathFromKey(url)`, `planCache(videos, cachedPaths) → {download, remove}`, `parseManifest(raw)`, `syncCache(manifest, onProgress)`, `videoSource(video) → {src, release} | null`.
  - `useScreenCache(enabled) → { manifest, progress }` (manifest every 60 s and on tab focus).
  - `useStage(cfg, beatBody?)` returns `offset` too and sends `{ cache: beatBody() }` with every heartbeat.
  - `<ScreenVideo screenKey screenRev video start soundOn onEnded onFailed />`, `<ClosingCard lang text brandOnly? />`.

- [ ] **Step 1: Write the failing cache-plan test**

Create `tests/unit/screen-cache.test.ts`:

````ts
import { describe, expect, it } from 'vitest';
import { cacheKey, parseManifest, pathFromKey, planCache } from '@/lib/screen-cache';

describe('screen cache', () => {
  it('maps paths to cache keys and back', () => {
    expect(cacheKey('welcome/v2.mp4')).toBe('/__nf-screens/welcome/v2.mp4');
    expect(pathFromKey('https://nf.example/__nf-screens/welcome/v2.mp4')).toBe('welcome/v2.mp4');
    expect(pathFromKey('https://nf.example/other')).toBeNull();
  });
  it('downloads what is missing, smallest first, and drops old versions', () => {
    const videos = [{ path: 'welcome/v2.mp4', bytes: 90 }, { path: 'ambient_dinner/v1.mp4', bytes: 10 }, { path: 'nominees/v1.mp4', bytes: 50 }];
    expect(planCache(videos, ['welcome/v1.mp4', 'nominees/v1.mp4'])).toEqual({
      download: ['ambient_dinner/v1.mp4', 'welcome/v2.mp4'],
      remove: ['welcome/v1.mp4'],
    });
    expect(planCache([], ['x/v1.mp4'])).toEqual({ download: [], remove: ['x/v1.mp4'] });
  });
  it('reads the manifest defensively', () => {
    expect(parseManifest(null)).toEqual({ videos: [], closing: null });
    const m = parseManifest({
      videos: [{ key: 'welcome', path: 'welcome/v1.mp4', version: 1, bytes: 5, duration_s: 9, url: 'u' }, { nope: 1 }],
      closing: { id: ['A', 'B'], en: ['C', 'D'] },
    });
    expect(m.videos).toHaveLength(1);
    expect(m.closing?.en[0]).toBe('C');
    expect(parseManifest({ videos: [], closing: { id: ['A'], en: ['C', 'D'] } }).closing).toBeNull();
  });
});
````


- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/screen-cache.test.ts`
Expected: FAIL — `Cannot find module '@/lib/screen-cache'`.

- [ ] **Step 3: The cache**

Create `src/lib/screen-cache.ts`:

````ts
/**
 * The stage laptop's local copy of the videotron videos (spec 2026-11-13 §5.1). Videos are fetched once into Cache Storage
 * and played from there, so playback never depends on the venue network. Cache entries are keyed by storage path, and a
 * new upload has a new path ('<key>/v<n>.mp4'), so a replaced video is simply a new entry.
 */
import type { ScreenKey } from './screens';

export type ManifestVideo = { key: ScreenKey; path: string; version: number; bytes: number; duration_s: number; url: string | null };
export type ClosingText = { id: [string, string]; en: [string, string] } | null;
export type Manifest = { videos: ManifestVideo[]; closing: ClosingText };
export type CacheProgress = { ready: number; total: number; failed: ScreenKey[] };

export const CACHE_NAME = 'nf-screens';
const PREFIX = '/__nf-screens/';

/** Same-origin URL used only as a Cache Storage key (never fetched). */
export const cacheKey = (path: string): string => `${PREFIX}${path}`;
export const pathFromKey = (url: string): string | null => {
  const i = url.indexOf(PREFIX);
  return i < 0 ? null : url.slice(i + PREFIX.length);
};

/** Which manifest paths to download (smallest first, so most screens are ready soonest) and which cached paths to drop. */
export function planCache(videos: Pick<ManifestVideo, 'path' | 'bytes'>[], cachedPaths: string[]): { download: string[]; remove: string[] } {
  const want = new Set(videos.map((v) => v.path));
  const have = new Set(cachedPaths);
  return {
    download: [...videos].sort((a, b) => a.bytes - b.bytes).map((v) => v.path).filter((p) => !have.has(p)),
    remove: cachedPaths.filter((p) => !want.has(p)),
  };
}

/** Normalises the manifest from /api/stage/screens. */
export function parseManifest(raw: unknown): Manifest {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { videos?: unknown; closing?: unknown };
  const videos = Array.isArray(r.videos)
    ? (r.videos as ManifestVideo[]).filter((v) => v && typeof v.path === 'string' && typeof v.key === 'string')
    : [];
  const c = r.closing as { id?: unknown; en?: unknown } | null;
  const two = (x: unknown): x is [string, string] => Array.isArray(x) && x.length === 2 && x.every((s) => typeof s === 'string');
  return { videos, closing: c && two(c.id) && two(c.en) ? { id: c.id, en: c.en } : null };
}

/** Downloads what is missing, drops what is no longer listed, and reports progress after each file. Never throws. */
export async function syncCache(m: Manifest, onProgress: (p: CacheProgress) => void): Promise<CacheProgress> {
  const total = m.videos.length;
  const failed: ScreenKey[] = [];
  let cache: Cache;
  try {
    await navigator.storage?.persist?.().catch(() => false);
    cache = await caches.open(CACHE_NAME);
  } catch {
    const p = { ready: 0, total, failed: m.videos.map((v) => v.key) };
    onProgress(p);
    return p;
  }
  const cached = (await cache.keys()).map((r) => pathFromKey(r.url)).filter((p): p is string => !!p);
  const plan = planCache(m.videos, cached);
  await Promise.all(plan.remove.map((p) => cache.delete(cacheKey(p)).catch(() => false)));

  let ready = total - plan.download.length;
  onProgress({ ready, total, failed: [] });
  for (const path of plan.download) {
    const v = m.videos.find((x) => x.path === path)!;
    try {
      if (!v.url) throw new Error('no_url');
      const res = await fetch(v.url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`http_${res.status}`);
      await cache.put(cacheKey(path), res);
      ready += 1;
    } catch {
      failed.push(v.key);
    }
    onProgress({ ready, total, failed: [...failed] });
  }
  return { ready, total, failed };
}

/** A playable URL for one video: a blob URL from the local copy, else the signed URL (streams), else null. */
export async function videoSource(v: ManifestVideo): Promise<{ src: string; release: () => void } | null> {
  try {
    const hit = await (await caches.open(CACHE_NAME)).match(cacheKey(v.path));
    if (hit) {
      const src = URL.createObjectURL(await hit.blob());
      return { src, release: () => URL.revokeObjectURL(src) };
    }
  } catch {
    // Cache Storage not available here: fall through to streaming.
  }
  return v.url ? { src: v.url, release: () => {} } : null;
}
````


- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/screen-cache.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Keep the cache in step with uploads**

Create `src/lib/use-screen-cache.ts`:

````ts
'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from './client';
import { parseManifest, syncCache, type CacheProgress, type Manifest } from './screen-cache';

const MANIFEST_MS = 60_000;

/**
 * Keeps the stage laptop's video cache in step with admin uploads: fetch the manifest on load, every 60 seconds and when
 * the tab becomes visible, then download what is missing. One sync runs at a time.
 */
export function useScreenCache(enabled: boolean) {
  const [manifest, setManifest] = useState<Manifest>({ videos: [], closing: null });
  const [progress, setProgress] = useState<CacheProgress>({ ready: 0, total: 0, failed: [] });
  const running = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const refresh = async () => {
      if (running.current) return;
      const r = await api<unknown>('/api/stage/screens');
      if (!alive || !r.ok) return;
      const m = parseManifest(r.data);
      setManifest(m);
      running.current = true;
      try {
        await syncCache(m, (p) => { if (alive) setProgress(p); });
      } finally {
        running.current = false;
      }
    };
    refresh();
    const id = setInterval(refresh, MANIFEST_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [enabled]);

  return { manifest, progress };
}
````


- [ ] **Step 6: Closing card and brand fallback**

Create `src/components/stage/ClosingCard.tsx`:

````tsx
'use client';
import { translate, type Lang } from '@/lib/i18n/strings';
import type { ClosingText } from '@/lib/screen-cache';

/**
 * The closing card, and (with `brandOnly`) the fallback shown instead of black when a video cannot be played.
 * Drawn on the same 1280 × 720 board as the draw, in the Retro Rewind look.
 */
export function ClosingCard({ lang, text, brandOnly = false }: { lang: Lang; text: ClosingText; brandOnly?: boolean }) {
  const lines = text ? text[lang] : [translate(lang, 'stage.closing_1'), translate(lang, 'stage.closing_2')];
  return (
    <div className="board">
      <main className="board__main">
        <h1 className="idle__mark" aria-label="NourishFest 2026"><span>NOURISH</span><span>FEST 2026</span></h1>
        <span className="idle__theme">{translate(lang, 'brand.theme')}</span>
        {!brandOnly && (
          <>
            {lines[0] && <p className="closing__main">{lines[0]}</p>}
            {lines[1] && <p className="closing__sub">{lines[1]}</p>}
          </>
        )}
      </main>
    </div>
  );
}
````


- [ ] **Step 7: The two-layer video player**

Create `src/components/stage/ScreenVideo.tsx`:

````tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { videoSource, type ManifestVideo } from '@/lib/screen-cache';
import { screenDef, type ScreenKey } from '@/lib/screens';

const START_TIMEOUT_MS = 8_000;

type Props = {
  /** The live screen's key and screen_rev; a new screen_rev (re)starts playback. */
  screenKey: ScreenKey;
  screenRev: number;
  /** The file for the live screen, or null when the live screen is not a video screen. */
  video: ManifestVideo | null;
  start: { at: number; ended: boolean };
  soundOn: boolean;
  /** A one-off video reached its end (the server decides between hold and go to). */
  onEnded: (screenRev: number) => void;
  /** The live video screen could not be played: the stage shows the brand card instead of black. */
  onFailed: (failed: boolean) => void;
};

function waitFor(el: HTMLVideoElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('video_error')); };
    const timer = setTimeout(fail, START_TIMEOUT_MS);
    const cleanup = () => { clearTimeout(timer); el.removeEventListener(event, done); el.removeEventListener('error', fail); };
    el.addEventListener(event, done, { once: true });
    el.addEventListener('error', fail, { once: true });
  });
}

/**
 * Two stacked <video> layers. A new screen loads into the hidden layer and is shown only once it is actually playing
 * (or, for a finished one-off video after a reload, once it has seeked to its last frame), so a switch is a hard cut
 * with no black frame. Loops are always muted; one-off videos have sound once the stage sound is on.
 */
export function ScreenVideo({ screenKey, screenRev, video, start, soundOn, onEnded, onFailed }: Props) {
  const a = useRef<HTMLVideoElement>(null);
  const b = useRef<HTMLVideoElement>(null);
  const [front, setFront] = useState<0 | 1 | null>(null);
  const frontRef = useRef<0 | 1 | null>(null);
  const releases = useRef<[() => void, () => void]>([() => {}, () => {}]);
  const seq = useRef(0);
  const live = useRef({ screenRev, kind: screenDef(screenKey).kind, audio: screenDef(screenKey).audio, soundOn });
  live.current = { screenRev, kind: screenDef(screenKey).kind, audio: screenDef(screenKey).audio, soundOn };

  const path = video?.path ?? null;
  useEffect(() => {
    const els = [a.current, b.current] as const;
    const token = ++seq.current;
    if (!video || !els[0] || !els[1]) {
      els.forEach((el) => el?.pause());
      frontRef.current = null;
      setFront(null);
      onFailed(false);
      return;
    }
    const back: 0 | 1 = frontRef.current === 0 ? 1 : 0;
    const el = els[back]!;
    const { kind, audio } = live.current;
    (async () => {
      const source = await videoSource(video);
      if (token !== seq.current) { source?.release(); return; }
      if (!source) throw new Error('no_source');
      releases.current[back]();
      releases.current[back] = source.release;
      el.loop = kind === 'loop';
      el.muted = !(audio && live.current.soundOn);
      el.src = source.src;
      await waitFor(el, 'loadedmetadata');
      if (token !== seq.current) return;
      el.currentTime = start.at;
      if (start.ended) {
        el.pause();
        await waitFor(el, 'seeked');
      } else {
        const playing = waitFor(el, 'playing');
        await el.play().catch(async () => {
          // Unmuted autoplay can be refused before the sound button was clicked: play muted instead.
          el.muted = true;
          await el.play();
        });
        await playing;
      }
      if (token !== seq.current) return;
      const old = els[back === 0 ? 1 : 0]!;
      old.pause();
      frontRef.current = back;
      setFront(back);
      onFailed(false);
    })().catch(() => {
      if (token !== seq.current) return;
      els.forEach((x) => x?.pause());
      frontRef.current = null;
      setFront(null);
      onFailed(true);
    });
    // start is read only when the screen changes: it must not restart a playing video.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenRev, path]);

  // The sound button can be pressed while a one-off video plays.
  useEffect(() => {
    const el = frontRef.current === null ? null : [a.current, b.current][frontRef.current];
    if (el && live.current.kind === 'once' && live.current.audio) el.muted = !soundOn;
  }, [soundOn, front]);

  useEffect(() => {
    const r = releases.current;
    return () => { r[0](); r[1](); };
  }, []);

  const ended = (i: 0 | 1) => () => {
    if (frontRef.current === i && live.current.kind === 'once') onEnded(live.current.screenRev);
  };

  return (
    <div className="scr-stage" aria-hidden="true">
      <video ref={a} className={front === 0 ? 'scr-video scr-video--front' : 'scr-video'} playsInline preload="auto" disablePictureInPicture onEnded={ended(0)} />
      <video ref={b} className={front === 1 ? 'scr-video scr-video--front' : 'scr-video'} playsInline preload="auto" disablePictureInPicture onEnded={ended(1)} />
    </div>
  );
}
````


- [ ] **Step 8: Clock offset and the cache report in the heartbeat**

Apply this change to `src/lib/use-stage.ts`:

````diff
diff --git a/src/lib/use-stage.ts b/src/lib/use-stage.ts
index f2631b1..6523a39 100644
--- a/src/lib/use-stage.ts
+++ b/src/lib/use-stage.ts
@@ -15,12 +15,15 @@ const RECONCILE_MS = 30_000; // slow safety net even while Realtime says it is f
  * Keeps one `StageRow` up to date. Three sources feed the same `apply()`: the first fetch, Realtime, and polling.
  * `apply()` keeps a row only if its `rev` is higher, so late or duplicate deliveries change nothing.
  */
-export function useStage(cfg: StageConfig) {
+export function useStage(cfg: StageConfig, beatBody?: () => unknown) {
   const [row, setRow] = useState<StageRow | null>(null);
   const [delays, setDelays] = useState<Record<number, number>>({});
   const [now, setNow] = useState(() => Date.now());
   const [realtimeUp, setRealtimeUp] = useState(false);
   const [signedOut, setSignedOut] = useState(false);
+  const [offset, setOffset] = useState(0); // server clock minus this laptop's clock, from every poll
+  const body = useRef(beatBody);
+  body.current = beatBody;
   const current = useRef<StageRow | null>(null);
   const starts = useRef(new Map<string, number>());
   const sawFirst = useRef(false);
@@ -41,6 +44,8 @@ export function useStage(cfg: StageConfig) {
   const poll = useCallback(async () => {
     const r = await api<unknown>('/api/stage/state');
     if (r.http === 401) { setSignedOut(true); return; }
+    const now = (r.data as { server_now?: unknown } | null)?.server_now;
+    if (typeof now === 'string' && Number.isFinite(Date.parse(now))) setOffset(Date.parse(now) - Date.now());
     const parsed = r.ok ? parseRow(r.data) : null;
     if (parsed) apply(parsed);
   }, [apply]);
@@ -75,10 +80,10 @@ export function useStage(cfg: StageConfig) {
     return () => { clearTimeout(start); if (interval) clearInterval(interval); };
   }, [realtimeUp, poll]);
 
-  // Heartbeat: tells the operator's phone this display is alive.
+  // Heartbeat: tells the operator's phone this display is alive, with the video cache report (spec 2026-11-13).
   useEffect(() => {
     const beat = async () => {
-      const r = await api('/api/stage/heartbeat', {});
+      const r = await api('/api/stage/heartbeat', { cache: body.current?.() });
       if (r.http === 401) setSignedOut(true);
     };
     beat();
@@ -106,5 +111,5 @@ export function useStage(cfg: StageConfig) {
     return () => clearInterval(id);
   }, [rolling]);
 
-  return { row, delays, starts: starts.current, now, link: realtimeUp ? ('live' as const) : ('polling' as const), signedOut };
+  return { row, delays, starts: starts.current, now, offset, link: realtimeUp ? ('live' as const) : ('polling' as const), signedOut };
 }
````


- [ ] **Step 9: Route the stage by screen**

Replace the whole of `src/app/stage/StageClient.tsx` with:

````tsx
'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClosingCard } from '@/components/stage/ClosingCard';
import { ScreenVideo } from '@/components/stage/ScreenVideo';
import { StageView } from '@/components/stage/StageView';
import { api } from '@/lib/client';
import { translate } from '@/lib/i18n/strings';
import { screenDef, screenLabel, startPosition } from '@/lib/screens';
import { slotViews } from '@/lib/stage';
import { fitScale } from '@/lib/stage-fit';
import { createSound } from '@/lib/stage-sound';
import { useScreenCache } from '@/lib/use-screen-cache';
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
  const sound = useMemo(() => createSound(), []);
  const [soundOn, setSoundOn] = useState(false);
  const { manifest, progress } = useScreenCache(true);
  const report = useRef({ ...progress, sound_on: soundOn });
  report.current = { ...progress, sound_on: soundOn };
  const { row, delays, starts, now, offset, signedOut } = useStage(cfg, () => report.current);
  const scale = useFit();
  const [active, setActive] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const lang = row?.options.language ?? 'en';
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

  // The video sound needs the same one-time click, so the button shows in projector-safe mode too (spec 2026-11-13 §5.2).
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
      if (e.key === 's' || e.key === 'S') enableSound();
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(hideTimer.current); };
  }, [fullscreen, enableSound]);

  // A screen that changes while this page is open starts from 0; the screen found on load resumes by the server clock.
  const firstScreenRev = useRef<number | null>(null);
  if (row && firstScreenRev.current === null) firstScreenRev.current = row.screen_rev;
  const screen = row?.screen ?? null;
  const kind = screen ? screenDef(screen.key).kind : null;
  const video = screen && (kind === 'loop' || kind === 'once') ? (manifest.videos.find((v) => v.key === screen.key) ?? null) : null;
  const start = screen && row
    ? startPosition(screen, video?.duration_s ?? null, row.screen_rev !== firstScreenRev.current, Date.now(), offset)
    : { at: 0, ended: false };
  const onEnded = useCallback((screenRev: number) => { api('/api/stage/ended', { screen_rev: screenRev }); }, []);
  const waitingForFile = (kind === 'loop' || kind === 'once') && !video;

  let board: React.ReactNode = <div className="stage__boot" />;
  if (row && screen) {
    if (kind === 'draw') board = <StageView row={row} views={views} delays={delays} />;
    else if (kind === 'card') board = <ClosingCard lang={lang} text={manifest.closing} />;
    else if (kind === 'black') board = null;
    else if (videoFailed || waitingForFile) board = <ClosingCard lang={lang} text={null} brandOnly />;
    else board = null; // the video layer is showing
  }

  const failedNames = progress.failed.map((k) => translate(lang, screenLabel(k))).join(', ');
  const classes = ['stage', active ? 'stage--active' : '', safe ? 'stage--safe' : '', reduce ? 'stage--reduce' : ''].filter(Boolean).join(' ');
  return (
    <div className={classes} onMouseMove={poke} onPointerDown={poke}>
      <ScreenVideo screenKey={screen?.key ?? 'blackout'} screenRev={row?.screen_rev ?? -1} video={video} start={start}
        soundOn={soundOn} onEnded={onEnded} onFailed={setVideoFailed} />
      <div className="stage__fit" style={{ transform: `scale(${scale})` }}>{board}</div>
      <div className="stage__controls">
        <button type="button" className="stage__btn" onClick={enableSound} disabled={soundOn}>
          {translate(lang, soundOn ? 'stage.sound_on' : 'stage.sound')}
        </button>
        <button type="button" className="stage__btn" onClick={fullscreen}>{translate(lang, 'stage.fullscreen')}</button>
        <span className={progress.failed.length ? 'stage__cache stage__cache--bad' : 'stage__cache'}>
          {translate(lang, 'stage.cache', { ready: progress.ready, total: progress.total })}
          {failedNames && ` · ${translate(lang, 'stage.cache_failed', { names: failedNames })}`}
        </span>
      </div>
      {signedOut && <div className="stage__notice" role="alert">{translate(lang, 'stage.signed_out')}</div>}
    </div>
  );
}
````


- [ ] **Step 10: Styles**

Apply this change to `src/styles/stage.css`:

````diff
diff --git a/src/styles/stage.css b/src/styles/stage.css
index 09424ea..dec99dc 100644
--- a/src/styles/stage.css
+++ b/src/styles/stage.css
@@ -87,3 +87,14 @@ html:has(.stage), body:has(.stage) { overflow: hidden; background: #000; }
 @keyframes nf-out { to { opacity: 0; } }
 @keyframes nf-fade { from { opacity: 0; } to { opacity: 1; } }
 
+
+/* Videotron screens (spec 2026-11-13). Videos fill the real screen (not the 1280 × 720 board) and keep their ratio. */
+.scr-stage { position: absolute; inset: 0; background: #000; }
+.scr-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; background: #000; opacity: 0; }
+.scr-video--front { opacity: 1; }
+.stage__fit { position: relative; }
+.closing__main { margin: 18px 0 0; max-width: 1160px; font-family: var(--nf-font-heading); font-size: 72px; line-height: 1.02; text-transform: uppercase; color: var(--nf-text); text-shadow: 5px 5px 0 var(--nf-pink); }
+.closing__sub { margin: 0; font-family: var(--nf-font-label); font-weight: 600; font-size: 30px; letter-spacing: .12em; color: var(--nf-gold); }
+.stage__cache { align-self: center; padding: 6px 12px; border-radius: 10px; background: rgba(0,0,0,.75); color: var(--nf-green); font-family: var(--nf-font-label); font-weight: 600; letter-spacing: .08em; }
+.stage__cache--bad { color: var(--nf-pink); }
+.stage--safe .closing__main { text-shadow: none; -webkit-text-stroke: 2px #000; paint-order: stroke fill; }
````


- [ ] **Step 11: Run the checks**

Run: `npm run test:unit && npx tsc --noEmit && npx eslint src tests`
Expected: all pass; eslint only the two `Scanner.tsx` warnings.

- [ ] **Step 12: Check the player in Chrome**

With the dev stack from Task 5, upload two short test files by hand (Task 7 adds the admin page; until then: `ffmpeg -f lavfi -i color=c=red:s=1920x1080:d=10:r=30 -c:v libx264 -pix_fmt yuv420p -movflags +faststart red.mp4`, upload to bucket `screens` as `ambient_dinner/v1.mp4` in the Supabase dashboard, then `select public.admin_set_screen_video('<EVENT_ID>', 'ambient_dinner', 'ambient_dinner/v1.mp4', <bytes>, 10, 'dev');`). Open `/stage?key=…` in Chrome. Expected: the corner shows **Videos 1/1**; switching to **Ambient — Dinner** on the panel cuts to red with no black frame; **Closing** shows the card; **Blackout** is black; reloading the stage keeps the live screen.

- [ ] **Step 13: Commit**

```bash
git add src/lib/screen-cache.ts src/lib/use-screen-cache.ts src/lib/use-stage.ts src/components/stage src/app/stage src/styles/stage.css tests/unit/screen-cache.test.ts
git commit -m "feat: stage plays videotron screens from a local cache"
```

### Task 7: Admin — Screens page, uploads, suggested screen, report

**Files:**
- Create: `src/lib/admin-screen-text.ts`, `src/app/api/admin/screens/route.ts`, `src/app/api/admin/screens/upload-url/route.ts`, `src/app/api/admin/rundown/[id]/screen/route.ts`, `src/components/admin/ScreenManager.tsx`, `src/app/admin/(console)/screens/page.tsx`
- Modify: `src/components/admin/AdminNav.tsx`, `src/components/admin/RundownEditor.tsx`, `src/lib/mc.ts`, `src/lib/reports.ts`, `src/components/admin/ReportsPanel.tsx`, `tests/unit/reports.test.ts`

**Interfaces:**
- Consumes: Task 2 SQL (`admin_screen_list`, `admin_save_screen`, `admin_set_screen_video`, `admin_set_segment_screen`, `report_rows('screens')`, `mc_state.suggested_screen`); Task 3 (`SCREENS`, `SCREEN_KEYS`, `screenDef`, `screenLabel`, `hasVideo`, `videoPath`, `usbName`, `checkVideo`, `describeVideoProblems`, `HEAD_BYTES`); Task 4 (`signedDownloads`, `signedUpload`); existing `adminGet`, `adminPost`, `useLoad`, `describeRundown`.
- Produces:
  - `GET /api/admin/screens` → `{ screens: [... , preview_url, download_url] }`; `POST /api/admin/screens` either `{ key, path, bytes, duration_s }` (record an upload) or `{ key, end_action?, end_target?, card_text? }`.
  - `POST /api/admin/screens/upload-url` `{ key }` → `{ path, url }` (next version).
  - `POST /api/admin/rundown/[id]/screen` `{ screen: key | null }`.
  - `describeScreen(status)`, `formatDuration(s)`, `formatMb(bytes)` from `@/lib/admin-screen-text`.
  - `Segment.suggested_screen?: ScreenKey | null`; report `screens` (`nourishfest-screens.csv`).

- [ ] **Step 1: Write the failing report-name test**

Apply this change to `tests/unit/reports.test.ts`:

````diff
diff --git a/tests/unit/reports.test.ts b/tests/unit/reports.test.ts
index c7ff480..0068a67 100644
--- a/tests/unit/reports.test.ts
+++ b/tests/unit/reports.test.ts
@@ -10,7 +10,7 @@ describe('witaStamp', () => {
 });
 
 describe('isReportName', () => {
-  it.each(['guests', 'check-ins', 'merchandise', 'beverages', 'beverage-pending', 'merch-sizes', 'merch-size-pending', 'draws', 'audit'])('knows %s', (n) => expect(isReportName(n)).toBe(true));
+  it.each(['guests', 'check-ins', 'merchandise', 'beverages', 'beverage-pending', 'merch-sizes', 'merch-size-pending', 'draws', 'rundown', 'screens', 'audit'])('knows %s', (n) => expect(isReportName(n)).toBe(true));
   it.each(['rsvp-pending', 'invitations', '../etc', 'toString', '__proto__', ''])('rejects %s', (n) => expect(isReportName(n)).toBe(false));
 });
 
````


- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/reports.test.ts`
Expected: FAIL — `knows screens`.

- [ ] **Step 3: Add the Screens report**

Apply this change to `src/lib/reports.ts`:

````diff
diff --git a/src/lib/reports.ts b/src/lib/reports.ts
index 1bebdb0..8f54838 100644
--- a/src/lib/reports.ts
+++ b/src/lib/reports.ts
@@ -88,6 +88,13 @@ export const REPORTS = {
       { key: 'started_by', header: 'Started by' }, { key: 'reason', header: 'Correction reason' },
     ],
   },
+  screens: {
+    sql: 'screens', file: 'nourishfest-screens.csv',
+    cols: [
+      { key: 'at', header: 'Time', kind: 'time' }, { key: 'screen', header: 'Screen' }, { key: 'from', header: 'Previous screen' },
+      { key: 'how', header: 'How' }, { key: 'by', header: 'By' },
+    ],
+  },
   audit: {
     sql: 'audit', file: 'nourishfest-audit.csv',
     cols: [
````


- [ ] **Step 4: List it**

Apply this change to `src/components/admin/ReportsPanel.tsx`:

````diff
diff --git a/src/components/admin/ReportsPanel.tsx b/src/components/admin/ReportsPanel.tsx
index e5a367b..ceba3c1 100644
--- a/src/components/admin/ReportsPanel.tsx
+++ b/src/components/admin/ReportsPanel.tsx
@@ -8,6 +8,7 @@ const REPORTS: { href: string; title: string; text: string }[] = [
   { href: '/api/admin/reports/merch-size-pending', title: 'T-shirt size pending', text: 'Guests with no size yet, with phone, for the reminder through the Fonnte sheet.' },
   { href: '/api/admin/reports/draws', title: 'Draw history', text: 'Every draw: prize, slot, winner, outcome, who resolved it, void reasons.' },
   { href: '/api/admin/reports/rundown', title: 'Rundown', text: 'Every segment: planned vs actual start and end, drift, who moved the show on, correction reasons.' },
+  { href: '/api/admin/reports/screens', title: 'Screens', text: 'Every videotron switch: time, screen, previous screen, manual / draw takeover / end of video, by whom.' },
   { href: '/api/admin/reports/audit', title: 'Audit log', text: 'Every recorded action, oldest first.' },
   { href: '/api/admin/invitations.csv', title: 'Invitation links', text: 'Personal pass link per employee, for the WhatsApp broadcast.' },
 ];
````


- [ ] **Step 5: Console wording**

Create `src/lib/admin-screen-text.ts`:

````ts
/** Admin console wording for screen settings and uploads (English, like the rest of the console). */
const SCREEN: Record<string, string> = {
  INVALID: 'Check the settings: “go to” needs a target that is not this screen or the draw; closing lines are up to 60 characters.',
  NOT_FOUND: 'That screen or segment no longer exists. Reload the page.',
  STALE: 'A newer video was uploaded meanwhile. Reload the page.',
  BAD_INPUT: 'Check the fields and try again.',
};

export const describeScreen = (status: string): string => SCREEN[status] ?? 'Could not save. Try again.';

/** "1:32" / "12:05" from seconds. */
export const formatDuration = (s: number | null): string =>
  s === null || !Number.isFinite(s) ? '' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** "48.2 MB" */
export const formatMb = (bytes: number | null): string => (bytes ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : '');
````


- [ ] **Step 6: Screens list and save**

Create `src/app/api/admin/screens/route.ts`:

````ts
import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminGet, adminPost } from '@/lib/routes';
import { signedDownloads } from '@/lib/screen-storage';
import { SCREEN_KEYS, usbName, type ScreenKey } from '@/lib/screens';

type Row = { key: ScreenKey; video_path: string | null };

/** Every screen with its settings, plus a preview URL and a named download URL (USB fallback) for each video. */
export const GET = adminGet(async () => {
  const r = await rpc<{ screens: Row[] }>('admin_screen_list', { p_event: env().EVENT_ID });
  const paths = r.screens.map((s) => s.video_path).filter((p): p is string => !!p);
  const keyOf = new Map(r.screens.map((s) => [s.video_path, s.key]));
  const [preview, download] = await Promise.all([
    signedDownloads(paths),
    signedDownloads(paths, (p) => usbName(keyOf.get(p)!)),
  ]);
  return ok('OK', {
    screens: r.screens.map((s) => ({
      ...s, preview_url: s.video_path ? (preview[s.video_path] ?? null) : null, download_url: s.video_path ? (download[s.video_path] ?? null) : null,
    })),
  });
});

const line = z.string().max(60);
const pair = z.tuple([line, line]);
const schema = z.union([
  // A finished upload (path from /api/admin/screens/upload-url).
  z.object({ key: z.enum(SCREEN_KEYS), path: z.string().max(80), bytes: z.number().int().positive(), duration_s: z.number().positive() }),
  // Settings: end action (one-off videos) or closing text.
  z.object({
    key: z.enum(SCREEN_KEYS),
    end_action: z.enum(['hold', 'goto']).optional(),
    end_target: z.enum(SCREEN_KEYS).nullable().optional(),
    card_text: z.object({ id: pair, en: pair }).optional(),
  }),
]);

export const POST = adminPost(schema, async ({ actor, body }) => {
  if ('path' in body) {
    const r = await rpc<{ status: string }>('admin_set_screen_video', {
      p_event: env().EVENT_ID, p_key: body.key, p_path: body.path, p_bytes: body.bytes, p_duration: body.duration_s, p_actor: actorId(actor),
    });
    return ok(r.status, r);
  }
  const { key, ...data } = body;
  const r = await rpc<{ status: string }>('admin_save_screen', { p_event: env().EVENT_ID, p_key: key, p_data: data, p_actor: actorId(actor) });
  return ok(r.status, r);
});
````


- [ ] **Step 7: Signed upload URL**

Create `src/app/api/admin/screens/upload-url/route.ts`:

````ts
import { z } from 'zod';
import { fail, ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { adminPost } from '@/lib/routes';
import { signedUpload } from '@/lib/screen-storage';
import { hasVideo, SCREEN_KEYS, videoPath } from '@/lib/screens';

/**
 * A signed upload URL for the next version of one screen's video. The browser uploads straight to Storage (Vercel caps
 * request bodies at 4.5 MB), then records the upload with POST /api/admin/screens { key, path, bytes, duration_s }.
 */
export const POST = adminPost(z.object({ key: z.enum(SCREEN_KEYS) }), async ({ body }) => {
  if (!hasVideo(body.key)) return fail(400, 'BAD_INPUT');
  const r = await rpc<{ screens: { key: string; video_version: number }[] }>('admin_screen_list', { p_event: env().EVENT_ID });
  const current = r.screens.find((s) => s.key === body.key)?.video_version ?? 0;
  const path = videoPath(body.key, current + 1);
  return ok('OK', { path, url: await signedUpload(path) });
});
````


- [ ] **Step 8: Suggested screen per segment**

Create `src/app/api/admin/rundown/[id]/screen/route.ts`:

````ts
import { z } from 'zod';
import { fail, ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminPost } from '@/lib/routes';
import { SCREEN_KEYS } from '@/lib/screens';

/** The suggested screen of one rundown segment (null clears it): "Up next" on the Screen Control panel. */
export const POST = adminPost(z.object({ screen: z.enum(SCREEN_KEYS).nullable() }), async ({ actor, body, params }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return fail(400, 'BAD_INPUT');
  const r = await rpc<{ status: string }>('admin_set_segment_screen', {
    p_event: env().EVENT_ID, p_segment: id.data, p_screen: body.screen, p_actor: actorId(actor),
  });
  return ok(r.status);
});
````


- [ ] **Step 9: The Screens manager**

Create `src/components/admin/ScreenManager.tsx`:

````tsx
'use client';
import { useState } from 'react';
import { describeScreen, formatDuration, formatMb } from '@/lib/admin-screen-text';
import { api } from '@/lib/client';
import { STRINGS } from '@/lib/i18n/strings';
import { checkVideo, describeVideoProblems, HEAD_BYTES, type VideoMeta } from '@/lib/mp4-check';
import { SCREENS, screenDef, screenLabel, type ScreenKey } from '@/lib/screens';
import { useLoad } from '@/lib/use-load';

type Row = {
  key: ScreenKey; kind: string; video_path: string | null; video_version: number; video_bytes: number | null; duration_s: number | null;
  end_action: 'hold' | 'goto'; end_target: ScreenKey | null; card_text: { id: [string, string]; en: [string, string] } | null;
  preview_url: string | null; download_url: string | null;
};
type Msg = { ok: boolean; text: string } | null;

const label = (k: ScreenKey) => STRINGS.en[screenLabel(k)];

/** Width, height and length as the browser reads them from the file itself. */
function readMeta(file: File): Promise<VideoMeta> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    const done = (m: Partial<VideoMeta>) => { URL.revokeObjectURL(url); resolve({ bytes: file.size, width: 0, height: 0, duration: NaN, ...m }); };
    v.preload = 'metadata';
    v.onloadedmetadata = () => done({ width: v.videoWidth, height: v.videoHeight, duration: v.duration });
    v.onerror = () => done({});
    v.src = url;
  });
}

/** PUT to the signed upload URL with progress (same form body as supabase-js uploadToSignedUrl). */
function putFile(url: string, file: File, onProgress: (pct: number) => void): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    const body = new FormData();
    body.append('cacheControl', '3600');
    body.append('', file);
    xhr.send(body);
  });
}

function Upload({ row, onDone }: { row: Row; onDone: (m: Msg) => void }) {
  const [pct, setPct] = useState<number | null>(null);
  async function pick(file: File | undefined) {
    if (!file) return;
    const meta = await readMeta(file);
    const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
    const problems = checkVideo(head, meta);
    if (problems.length) return onDone({ ok: false, text: `${label(row.key)}: ${describeVideoProblems(problems, meta)}` });
    const sign = await api<{ path: string; url: string }>('/api/admin/screens/upload-url', { key: row.key });
    if (!sign.ok || !sign.data) return onDone({ ok: false, text: 'Could not start the upload. Try again.' });
    setPct(0);
    const uploaded = await putFile(sign.data.url, file, setPct);
    setPct(null);
    if (!uploaded) return onDone({ ok: false, text: `${label(row.key)}: upload failed. Check the connection and try again.` });
    const r = await api('/api/admin/screens', { key: row.key, path: sign.data.path, bytes: file.size, duration_s: meta.duration });
    onDone(r.status === 'OK'
      ? { ok: true, text: `${label(row.key)}: uploaded. The stage laptop downloads it within a minute.` }
      : { ok: false, text: describeScreen(r.status) });
  }
  if (pct !== null) return <span className="adm-badge adm-badge--gold">Uploading {pct}%</span>;
  return (
    <label className="btn">
      {row.video_path ? 'Replace…' : 'Upload…'}
      <input type="file" accept="video/mp4" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
    </label>
  );
}

function EndAction({ row, onDone }: { row: Row; onDone: (m: Msg) => void }) {
  if (row.key === 'doorprize_intro') return <span className="adm-muted">Holds; the MC’s prize pick switches to the draw.</span>;
  const value = row.end_action === 'goto' && row.end_target ? row.end_target : 'hold';
  async function save(v: string) {
    const body = v === 'hold' ? { key: row.key, end_action: 'hold' } : { key: row.key, end_action: 'goto', end_target: v };
    const r = await api('/api/admin/screens', body);
    onDone(r.status === 'OK' ? { ok: true, text: `${label(row.key)}: end action saved.` } : { ok: false, text: describeScreen(r.status) });
  }
  return (
    <select className="adm-select" aria-label={`${label(row.key)} at the end`} value={value} onChange={(e) => save(e.target.value)}>
      <option value="hold">Hold the last frame</option>
      {SCREENS.filter((s) => s.key !== row.key && s.key !== 'draw').map((s) => (
        <option key={s.key} value={s.key}>Go to: {label(s.key)}</option>
      ))}
    </select>
  );
}

function ClosingText({ row, onDone }: { row: Row; onDone: (m: Msg) => void }) {
  const [t, setT] = useState(() => row.card_text ?? {
    id: [STRINGS.id['stage.closing_1'], STRINGS.id['stage.closing_2']] as [string, string],
    en: [STRINGS.en['stage.closing_1'], STRINGS.en['stage.closing_2']] as [string, string],
  });
  const set = (lang: 'id' | 'en', i: 0 | 1, v: string) => setT((x) => {
    const next: [string, string] = [...x[lang]];
    next[i] = v;
    return { ...x, [lang]: next };
  });
  async function save() {
    const r = await api('/api/admin/screens', { key: 'closing', card_text: t });
    onDone(r.status === 'OK' ? { ok: true, text: 'Closing text saved. The stage shows it within a minute.' } : { ok: false, text: describeScreen(r.status) });
  }
  return (
    <div className="adm-card">
      {(['id', 'en'] as const).map((lang) => (
        <div key={lang} className="adm-row">
          <b>{lang.toUpperCase()}</b>
          <input className="adm-input" maxLength={60} aria-label={`Closing line 1 (${lang})`} value={t[lang][0]} onChange={(e) => set(lang, 0, e.target.value)} />
          <input className="adm-input" maxLength={60} aria-label={`Closing line 2 (${lang})`} value={t[lang][1]} onChange={(e) => set(lang, 1, e.target.value)} />
        </div>
      ))}
      <button className="btn btn--gold" onClick={save}>Save closing text</button>
    </div>
  );
}

export function ScreenManager() {
  const { data, reload } = useLoad<{ screens: Row[] }>('/api/admin/screens');
  const [msg, setMsg] = useState<Msg>(null);
  const [preview, setPreview] = useState<ScreenKey | null>(null);
  const rows = data?.screens ?? [];
  const done = (m: Msg) => { setMsg(m); reload(); };
  const closing = rows.find((r) => r.key === 'closing');

  return (
    <>
      {msg && <p className={`adm-msg ${msg.ok ? 'adm-msg--ok' : 'adm-msg--error'}`}>{msg.text}</p>}
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Screen</th><th>Kind</th><th>File</th><th>Length</th><th>Size</th><th>At the end</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => {
              const def = screenDef(r.key);
              const video = def.kind === 'loop' || def.kind === 'once';
              return (
                <tr key={r.key}>
                  <td><b>{label(r.key)}</b>{def.audio && ' 🔊'}</td>
                  <td>{def.kind === 'loop' ? 'Loop, silent' : def.kind === 'once' ? 'Plays once' : def.kind === 'draw' ? 'Live draw board' : def.kind === 'card' ? 'Card (in app)' : 'Black'}</td>
                  <td>{video ? (r.video_path ? `v${r.video_version}` : <span className="adm-badge adm-badge--pink">missing</span>) : '—'}</td>
                  <td>{formatDuration(r.duration_s)}</td>
                  <td>{formatMb(r.video_bytes)}</td>
                  <td>{def.kind === 'once' ? <EndAction row={r} onDone={done} /> : ''}</td>
                  <td>
                    <span className="adm-row" style={{ margin: 0 }}>
                      {video && <Upload row={r} onDone={done} />}
                      {r.preview_url && <button className="btn" onClick={() => setPreview(preview === r.key ? null : r.key)}>{preview === r.key ? 'Close' : 'Preview'}</button>}
                    </span>
                    {preview === r.key && r.preview_url && <video src={r.preview_url} controls style={{ width: 320, marginTop: 8 }} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="adm-sub">Closing card</h2>
      {closing && <ClosingText key={closing.card_text ? JSON.stringify(closing.card_text) : 'default'} row={closing} onDone={done} />}

      <h2 className="adm-sub">USB fallback</h2>
      <p className="adm-muted">Download every current file and copy them to a USB stick for the LED vendor. File names are in show order.</p>
      <div className="adm-links">
        {rows.filter((r) => r.download_url).map((r) => (
          <a key={r.key} className="adm-link" href={r.download_url!} download>
            <b>{label(r.key)}</b>
            <span>v{r.video_version} · {formatMb(r.video_bytes)}</span>
          </a>
        ))}
      </div>
    </>
  );
}
````


- [ ] **Step 10: The page**

Create `src/app/admin/(console)/screens/page.tsx`:

````tsx
import { ScreenManager } from '@/components/admin/ScreenManager';

export default function ScreensPage() {
  return (
    <>
      <div className="adm-row">
        <h1 className="adm-title" style={{ margin: 0 }}>Screens</h1>
        <span className="adm-spacer" />
        <a className="btn" href="/station/screen">Open Screen Control</a>
      </div>
      <p className="adm-muted">
        The videotron screens. Upload one 16:9 H.264 MP4 (1920 × 1080, fast start, up to 300 MB) per video screen. The stage laptop
        downloads every file and plays it from its own copy, so open /stage on it at least an hour before gates. The draw board takes over
        on its own when the MC picks a prize.
      </p>
      <ScreenManager />
    </>
  );
}
````


- [ ] **Step 11: Nav link**

Apply this change to `src/components/admin/AdminNav.tsx`:

````diff
diff --git a/src/components/admin/AdminNav.tsx b/src/components/admin/AdminNav.tsx
index 20a12d6..5bf6174 100644
--- a/src/components/admin/AdminNav.tsx
+++ b/src/components/admin/AdminNav.tsx
@@ -10,6 +10,7 @@ const LINKS = [
   { href: '/admin/beverages', label: 'Beverages' },
   { href: '/admin/prizes', label: 'Prizes' },
   { href: '/admin/rundown', label: 'Rundown' },
+  { href: '/admin/screens', label: 'Screens' },
   { href: '/admin/draws', label: 'Draws' },
   { href: '/admin/reports', label: 'Reports' },
   { href: '/admin/audit', label: 'Audit' },
````


- [ ] **Step 12: Segment type carries the suggested screen**

Apply this change to `src/lib/mc.ts`:

````diff
diff --git a/src/lib/mc.ts b/src/lib/mc.ts
index 56ea1c9..8ae7c99 100644
--- a/src/lib/mc.ts
+++ b/src/lib/mc.ts
@@ -1,4 +1,5 @@
 /** MC cue card: types for `mc_state`, `mc_vip`, `mc_pax` (SQL) and the pure logic the MC screen runs on them. */
+import type { ScreenKey } from './screens';
 
 export type SegmentPrize = {
   id: string; name: string; tier: string | null; quantity: number; mc_script: string | null;
@@ -7,6 +8,8 @@ export type SegmentPrize = {
 export type Segment = {
   id: string; sort_order: number; title: string; planned_start: string; duration_min: number;
   pic: string | null; script: string | null; kind: 'normal' | 'door_prize';
+  /** The screen the Screen Control panel offers as "Up next" while this segment runs (spec 2026-11-13). */
+  suggested_screen?: ScreenKey | null;
   started_at: string | null; ended_at: string | null; prizes: SegmentPrize[];
 };
 export type McPhase = 'not_started' | 'running' | 'ended';
````


- [ ] **Step 13: Screen column in the rundown**

Apply this change to `src/components/admin/RundownEditor.tsx`:

````diff
diff --git a/src/components/admin/RundownEditor.tsx b/src/components/admin/RundownEditor.tsx
index 74992ae..a3a6116 100644
--- a/src/components/admin/RundownEditor.tsx
+++ b/src/components/admin/RundownEditor.tsx
@@ -4,6 +4,8 @@ import { describeRundown, parseTime } from '@/lib/admin-mc-text';
 import { api } from '@/lib/client';
 import { segmentStatus, type McState, type Segment } from '@/lib/mc';
 import { prizeLabel, type PrizeRow } from '@/lib/prizes';
+import { SCREENS, screenLabel, type ScreenKey } from '@/lib/screens';
+import { STRINGS } from '@/lib/i18n/strings';
 import { formatTimeWita } from '@/lib/time';
 import { useLoad } from '@/lib/use-load';
 
@@ -101,6 +103,12 @@ export function RundownEditor() {
     reload();
   }
 
+  async function setScreen(id: string, screen: ScreenKey | null) {
+    const r = await api(`/api/admin/rundown/${id}/screen`, { screen });
+    setMsg(r.status === 'OK' ? { ok: true, text: 'Suggested screen saved.' } : { ok: false, text: describeRundown(r.status) });
+    reload();
+  }
+
   async function setCurrent() {
     if (!jump) return;
     const r = await api('/api/admin/rundown/set-current', { segment_id: jump.id, reason: jump.reason });
@@ -123,14 +131,14 @@ export function RundownEditor() {
 
       <div className="adm-table-wrap">
         <table className="adm-table">
-          <thead><tr><th>Order</th><th>Time</th><th>Segment</th><th>Min</th><th>PIC</th><th>Prizes</th><th>Status</th><th /></tr></thead>
+          <thead><tr><th>Order</th><th>Time</th><th>Segment</th><th>Min</th><th>PIC</th><th>Prizes</th><th>Screen</th><th>Status</th><th /></tr></thead>
           <tbody>
             {segments.map((s) => {
               const status = segmentStatus(s, state?.current_segment_id ?? null);
               if (editing?.id === s.id) {
                 return (
                   <tr key={s.id}>
-                    <td colSpan={8}>
+                    <td colSpan={9}>
                       <Fields d={editing.draft} set={(draft) => setEditing({ id: s.id, draft })} prizes={prizes} takenBy={takenBy(s.id)} />
                       <span className="adm-row">
                         <button className="btn btn--gold" onClick={async () => { if (await save(s.id, editing.draft)) setEditing(null); }}>Save</button>
@@ -148,6 +156,13 @@ export function RundownEditor() {
                   <td>{s.duration_min}</td>
                   <td>{s.pic ?? ''}</td>
                   <td>{s.prizes.map((p) => p.name).join(', ')}</td>
+                  <td>
+                    <select className="adm-select" aria-label={`Suggested screen for ${s.title}`} value={s.suggested_screen ?? ''}
+                      onChange={(e) => setScreen(s.id, (e.target.value || null) as ScreenKey | null)}>
+                      <option value="">—</option>
+                      {SCREENS.map((x) => <option key={x.key} value={x.key}>{STRINGS.en[screenLabel(x.key)]}</option>)}
+                    </select>
+                  </td>
                   <td>
                     {status === 'current' ? <span className="adm-badge adm-badge--green">current</span>
                       : status === 'done' && s.started_at && s.ended_at ? `${formatTimeWita(s.started_at)}–${formatTimeWita(s.ended_at)}` : ''}
@@ -177,7 +192,7 @@ export function RundownEditor() {
                 </tr>
               );
             })}
-            {!loading && segments.length === 0 && <tr><td colSpan={8} className="adm-muted">No segments yet. Add the first one above.</td></tr>}
+            {!loading && segments.length === 0 && <tr><td colSpan={9} className="adm-muted">No segments yet. Add the first one above.</td></tr>}
           </tbody>
         </table>
       </div>
````


- [ ] **Step 14: Run the checks**

Run: `npm run test:unit && npx tsc --noEmit && npx eslint src tests`
Expected: 259 unit tests pass; tsc clean; eslint only the two `Scanner.tsx` warnings. Review by eye: every new admin route uses `adminGet` / `adminPost`.

- [ ] **Step 15: Check it in the browser**

Dev stack from Task 5, Storage global limit raised (Task 8 Step 2) on the dev project too. **Admin → Screens:** upload a 1080 × 1920 (portrait) file → refused with "Not 16:9 (1080 × 1920)."; upload a 1080p H.264 file → progress, then **v1** with length and size; **Preview** plays it; set **Welcome → Go to: Ambient — Dinner**; save the closing text. **Admin → Rundown:** pick a screen in the **Screen** column, make that segment current, and the panel shows it under **UP NEXT**. **Reports → Screens** downloads a CSV with the switches.

- [ ] **Step 16: Commit**

```bash
git add src/lib/admin-screen-text.ts src/app/api/admin/screens "src/app/api/admin/rundown/[id]/screen" src/components/admin \
  "src/app/admin/(console)/screens" src/lib/mc.ts src/lib/reports.ts tests/unit/reports.test.ts
git commit -m "feat: admin screens page, uploads, suggested screen per segment, screens report"
```

### Task 8: Runbook, full check, go live

**Files:**
- Create: `docs/runbooks/screen-switcher.md`

- [ ] **Step 1: Write the runbook**

Create `docs/runbooks/screen-switcher.md`:

````markdown
# Videotron screen switcher — setup and rehearsal

> The screens show **English** by default (tap ID for Indonesian). Indonesian button names: TAYANGKAN = GO LIVE, BERIKUTNYA = UP NEXT, PUTAR ULANG = REPLAY, LAYAR HITAM = BLACKOUT, YA = YES, BATAL = CANCEL.

One operator at the FOH desk runs the videotron from `/station/screen` on a phone or tablet, with the **Screen PIN**. The stage laptop wired to the LED wall shows `/stage` full screen. When the MC picks a door prize, the draw board takes over the videotron by itself.

## Once, before the first upload (admin, 15 minutes)

- [ ] **Supabase → Storage → Settings:** set the **Global file size limit** to at least **300 MB** (the Pro plan allows it; the default is 50 MB and uploads over it fail).
- [ ] **LED vendor:** confirm the **pixel resolution** and that the input is **HDMI from our laptop**. If it is not 1920 × 1080 (16:9), stop and tell the video team before anything is rendered.
- [ ] **Settings → Station PINs:** set the **Screen control (videotron)** PIN. Write it in the password manager.

## Loading the videos (admin, whenever a file is ready)

- [ ] **Admin → Screens:** upload each MP4 on its row (16:9, H.264, fast start, up to 300 MB). The page refuses anything else and says why.
- [ ] Preview each file on the page once.
- [ ] One-off videos: set **At the end** (hold the last frame, or go to another screen). The Door Prize intro always holds.
- [ ] **Closing card:** check both lines in ID and EN.
- [ ] **Admin → Rundown → Screen:** set the suggested screen for each segment that has one (it shows as **UP NEXT** on the panel while that segment runs).
- [ ] **USB fallback:** after the last upload, download every file from **Admin → Screens → USB fallback** onto a USB stick for the LED vendor.

## Stage laptop (every rehearsal and on the night, at least 1 hour before gates)

- [ ] Chrome only. Plug in power. Turn off sleep, screen saver and OS updates.
- [ ] Open the stage link from **Settings → Stage display** on a good connection. Move the mouse: the corner shows **Videos 9/9** when every file is on the laptop. Pink means a download failed — reload the page.
- [ ] Click **Turn on sound** once (or press **S**), then **F** for full screen. Without that click the one-off videos play muted.
- [ ] Laptop audio out → sound mixer. Check the level with the Welcome video.

## At each rehearsal (45 minutes: stage laptop + LED, sound desk, one screen phone, one MC phone, admin laptop)

- [ ] Screen phone logs in with the Screen PIN. Header shows **Stage laptop connected** and **Videos ready 9/9**.
- [ ] Tap **Ambient — Dinner**, then **GO LIVE**: the LED cuts with no black frame.
- [ ] Put **Welcome** live: the sound comes through the mixer; the progress bar runs on the phone; at the end it does what **At the end** says.
- [ ] Tap Welcome again: **Replay?** appears.
- [ ] Unplug the laptop's network. Switch nothing for 2 minutes: the video keeps playing. Plug it back in: the next switch arrives within a few seconds.
- [ ] Reload the stage laptop in the middle of a one-off video: it comes back at the right second.
- [ ] MC phone picks a prize during a video: the draw board takes over at once and the screen phone shows **Door Prize draw · AUTO**. Draw and confirm one prize.
- [ ] While a number is unconfirmed, switch away on the screen phone: **Draw not finished — switch screen?** appears.
- [ ] Two screen phones tap GO LIVE at the same moment: one switches, the other shows **Screen already changed**.
- [ ] **Blackout** is one tap. **Closing** shows the closing card.
- [ ] Play every file from the USB stick on the LED vendor's player once.
- [ ] Download **Reports → Screens** and check the switches are all there.
- [ ] Reset rehearsal data (Settings): videos, end actions and suggested screens stay; the videotron goes back to **Ambient — Arrival**.

## On the night

- The screen phone stays on charge. The operator follows the rundown and the **UP NEXT** card; the MC finishes speaking, then the operator taps **GO LIVE**.
- Sound desk: fade the DJ down before a 🔊 screen goes live.
- Stage laptop shows the wrong thing or freezes: reload it (it resumes). Still wrong: the LED vendor plays the file from the USB stick and the draw runs on the paper procedure in `failure-playbook.md`.
- After the show: download **Reports → Screens** with the other reports.
````


- [ ] **Step 2: Raise the Storage limit (production project, before any upload)**

Supabase dashboard → **Storage → Settings → Global file size limit**: 300 MB or more. (The bucket itself is created by the app on the first upload URL, with its own 300 MB and `video/mp4` limits.)

- [ ] **Step 3: Full check**

Run: `npx supabase db reset && npx supabase test db && npm run test:unit && npx tsc --noEmit && npx eslint src tests && npm run build`
Expected: 357 pgTAP tests, 259 unit tests, clean tsc, two existing eslint warnings, build succeeds.

- [ ] **Step 4: Push the database and deploy**

```bash
npm run db:push        # applies migrations 20 and 21 to production
git push origin feat/screen-switcher   # open the PR, merge to main; Vercel deploys main
```
Expected: `/station/screen` loads on production; `/stage` still shows the arrival loop's brand card until a video is uploaded.

- [ ] **Step 5: Rehearsal**

Run every box in `docs/runbooks/screen-switcher.md` → *At each rehearsal* on the real stage laptop, LED wall and mixer, before the 6 December code freeze. Reset rehearsal data afterwards.

- [ ] **Step 6: Commit**

```bash
git add docs/runbooks/screen-switcher.md
git commit -m "docs: screen switcher runbook"
```

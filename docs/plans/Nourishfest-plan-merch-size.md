# NourishFest 2026 — Merchandise T-shirt Size: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Employees pick a T-shirt size (S, M, L, XL, XXL) once in the invitation or on their pass; HR gets a per-size order count that goes FINAL at a size deadline; the merchandise booth shows the reserved size, records the size actually handed over, and tracks stock left per size.

**Architecture:** Mirrors the shipped Beverage Reservation (migration `20261115000013`). Every rule lives in a `SECURITY DEFINER` Postgres function; the effective size (stored size, else the admin default after the deadline) is computed on read by `effective_merch_size()`, so no job runs at the deadline. No new QR and no new station: the existing pink Merchandise QR and booth gain the size. One shared `SizeChoice` component serves the invitation scene and the pass card.

**Tech Stack:** Next.js 15 (App Router) + React 19, Supabase Postgres with pgTAP, zod 4, vitest. No new dependencies.

**Spec:** `engineering/2026-11-08-nourishfest-merch-size-design.md` in the NourishFest 2026 project (approved 8 Nov 2026). Task 1 copies it into the repo as `docs/2026-11-08-nourishfest-merch-size-design.md`.

**Verified:** every file and edit in this plan was built and run against the current `main` (`9bc8b6a`) before the plan was written: `tsc` clean, `eslint` clean apart from two warnings already in `Scanner.tsx`, **216 unit tests** and **154 pgTAP tests** passing (60 existing + 94 new).

## Global Constraints

- **Do not run `npm run db:push` or deploy until Task 10.** `db:push` targets the production Supabase project. Task 2 changes the `redeem_merchandise` signature, so the booth only works again once Task 7 is in; migrations and app go live together.
- **Sizes:** exactly `S`, `M`, `L`, `XL`, `XXL`, in that order. The SQL check constraints and `SIZES` in `src/lib/sizes.ts` must stay identical.
- **Database rules (same as every earlier migration):** functions are `SECURITY DEFINER` with `set search_path = public, extensions` (or `public` for pure SQL helpers); every migration ends with `select public.lock_down_public();` so `anon` and `authenticated` cannot execute anything and RLS is on for the new table.
- **Status names follow the beverage convention:** `OK`, `ALREADY_CHOSEN`, `CLOSED`, `INVALID`, `REASON_REQUIRED`, `ALREADY_REDEEMED`, `NOT_FOUND`, plus new `INVALID_SIZE`, `INVALID_SIZE_CHART`, `DEFAULT_SIZE_REQUIRED`.
- **Times:** deadlines are entered as WITA `YYYY-MM-DDTHH:mm` and stored with `+08:00`. The size deadline must be before `doors_at` and is independent of the beverage deadline. A default size is required whenever a size deadline is set.
- **Guest routes:** JSON `POST` with the Origin check, the 20-per-minute invalid-token limit, and the fresh pass returned in the response — copy the beverage route exactly.
- **Copy:** every new string exists in both `id` and `en` with the same `{placeholders}` (`tests/unit/strings.test.ts` enforces this). Guest copy names Chest and Bottom as flat widths.
- **No new QR frame colour.** The Size card and size labels use the existing pink merchandise styling.
- **Tests:** unit tests run with `npm run test:unit`. Database tests run on a local Supabase stack (Docker): `npx supabase start` once, then `npx supabase db reset && npx supabase test db` after each SQL change.

## Deviations from the spec (decided while building, all minor)

| Spec | Plan | Why |
|:--|:--|:--|
| §6.1 one migration `…_merch_size.sql` | Three migrations `…14_merch_size`, `…15_merch_size_booth`, `…16_merch_size_admin` | One per reviewable task; applied together |
| §6.2 `set_merch_size` returns `SAVED` / `ALREADY_SET` | Returns `OK` / `ALREADY_CHOSEN` | Same names as `set_beverage`, so the client code reads the same |
| §6.2 `merch_stock_summary()` | One function `merch_size_summary()` returns order counts and stock | Dashboard, booth strip and stock panel need the same rows |
| §6.2 `report_rows` / `admin_dashboard` redefined in full | Existing bodies renamed to `report_rows_core` / `admin_dashboard_core` and wrapped | Avoids copying 80 lines of unrelated SQL; a comment in the migration flags it for future changes |
| §2 table headers "Lebar dada (diukur rata)" | Short headers ("Lebar dada") plus one caption "Dalam cm, diukur rata (bukan lingkar badan)" | Long headers do not fit five columns at 360 px |
| §9 component tests for `SizeChoice` | Pure-logic unit tests (`sizes.test.ts`) plus the rehearsal checklist in Task 10 | The repo has no DOM test setup (vitest runs in `node`); adding one is out of scope |

## File map

| File | Task | Responsibility |
|:--|:--|:--|
| `supabase/migrations/20261115000014_merch_size.sql` | 1 | Columns, `merch_stock`, `valid_size_chart`, `effective_merch_size`, `set_merch_size`, `get_pass`, `set_event_details` |
| `supabase/migrations/20261115000015_merch_size_booth.sql` | 2 | `redeem_lookup`, `redeem_merchandise` (6 args), `merch_size_summary` |
| `supabase/migrations/20261115000016_merch_size_admin.sql` | 3 | `admin_set_merch_size`, `set_merch_stock`, `admin_guest_list`, dashboard and report wrappers |
| `supabase/tests/database/005…007_merch_size_*.test.sql` | 1–3 | pgTAP for each migration |
| `src/lib/sizes.ts` | 4 | `SIZES`, chart types and zod schema, summary types, `leftFor()` |
| `src/lib/pass.ts`, `src/lib/i18n/strings.ts` | 4 | Pass types, `size.*` strings |
| `src/app/api/pass/[token]/merch-size/route.ts` | 5 | Guest saves a size |
| `src/components/pass/SizeGuide.tsx`, `SizeChoice.tsx`, `MerchCard.tsx`, `PassView.tsx` | 5 | Size card, guide table, size on the Merchandise card |
| `src/components/invite/Scenes.tsx`, `Invitation.tsx` | 6 | Invitation scene |
| `src/app/api/station/merchandise/redeem/route.ts`, `stock/route.ts` | 7 | Redeem with `given_size`; stock counts |
| `src/components/station/SizeHandOver.tsx`, `StockStrip.tsx`, `ResultPanel.tsx`, `src/app/station/merchandise/page.tsx` | 7 | Booth hand-over, picker, stock strip |
| `src/app/api/admin/settings/…`, `EventDetails.tsx`, `SizeChartEditor.tsx`, settings page | 8 | Deadline, default size, size guide editor |
| `src/app/api/admin/merch-stock/route.ts`, `guests/[id]/merch-size/route.ts`, `StockPanel.tsx`, `RedemptionList.tsx`, `GuestEditor.tsx`, dashboard, merchandise page | 9 | Stock entry, corrections, order count |
| `src/lib/reports.ts`, `ReportsPanel.tsx` | 10 | Two CSV reports |

---

### Task 1: Size choice, pass payload and event settings (database)

**Files:**
- Create: `docs/2026-11-08-nourishfest-merch-size-design.md`
- Create: `supabase/tests/database/005_merch_size_choice.test.sql`
- Create: `supabase/migrations/20261115000014_merch_size.sql`

**Interfaces:**
- Consumes: `public.audit`, `public.actor_type_of`, `public.effective_beverage`, `public.lock_down_public` (existing).
- Produces:
  - Columns `guests.merch_size`, `guests.merch_size_chosen_at`, `guests.merch_size_source`; `events.merch_size_deadline`, `events.merch_default_size`, `events.merch_size_chart` (jsonb, seeded with the vendor chart), `events.merch_fit_note` (bool, default true); `merchandise_redemptions.reserved_size`, `reserved_source`, `given_size`; table `merch_stock (event_id, size, received, updated_at)`.
  - `valid_size_chart(p jsonb) → boolean`
  - `effective_merch_size(p_size text, p_source text, p_deadline timestamptz, p_default text) → {size, source}` (`source` is `guest` / `admin` / `auto` / null)
  - `set_merch_size(p_token text, p_size text) → {status: OK | ALREADY_CHOSEN | CLOSED | INVALID, size}`
  - `get_pass` adds `event.merch_size_deadline`, `event.merch_size_chart`, `event.merch_fit_note` and top-level `merch_size: {size, source, given_size}`
  - `set_event_details` accepts `merch_size_deadline`, `merch_default_size`, `merch_size_chart`, `merch_fit_note`; new statuses `INVALID_SIZE`, `INVALID_SIZE_CHART`, `DEFAULT_SIZE_REQUIRED`

- [ ] **Step 1: Copy the spec into the repo**

Read `engineering/2026-11-08-nourishfest-merch-size-design.md` from the NourishFest 2026 project and save it unchanged as `docs/2026-11-08-nourishfest-merch-size-design.md`.

- [ ] **Step 2: Write the failing test**

Create `supabase/tests/database/005_merch_size_choice.test.sql`:

```sql
-- pgTAP: merchandise T-shirt size, part 1 (guest choice, pass, event settings). Run with `supabase test db`.
-- now() is fixed for the whole transaction, so deadlines are set relative to it.
begin;
select plan(34);

insert into public.events (id, name, event_date, mode, doors_at)
values ('00000000-0000-0000-0000-0000000000cc', 'T', '2026-12-08', 'rehearsal', now() + interval '30 days');

insert into public.guests (id, event_id, employee_id, full_name, outlet, invite_token) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000cc', 'E1', 'Ayu', 'A', 'inviteAAAAAAAAAAAAAAAA'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000cc', 'E2', 'Budi', 'A', 'inviteBBBBBBBBBBBBBBBB');

-- get_pass before any choice
select is(public.get_pass('inviteAAAAAAAAAAAAAAAA') #>> '{merch_size,size}', null, 'no size yet');
select is(public.get_pass('inviteAAAAAAAAAAAAAAAA') #>> '{event,merch_fit_note}', 'true', 'fit note on by default');
select is(public.get_pass('inviteAAAAAAAAAAAAAAAA') #>> '{event,merch_size_chart,L,chest}', '63', 'vendor chart seeded');

-- valid_size_chart
select ok(public.valid_size_chart((select merch_size_chart from public.events where id = '00000000-0000-0000-0000-0000000000cc')), 'seeded chart is valid');
select ok(public.valid_size_chart('{}'::jsonb), 'empty chart allowed');
select ok(not public.valid_size_chart('[]'::jsonb), 'array refused');
select ok(not public.valid_size_chart('{"S":{"chest":59,"bottom":56,"length":68,"sleeve":20}}'::jsonb), 'partial chart refused');
select ok(not public.valid_size_chart(jsonb_set((select merch_size_chart from public.events where id = '00000000-0000-0000-0000-0000000000cc'), '{L,chest}', '63.5')), 'decimal refused');
select ok(not public.valid_size_chart(jsonb_set((select merch_size_chart from public.events where id = '00000000-0000-0000-0000-0000000000cc'), '{L,chest}', '0')), 'zero refused');
select ok(not public.valid_size_chart(jsonb_set((select merch_size_chart from public.events where id = '00000000-0000-0000-0000-0000000000cc'), '{L,chest}', '"63"')), 'string refused');

-- set_merch_size
select is(public.set_merch_size('inviteAAAAAAAAAAAAAAAA', 'XS') ->> 'status', 'INVALID', 'bad size');
select is(public.set_merch_size('nope', 'L') ->> 'status', 'INVALID', 'bad token');
select is(public.set_merch_size('inviteAAAAAAAAAAAAAAAA', 'L') ->> 'status', 'OK', 'first size saved');
select is(public.set_merch_size('inviteAAAAAAAAAAAAAAAA', 'L') ->> 'status', 'OK', 'identical repeat is OK');
select is(public.set_merch_size('inviteAAAAAAAAAAAAAAAA', 'XL') ->> 'status', 'ALREADY_CHOSEN', 'different size refused');
select is(public.set_merch_size('inviteAAAAAAAAAAAAAAAA', 'XL') ->> 'size', 'L', 'returns the saved size');
select is((select merch_size_source from public.guests where employee_id = 'E1'), 'guest', 'source guest');
select is(public.get_pass('inviteAAAAAAAAAAAAAAAA') #>> '{merch_size,size}', 'L', 'pass shows the size');

-- effective_merch_size
select is(public.effective_merch_size(null, null, null, null) ->> 'size', null, 'no deadline, no size');
select is(public.effective_merch_size(null, null, now() + interval '1 day', 'M') ->> 'size', null, 'deadline ahead, no size');
select is(public.effective_merch_size(null, null, now() - interval '1 second', 'M') ->> 'size', 'M', 'default after the deadline');
select is(public.effective_merch_size(null, null, now() - interval '1 second', 'M') ->> 'source', 'auto', 'source auto');
select is(public.effective_merch_size('XL', 'guest', now() - interval '1 second', 'M') ->> 'size', 'XL', 'stored size wins');

-- set_event_details
select is(public.set_event_details('00000000-0000-0000-0000-0000000000cc',
  jsonb_build_object('merch_size_deadline', now() + interval '1 day'), 'admin') ->> 'status', 'DEFAULT_SIZE_REQUIRED', 'deadline needs a default');
select is(public.set_event_details('00000000-0000-0000-0000-0000000000cc',
  jsonb_build_object('merch_default_size', 'XS'), 'admin') ->> 'status', 'INVALID_SIZE', 'bad default size');
select is(public.set_event_details('00000000-0000-0000-0000-0000000000cc',
  jsonb_build_object('merch_default_size', 'M', 'merch_size_deadline', now() + interval '31 days'), 'admin') ->> 'status',
  'INVALID_TIMES', 'deadline after doors refused');
select is(public.set_event_details('00000000-0000-0000-0000-0000000000cc',
  jsonb_build_object('merch_size_chart', '{"S":{"chest":59}}'::jsonb), 'admin') ->> 'status', 'INVALID_SIZE_CHART', 'partial chart refused');
select is(public.set_event_details('00000000-0000-0000-0000-0000000000cc',
  jsonb_build_object('merch_fit_note', 'yes'), 'admin') ->> 'status', 'INVALID', 'fit note must be a boolean');
select is(public.set_event_details('00000000-0000-0000-0000-0000000000cc',
  jsonb_build_object('merch_size_chart', '{}'::jsonb, 'merch_fit_note', false), 'admin') ->> 'status', 'OK', 'chart cleared, note off');
select is(public.get_pass('inviteAAAAAAAAAAAAAAAA') #>> '{event,merch_size_chart}', '{}', 'cleared chart on the pass');

-- deadline passed: Budi gets the default, Ayu keeps her size
select is(public.set_event_details('00000000-0000-0000-0000-0000000000cc',
  jsonb_build_object('merch_default_size', 'M', 'merch_size_deadline', now() - interval '1 minute'), 'admin') ->> 'status', 'OK', 'deadline and default saved');
select is(public.set_merch_size('inviteBBBBBBBBBBBBBBBB', 'S') ->> 'status', 'CLOSED', 'closed after the deadline');
select is(public.get_pass('inviteBBBBBBBBBBBBBBBB') -> 'merch_size', '{"size": "M", "source": "auto", "given_size": null}'::jsonb, 'default size on the pass');

select ok(not has_function_privilege('anon', 'public.set_merch_size(text,text)', 'execute')
      and not has_function_privilege('authenticated', 'public.set_merch_size(text,text)', 'execute'),
  'anon and authenticated cannot execute');

select * from finish();
rollback;
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `npx supabase db reset && npx supabase test db`
Expected: `005_merch_size_choice.test.sql` FAILS (no `merch_fit_note` on the pass, then `function public.valid_size_chart(jsonb) does not exist`); `003` and `004` pass.

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/20261115000014_merch_size.sql`. `get_pass` and `set_event_details` are full replacements of the versions in `20261115000013_beverage_reservation.sql`, with the merch lines added.

```sql
-- Merchandise T-shirt size (spec 2026-11-08), part 1: schema, the guest's choice, the pass and event settings.
-- No job runs at the deadline: effective_merch_size() works the size out on every read, like effective_beverage().

alter table public.guests
  add column merch_size text check (merch_size in ('S', 'M', 'L', 'XL', 'XXL')),
  add column merch_size_chosen_at timestamptz,
  add column merch_size_source text check (merch_size_source in ('guest', 'admin'));

alter table public.events
  add column merch_size_deadline timestamptz,
  add column merch_default_size text check (merch_default_size in ('S', 'M', 'L', 'XL', 'XXL')),
  add column merch_size_chart jsonb not null default '{
    "S":   {"chest": 59, "bottom": 56, "length": 68, "sleeve": 20},
    "M":   {"chest": 61, "bottom": 58, "length": 70, "sleeve": 21},
    "L":   {"chest": 63, "bottom": 60, "length": 72, "sleeve": 22},
    "XL":  {"chest": 65, "bottom": 62, "length": 74, "sleeve": 23},
    "XXL": {"chest": 67, "bottom": 64, "length": 76, "sleeve": 24}
  }'::jsonb,
  add column merch_fit_note boolean not null default true,
  add constraint merch_deadline_needs_default check (merch_size_deadline is null or merch_default_size is not null);

create table public.merch_stock (
  event_id uuid not null references public.events (id),
  size text not null check (size in ('S', 'M', 'L', 'XL', 'XXL')),
  received integer not null default 0 check (received >= 0),
  updated_at timestamptz not null default now(),
  primary key (event_id, size)
);

-- given_size stays nullable for redemptions recorded before this migration (rehearsal data).
-- redeem_merchandise() requires it for every new redemption.
alter table public.merchandise_redemptions
  add column reserved_size text check (reserved_size in ('S', 'M', 'L', 'XL', 'XXL')),
  add column reserved_source text check (reserved_source in ('guest', 'admin', 'auto')),
  add column given_size text check (given_size in ('S', 'M', 'L', 'XL', 'XXL'));

-- All five sizes with four positive whole-number measurements (cm), or {} to hide the guide.
-- CASE keeps the checks in order, so a non-object never reaches jsonb_object_keys and a string never reaches ::numeric.
create function public.valid_size_chart(p jsonb) returns boolean
language sql immutable set search_path = public
as $$
  select case
    when p is null or jsonb_typeof(p) <> 'object' then false
    when p = '{}'::jsonb then true
    when (select array_agg(k order by k collate "C") from jsonb_object_keys(p) k) <> array['L', 'M', 'S', 'XL', 'XXL']::text[] then false
    else not exists (
      select 1
        from jsonb_each(p) s, unnest(array['chest', 'bottom', 'length', 'sleeve']) f
       where case
         when jsonb_typeof(s.value) <> 'object' then true
         when jsonb_typeof(s.value -> f) is distinct from 'number' then true
         else (s.value ->> f)::numeric <= 0 or (s.value ->> f)::numeric <> trunc((s.value ->> f)::numeric)
       end)
  end
$$;

-- Stored size, else the admin default once the deadline has passed, else none.
create function public.effective_merch_size(p_size text, p_source text, p_deadline timestamptz, p_default text) returns jsonb
language sql stable set search_path = public
as $$
  select case
    when p_size is not null then jsonb_build_object('size', p_size, 'source', coalesce(p_source, 'guest'))
    when p_deadline is not null and now() >= p_deadline and p_default is not null
      then jsonb_build_object('size', p_default, 'source', 'auto')
    else jsonb_build_object('size', null, 'source', null)
  end
$$;

-- Guest picks a size. First saved size wins; identical repeat is OK.
create function public.set_merch_size(p_token text, p_size text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  g public.guests%rowtype;
  e public.events%rowtype;
  mr public.merchandise_redemptions%rowtype;
  v_saved text;
begin
  if p_size is null or p_size not in ('S', 'M', 'L', 'XL', 'XXL') then
    return jsonb_build_object('status', 'INVALID');
  end if;
  select * into g from public.guests where invite_token = p_token and active;
  if not found then
    return jsonb_build_object('status', 'INVALID');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(g.id::text, 0));

  select * into mr from public.merchandise_redemptions where guest_id = g.id and status = 'redeemed';
  if found then
    return jsonb_build_object('status', 'ALREADY_CHOSEN', 'size', coalesce(mr.reserved_size, mr.given_size));
  end if;

  select * into e from public.events where id = g.event_id;
  update public.guests
     set merch_size = p_size, merch_size_chosen_at = now(), merch_size_source = 'guest'
   where id = g.id and merch_size is null
     and (e.merch_size_deadline is null or now() < e.merch_size_deadline);
  if found then
    perform public.audit(g.event_id, 'guest', g.employee_id, 'merch_size_chosen', 'guest', g.id::text,
                         jsonb_build_object('size', p_size));
    return jsonb_build_object('status', 'OK', 'size', p_size);
  end if;

  select merch_size into v_saved from public.guests where id = g.id;
  if v_saved is null then
    return jsonb_build_object('status', 'CLOSED');
  end if;
  if v_saved = p_size then
    return jsonb_build_object('status', 'OK', 'size', v_saved);
  end if;
  return jsonb_build_object('status', 'ALREADY_CHOSEN', 'size', v_saved);
end $$;

-- Pass payload gains event.merch_size_deadline / merch_size_chart / merch_fit_note and a top-level merch_size object.
-- After a redemption, merch_size shows what was reserved at the booth and what was handed over.
create or replace function public.get_pass(p_token text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  g public.guests%rowtype; e public.events%rowtype; ci public.check_ins%rowtype;
  mr public.merchandise_redemptions%rowtype; br public.beverage_redemptions%rowtype;
  v_merch jsonb; v_eff jsonb; v_size jsonb;
begin
  select * into g from public.guests where invite_token = p_token and active;
  if not found then return jsonb_build_object('status', 'INVALID'); end if;
  if g.first_opened_at is null then update public.guests set first_opened_at = now() where id = g.id; end if;
  select * into e from public.events where id = g.event_id;
  select * into ci from public.check_ins where guest_id = g.id;
  if ci.id is not null then
    select * into mr from public.merchandise_redemptions where guest_id = g.id and status = 'redeemed';
    v_merch := jsonb_build_object('token', g.merch_token, 'claimed', mr.id is not null, 'redeemed_at', mr.redeemed_at);
  end if;
  select * into br from public.beverage_redemptions where guest_id = g.id and status = 'redeemed';
  v_eff := public.effective_beverage(g.beverage_choice, g.beverage_source, e.beverage_deadline);
  v_size := public.effective_merch_size(g.merch_size, g.merch_size_source, e.merch_size_deadline, e.merch_default_size);
  return jsonb_build_object(
    'status', 'OK',
    'server_now', now(),
    'event', jsonb_build_object('name', e.name, 'date', e.event_date, 'doors_at', e.doors_at,
      'starts_at', e.starts_at, 'ends_at', e.ends_at, 'venue', e.venue, 'maps_url', e.maps_url,
      'beverage_deadline', e.beverage_deadline, 'merch_size_deadline', e.merch_size_deadline,
      'merch_size_chart', e.merch_size_chart, 'merch_fit_note', e.merch_fit_note),
    'guest', jsonb_build_object('full_name', g.full_name, 'nickname', g.nickname, 'outlet', g.outlet,
      'department', g.department, 'position', g.position),
    'invite_token', g.invite_token, 'checked_in', ci.id is not null, 'checked_in_at', ci.checked_in_at,
    'prize_number', ci.prize_number, 'merchandise', v_merch,
    'beverage', jsonb_build_object(
      'choice', coalesce(br.beverage, v_eff ->> 'choice'),
      'source', coalesce(br.source, v_eff ->> 'source'),
      'token', case when br.id is not null or v_eff ->> 'choice' is not null then g.beverage_token end,
      'redeemed', br.id is not null,
      'redeemed_at', br.redeemed_at),
    'merch_size', jsonb_build_object(
      'size', case when mr.id is not null then mr.reserved_size else v_size ->> 'size' end,
      'source', case when mr.id is not null then mr.reserved_source else v_size ->> 'source' end,
      'given_size', mr.given_size));
end $$;

-- Partial update: absent key = unchanged, JSON null = clear (event_date cannot be cleared; a null chart becomes {}).
create or replace function public.set_event_details(p_event uuid, p_details jsonb, p_actor text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  e public.events%rowtype;
  v_date date; v_doors timestamptz; v_starts timestamptz; v_ends timestamptz; v_venue text; v_maps text; v_bev timestamptz;
  v_msd timestamptz; v_mdef text; v_chart jsonb; v_fit boolean;
begin
  select * into e from public.events where id = p_event;
  if not found then return jsonb_build_object('status', 'NOT_FOUND'); end if;
  if jsonb_typeof(p_details) is distinct from 'object' then return jsonb_build_object('status', 'INVALID'); end if;

  v_date   := e.event_date; v_doors := e.doors_at; v_starts := e.starts_at;
  v_ends   := e.ends_at;    v_venue := e.venue;    v_maps   := e.maps_url;
  v_bev    := e.beverage_deadline;
  v_msd    := e.merch_size_deadline; v_mdef := e.merch_default_size; v_chart := e.merch_size_chart; v_fit := e.merch_fit_note;

  if p_details ? 'event_date' then
    if jsonb_typeof(p_details -> 'event_date') <> 'string' then return jsonb_build_object('status', 'INVALID'); end if;
    v_date := (p_details ->> 'event_date')::date;
  end if;
  if p_details ? 'doors_at'  then v_doors  := (p_details ->> 'doors_at')::timestamptz;  end if;
  if p_details ? 'starts_at' then v_starts := (p_details ->> 'starts_at')::timestamptz; end if;
  if p_details ? 'ends_at'   then v_ends   := (p_details ->> 'ends_at')::timestamptz;   end if;
  if p_details ? 'venue'     then v_venue  := nullif(trim(p_details ->> 'venue'), '');   end if;
  if p_details ? 'maps_url'  then v_maps   := nullif(trim(p_details ->> 'maps_url'), ''); end if;
  if p_details ? 'beverage_deadline' then v_bev := (p_details ->> 'beverage_deadline')::timestamptz; end if;
  if p_details ? 'merch_size_deadline' then v_msd := (p_details ->> 'merch_size_deadline')::timestamptz; end if;
  if p_details ? 'merch_default_size' then v_mdef := nullif(p_details ->> 'merch_default_size', ''); end if;
  if p_details ? 'merch_size_chart' then
    v_chart := case when jsonb_typeof(p_details -> 'merch_size_chart') = 'null' then '{}'::jsonb else p_details -> 'merch_size_chart' end;
  end if;
  if p_details ? 'merch_fit_note' then
    if jsonb_typeof(p_details -> 'merch_fit_note') <> 'boolean' then return jsonb_build_object('status', 'INVALID'); end if;
    v_fit := (p_details ->> 'merch_fit_note')::boolean;
  end if;

  if v_maps is not null and v_maps !~* '^https://(www\.google\.com/maps|google\.com/maps|maps\.google\.com|maps\.app\.goo\.gl|goo\.gl/maps)([/?#].*)?$' then
    return jsonb_build_object('status', 'INVALID_MAPS_URL');
  end if;
  if v_mdef is not null and v_mdef not in ('S', 'M', 'L', 'XL', 'XXL') then
    return jsonb_build_object('status', 'INVALID_SIZE');
  end if;
  if not public.valid_size_chart(v_chart) then
    return jsonb_build_object('status', 'INVALID_SIZE_CHART');
  end if;
  if v_msd is not null and v_mdef is null then
    return jsonb_build_object('status', 'DEFAULT_SIZE_REQUIRED');
  end if;
  if v_doors is not null and ((v_starts is not null and v_starts < v_doors) or (v_ends is not null and v_ends <= v_doors)
                              or (v_bev is not null and v_bev >= v_doors) or (v_msd is not null and v_msd >= v_doors)) then
    return jsonb_build_object('status', 'INVALID_TIMES');
  end if;

  update public.events
     set event_date = v_date, doors_at = v_doors, starts_at = v_starts, ends_at = v_ends, venue = v_venue, maps_url = v_maps,
         beverage_deadline = v_bev, merch_size_deadline = v_msd, merch_default_size = v_mdef,
         merch_size_chart = v_chart, merch_fit_note = v_fit
   where id = p_event;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'event_details_updated', 'event', p_event::text,
    jsonb_build_object('keys', (select coalesce(jsonb_agg(k order by k), '[]'::jsonb) from jsonb_object_keys(p_details) k)));
  return jsonb_build_object('status', 'OK');
end $$;

select public.lock_down_public();
```

- [ ] **Step 5: Run the tests and make sure they pass**

Run: `npx supabase db reset && npx supabase test db`
Expected: PASS — `003` 11/11, `004` 49/49, `005` 34/34.

- [ ] **Step 6: Commit**

```bash
git add docs/2026-11-08-nourishfest-merch-size-design.md supabase/migrations/20261115000014_merch_size.sql supabase/tests/database/005_merch_size_choice.test.sql
git commit -m "feat(db): T-shirt size choice, pass payload and event settings"
```

---

### Task 2: Booth lookup, redeem with given size, size summary (database)

**Files:**
- Create: `supabase/tests/database/006_merch_size_booth.test.sql`
- Create: `supabase/migrations/20261115000015_merch_size_booth.sql`

**Interfaces:**
- Consumes (Task 1): `effective_merch_size(...)`, `set_merch_size(...)`, columns `merchandise_redemptions.reserved_size / reserved_source / given_size`, table `merch_stock`.
- Produces:
  - `redeem_lookup(p_event, p_token, p_guest_id, p_actor default null)`: `READY` adds `size`, `size_source`; `ALREADY_REDEEMED` adds `size`, `given_size`.
  - `redeem_merchandise(p_event uuid, p_token text, p_guest_id uuid, p_station_label text, p_actor text, p_given_size text)` — **the 5-argument version is dropped**. New status `INVALID_SIZE`. `REDEEMED` adds `size`, `given_size`.
  - `merch_size_summary(p_event uuid) → {status, sizes: [{size, reserved, received, given, left, to_claim}] (S→XXL), no_size, total, deadline, default_size, final, stock_set}`

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/database/006_merch_size_booth.test.sql`:

```sql
-- pgTAP: merchandise T-shirt size, part 2 (booth lookup, redeem with given size, stock summary). Run with `supabase test db`.
begin;
select plan(28);

insert into public.events (id, name, event_date, mode, doors_at)
values ('00000000-0000-0000-0000-0000000000dd', 'T', '2026-12-08', 'rehearsal', now() + interval '30 days');

insert into public.guests (id, event_id, employee_id, full_name, outlet, invite_token, merch_token) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000dd', 'E1', 'Ayu', 'A', 'inviteAAAAAAAAAAAAAAAA', 'merchAAAAAAAAAAAAAAAAA'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000dd', 'E2', 'Budi', 'A', 'inviteBBBBBBBBBBBBBBBB', 'merchBBBBBBBBBBBBBBBBB'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000dd', 'E3', 'Citra', 'B', 'inviteCCCCCCCCCCCCCCCC', 'merchCCCCCCCCCCCCCCCCC');

do $$ begin
  perform public.set_merch_size('inviteAAAAAAAAAAAAAAAA', 'L');
  perform public.set_merch_size('inviteCCCCCCCCCCCCCCCC', 'L');
end $$;
insert into public.check_ins (event_id, guest_id, method, prize_number) values
  ('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-000000000001', 'scan', 1),
  ('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-000000000002', 'scan', 2);

-- lookup
select is(public.redeem_lookup('00000000-0000-0000-0000-0000000000dd', 'merchAAAAAAAAAAAAAAAAA', null) ->> 'status', 'READY', 'ready');
select is(public.redeem_lookup('00000000-0000-0000-0000-0000000000dd', 'merchAAAAAAAAAAAAAAAAA', null) ->> 'size', 'L', 'lookup shows the reserved size');
select is(public.redeem_lookup('00000000-0000-0000-0000-0000000000dd', 'merchAAAAAAAAAAAAAAAAA', null) ->> 'size_source', 'guest', 'lookup shows the source');
select is(public.redeem_lookup('00000000-0000-0000-0000-0000000000dd', null, '00000000-0000-0000-0000-000000000002') ->> 'size', null, 'no size yet');
select is(public.redeem_lookup('00000000-0000-0000-0000-0000000000dd', 'merchCCCCCCCCCCCCCCCCC', null) ->> 'status', 'NOT_CHECKED_IN', 'still needs check-in');

-- redeem
select is(public.redeem_merchandise('00000000-0000-0000-0000-0000000000dd', 'merchAAAAAAAAAAAAAAAAA', null, 'Booth 1', 'merchandise', null) ->> 'status', 'INVALID_SIZE', 'given size required');
select is(public.redeem_merchandise('00000000-0000-0000-0000-0000000000dd', 'merchAAAAAAAAAAAAAAAAA', null, 'Booth 1', 'merchandise', 'XS') ->> 'status', 'INVALID_SIZE', 'given size must be S to XXL');
select is(public.redeem_merchandise('00000000-0000-0000-0000-0000000000dd', 'merchAAAAAAAAAAAAAAAAA', null, 'Booth 1', 'merchandise', 'XL') ->> 'status', 'REDEEMED', 'redeemed with a substitute');
select is((select reserved_size || '>' || given_size from public.merchandise_redemptions where guest_id = '00000000-0000-0000-0000-000000000001'), 'L>XL', 'reserved and given recorded');
select is((select reserved_source from public.merchandise_redemptions where guest_id = '00000000-0000-0000-0000-000000000001'), 'guest', 'reserved source recorded');
select is(public.redeem_merchandise('00000000-0000-0000-0000-0000000000dd', 'merchAAAAAAAAAAAAAAAAA', null, 'Booth 1', 'merchandise', 'XL') ->> 'replay', 'true', 'same booth double tap is a replay');
select is(public.redeem_lookup('00000000-0000-0000-0000-0000000000dd', 'merchAAAAAAAAAAAAAAAAA', null) ->> 'status', 'ALREADY_REDEEMED', 'already redeemed');
select is(public.redeem_lookup('00000000-0000-0000-0000-0000000000dd', 'merchAAAAAAAAAAAAAAAAA', null) ->> 'given_size', 'XL', 'already redeemed shows the size given');
select is(public.get_pass('inviteAAAAAAAAAAAAAAAA') -> 'merch_size', '{"size": "L", "source": "guest", "given_size": "XL"}'::jsonb, 'pass shows reserved and given');
select is(public.set_merch_size('inviteAAAAAAAAAAAAAAAA', 'S') ->> 'status', 'ALREADY_CHOSEN', 'no change after the hand-over');
select is(public.redeem_merchandise('00000000-0000-0000-0000-0000000000dd', null, '00000000-0000-0000-0000-000000000002', 'Booth 1', 'merchandise', 'M') ->> 'status', 'REDEEMED', 'guest with no size gets what was handed over');
select is((select reserved_size from public.merchandise_redemptions where guest_id = '00000000-0000-0000-0000-000000000002'), null, 'no reserved size recorded');

-- summary before and after stock is entered
select is(public.merch_size_summary('00000000-0000-0000-0000-0000000000dd') ->> 'stock_set', 'false', 'no stock entered yet');
insert into public.merch_stock (event_id, size, received) values
  ('00000000-0000-0000-0000-0000000000dd', 'L', 3), ('00000000-0000-0000-0000-0000000000dd', 'XL', 5);
select is(public.merch_size_summary('00000000-0000-0000-0000-0000000000dd') #>> '{sizes,3,given}', '1', 'one XL handed over');
select is(public.merch_size_summary('00000000-0000-0000-0000-0000000000dd') #>> '{sizes,3,left}', '4', 'four XL left');
select is(public.merch_size_summary('00000000-0000-0000-0000-0000000000dd') #>> '{sizes,2,reserved}', '2', 'two L reserved');
select is(public.merch_size_summary('00000000-0000-0000-0000-0000000000dd') #>> '{sizes,2,to_claim}', '1', 'one L still to claim');
select is(public.merch_size_summary('00000000-0000-0000-0000-0000000000dd') ->> 'no_size', '1', 'one guest without a reserved size');

-- void returns the shirt to stock and lets the QR work again
select is(public.void_redemption('00000000-0000-0000-0000-0000000000dd',
  (select id from public.merchandise_redemptions where guest_id = '00000000-0000-0000-0000-000000000001'), 'wrong size swap', 'admin') ->> 'status', 'OK', 'voided');
select is(public.merch_size_summary('00000000-0000-0000-0000-0000000000dd') #>> '{sizes,3,left}', '5', 'void returns the XL to stock');
select is(public.redeem_merchandise('00000000-0000-0000-0000-0000000000dd', 'merchAAAAAAAAAAAAAAAAA', null, 'Booth 2', 'merchandise', 'L') ->> 'status', 'REDEEMED', 'can redeem again after a void');

select hasnt_function('public', 'redeem_merchandise', array['uuid', 'text', 'uuid', 'text', 'text'], 'old five-argument redeem is gone');
select ok(not has_function_privilege('anon', 'public.redeem_merchandise(uuid,text,uuid,text,text,text)', 'execute')
      and not has_function_privilege('authenticated', 'public.merch_size_summary(uuid)', 'execute'),
  'anon and authenticated cannot execute');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx supabase db reset && npx supabase test db`
Expected: `006` FAILS (lookup has no `size`, then `redeem_merchandise` with six arguments does not exist); `003`–`005` pass.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261115000015_merch_size_booth.sql`:

```sql
-- Merchandise T-shirt size (spec 2026-11-08), part 2: the booth. Lookup shows the reserved size, redeem records
-- reserved and given size, and merch_size_summary() gives counts per size for the booth strip, admin and dashboard.

-- Scan or manual search. Records nothing except rejected attempts.
create or replace function public.redeem_lookup(p_event uuid, p_token text, p_guest_id uuid, p_actor text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  g public.guests%rowtype;
  e public.events%rowtype;
  mr public.merchandise_redemptions%rowtype;
  v_eff jsonb;
begin
  if p_token is not null then
    select * into g from public.guests where event_id = p_event and merch_token = p_token;
  else
    select * into g from public.guests where event_id = p_event and id = p_guest_id;
  end if;

  if not found then
    perform public.log_attempt(p_event, 'merchandise', coalesce(p_token, p_guest_id::text), 'INVALID', p_actor);
    return jsonb_build_object('status', 'INVALID');
  end if;
  if not g.active then
    perform public.log_attempt(p_event, 'merchandise', p_token, 'NOT_ELIGIBLE', p_actor);
    return jsonb_build_object('status', 'NOT_ELIGIBLE');
  end if;
  if not exists (select 1 from public.check_ins where guest_id = g.id) then
    perform public.log_attempt(p_event, 'merchandise', p_token, 'NOT_CHECKED_IN', p_actor);
    return jsonb_build_object('status', 'NOT_CHECKED_IN', 'guest', public.guest_brief(g));
  end if;

  select * into mr from public.merchandise_redemptions where guest_id = g.id and status = 'redeemed';
  if found then
    perform public.log_attempt(p_event, 'merchandise', p_token, 'ALREADY_REDEEMED', p_actor);
    return jsonb_build_object('status', 'ALREADY_REDEEMED', 'guest', public.guest_brief(g),
                              'redeemed_at', mr.redeemed_at, 'station_label', mr.station_label,
                              'size', mr.reserved_size, 'given_size', mr.given_size);
  end if;

  select * into e from public.events where id = p_event;
  v_eff := public.effective_merch_size(g.merch_size, g.merch_size_source, e.merch_size_deadline, e.merch_default_size);
  return jsonb_build_object('status', 'READY', 'guest', public.guest_brief(g),
                            'size', v_eff ->> 'size', 'size_source', v_eff ->> 'source');
end $$;

-- The booth always says which size it handed over (spec §4.4), so the old five-argument version goes.
drop function public.redeem_merchandise(uuid, text, uuid, text, text);

create function public.redeem_merchandise(
  p_event uuid, p_token text, p_guest_id uuid, p_station_label text, p_actor text, p_given_size text
) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  g public.guests%rowtype;
  e public.events%rowtype;
  mr public.merchandise_redemptions%rowtype;
  v_eff jsonb;
begin
  if p_given_size is null or p_given_size not in ('S', 'M', 'L', 'XL', 'XXL') then
    return jsonb_build_object('status', 'INVALID_SIZE');
  end if;
  if p_token is not null then
    select * into g from public.guests where event_id = p_event and merch_token = p_token;
  else
    select * into g from public.guests where event_id = p_event and id = p_guest_id;
  end if;

  if not found then
    perform public.log_attempt(p_event, 'merchandise', coalesce(p_token, p_guest_id::text), 'INVALID', p_actor);
    return jsonb_build_object('status', 'INVALID');
  end if;
  if not g.active then
    return jsonb_build_object('status', 'NOT_ELIGIBLE');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(g.id::text, 0));

  if not exists (select 1 from public.check_ins where guest_id = g.id) then
    perform public.log_attempt(p_event, 'merchandise', p_token, 'NOT_CHECKED_IN', p_actor);
    return jsonb_build_object('status', 'NOT_CHECKED_IN', 'guest', public.guest_brief(g));
  end if;

  select * into mr from public.merchandise_redemptions where guest_id = g.id and status = 'redeemed';
  if found then
    -- double-tap guard: same station within 10 seconds is the same hand-over
    if mr.station_label is not distinct from p_station_label and mr.redeemed_at > now() - interval '10 seconds' then
      return jsonb_build_object('status', 'REDEEMED', 'guest', public.guest_brief(g), 'redeemed_at', mr.redeemed_at,
                                'size', mr.reserved_size, 'given_size', mr.given_size, 'replay', true);
    end if;
    perform public.log_attempt(p_event, 'merchandise', p_token, 'ALREADY_REDEEMED', p_actor);
    return jsonb_build_object('status', 'ALREADY_REDEEMED', 'guest', public.guest_brief(g),
                              'redeemed_at', mr.redeemed_at, 'station_label', mr.station_label,
                              'size', mr.reserved_size, 'given_size', mr.given_size);
  end if;

  -- Re-read under the lock so a size saved a moment ago counts.
  select * into g from public.guests where id = g.id;
  select * into e from public.events where id = p_event;
  v_eff := public.effective_merch_size(g.merch_size, g.merch_size_source, e.merch_size_deadline, e.merch_default_size);

  insert into public.merchandise_redemptions (event_id, guest_id, status, station_label, actor, reserved_size, reserved_source, given_size)
  values (p_event, g.id, 'redeemed', p_station_label, p_actor, v_eff ->> 'size', v_eff ->> 'source', p_given_size)
  returning * into mr;

  perform public.audit(p_event, 'station', coalesce(p_actor, 'unknown'), 'merchandise_redeemed', 'guest', g.id::text,
                       jsonb_build_object('station', p_station_label, 'reserved_size', mr.reserved_size, 'given_size', mr.given_size));

  return jsonb_build_object('status', 'REDEEMED', 'guest', public.guest_brief(g), 'redeemed_at', mr.redeemed_at,
                            'size', mr.reserved_size, 'given_size', mr.given_size, 'replay', false);
end $$;

-- Counts per size for active guests. A redeemed guest counts as what was reserved at the booth.
-- received comes from merch_stock; given counts active redemptions by given_size, so a void returns the shirt to stock.
create function public.merch_size_summary(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  with ev as (
    select merch_size_deadline as d, merch_default_size as def from public.events where id = p_event),
  x as (
    select case when m.id is not null then m.reserved_size
                else public.effective_merch_size(g.merch_size, g.merch_size_source, (select d from ev), (select def from ev)) ->> 'size'
           end as size,
           m.id is not null as redeemed
      from public.guests g
      left join public.merchandise_redemptions m on m.guest_id = g.id and m.status = 'redeemed'
     where g.event_id = p_event and g.active),
  given as (
    select given_size as size, count(*) as n
      from public.merchandise_redemptions
     where event_id = p_event and status = 'redeemed' and given_size is not null
     group by given_size),
  sz as (select u.s, u.ord from unnest(array['S', 'M', 'L', 'XL', 'XXL']) with ordinality as u(s, ord))
  select jsonb_build_object(
    'status', 'OK',
    'sizes', (
      select jsonb_agg(jsonb_build_object(
          'size', sz.s,
          'reserved', (select count(*) from x where x.size = sz.s),
          'received', coalesce(st.received, 0),
          'given', coalesce(gv.n, 0),
          'left', coalesce(st.received, 0) - coalesce(gv.n, 0),
          'to_claim', (select count(*) from x where x.size = sz.s and not x.redeemed)) order by sz.ord)
        from sz
        left join public.merch_stock st on st.event_id = p_event and st.size = sz.s
        left join given gv on gv.size = sz.s),
    'no_size', (select count(*) from x where x.size is null),
    'total', (select count(*) from x),
    'deadline', (select d from ev),
    'default_size', (select def from ev),
    'final', coalesce((select d from ev) <= now(), false),
    'stock_set', exists (select 1 from public.merch_stock where event_id = p_event))
$$;

select public.lock_down_public();
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx supabase db reset && npx supabase test db`
Expected: PASS — `006` 28/28, all earlier files still passing.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261115000015_merch_size_booth.sql supabase/tests/database/006_merch_size_booth.test.sql
git commit -m "feat(db): booth records reserved and given T-shirt size, size summary"
```

---

### Task 3: Admin corrections, stock, guest list, dashboard and reports (database)

**Files:**
- Create: `supabase/tests/database/007_merch_size_admin.test.sql`
- Create: `supabase/migrations/20261115000016_merch_size_admin.sql`

**Interfaces:**
- Consumes (Tasks 1–2): `effective_merch_size`, `merch_size_summary`, `redeem_merchandise` (6 args).
- Produces:
  - `admin_set_merch_size(p_event uuid, p_guest_id uuid, p_size text, p_reason text, p_actor text) → {status: OK | REASON_REQUIRED | INVALID | NOT_FOUND | ALREADY_REDEEMED}`
  - `set_merch_stock(p_event uuid, p_stock jsonb, p_actor text) → {status: OK | INVALID | NOT_FOUND}`; `p_stock` like `{"S": 40, "L": 60}`, whole numbers 0–10000, overwrites per size, audited as `merch_stock_set`.
  - `admin_guest_list` rows add `merch_size`, `merch_size_source`, `merch_given_size`.
  - `admin_dashboard` adds `merch_size` (the `merch_size_summary` object).
  - `report_rows` handles `merch_sizes` and `merch_size_pending`; everything else goes to `report_rows_core`.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/database/007_merch_size_admin.test.sql`:

```sql
-- pgTAP: merchandise T-shirt size, part 3 (admin corrections, stock, guest list, dashboard, reports). Run with `supabase test db`.
begin;
select plan(32);

insert into public.events (id, name, event_date, mode, doors_at)
values ('00000000-0000-0000-0000-0000000000ee', 'T', '2026-12-08', 'rehearsal', now() + interval '30 days');

insert into public.guests (id, event_id, employee_id, full_name, outlet, invite_token, merch_token) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000ee', 'E1', 'Ayu', 'A', 'inviteAAAAAAAAAAAAAAAA', 'merchAAAAAAAAAAAAAAAAA'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000ee', 'E2', 'Budi', 'A', 'inviteBBBBBBBBBBBBBBBB', 'merchBBBBBBBBBBBBBBBBB');
insert into public.guests (id, event_id, employee_id, full_name, outlet, active) values
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000ee', 'E3', 'Citra', 'B', false);

-- admin_set_merch_size
select is(public.admin_set_merch_size('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000001', 'L', 'oops', 'admin') ->> 'status', 'REASON_REQUIRED', 'reason too short');
select is(public.admin_set_merch_size('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000001', 'XS', 'wrong tap', 'admin') ->> 'status', 'INVALID', 'bad size');
select is(public.admin_set_merch_size('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-0000000000ff', 'L', 'wrong tap', 'admin') ->> 'status', 'NOT_FOUND', 'unknown guest');
select is(public.admin_set_merch_size('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000001', 'L', 'asked at the desk', 'admin') ->> 'status', 'OK', 'admin sets the size');
select is((select merch_size_source from public.guests where employee_id = 'E1'), 'admin', 'source admin');
select is(public.set_merch_size('inviteAAAAAAAAAAAAAAAA', 'M') ->> 'status', 'ALREADY_CHOSEN', 'guest cannot change an admin size');

insert into public.check_ins (event_id, guest_id, method, prize_number) values
  ('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000001', 'scan', 1);
do $$ begin
  perform public.redeem_merchandise('00000000-0000-0000-0000-0000000000ee', 'merchAAAAAAAAAAAAAAAAA', null, 'Booth 1', 'merchandise', 'L');
end $$;
select is(public.admin_set_merch_size('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000001', 'XL', 'wrong tap', 'admin') ->> 'status', 'ALREADY_REDEEMED', 'blocked while redeemed');

-- set_merch_stock
select is(public.set_merch_stock('00000000-0000-0000-0000-0000000000ee', '{"XS": 3}', 'admin') ->> 'status', 'INVALID', 'unknown size');
select is(public.set_merch_stock('00000000-0000-0000-0000-0000000000ee', '{"L": -1}', 'admin') ->> 'status', 'INVALID', 'negative refused');
select is(public.set_merch_stock('00000000-0000-0000-0000-0000000000ee', '{"L": 2.5}', 'admin') ->> 'status', 'INVALID', 'decimal refused');
select is(public.set_merch_stock('00000000-0000-0000-0000-0000000000ee', '{"L": "10"}', 'admin') ->> 'status', 'INVALID', 'string refused');
select is(public.set_merch_stock('00000000-0000-0000-0000-0000000000ee', '{}', 'admin') ->> 'status', 'INVALID', 'empty refused');
select is(public.set_merch_stock('00000000-0000-0000-0000-0000000000ee', '{"L": 10, "XL": 4}', 'admin') ->> 'status', 'OK', 'stock saved');
select is((select received from public.merch_stock where event_id = '00000000-0000-0000-0000-0000000000ee' and size = 'L'), 10, 'L received');
select is(public.set_merch_stock('00000000-0000-0000-0000-0000000000ee', '{"L": 12}', 'admin') ->> 'status', 'OK', 'second delivery');
select is((select received from public.merch_stock where event_id = '00000000-0000-0000-0000-0000000000ee' and size = 'L'), 12, 'L overwritten with the new total');
select is((select received from public.merch_stock where event_id = '00000000-0000-0000-0000-0000000000ee' and size = 'XL'), 4, 'XL untouched');
select is((select count(*)::int from public.audit_log where event_id = '00000000-0000-0000-0000-0000000000ee' and action = 'merch_stock_set'), 2, 'stock changes audited');

-- guest list and dashboard
select is(public.admin_guest_list('00000000-0000-0000-0000-0000000000ee', null, null) #>> '{guests,0,merch_size}', 'L', 'guest list shows the size');
select is(public.admin_guest_list('00000000-0000-0000-0000-0000000000ee', null, null) #>> '{guests,0,merch_given_size}', 'L', 'guest list shows the size given');
select is(public.admin_dashboard('00000000-0000-0000-0000-0000000000ee') #>> '{merch_size,sizes,2,left}', '11', 'dashboard carries the size summary');
select ok(public.admin_dashboard('00000000-0000-0000-0000-0000000000ee') ? 'beverage', 'dashboard keeps its other parts');

-- reports
select is(jsonb_array_length(public.report_rows('00000000-0000-0000-0000-0000000000ee', 'merch_sizes') -> 'rows'), 2, 'one hand-over row and one not-redeemed row');
select is(public.report_rows('00000000-0000-0000-0000-0000000000ee', 'merch_sizes') #>> '{rows,0,given_size}', 'L', 'hand-over row first');
select is(public.report_rows('00000000-0000-0000-0000-0000000000ee', 'merch_sizes') #>> '{rows,0,substituted}', 'false', 'not substituted');
select is(public.report_rows('00000000-0000-0000-0000-0000000000ee', 'merch_size_pending') #>> '{rows,0,employee_id}', 'E2', 'Budi has no size yet');
select is(public.report_rows('00000000-0000-0000-0000-0000000000ee', 'guests') ->> 'status', 'OK', 'existing reports still work');
select is(public.report_rows('00000000-0000-0000-0000-0000000000ee', 'nope') ->> 'status', 'UNKNOWN_REPORT', 'unknown report');

-- rehearsal reset keeps choices and stock
select is(public.reset_rehearsal_data('00000000-0000-0000-0000-0000000000ee', 'admin') ->> 'status', 'OK', 'reset ok');
select is((select merch_size from public.guests where employee_id = 'E1'), 'L', 'size kept after reset');
select is((select count(*)::int from public.merch_stock where event_id = '00000000-0000-0000-0000-0000000000ee'), 2, 'stock kept after reset');
select ok(not has_function_privilege('anon', 'public.set_merch_stock(uuid,jsonb,text)', 'execute')
      and not has_function_privilege('authenticated', 'public.admin_set_merch_size(uuid,uuid,text,text,text)', 'execute')
      and not has_function_privilege('anon', 'public.report_rows(uuid,text)', 'execute'),
  'anon and authenticated cannot execute');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx supabase db reset && npx supabase test db`
Expected: `007` FAILS (`function public.admin_set_merch_size(...) does not exist`).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261115000016_merch_size_admin.sql`. `admin_guest_list` is a full replacement of the beverage version with the three merch fields and the `lateral` join added.

```sql
-- Merchandise T-shirt size (spec 2026-11-08), part 3: admin corrections, stock entry, guest list, dashboard and reports.

-- Wrong size picked: admin sets or changes it, with a reason. Blocked while a redemption is active.
create function public.admin_set_merch_size(p_event uuid, p_guest_id uuid, p_size text, p_reason text, p_actor text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_reason text := trim(coalesce(p_reason, ''));
  g public.guests%rowtype;
begin
  if length(v_reason) < 5 then
    return jsonb_build_object('status', 'REASON_REQUIRED');
  end if;
  if p_size is null or p_size not in ('S', 'M', 'L', 'XL', 'XXL') then
    return jsonb_build_object('status', 'INVALID');
  end if;
  select * into g from public.guests where id = p_guest_id and event_id = p_event;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(g.id::text, 0));

  if exists (select 1 from public.merchandise_redemptions where guest_id = g.id and status = 'redeemed') then
    return jsonb_build_object('status', 'ALREADY_REDEEMED');
  end if;
  update public.guests
     set merch_size = p_size, merch_size_source = 'admin', merch_size_chosen_at = now()
   where id = g.id;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'merch_size_set', 'guest', g.id::text,
                       jsonb_build_object('from', g.merch_size, 'to', p_size, 'reason', v_reason));
  return jsonb_build_object('status', 'OK');
end $$;

-- Stock received per size, e.g. {"S": 40, "M": 60}. Sizes left out keep their number. Overwrites, so a second
-- delivery is entered as the new total.
create function public.set_merch_stock(p_event uuid, p_stock jsonb, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  k text;
  v jsonb;
begin
  if jsonb_typeof(p_stock) is distinct from 'object' or p_stock = '{}'::jsonb then
    return jsonb_build_object('status', 'INVALID');
  end if;
  for k, v in select key, value from jsonb_each(p_stock) loop
    if k not in ('S', 'M', 'L', 'XL', 'XXL') or jsonb_typeof(v) <> 'number' then
      return jsonb_build_object('status', 'INVALID');
    end if;
    if (v #>> '{}')::numeric < 0 or (v #>> '{}')::numeric > 10000
       or (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric) then
      return jsonb_build_object('status', 'INVALID');
    end if;
  end loop;
  if not exists (select 1 from public.events where id = p_event) then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;

  insert into public.merch_stock (event_id, size, received, updated_at)
  select p_event, s.key, (s.value #>> '{}')::int, now() from jsonb_each(p_stock) s
  on conflict (event_id, size) do update set received = excluded.received, updated_at = now();

  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'merch_stock_set', 'event', p_event::text, p_stock);
  return jsonb_build_object('status', 'OK');
end $$;

create or replace function public.admin_guest_list(p_event uuid, p_q text, p_outlet text) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object('status', 'OK', 'guests', coalesce(jsonb_agg(x order by x->>'full_name'), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'id', g.id, 'employee_id', g.employee_id, 'full_name', g.full_name, 'outlet', g.outlet,
      'department', g.department, 'position', g.position, 'phone', g.phone,
      'opened', g.first_opened_at is not null, 'active', g.active, 'flagged_missing', g.flagged_missing,
      'is_walk_in', g.is_walk_in, 'checked_in_at', c.checked_in_at, 'prize_number', c.prize_number,
      'merch', case when m.id is not null then 'redeemed' else 'none' end,
      'beverage', coalesce(b.beverage, public.effective_beverage(g.beverage_choice, g.beverage_source, ev.beverage_deadline) ->> 'choice'),
      'beverage_source', coalesce(b.source, public.effective_beverage(g.beverage_choice, g.beverage_source, ev.beverage_deadline) ->> 'source'),
      'beverage_redeemed', b.id is not null,
      'merch_size', case when m.id is not null then m.reserved_size else sz.v ->> 'size' end,
      'merch_size_source', case when m.id is not null then m.reserved_source else sz.v ->> 'source' end,
      'merch_given_size', m.given_size) as x
    from public.guests g
    join public.events ev on ev.id = g.event_id
    cross join lateral (
      select public.effective_merch_size(g.merch_size, g.merch_size_source, ev.merch_size_deadline, ev.merch_default_size) as v) sz
    left join public.check_ins c on c.guest_id = g.id
    left join public.merchandise_redemptions m on m.guest_id = g.id and m.status = 'redeemed'
    left join public.beverage_redemptions b on b.guest_id = g.id and b.status = 'redeemed'
    where g.event_id = p_event
      and (p_outlet is null or p_outlet = '' or g.outlet = p_outlet)
      and (coalesce(trim(p_q), '') = ''
           or position(lower(trim(p_q)) in lower(g.full_name)) > 0
           or position(lower(trim(p_q)) in lower(g.employee_id)) > 0)
    order by g.full_name
    limit 500
  ) s
$$;

-- The dashboard and the report list keep their existing body under a *_core name and gain the size parts here.
-- A later migration that redefines admin_dashboard or report_rows must keep calling the _core function (or fold it in).
alter function public.admin_dashboard(uuid) rename to admin_dashboard_core;

create function public.admin_dashboard(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select public.admin_dashboard_core(p_event) || jsonb_build_object('merch_size', public.merch_size_summary(p_event))
$$;

alter function public.report_rows(uuid, text) rename to report_rows_core;

create function public.report_rows(p_event uuid, p_report text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  v jsonb;
  e public.events%rowtype;
begin
  if p_report not in ('merch_sizes', 'merch_size_pending') then
    return public.report_rows_core(p_event, p_report);
  end if;
  select * into e from public.events where id = p_event;

  if p_report = 'merch_sizes' then
    -- One row per redemption (voided ones included), plus one row for each active guest not yet redeemed.
    select coalesce(jsonb_agg(jsonb_build_object(
        'employee_id', s.employee_id, 'full_name', s.full_name, 'outlet', s.outlet, 'department', s.department,
        'reserved_size', s.reserved_size, 'source', s.source, 'chosen_at', s.chosen_at, 'given_size', s.given_size,
        'substituted', s.reserved_size is not null and s.given_size is not null and s.reserved_size <> s.given_size,
        'redeemed_at', s.redeemed_at, 'station', s.station, 'actor', s.actor, 'status', s.status, 'void_reason', s.void_reason)
        order by s.outlet, s.full_name, s.redeemed_at), '[]'::jsonb) into v
      from (
        select g.employee_id, g.full_name, g.outlet, g.department, m.reserved_size, m.reserved_source as source,
               g.merch_size_chosen_at as chosen_at, m.given_size, m.redeemed_at, m.station_label as station, m.actor,
               m.status, m.void_reason
          from public.merchandise_redemptions m join public.guests g on g.id = m.guest_id
         where m.event_id = p_event
        union all
        select g.employee_id, g.full_name, g.outlet, g.department, sz.v ->> 'size', sz.v ->> 'source',
               g.merch_size_chosen_at, null, null, null, null, 'not redeemed', null
          from public.guests g
          cross join lateral (
            select public.effective_merch_size(g.merch_size, g.merch_size_source, e.merch_size_deadline, e.merch_default_size) as v) sz
         where g.event_id = p_event and g.active
           and not exists (select 1 from public.merchandise_redemptions m where m.guest_id = g.id and m.status = 'redeemed')
      ) s;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
        'employee_id', g.employee_id, 'full_name', g.full_name, 'outlet', g.outlet, 'department', g.department,
        'phone', g.phone) order by g.outlet, g.full_name), '[]'::jsonb) into v
      from public.guests g
     where g.event_id = p_event and g.active
       and public.effective_merch_size(g.merch_size, g.merch_size_source, e.merch_size_deadline, e.merch_default_size) ->> 'size' is null
       and not exists (select 1 from public.merchandise_redemptions m where m.guest_id = g.id and m.status = 'redeemed');
  end if;
  return jsonb_build_object('status', 'OK', 'rows', v);
end $$;

select public.lock_down_public();
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx supabase db reset && npx supabase test db`
Expected: PASS — `003` 11, `004` 49, `005` 34, `006` 28, `007` 32.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261115000016_merch_size_admin.sql supabase/tests/database/007_merch_size_admin.test.sql
git commit -m "feat(db): T-shirt size corrections, stock entry, dashboard and reports"
```

---

### Task 4: Shared size types and bilingual strings

**Files:**
- Create: `tests/unit/sizes.test.ts`
- Create: `src/lib/sizes.ts`
- Modify: `src/lib/pass.ts`
- Modify: `src/lib/i18n/strings.ts`

**Interfaces:**
- Consumes (Tasks 1–3): the JSON shapes of `get_pass.merch_size`, `get_pass.event.merch_*` and `merch_size_summary`.
- Produces (`src/lib/sizes.ts`): `SIZES`, `type Size`, `MEASURES`, `type Measure`, `type FullChart`, `type SizeChart`, `isSize()`, `hasChart()`, `sizeChartSchema`, `type SizeRow`, `type SizeSummary`, `leftFor(summary, size): number | null`. (`src/lib/pass.ts`): `type MerchSizeState = { size, source, given_size }`, `PassData.merch_size?`, `PassData.event.merch_size_deadline? / merch_size_chart? / merch_fit_note?`. Strings: every `size.*` key listed in Step 5.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/sizes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SIZES, hasChart, isSize, leftFor, sizeChartSchema, type SizeSummary } from '@/lib/sizes';

const SEED = {
  S: { chest: 59, bottom: 56, length: 68, sleeve: 20 },
  M: { chest: 61, bottom: 58, length: 70, sleeve: 21 },
  L: { chest: 63, bottom: 60, length: 72, sleeve: 22 },
  XL: { chest: 65, bottom: 62, length: 74, sleeve: 23 },
  XXL: { chest: 67, bottom: 64, length: 76, sleeve: 24 },
};
const summary = (stock_set: boolean): SizeSummary => ({
  sizes: SIZES.map((size) => ({ size, reserved: 0, received: 3, given: 0, left: size === 'L' ? 0 : 3, to_claim: 0 })),
  no_size: 0, total: 0, deadline: null, default_size: null, final: false, stock_set,
});

describe('sizes', () => {
  it('lists the five sizes in order', () => expect(SIZES).toEqual(['S', 'M', 'L', 'XL', 'XXL']));
  it('recognises sizes', () => {
    expect(isSize('XL')).toBe(true);
    expect(isSize('XS')).toBe(false);
    expect(isSize(undefined)).toBe(false);
  });
  it('treats an empty chart as no chart', () => {
    expect(hasChart(SEED)).toBe(true);
    expect(hasChart({})).toBe(false);
    expect(hasChart(null)).toBe(false);
  });
  it('accepts the vendor chart and an empty chart', () => {
    expect(sizeChartSchema.safeParse(SEED).success).toBe(true);
    expect(sizeChartSchema.safeParse({}).success).toBe(true);
  });
  it('rejects partial, zero and decimal charts', () => {
    expect(sizeChartSchema.safeParse({ S: SEED.S }).success).toBe(false);
    expect(sizeChartSchema.safeParse({ ...SEED, L: { ...SEED.L, chest: 0 } }).success).toBe(false);
    expect(sizeChartSchema.safeParse({ ...SEED, L: { ...SEED.L, chest: 63.5 } }).success).toBe(false);
  });
  it('gives stock left only once stock was entered', () => {
    expect(leftFor(summary(true), 'L')).toBe(0);
    expect(leftFor(summary(true), 'M')).toBe(3);
    expect(leftFor(summary(false), 'M')).toBeNull();
    expect(leftFor(null, 'M')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/sizes.test.ts`
Expected: FAIL — vitest cannot resolve `@/lib/sizes`.

- [ ] **Step 3: Write `src/lib/sizes.ts`**

```ts
import { z } from 'zod';

/** T-shirt sizes in display order (merch size spec 2026-11-08 §1.1). Same list as the SQL check constraints. */
export const SIZES = ['S', 'M', 'L', 'XL', 'XXL'] as const;
export type Size = (typeof SIZES)[number];
export const MEASURES = ['chest', 'bottom', 'length', 'sleeve'] as const;
export type Measure = (typeof MEASURES)[number];
export type FullChart = Record<Size, Record<Measure, number>>;
/** `{}` when admin cleared the chart; the guide is then hidden. */
export type SizeChart = FullChart | Record<string, never>;

export const isSize = (s: unknown): s is Size => typeof s === 'string' && (SIZES as readonly string[]).includes(s);
export const hasChart = (c: SizeChart | null | undefined): c is FullChart => !!c && SIZES.every((s) => s in c);

const cm = z.number().int().positive().max(300);
const dims = z.object({ chest: cm, bottom: cm, length: cm, sleeve: cm }).strict();
/** Same rule as valid_size_chart() in SQL: all five sizes with four whole-number measurements in cm, or empty. */
export const sizeChartSchema = z.union([
  z.object({ S: dims, M: dims, L: dims, XL: dims, XXL: dims }).strict(),
  z.object({}).strict(),
]);

/** One row of merch_size_summary(). left = received − given; to_claim = guests with that size not yet redeemed. */
export type SizeRow = { size: Size; reserved: number; received: number; given: number; left: number; to_claim: number };
export type SizeSummary = {
  sizes: SizeRow[]; no_size: number; total: number; deadline: string | null;
  default_size: Size | null; final: boolean; stock_set: boolean;
};

/** Stock left for a size, or null when HR has not entered stock yet (the booth then shows claimed counts). */
export const leftFor = (summary: SizeSummary | null, size: Size): number | null =>
  summary?.stock_set ? (summary.sizes.find((r) => r.size === size)?.left ?? 0) : null;
```

- [ ] **Step 4: Extend the pass types**

Apply this change to `src/lib/pass.ts`:

```diff
--- a/src/lib/pass.ts
+++ b/src/lib/pass.ts
@@ -1,10 +1,12 @@
 import { db, rpc } from './db';
 import { isToken } from './qr';
+import type { Size, SizeChart } from './sizes';
 
 export type PassData = {
   event: {
     name: string; date: string; doors_at: string | null; starts_at: string | null; ends_at: string | null;
     venue: string | null; maps_url: string | null; beverage_deadline?: string | null;
+    merch_size_deadline?: string | null; merch_size_chart?: SizeChart; merch_fit_note?: boolean;
   };
   server_now: string;
   guest: { full_name: string; nickname?: string | null; outlet: string; department: string | null; position: string | null };
@@ -15,12 +17,16 @@ export type PassData = {
   merchandise: null | { token: string; claimed: boolean; redeemed_at: string | null };
   /** Optional so a pass rendered before the beverage migration still type-checks; null choice = not chosen yet. */
   beverage?: BeverageState;
+  /** Optional so a pass rendered before the merch size migration still type-checks; null size = not chosen yet. */
+  merch_size?: MerchSizeState;
 };
 export type Beverage = 'beer' | 'soft_drink';
 export type BeverageState = {
   choice: Beverage | null; source: 'guest' | 'admin' | 'auto' | null; token: string | null;
   redeemed: boolean; redeemed_at: string | null;
 };
+/** After a hand-over, size is what was reserved at the booth and given_size what was handed over. */
+export type MerchSizeState = { size: Size | null; source: 'guest' | 'admin' | 'auto' | null; given_size: Size | null };
 export type PassResult = { status: 'OK'; data: PassData } | { status: 'INVALID' } | { status: 'RATE_LIMITED' };
 
 const LIMIT = 20;
```

- [ ] **Step 5: Add the `size.*` strings**

Apply this change to `src/lib/i18n/strings.ts` (Indonesian block after `bev.already_detail`, English block after its English twin). `size.confirm_yes/no` are not needed: the confirm step reuses `bev.confirm_yes`, `bev.confirm_no` and `bev.saving` (KONFIRMASI / BATAL / Menyimpan…).

```diff
--- a/src/lib/i18n/strings.ts
+++ b/src/lib/i18n/strings.ts
@@ -71,6 +71,38 @@ const id = {
   'bev.wrong_code': 'BUKAN QR MINUMAN',
   'bev.no_choice': 'BELUM PILIH MINUMAN',
   'bev.already_detail': 'Sudah diambil {time} di {station}',
+  'size.title': 'PILIH UKURAN KAOSMU',
+  'size.banner': 'UKURAN KAOS',
+  'size.fit': 'Oversized fit — pilih ukuran biasamu.',
+  'size.guide': 'Panduan ukuran',
+  'size.guide_hide': 'Tutup panduan',
+  'size.col_size': 'Ukuran',
+  'size.chest': 'Lebar dada',
+  'size.bottom': 'Lebar bawah',
+  'size.length': 'Panjang',
+  'size.sleeve': 'Lengan',
+  'size.unit': 'Dalam cm, diukur rata (bukan lingkar badan).',
+  'size.tip': 'Bandingkan dengan kaos favoritmu yang diletakkan rata.',
+  'size.deadline': 'Pilih sebelum {deadline}',
+  'size.confirm': '{size}: lebar dada {chest} cm, panjang {length} cm. Pilihan final, tidak bisa diubah.',
+  'size.confirm_plain': 'Ukuran {size}? Pilihan final, tidak bisa diubah.',
+  'size.saved': 'Final. Tukar di booth merchandise setelah check-in.',
+  'size.auto': 'Ditetapkan otomatis karena belum memilih sampai batas waktu',
+  'size.closed': 'Batas waktu sudah lewat. Ukuranmu ditetapkan otomatis.',
+  'size.retry': 'Koneksi bermasalah. Ukuranmu belum tersimpan, coba lagi.',
+  'size.label': 'SIZE {size}',
+  'size.swapped': 'Dipesan {reserved}, diterima {given}',
+  'size.handover': 'SERAHKAN KAOS {size}',
+  'size.change': 'Ganti ukuran',
+  'size.left': 'Sisa {size}: {n}',
+  'size.out': 'STOK {size} HABIS',
+  'size.none': 'BELUM PILIH UKURAN',
+  'size.pick': 'Pilih ukuran yang diserahkan',
+  'size.zero_confirm': 'Stok {size} tercatat 0. Lanjut?',
+  'size.continue': 'LANJUT',
+  'size.cancel': 'BATAL',
+  'size.strip_left': 'SISA',
+  'size.strip_given': 'DIAMBIL',
 
   'staff.success': 'CHECK-IN BERHASIL',
   'staff.already': 'SUDAH CHECK-IN',
@@ -201,6 +233,38 @@ const en: Record<StringKey, string> = {
   'bev.wrong_code': 'NOT A DRINK QR',
   'bev.no_choice': 'NO DRINK CHOSEN',
   'bev.already_detail': 'Claimed {time} at {station}',
+  'size.title': 'CHOOSE YOUR T-SHIRT SIZE',
+  'size.banner': 'T-SHIRT SIZE',
+  'size.fit': 'Oversized fit — pick your usual size.',
+  'size.guide': 'Size guide',
+  'size.guide_hide': 'Hide guide',
+  'size.col_size': 'Size',
+  'size.chest': 'Chest width',
+  'size.bottom': 'Bottom width',
+  'size.length': 'Length',
+  'size.sleeve': 'Sleeve',
+  'size.unit': 'In cm, measured flat (not around the body).',
+  'size.tip': 'Compare with your favourite T-shirt laid flat.',
+  'size.deadline': 'Choose by {deadline}',
+  'size.confirm': '{size}: chest width {chest} cm, length {length} cm. This is final and cannot be changed.',
+  'size.confirm_plain': 'Size {size}? This is final and cannot be changed.',
+  'size.saved': 'Final. Collect it at the merchandise booth after check-in.',
+  'size.auto': 'Set automatically because no size was chosen by the deadline',
+  'size.closed': 'The deadline has passed. Your size was set automatically.',
+  'size.retry': 'Connection problem. Your size is not saved yet, try again.',
+  'size.label': 'SIZE {size}',
+  'size.swapped': 'Reserved {reserved}, received {given}',
+  'size.handover': 'HAND OVER SIZE {size}',
+  'size.change': 'Change size',
+  'size.left': '{size} left: {n}',
+  'size.out': '{size} OUT OF STOCK',
+  'size.none': 'NO SIZE CHOSEN',
+  'size.pick': 'Pick the size handed over',
+  'size.zero_confirm': 'Recorded stock for {size} is 0. Continue?',
+  'size.continue': 'CONTINUE',
+  'size.cancel': 'CANCEL',
+  'size.strip_left': 'LEFT',
+  'size.strip_given': 'CLAIMED',
 
   'staff.success': 'CHECKED IN',
   'staff.already': 'ALREADY CHECKED IN',
```

- [ ] **Step 6: Run the checks**

Run: `npx tsc --noEmit -p . && npm run test:unit`
Expected: PASS — 22 files, 213 tests (the strings tests confirm both languages have the same keys and placeholders).

- [ ] **Step 7: Commit**

```bash
git add src/lib/sizes.ts tests/unit/sizes.test.ts src/lib/pass.ts src/lib/i18n/strings.ts
git commit -m "feat: shared T-shirt size types and bilingual strings"
```

---

### Task 5: Size card on the pass and size on the Merchandise card

**Files:**
- Create: `src/app/api/pass/[token]/merch-size/route.ts`
- Create: `src/components/pass/SizeGuide.tsx`
- Create: `src/components/pass/SizeChoice.tsx`
- Modify (full replacement): `src/components/pass/MerchCard.tsx`
- Modify: `src/components/pass/PassView.tsx`
- Modify: `src/styles/pass.css`

**Interfaces:**
- Consumes: `set_merch_size` (Task 1); `SIZES`, `hasChart`, `FullChart`, `MEASURES`, `PassData.merch_size` (Task 4); `api`, `useI18n`, `formatDateShort`, `formatTimeWita`, `checkLimit`, `loadPass`, `noteInvalid` (existing).
- Produces: `POST /api/pass/[token]/merch-size {size}` → `{ok, status, data: PassData | null}`; `<SizeChoice token data onChange />` (used again by Task 6); `<MerchCard merch size name reveal />`.

There is no DOM test setup in this repo, so this task is checked with `tsc`, `eslint` and the rehearsal checklist in Task 10.

- [ ] **Step 1: Add the guest route**

Create `src/app/api/pass/[token]/merch-size/route.ts` (same shape as the beverage route):

```ts
import { z } from 'zod';
import { clientIp, fail, guard, ok, readJson, sameOrigin } from '@/lib/api';
import { rpc } from '@/lib/db';
import { checkLimit, loadPass, noteInvalid } from '@/lib/pass';
import { isToken } from '@/lib/qr';
import { SIZES } from '@/lib/sizes';

const Body = z.object({ size: z.enum(SIZES) });

/** Guest saves a T-shirt size. Answers with the fresh pass so the client swaps state in one round-trip. */
export const POST = guard(async (req: Request, ctx?: { params: Promise<{ token: string }> }) => {
  if (!sameOrigin(req)) return fail(403, 'BAD_ORIGIN');
  const { token } = await ctx!.params;
  const ip = clientIp(req);
  if (await checkLimit(ip)) return fail(429, 'RATE_LIMITED');
  if (!isToken(token)) {
    await noteInvalid(ip);
    return ok('INVALID');
  }
  const body = await readJson(req, Body);
  if (body === null) return fail(400, 'BAD_INPUT');
  const r = await rpc<{ status: string }>('set_merch_size', { p_token: token, p_size: body.size });
  if (r.status === 'INVALID') {
    await noteInvalid(ip);
    return ok('INVALID');
  }
  const pass = await loadPass(token, ip);
  return ok(r.status, pass.status === 'OK' ? pass.data : null);
});
```

- [ ] **Step 2: Add the size guide table**

Create `src/components/pass/SizeGuide.tsx`:

```tsx
'use client';
import { useI18n } from '@/lib/i18n';
import type { StringKey } from '@/lib/i18n/strings';
import { MEASURES, SIZES, type FullChart, type Measure } from '@/lib/sizes';

const HEAD: Record<Measure, StringKey> = { chest: 'size.chest', bottom: 'size.bottom', length: 'size.length', sleeve: 'size.sleeve' };

/** Vendor chart as a native bilingual table (merch size spec §2). Widths are measured flat, not around the body. */
export function SizeGuide({ chart }: { chart: FullChart }) {
  const { t } = useI18n();
  return (
    <div className="size-guide">
      <table>
        <thead>
          <tr>
            <th scope="col">{t('size.col_size')}</th>
            {MEASURES.map((m) => <th key={m} scope="col">{t(HEAD[m])}</th>)}
          </tr>
        </thead>
        <tbody>
          {SIZES.map((s) => (
            <tr key={s}>
              <th scope="row">{s}</th>
              {MEASURES.map((m) => <td key={m}>{chart[s][m]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="caption">{t('size.unit')}</p>
      <p className="caption">{t('size.tip')}</p>
    </div>
  );
}
```

- [ ] **Step 3: Add the shared size choice**

Create `src/components/pass/SizeChoice.tsx`. States match spec §3.2: buttons with optional guide and deadline → inline confirm repeating chest and length → saved size (with "Ditetapkan otomatis" for `auto`).

```tsx
'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import { useI18n } from '@/lib/i18n';
import type { PassData } from '@/lib/pass';
import { SIZES, hasChart, type Size } from '@/lib/sizes';
import { formatDateShort, formatTimeWita } from '@/lib/time';
import { SizeGuide } from './SizeGuide';

/**
 * One component for the invitation scene and the pass card, so they cannot drift (merch size spec §3).
 * Choose → inline confirm → saved (shown only after the server confirms). Final after the first confirmed tap.
 */
export function SizeChoice({ token, data, onChange }: { token: string; data: PassData; onChange: (d: PassData) => void }) {
  const { t, lang } = useI18n();
  const [pick, setPick] = useState<Size | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [guide, setGuide] = useState(false);
  const s = data.merch_size;
  if (!s) return null;

  if (s.size) {
    return (
      <section className="size">
        <h2 className="size__banner">{t('size.banner')}</h2>
        <p className="size__big">{s.size}</p>
        <p className="helper">{t('size.saved')}</p>
        {s.source === 'auto' && <p className="caption">{t('size.auto')}</p>}
      </section>
    );
  }

  async function save(size: Size) {
    setBusy(true);
    setMsg('');
    const r = await api<PassData>(`/api/pass/${token}/merch-size`, { size });
    setBusy(false);
    setPick(null);
    if (r.ok && r.data) onChange(r.data);
    if (r.status === 'CLOSED') setMsg(t('size.closed'));
    else if (!r.ok || !r.data) setMsg(t('size.retry'));
  }

  const ev = data.event;
  const chart = hasChart(ev.merch_size_chart) ? ev.merch_size_chart : null;
  const deadline = ev.merch_size_deadline;
  return (
    <section className="size">
      <h2 className="size__banner">{t('size.title')}</h2>
      {ev.merch_fit_note !== false && <p className="helper">{t('size.fit')}</p>}
      {deadline && (
        <p className="caption">{t('size.deadline', { deadline: `${formatDateShort(deadline, lang)} ${formatTimeWita(deadline)} WITA` })}</p>
      )}
      {chart && (
        <button type="button" className="size__guide-btn" aria-expanded={guide} onClick={() => setGuide(!guide)}>
          {guide ? t('size.guide_hide') : t('size.guide')}
        </button>
      )}
      {chart && guide && <SizeGuide chart={chart} />}
      {pick ? (
        <div className="size__confirm" role="group" aria-label={t('size.title')}>
          <p className="size__q">
            {chart
              ? t('size.confirm', { size: pick, chest: chart[pick].chest, length: chart[pick].length })
              : t('size.confirm_plain', { size: pick })}
          </p>
          <div className="size__row">
            <button type="button" className="size__btn" disabled={busy} onClick={() => save(pick)}>{busy ? t('bev.saving') : t('bev.confirm_yes')}</button>
            <button type="button" className="size__btn size__btn--ghost" disabled={busy} onClick={() => setPick(null)}>{t('bev.confirm_no')}</button>
          </div>
        </div>
      ) : (
        <div className="size__btns">
          {SIZES.map((sz) => (
            <button key={sz} type="button" className="size__btn" onClick={() => setPick(sz)}>{sz}</button>
          ))}
        </div>
      )}
      {msg && <p className="error" role="alert">{msg}</p>}
    </section>
  );
}
```

- [ ] **Step 4: Show the size on the Merchandise card**

Replace `src/components/pass/MerchCard.tsx` with:

```tsx
'use client';
import { QrTile } from '@/components/QrTile';
import { useI18n } from '@/lib/i18n';
import { payloadFor } from '@/lib/qr';
import { formatTimeWita } from '@/lib/time';
import type { PassData } from '@/lib/pass';

export function MerchCard({ merch, size, name, reveal }: {
  merch: NonNullable<PassData['merchandise']>; size?: PassData['merch_size']; name: string; reveal: boolean;
}) {
  const { t } = useI18n();
  if (merch.claimed) {
    const given = size?.given_size;
    return (
      <section className="merch merch--claimed">
        <h2 className="merch__banner merch__banner--muted">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7" /></svg>
          {t('merch.claimed')}
        </h2>
        {given && (
          <p className="merch__size">
            {size?.size && size.size !== given ? t('size.swapped', { reserved: size.size, given }) : t('size.label', { size: given })}
          </p>
        )}
        {merch.redeemed_at && <p className="helper">{t('merch.claimed_at', { time: formatTimeWita(merch.redeemed_at) })}</p>}
      </section>
    );
  }
  return (
    <section className={reveal ? 'merch merch--reveal' : 'merch'}>
      <h2 className="merch__banner">{t('merch.banner')}</h2>
      {size?.size && <p className="merch__size">{t('size.label', { size: size.size })}</p>}
      <QrTile payload={payloadFor('merch', merch.token)} frame="pink" alt={t('merch.qr_alt', { name })} />
      <span className="pill pill--pink">{t('merch.once')}</span>
      <p className="helper">{t('merch.show')}</p>
      <p className="caption caption--warn">{t('merch.warn')}</p>
    </section>
  );
}
```

- [ ] **Step 5: Render the size card before check-in**

In `src/components/pass/PassView.tsx`, add the import:

```tsx
import { SaveImage } from './SaveImage';
import { SizeChoice } from './SizeChoice';
```

and replace

```tsx
      {data.checked_in && data.merchandise && <MerchCard merch={data.merchandise} name={data.guest.full_name} reveal={riseMerch} />}
      <BeverageChoice token={token} data={data} onChange={setData} />
```

with

```tsx
      {data.checked_in && data.merchandise && <MerchCard merch={data.merchandise} size={data.merch_size} name={data.guest.full_name} reveal={riseMerch} />}
      <BeverageChoice token={token} data={data} onChange={setData} />
      {/* After check-in the size shows on the Merchandise card instead (merch size spec §3.2). */}
      {!data.checked_in && <SizeChoice token={token} data={data} onChange={setData} />}
```

- [ ] **Step 6: Add the styles**

Apply this change to `src/styles/pass.css` (directly after `.bev__btn:disabled`):

```diff
--- a/src/styles/pass.css
+++ b/src/styles/pass.css
@@ -93,6 +93,26 @@
 .bev__btn--ghost { background: transparent; color: var(--nf-green); }
 .bev__btn:disabled { opacity: 0.6; cursor: default; }
 
+/* T-shirt size (merch size spec 2026-11-08 §3). Pink ties it to the merchandise card; no new QR frame colour. */
+.size { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 0 16px 16px; background: var(--nf-card); border: 3px solid var(--nf-pink); border-radius: var(--nf-radius-card); overflow: hidden; }
+.size__banner { align-self: stretch; margin: 0 -16px 4px; padding: 3px 0; text-align: center; background: var(--nf-pink); color: var(--nf-black); font-family: var(--nf-font-heading); font-weight: 400; font-size: 24px; line-height: 1.2; letter-spacing: 0.1em; }
+.size .helper { color: var(--nf-text); text-align: center; }
+.size__big { margin: 0; font-family: var(--nf-font-display); font-size: 56px; line-height: 1; color: var(--nf-pink); }
+.size__btns { display: grid; grid-template-columns: repeat(5, minmax(44px, 1fr)); gap: 6px; width: 100%; }
+.size__row { display: flex; gap: 10px; width: 100%; }
+.size__btn { flex: 1; min-height: 52px; padding: 0 4px; border: 2px solid var(--nf-pink); border-radius: var(--nf-radius-btn); background: var(--nf-pink); color: var(--nf-black); font-family: var(--nf-font-heading); font-size: 20px; letter-spacing: 0.04em; cursor: pointer; }
+.size__btn--ghost { background: transparent; color: var(--nf-pink); }
+.size__btn:disabled { opacity: 0.6; cursor: default; }
+.size__confirm { display: flex; flex-direction: column; align-items: center; gap: 10px; width: 100%; }
+.size__q { margin: 0; text-align: center; font-weight: 600; color: var(--nf-text); }
+.size__guide-btn { min-height: 44px; padding: 0 12px; border: 0; background: none; color: var(--nf-pink); font-family: var(--nf-font-label); font-weight: 600; font-size: 15px; letter-spacing: 0.08em; text-decoration: underline; cursor: pointer; }
+.size-guide { width: 100%; }
+.size-guide table { width: 100%; border-collapse: collapse; font-size: 14px; color: var(--nf-text); }
+.size-guide th, .size-guide td { padding: 6px 2px; text-align: center; border-bottom: 1px solid var(--nf-line-dash); }
+.size-guide thead th { font-family: var(--nf-font-label); font-weight: 600; font-size: 12px; letter-spacing: 0.04em; }
+.size-guide .caption { margin: 6px 0 0; text-align: center; }
+.merch__size { margin: 0; font-family: var(--nf-font-heading); font-size: 28px; letter-spacing: 0.08em; color: var(--nf-text); }
+
 .save { display: flex; flex-direction: column; align-items: center; gap: 8px; }
 
 /* Event details sit on a card, never on the halftone (Clean Ground). */
```

- [ ] **Step 7: Run the checks**

Run: `npx tsc --noEmit -p . && npx eslint src/components/pass src/app/api/pass && npm run test:unit`
Expected: no errors; 213 tests pass.

- [ ] **Step 8: Commit**

```bash
git add "src/app/api/pass/[token]/merch-size/route.ts" src/components/pass src/styles/pass.css
git commit -m "feat(pass): T-shirt size card, size guide and size on the merchandise card"
```

---

### Task 6: Invitation scene

**Files:**
- Modify: `src/components/invite/Scenes.tsx`
- Modify: `src/components/invite/Invitation.tsx`
- Modify: `src/components/pass/PassView.tsx`
- Modify: `src/styles/invite.css`

**Interfaces:**
- Consumes: `<SizeChoice token data onChange />` (Task 5).
- Produces: the `onBeverage` prop on `Invitation` and `Scenes` is renamed **`onPassUpdate`**, because it now carries both drink and size updates. No other caller exists.

- [ ] **Step 1: Add the scene and rename the prop in `Scenes.tsx`**

```diff
--- a/src/components/invite/Scenes.tsx
+++ b/src/components/invite/Scenes.tsx
@@ -8,6 +8,7 @@ import { countdownParts, witaDate } from '@/lib/invite/time';
 import type { PassData } from '@/lib/pass';
 import { formatTimeWita } from '@/lib/time';
 import { BeverageChoice } from '@/components/pass/BeverageChoice';
+import { SizeChoice } from '@/components/pass/SizeChoice';
 import { Cassette, Crowd, MapPin, MapStreets } from './art';
 import { BlingItem, LookPair, SkipItem, type Bling } from './outfits';
 
@@ -89,10 +90,10 @@ function SlamWord({ word, start }: { word: string; start: number }) {
 }
 
 type Props = {
-  data: PassData; token: string; label: string; root: HTMLElement | null; onBeverage: (d: PassData) => void; onViewPass: () => void;
+  data: PassData; token: string; label: string; root: HTMLElement | null; onPassUpdate: (d: PassData) => void; onViewPass: () => void;
 };
 
-export function Scenes({ data, token, label, root, onBeverage, onViewPass }: Props) {
+export function Scenes({ data, token, label, root, onPassUpdate, onViewPass }: Props) {
   const { t } = useI18n();
   const [now, setNow] = useState(() => Date.now());
   const offset = useRef(Date.parse(data.server_now) - Date.now());
@@ -335,12 +336,22 @@ export function Scenes({ data, token, label, root, onBeverage, onViewPass }: Pro
         <Scene root={root}>
           <Chip n={9} />
           <div className="inv-bev m m-settle" style={d(0.5)}>
-            <BeverageChoice token={token} data={data} onChange={onBeverage} />
+            <BeverageChoice token={token} data={data} onChange={onPassUpdate} />
           </div>
         </Scene>
       )}
 
-      {/* 11 · Outro */}
+      {/* 11 · Choose your T-shirt size (merch size spec 2026-11-08 §3.1). Never blocks scrolling or Lewati. */}
+      {data.merch_size && (
+        <Scene root={root}>
+          <Chip n={10} />
+          <div className="inv-size m m-settle" style={d(0.5)}>
+            <SizeChoice token={token} data={data} onChange={onPassUpdate} />
+          </div>
+        </Scene>
+      )}
+
+      {/* 12 · Outro */}
       <Scene root={root} className="scene--outro">
         <Chip n="end" />
         <div className="outro-tape m m-eject" style={d(0.25)}><Cassette label={label} /></div>
```

- [ ] **Step 2: Rename the prop in `Invitation.tsx`**

```diff
--- a/src/components/invite/Invitation.tsx
+++ b/src/components/invite/Invitation.tsx
@@ -19,8 +19,8 @@ const prefersReduced = () => typeof window !== 'undefined' && !!window.matchMedi
  * Controller for the invitation layer (motion spec 2026-10-19): gate → opening → scroll scenes → exit to the pass.
  * The exit animates the whole layer and calls onDone on its `inv-leave` animationend.
  */
-export function Invitation({ data, token, replay, onBeverage, onDone }: {
-  data: PassData; token: string; replay: boolean; onBeverage: (d: PassData) => void; onDone: () => void;
+export function Invitation({ data, token, replay, onPassUpdate, onDone }: {
+  data: PassData; token: string; replay: boolean; onPassUpdate: (d: PassData) => void; onDone: () => void;
 }) {
   const { t } = useI18n();
   const music = useMusic();
@@ -71,7 +71,7 @@ export function Invitation({ data, token, replay, onBeverage, onDone }: {
         </div>
       )}
       {phase === 'scroll'
-        ? <Scenes data={data} token={token} label={label} root={scroller} onBeverage={onBeverage} onViewPass={() => leave('slow')} />
+        ? <Scenes data={data} token={token} label={label} root={scroller} onPassUpdate={onPassUpdate} onViewPass={() => leave('slow')} />
         : <Stage phase={phase} label={label} onPlay={play} onSkip={skipFromGate} onEnd={() => setPhase('scroll')} />}
     </div>
   );
```

- [ ] **Step 3: Rename the prop where `PassView` renders the invitation**

In `src/components/pass/PassView.tsx` replace `onBeverage={setData}` with `onPassUpdate={setData}`.

- [ ] **Step 4: Share the scene layout rule**

In `src/styles/invite.css` replace

```css
.inv-bev { width: 100%; text-align: left; }
```

with

```css
.inv-bev, .inv-size { width: 100%; text-align: left; }
```

- [ ] **Step 5: Run the checks**

Run: `grep -rn onBeverage src; npx tsc --noEmit -p . && npx eslint src/components/invite src/components/pass && npm run test:unit`
Expected: `grep` prints nothing; no errors; 213 tests pass (including `invite-css.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add src/components/invite src/components/pass/PassView.tsx src/styles/invite.css
git commit -m "feat(invite): choose your T-shirt size scene"
```

---

### Task 7: Merchandise booth — size headline, hand-over, picker, stock strip

**Files:**
- Modify (full replacement): `src/app/api/station/merchandise/redeem/route.ts`
- Create: `src/app/api/station/merchandise/stock/route.ts`
- Create: `src/components/station/StockStrip.tsx`
- Create: `src/components/station/SizeHandOver.tsx`
- Modify: `src/components/station/ResultPanel.tsx`
- Modify (full replacement): `src/app/station/merchandise/page.tsx`
- Modify: `src/styles/station.css`

**Interfaces:**
- Consumes: `redeem_lookup` / `redeem_merchandise` (6 args) / `merch_size_summary` (Task 2); `SIZES`, `leftFor`, `Size`, `SizeSummary` (Task 4); `codeInput`, `resolveCode`, `stationPost`, `stationGet` (existing).
- Produces: `POST /api/station/merchandise/redeem {code | guest_id, given_size}` (body without `given_size` → 400 `BAD_INPUT`); `GET /api/station/merchandise/stock` → `SizeSummary`; `ResultPanel` gains `extra?: ReactNode` (replaces the default hand-over button) and shows `SIZE X` as the merchandise headline; `Result` gains `size`, `size_source`, `given_size`.

- [ ] **Step 1: Require the size handed over**

Replace `src/app/api/station/merchandise/redeem/route.ts` with the version below. `z.intersection` keeps `codeInput`'s "exactly one of code or guest_id" rule and adds `given_size`.

```ts
import { z } from 'zod';
import { ok } from '@/lib/api';
import { codeInput, resolveCode } from '@/lib/code-input';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, actorLabel, stationPost } from '@/lib/routes';
import { SIZES } from '@/lib/sizes';

/** The booth always says which size it handed over; it can differ from the reserved size (merch size spec §4.1). */
const Body = z.intersection(codeInput, z.object({ given_size: z.enum(SIZES) }));

export const POST = stationPost(['merchandise'], Body, async ({ actor, body }) => {
  const c = await resolveCode(body, 'merch', 'merchandise', actorId(actor));
  if ('response' in c) return c.response;
  const r = await rpc<{ status: string }>('redeem_merchandise', {
    p_event: env().EVENT_ID, p_token: c.token, p_guest_id: body.guest_id ?? null,
    p_station_label: actorLabel(actor), p_actor: actorId(actor), p_given_size: body.given_size,
  });
  return ok(r.status, r);
});
```

- [ ] **Step 2: Add the stock route**

Create `src/app/api/station/merchandise/stock/route.ts`:

```ts
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { stationGet } from '@/lib/routes';

/** Counts per size for the booth's stock strip (merch size spec §4.2). */
export const GET = stationGet(['merchandise'], async () =>
  ok('OK', await rpc<Record<string, unknown>>('merch_size_summary', { p_event: env().EVENT_ID })));
```

- [ ] **Step 3: Add the stock strip**

Create `src/components/station/StockStrip.tsx`:

```tsx
'use client';
import { useI18n } from '@/lib/i18n';
import type { SizeSummary } from '@/lib/sizes';

/** Stock left per size, pinned above the scanner (merch size spec §4.2). Before stock is entered it shows claimed per size. */
export function StockStrip({ summary }: { summary: SizeSummary | null }) {
  const { t } = useI18n();
  if (!summary) return null;
  const label = summary.stock_set ? t('size.strip_left') : t('size.strip_given');
  return (
    <div className="stock-strip" role="group" aria-label={label}>
      <b>{label}</b>
      {summary.sizes.map((r) => {
        const n = summary.stock_set ? r.left : r.given;
        return <span key={r.size} className={summary.stock_set && n <= 0 ? 'is-zero' : undefined}>{r.size} {n}</span>;
      })}
    </div>
  );
}
```

- [ ] **Step 4: Add the hand-over controls**

Create `src/components/station/SizeHandOver.tsx`. It opens the picker straight away when the guest has no size or the reserved size is at 0 (spec §4.3), and asks once before handing over a size recorded at 0 (spec §4.4).

```tsx
'use client';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { SIZES, leftFor, type Size, type SizeSummary } from '@/lib/sizes';

/**
 * Booth hand-over for a READY guest (merch size spec §4). One tap hands over the reserved size; "Ganti ukuran"
 * opens a picker with stock left per size. A size at 0 asks once, because the box count beats the system count.
 * Mount with a `key` per lookup so the picker state starts fresh for each guest.
 */
export function SizeHandOver({ size, summary, busy, onHandOver }: {
  size: Size | null; summary: SizeSummary | null; busy: boolean; onHandOver: (given: Size) => void;
}) {
  const { t } = useI18n();
  const reservedLeft = size ? leftFor(summary, size) : null;
  const out = reservedLeft !== null && reservedLeft <= 0;
  const [picking, setPicking] = useState(size === null || out);
  const [zero, setZero] = useState<Size | null>(null);

  if (zero) {
    return (
      <div className="size-hand">
        <p className="size-alert">{t('size.zero_confirm', { size: zero })}</p>
        <div className="size-hand__actions">
          <button type="button" className="btn--staff" disabled={busy} aria-disabled={busy} onClick={() => onHandOver(zero)}>{t('size.continue')}</button>
          <button type="button" className="btn--staff btn--staff-dark" onClick={() => setZero(null)}>{t('size.cancel')}</button>
        </div>
      </div>
    );
  }

  if (!picking && size) {
    return (
      <div className="size-hand">
        {reservedLeft !== null && <p className="panel__note">{t('size.left', { size, n: reservedLeft })}</p>}
        <div className="size-hand__actions">
          <button type="button" className="btn--staff" disabled={busy} aria-disabled={busy} onClick={() => onHandOver(size)}>{t('size.handover', { size })}</button>
          <button type="button" className="btn--staff btn--staff-dark" onClick={() => setPicking(true)}>{t('size.change')}</button>
        </div>
      </div>
    );
  }

  const alert = size === null || out;
  return (
    <div className="size-hand">
      <p className={alert ? 'size-alert' : 'panel__note'}>{size === null ? t('size.none') : out ? t('size.out', { size }) : t('size.pick')}</p>
      <div className="size-picks" role="group" aria-label={t('size.pick')}>
        {SIZES.map((s) => {
          const left = leftFor(summary, s);
          const empty = left !== null && left <= 0;
          return (
            <button key={s} type="button" className={empty ? 'size-pick size-pick--zero' : 'size-pick'} disabled={busy}
              onClick={() => (empty ? setZero(s) : onHandOver(s))}>
              {s}{left !== null && <small>{left}</small>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Teach `ResultPanel` about sizes**

```diff
--- a/src/components/station/ResultPanel.tsx
+++ b/src/components/station/ResultPanel.tsx
@@ -1,7 +1,8 @@
 'use client';
-import { useEffect, useState } from 'react';
+import { useEffect, useState, type ReactNode } from 'react';
 import { useI18n } from '@/lib/i18n';
 import { panelFor, type Context, type Icon } from '@/lib/result-panel';
+import type { Size } from '@/lib/sizes';
 import { formatTimeWita } from '@/lib/time';
 
 export type Result = {
@@ -12,6 +13,10 @@ export type Result = {
   redeemed_at?: string;
   station_label?: string;
   beverage?: 'beer' | 'soft_drink';
+  /** Merchandise: reserved size (null = none yet) and, after a hand-over, the size given. */
+  size?: Size | null;
+  size_source?: 'guest' | 'admin' | 'auto' | null;
+  given_size?: Size | null;
 };
 
 const PATHS: Record<Exclude<Icon, 'none'>, string[]> = {
@@ -33,8 +38,9 @@ function PanelIcon({ icon }: { icon: Icon }) {
   );
 }
 
-export function ResultPanel({ context, result, busy, onNext, onHandOver }: {
-  context: Context; result: Result; busy?: boolean; onNext: () => void; onHandOver?: () => void;
+/** `extra` replaces the default hand-over button (the merchandise booth puts its size controls there). */
+export function ResultPanel({ context, result, busy, onNext, onHandOver, extra }: {
+  context: Context; result: Result; busy?: boolean; onNext: () => void; onHandOver?: () => void; extra?: ReactNode;
 }) {
   const { t } = useI18n();
   const panel = panelFor(context, result.status);
@@ -59,6 +65,9 @@ export function ResultPanel({ context, result, busy, onNext, onHandOver }: {
   const ready = (context === 'merchandise' || context === 'bar') && result.status === 'READY';
   // At the bar the drink itself is the headline, in large type (spec §3).
   const drink = context === 'bar' && result.beverage ? t(result.beverage === 'beer' ? 'bev.beer' : 'bev.soft') : null;
+  // At the booth the size is the headline: what was handed over, else what was reserved (merch size spec §4.1).
+  const shirtSize = context === 'merchandise' ? (result.given_size ?? result.size ?? null) : null;
+  const headline = drink ?? (shirtSize ? t('size.label', { size: shirtSize }) : null);
 
   return (
     <section className={`panel panel--${panel.tone}`}>
@@ -67,15 +76,16 @@ export function ResultPanel({ context, result, busy, onNext, onHandOver }: {
         <PanelIcon icon={panel.icon} />
         <span className="panel__title">{t(panel.titleKey)}</span>
       </div>
-      {drink && <div className="panel__drink">{drink}</div>}
+      {headline && <div className="panel__drink">{headline}</div>}
       {g && <div className="panel__name">{g.full_name}</div>}
       {meta && <div className="panel__meta">{meta}</div>}
       {context === 'checkin' && result.prize_number !== undefined && (
         <div className="panel__prize"><b>{t('staff.prize_label')}</b><span>{String(result.prize_number).padStart(3, '0')}</span></div>
       )}
       {note && <div className="panel__note">{note}</div>}
+      {extra}
       <div className="panel__actions">
-        {ready && (
+        {ready && !extra && (
           <button type="button" className="btn--staff" disabled={busy} aria-disabled={busy} onClick={onHandOver}>{t(context === 'bar' ? 'bev.handover' : 'merch.handover')}</button>
         )}
         <button type="button" className="btn--staff btn--staff-dark" onClick={onNext}>{t('staff.next')}</button>
```

- [ ] **Step 6: Wire up the booth page**

Replace `src/app/station/merchandise/page.tsx` with:

```tsx
'use client';
import { useCallback, useEffect, useState } from 'react';
import { ManualSearch, type Found } from '@/components/station/ManualSearch';
import { ResultPanel, type Result } from '@/components/station/ResultPanel';
import { Scanner } from '@/components/station/Scanner';
import { SizeHandOver } from '@/components/station/SizeHandOver';
import { StationShell } from '@/components/station/StationShell';
import { StockStrip } from '@/components/station/StockStrip';
import { TabBar, type Tab } from '@/components/station/TabBar';
import { api } from '@/lib/client';
import { panelFor } from '@/lib/result-panel';
import type { Size, SizeSummary } from '@/lib/sizes';
import { useStation } from '@/lib/use-station';

export default function MerchandiseStation() {
  const { me } = useStation('merchandise');
  const [tab, setTab] = useState<Tab>('scan');
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [counter, setCounter] = useState('– / –');
  const [sizes, setSizes] = useState<SizeSummary | null>(null);

  const refreshCounter = useCallback(async () => {
    const [r, s] = await Promise.all([
      api<{ redeemed: number; checked_in: number }>('/api/station/merchandise/count'),
      api<SizeSummary>('/api/station/merchandise/stock'),
    ]);
    if (r.ok && r.data) setCounter(`${r.data.redeemed} / ${r.data.checked_in}`);
    if (s.ok && s.data) setSizes(s.data);
  }, []);
  useEffect(() => {
    if (!me) return;
    refreshCounter();
    const id = setInterval(refreshCounter, 10_000);
    return () => clearInterval(id);
  }, [me, refreshCounter]);

  const asResult = (r: Awaited<ReturnType<typeof api<Result>>>): Result =>
    r.ok ? { ...(r.data ?? {}), status: r.status } : { status: 'RETRYABLE_ERROR' };

  const doLookup = useCallback(async (body: { code: string } | { guest_id: string }) => {
    setBusy(true);
    setResult(asResult(await api<Result>('/api/station/merchandise/lookup', body)));
    setBusy(false);
  }, []);

  // The redemption is recorded only when a hand-over button is tapped, with the size actually handed over.
  const handOver = useCallback(async (given: Size) => {
    if (!result?.guest?.id) return;
    setBusy(true);
    const r = await api<Result>('/api/station/merchandise/redeem', { guest_id: result.guest.id, given_size: given });
    setBusy(false);
    setResult(asResult(r));
    if (r.status === 'REDEEMED') refreshCounter();
  }, [result, refreshCounter]);

  if (!me) return null;
  const problem = result ? !['green', 'neutral'].includes(panelFor('merchandise', result.status).tone) : false;
  const sizeControls = result?.status === 'READY'
    ? <SizeHandOver key={result.guest?.id ?? 'none'} size={result.size ?? null} summary={sizes} busy={busy} onHandOver={handOver} />
    : undefined;
  return (
    <StationShell title="MERCHANDISE" me={me}>
      <StockStrip summary={sizes} />
      {tab === 'scan' && <Scanner onCode={(code) => doLookup({ code })} paused={busy || !!result} problem={problem} onManual={() => { setResult(null); setTab('manual'); }} />}
      {result ? (
        <ResultPanel context="merchandise" result={result} busy={busy} onNext={() => setResult(null)} extra={sizeControls} />
      ) : tab === 'manual' ? (
        <ManualSearch onPick={(g: Found) => doLookup({ guest_id: g.id })} />
      ) : (
        <div style={{ flex: 1 }} />
      )}
      <TabBar tab={tab} onTab={(t) => { setResult(null); setTab(t); }} counter={counter} />
    </StationShell>
  );
}
```

- [ ] **Step 7: Add the styles**

Append to `src/styles/station.css`:

```diff
--- a/src/styles/station.css
+++ b/src/styles/station.css
@@ -66,3 +66,17 @@
 .search__status--error { color: var(--nf-pink); }
 .scanner__gate .scanner__help { font-size: 14px; }
 .scanner__actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
+
+/* Merchandise booth sizes (merch size spec 2026-11-08 §4) */
+.stock-strip { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 10px; padding: 8px var(--nf-gutter); background: var(--nf-black); color: var(--nf-text); font-family: var(--nf-font-label); font-weight: 600; font-size: 16px; letter-spacing: 0.06em; }
+.stock-strip b { font-weight: 600; font-size: 12px; letter-spacing: 0.2em; color: var(--nf-text-muted); }
+.stock-strip .is-zero { color: var(--nf-pink); }
+.size-hand { display: grid; gap: 10px; margin-top: auto; }
+.size-hand + .panel__actions { margin-top: 0; }
+.size-hand__actions { display: grid; gap: 10px; }
+.size-alert { margin: 0; font-family: var(--nf-font-heading); font-size: 26px; letter-spacing: 0.04em; color: var(--nf-pink); }
+.size-picks { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
+.size-pick { min-height: 72px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; border: 0; border-radius: 14px; background: var(--nf-green); color: var(--nf-black); font-family: var(--nf-font-heading); font-size: 24px; cursor: pointer; }
+.size-pick small { font-family: var(--nf-font-label); font-size: 13px; font-weight: 600; }
+.size-pick--zero { background: var(--nf-pink); }
+.size-pick:disabled { opacity: 0.6; }
```

- [ ] **Step 8: Run the checks**

Run: `npx tsc --noEmit -p . && npx eslint src/components/station src/app/station src/app/api/station && npm run test:unit`
Expected: no errors (the two `Unused eslint-disable directive` warnings in `Scanner.tsx` were already there); 213 tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/app/api/station/merchandise src/components/station src/app/station/merchandise/page.tsx src/styles/station.css
git commit -m "feat(booth): hand over by size, change size, stock strip"
```

---

### Task 8: Admin settings — size deadline, default size, size guide editor

**Files:**
- Modify: `src/app/api/admin/settings/route.ts`
- Modify (full replacement): `src/app/api/admin/settings/event/route.ts`
- Modify (full replacement): `src/components/admin/EventDetails.tsx`
- Create: `src/components/admin/SizeChartEditor.tsx`
- Modify: `src/app/admin/(console)/settings/page.tsx`

**Interfaces:**
- Consumes: `set_event_details` merch keys (Task 1); `SIZES`, `sizeChartSchema`, `hasChart`, `SizeChart`, `FullChart` (Task 4).
- Produces: `GET /api/admin/settings` returns `event.merch_size_deadline`, `merch_default_size`, `merch_size_chart`, `merch_fit_note`; `POST /api/admin/settings/event` accepts them (deadline as WITA `YYYY-MM-DDTHH:mm`); `EventInfo` gains the four optional fields.

- [ ] **Step 1: Return the merch settings**

```diff
--- a/src/app/api/admin/settings/route.ts
+++ b/src/app/api/admin/settings/route.ts
@@ -7,7 +7,7 @@ import { adminGet } from '@/lib/routes';
 
 export const GET = adminGet(async () => {
   const [{ data: ev, error: e1 }, { data: pins, error: e2 }, labels] = await Promise.all([
-    db().from('events').select('name, event_date, mode, doors_at, starts_at, ends_at, venue, maps_url, beverage_deadline').eq('id', env().EVENT_ID).single(),
+    db().from('events').select('name, event_date, mode, doors_at, starts_at, ends_at, venue, maps_url, beverage_deadline, merch_size_deadline, merch_default_size, merch_size_chart, merch_fit_note').eq('id', env().EVENT_ID).single(),
     db().from('station_pins').select('role, active, updated_at').eq('event_id', env().EVENT_ID),
     stationLabels(),
   ]);
@@ -17,6 +17,8 @@ export const GET = adminGet(async () => {
     event: {
       name: ev.name, event_date: ev.event_date, doors_at: ev.doors_at, starts_at: ev.starts_at,
       ends_at: ev.ends_at, venue: ev.venue, maps_url: ev.maps_url, beverage_deadline: ev.beverage_deadline,
+      merch_size_deadline: ev.merch_size_deadline, merch_default_size: ev.merch_default_size,
+      merch_size_chart: ev.merch_size_chart, merch_fit_note: ev.merch_fit_note,
     },
     mode: ev.mode,
     station_labels: labels,
```

- [ ] **Step 2: Accept the merch settings**

Replace `src/app/api/admin/settings/event/route.ts` with:

```ts
import { z } from 'zod';
import { fail, ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { isMapsUrl } from '@/lib/invite/maps';
import { actorId, adminPost } from '@/lib/routes';
import { SIZES, sizeChartSchema } from '@/lib/sizes';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable();
/** WITA date and time from a datetime-local field. */
const local = z.string().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/).nullable();

const Body = z.object({
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  doors_at: hhmm,
  starts_at: hhmm,
  ends_at: hhmm,
  venue: z.string().max(120).nullable(),
  maps_url: z.string().max(500).nullable(),
  beverage_deadline: local,
  merch_size_deadline: local,
  merch_default_size: z.enum(SIZES).nullable(),
  merch_size_chart: sizeChartSchema,
  merch_fit_note: z.boolean(),
}).partial();

/** Times arrive as HH:mm in WITA; combine with the event date and store with +08:00. */
export const POST = adminPost(Body, async ({ actor, body }) => {
  if (body.maps_url && !isMapsUrl(body.maps_url)) return fail(400, 'INVALID_MAPS_URL');
  const { event_date, doors_at, starts_at, ends_at, beverage_deadline, merch_size_deadline, ...rest } = body;
  const times = { doors_at, starts_at, ends_at };
  const needsDate = Object.values(times).some((v) => v);
  if (needsDate && !event_date) return fail(400, 'BAD_INPUT'); // client always sends the date with times
  const details: Record<string, unknown> = { ...rest };
  if (event_date) details.event_date = event_date;
  for (const [k, v] of Object.entries(times)) {
    if (v !== undefined) details[k] = v === null ? null : `${event_date}T${v}:00+08:00`;
  }
  // The deadlines carry their own date (WITA date and time from a datetime-local field).
  const deadlines = { beverage_deadline, merch_size_deadline };
  for (const [k, v] of Object.entries(deadlines)) {
    if (v !== undefined) details[k] = v === null ? null : `${v}:00+08:00`;
  }
  const r = await rpc<{ status: string }>('set_event_details', {
    p_event: env().EVENT_ID, p_details: details, p_actor: actorId(actor),
  });
  return ok(r.status);
});
```

- [ ] **Step 3: Add the deadline and default size to Event details**

Replace `src/components/admin/EventDetails.tsx` with:

```tsx
'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import { SIZES, type Size, type SizeChart } from '@/lib/sizes';
import { formatTimeWita } from '@/lib/time';

export type EventInfo = {
  event_date: string; doors_at: string | null; starts_at: string | null; ends_at: string | null;
  venue: string | null; maps_url: string | null; beverage_deadline?: string | null;
  merch_size_deadline?: string | null; merch_default_size?: Size | null; merch_size_chart?: SizeChart; merch_fit_note?: boolean;
};

const hm = (iso: string | null) => (iso ? formatTimeWita(iso) : '');
const witaLocal = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Makassar', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
/** ISO → "2026-12-01T12:00" in WITA, the value a datetime-local field takes. */
const dtl = (iso: string | null | undefined) => (iso ? witaLocal.format(new Date(iso)).replace(' ', 'T') : '');
const ERR: Record<string, string> = {
  INVALID_MAPS_URL: 'That is not a Google Maps link. Paste the link from the Share button in Google Maps.',
  INVALID_TIMES: 'Programme start and end must be after the gate opens, and both deadlines before it.',
  DEFAULT_SIZE_REQUIRED: 'Pick a default T-shirt size before setting the size deadline.',
  INVALID_SIZE: 'The default size must be S, M, L, XL or XXL.',
};

export function EventDetails({ info, reload }: { info: EventInfo; reload: () => void }) {
  const [f, setF] = useState({
    event_date: info.event_date, doors_at: hm(info.doors_at) || '17:00', starts_at: hm(info.starts_at), ends_at: hm(info.ends_at),
    venue: info.venue ?? '', maps_url: info.maps_url ?? '', beverage_deadline: dtl(info.beverage_deadline),
    merch_size_deadline: dtl(info.merch_size_deadline), merch_default_size: info.merch_default_size ?? '',
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    const r = await api('/api/admin/settings/event', {
      event_date: f.event_date, doors_at: f.doors_at || null, starts_at: f.starts_at || null, ends_at: f.ends_at || null,
      venue: f.venue.trim() || null, maps_url: f.maps_url.trim() || null, beverage_deadline: f.beverage_deadline || null,
      merch_size_deadline: f.merch_size_deadline || null, merch_default_size: f.merch_default_size || null,
    });
    if (r.status === 'OK') { setMsg({ ok: true, text: 'Saved.' }); reload(); }
    else setMsg({ ok: false, text: ERR[r.status] ?? 'Could not save. Check the fields and try again.' });
  }

  return (
    <>
      <h2 className="adm-sub">Event details</h2>
      <p className="adm-muted">Shown on the invitation. Times are WITA. Date, gate time, venue and Maps link are needed before the invitations go out; start and end are optional.</p>
      <div className="adm-card">
        <div className="adm-checks">
          <label className="adm-check">Date <input type="date" value={f.event_date} onChange={set('event_date')} /></label>
          <label className="adm-check">Gate opens <input type="time" value={f.doors_at} onChange={set('doors_at')} /></label>
          <label className="adm-check">Programme starts <input type="time" value={f.starts_at} onChange={set('starts_at')} /></label>
          <label className="adm-check">Ends <input type="time" value={f.ends_at} onChange={set('ends_at')} /></label>
          <label className="adm-check">Venue <input type="text" maxLength={120} value={f.venue} onChange={set('venue')} /></label>
          <label className="adm-check">Google Maps link <input type="url" maxLength={500} value={f.maps_url} onChange={set('maps_url')} /></label>
          <label className="adm-check">Beverage deadline <input type="datetime-local" value={f.beverage_deadline} onChange={set('beverage_deadline')} /></label>
          <label className="adm-check">T-shirt size deadline <input type="datetime-local" value={f.merch_size_deadline} onChange={set('merch_size_deadline')} /></label>
          <label className="adm-check">Default T-shirt size
            <select value={f.merch_default_size} onChange={set('merch_default_size')}>
              <option value="">None</option>
              {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>
        <div className="adm-row">
          <button className="btn btn--gold" onClick={save}>Save details</button>
        </div>
        <p className="adm-muted">Beverage deadline (WITA): after it, anyone without a drink gets Soft Drink and the purchase count is final. Leave blank to keep choices open. Moving it later reopens the choice for automatic Soft Drink guests who have not redeemed.</p>
        <p className="adm-muted">T-shirt size deadline (WITA): separate from the beverage deadline, set it early enough for printing. After it, anyone without a size gets the default size and the order count is final. A default size is required whenever a deadline is set.</p>
        <p className="adm-muted">To preview, open any guest pass link and tap “Putar undangan”.</p>
        {msg && <p className={`adm-msg ${msg.ok ? 'adm-msg--ok' : 'adm-msg--error'}`}>{msg.text}</p>}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Add the size guide editor**

Create `src/components/admin/SizeChartEditor.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import { MEASURES, SIZES, hasChart, type FullChart, type Measure, type Size, type SizeChart } from '@/lib/sizes';

const LABEL: Record<Measure, string> = { chest: 'Chest (flat)', bottom: 'Bottom (flat)', length: 'Length', sleeve: 'Sleeve' };
type Grid = Record<Size, Record<Measure, string>>;
const toGrid = (c: SizeChart | undefined): Grid =>
  Object.fromEntries(SIZES.map((s) => [s, Object.fromEntries(MEASURES.map((m) => [m, hasChart(c) ? String(c[s][m]) : '']))])) as Grid;

/** Size guide shown to guests (merch size spec §2, §5.2). All 20 values in cm, or clear it to hide the guide. */
export function SizeChartEditor({ chart, fitNote, reload }: { chart?: SizeChart; fitNote?: boolean; reload: () => void }) {
  const [grid, setGrid] = useState<Grid>(() => toGrid(chart));
  const [fit, setFit] = useState(fitNote ?? true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send(merch_size_chart: FullChart | Record<string, never>) {
    const r = await api('/api/admin/settings/event', { merch_size_chart, merch_fit_note: fit });
    if (r.status === 'OK') { setMsg({ ok: true, text: 'Saved.' }); reload(); }
    else setMsg({ ok: false, text: 'Could not save. Every cell needs a whole number above 0, or clear the whole chart.' });
  }

  function save() {
    const out = {} as FullChart;
    for (const s of SIZES) {
      out[s] = {} as Record<Measure, number>;
      for (const m of MEASURES) {
        const n = Number(grid[s][m]);
        if (grid[s][m].trim() === '' || !Number.isInteger(n) || n <= 0) {
          setMsg({ ok: false, text: `${s} ${LABEL[m]}: enter a whole number above 0.` });
          return;
        }
        out[s][m] = n;
      }
    }
    void send(out);
  }

  function clear() {
    setGrid(toGrid({}));
    void send({});
  }

  const setCell = (s: Size, m: Measure, v: string) => setGrid({ ...grid, [s]: { ...grid[s], [m]: v } });
  return (
    <>
      <h2 className="adm-sub">T-shirt size guide</h2>
      <p className="adm-muted">Vendor chart in cm, measured flat. Guests see it under “Panduan ukuran” and in the confirm step. Clear it to hide the guide.</p>
      <div className="adm-card">
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th>Size</th>{MEASURES.map((m) => <th key={m}>{LABEL[m]}</th>)}</tr></thead>
            <tbody>
              {SIZES.map((s) => (
                <tr key={s}>
                  <th scope="row">{s}</th>
                  {MEASURES.map((m) => (
                    <td key={m}>
                      <input className="adm-input" style={{ width: 72 }} type="number" min={1} inputMode="numeric"
                        aria-label={`${s} ${LABEL[m]}`} value={grid[s][m]} onChange={(e) => setCell(s, m, e.target.value)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <label className="adm-row"><input type="checkbox" checked={fit} onChange={(e) => setFit(e.target.checked)} /> Show “Oversized fit — pick your usual size”</label>
        <div className="adm-row">
          <button className="btn btn--gold" onClick={save}>Save size guide</button>
          <button className="btn" onClick={clear}>Clear chart</button>
        </div>
        {msg && <p className={`adm-msg ${msg.ok ? 'adm-msg--ok' : 'adm-msg--error'}`}>{msg.text}</p>}
      </div>
    </>
  );
}
```

- [ ] **Step 5: Show it on the Settings page**

```diff
--- a/src/app/admin/(console)/settings/page.tsx
+++ b/src/app/admin/(console)/settings/page.tsx
@@ -1,6 +1,7 @@
 'use client';
 import { EventDetails, type EventInfo } from '@/components/admin/EventDetails';
 import { RehearsalPanel } from '@/components/admin/RehearsalPanel';
+import { SizeChartEditor } from '@/components/admin/SizeChartEditor';
 import { StagePanel } from '@/components/admin/StagePanel';
 import { StationSettings, type PinRow } from '@/components/admin/StationSettings';
 import { useLoad } from '@/lib/use-load';
@@ -16,6 +17,10 @@ export default function SettingsPage() {
       <h1 className="adm-title">Settings</h1>
       <p className="adm-muted">{data.event.name} · {data.event.event_date}</p>
       <EventDetails key={JSON.stringify(data.event)} info={data.event} reload={reload} />
+      <SizeChartEditor
+        key={JSON.stringify([data.event.merch_size_chart, data.event.merch_fit_note])}
+        chart={data.event.merch_size_chart} fitNote={data.event.merch_fit_note} reload={reload}
+      />
       <StationSettings key={data.station_labels.join('|')} pins={data.pins} labels={data.station_labels} reload={reload} />
       <StagePanel />
       <RehearsalPanel mode={data.mode} reload={reload} />
```

- [ ] **Step 6: Run the checks**

Run: `npx tsc --noEmit -p . && npx eslint src/components/admin src/app/admin src/app/api/admin && npm run test:unit`
Expected: no errors; 213 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/admin/settings src/components/admin/EventDetails.tsx src/components/admin/SizeChartEditor.tsx "src/app/admin/(console)/settings/page.tsx"
git commit -m "feat(admin): T-shirt size deadline, default size and size guide editor"
```

---

### Task 9: Admin stock, hand-over sizes, guest size correction, order count

**Files:**
- Create: `src/app/api/admin/merch-stock/route.ts`
- Create: `src/app/api/admin/guests/[id]/merch-size/route.ts`
- Create: `src/components/admin/StockPanel.tsx`
- Modify (full replacement): `src/app/admin/(console)/merchandise/page.tsx`
- Modify: `src/app/api/admin/redemptions/route.ts`
- Modify: `src/components/admin/RedemptionList.tsx`
- Modify: `src/components/admin/GuestEditor.tsx`
- Modify: `src/styles/admin.css`
- Modify: `src/app/admin/(console)/page.tsx`

**Interfaces:**
- Consumes: `merch_size_summary`, `set_merch_stock`, `admin_set_merch_size`, `admin_guest_list` merch fields, `admin_dashboard.merch_size` (Tasks 2–3); `SIZES`, `Size`, `SizeSummary` (Task 4).
- Produces: `GET /api/admin/merch-stock` → `SizeSummary`; `POST /api/admin/merch-stock {stock: {S,M,L,XL,XXL: number}}` (all five keys required); `POST /api/admin/guests/[id]/merch-size {size, reason}`; `AdminGuest` gains `merch_size`, `merch_size_source`, `merch_given_size`.

- [ ] **Step 1: Add the stock route**

Create `src/app/api/admin/merch-stock/route.ts`:

```ts
import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminGet, adminPost } from '@/lib/routes';
import { SIZES } from '@/lib/sizes';

/** Counts per size for the admin Stock panel (merch size spec §5.4). */
export const GET = adminGet(async () =>
  ok('OK', await rpc<Record<string, unknown>>('merch_size_summary', { p_event: env().EVENT_ID })));

/** Received quantity for all five sizes. Overwrites: a second delivery is entered as the new total. */
const Body = z.object({ stock: z.record(z.enum(SIZES), z.number().int().min(0).max(10000)) });

export const POST = adminPost(Body, async ({ actor, body }) => {
  const r = await rpc<{ status: string }>('set_merch_stock', {
    p_event: env().EVENT_ID, p_stock: body.stock, p_actor: actorId(actor),
  });
  return ok(r.status);
});
```

- [ ] **Step 2: Add the guest size route**

Create `src/app/api/admin/guests/[id]/merch-size/route.ts`:

```ts
import { z } from 'zod';
import { fail, ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminPost } from '@/lib/routes';
import { SIZES } from '@/lib/sizes';

const Body = z.object({ size: z.enum(SIZES), reason: z.string().max(200) });

export const POST = adminPost(Body, async ({ actor, body, params }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return fail(400, 'BAD_INPUT');
  const r = await rpc<{ status: string }>('admin_set_merch_size', {
    p_event: env().EVENT_ID, p_guest_id: id.data, p_size: body.size, p_reason: body.reason, p_actor: actorId(actor),
  });
  return ok(r.status);
});
```

- [ ] **Step 3: Add the stock panel**

Create `src/components/admin/StockPanel.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import { SIZES, type Size, type SizeSummary } from '@/lib/sizes';
import { useLoad } from '@/lib/use-load';

/** Received stock per size and what is left (merch size spec §5.4). Amber where more guests still need a size than are left. */
export function StockPanel() {
  const { data, loading, reload } = useLoad<SizeSummary>('/api/admin/merch-stock', 15_000);
  const [draft, setDraft] = useState<Record<Size, string> | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (loading) return <p className="adm-muted">Loading…</p>;
  if (!data) return <p className="adm-msg adm-msg--error">Could not load stock.</p>;

  const rows = data.sizes;
  const values = draft ?? (Object.fromEntries(rows.map((r) => [r.size, String(r.received)])) as Record<Size, string>);

  async function save() {
    const stock = {} as Record<Size, number>;
    for (const s of SIZES) {
      const n = Number(values[s]);
      if (values[s].trim() === '' || !Number.isInteger(n) || n < 0) {
        setMsg({ ok: false, text: `${s}: enter a whole number, 0 or more.` });
        return;
      }
      stock[s] = n;
    }
    const r = await api('/api/admin/merch-stock', { stock });
    if (r.status === 'OK') { setMsg({ ok: true, text: 'Stock saved.' }); setDraft(null); reload(); }
    else setMsg({ ok: false, text: 'Could not save. Try again.' });
  }

  return (
    <>
      <h2 className="adm-sub">Stock</h2>
      <p className="adm-muted">Enter what the vendor delivered per size; after a second delivery, enter the new total. Left = received − handed over. Amber: more guests still to claim that size than shirts left.</p>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th />{rows.map((r) => <th key={r.size}>{r.size}</th>)}</tr></thead>
          <tbody>
            <tr>
              <th scope="row">Received</th>
              {rows.map((r) => (
                <td key={r.size}>
                  <input className="adm-input" style={{ width: 72 }} type="number" min={0} inputMode="numeric" aria-label={`Received ${r.size}`}
                    value={values[r.size]} onChange={(e) => setDraft({ ...values, [r.size]: e.target.value })} />
                </td>
              ))}
            </tr>
            <tr><th scope="row">Handed over</th>{rows.map((r) => <td key={r.size}>{r.given}</td>)}</tr>
            <tr><th scope="row">Left</th>{rows.map((r) => <td key={r.size}>{r.left}</td>)}</tr>
            <tr>
              <th scope="row">Still to claim</th>
              {rows.map((r) => <td key={r.size} className={data.stock_set && r.to_claim > r.left ? 'is-warn' : undefined}>{r.to_claim}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="adm-row"><button className="btn btn--gold" onClick={save}>Save stock</button></div>
      {msg && <p className={`adm-msg ${msg.ok ? 'adm-msg--ok' : 'adm-msg--error'}`}>{msg.text}</p>}
    </>
  );
}
```

- [ ] **Step 4: Put it on the Merchandise page**

Replace `src/app/admin/(console)/merchandise/page.tsx` with:

```tsx
import { RedemptionList } from '@/components/admin/RedemptionList';
import { StockPanel } from '@/components/admin/StockPanel';

export default function MerchandisePage() {
  return (
    <>
      <h1 className="adm-title">Merchandise</h1>
      <StockPanel />
      <h2 className="adm-sub">Hand-overs</h2>
      <p className="adm-muted">Voiding frees that employee to collect again (for example after a wrong-size exchange) and returns the size given to stock. The reason is kept in the audit log.</p>
      <RedemptionList />
    </>
  );
}
```

- [ ] **Step 5: Show sizes in the hand-over list**

```diff
--- a/src/app/api/admin/redemptions/route.ts
+++ b/src/app/api/admin/redemptions/route.ts
@@ -6,7 +6,7 @@ import { adminGet } from '@/lib/routes';
 export const GET = adminGet(async () => {
   const { data: reds, error } = await db()
     .from('merchandise_redemptions')
-    .select('id, guest_id, status, redeemed_at, station_label, void_reason')
+    .select('id, guest_id, status, redeemed_at, station_label, void_reason, reserved_size, given_size')
     .eq('event_id', env().EVENT_ID)
     .order('redeemed_at', { ascending: false })
     .limit(500);
```

```diff
--- a/src/components/admin/RedemptionList.tsx
+++ b/src/components/admin/RedemptionList.tsx
@@ -6,6 +6,7 @@ import { useLoad } from '@/lib/use-load';
 
 type Red = {
   id: string; status: 'redeemed' | 'voided'; redeemed_at: string; station_label: string | null; void_reason: string | null;
+  reserved_size: string | null; given_size: string | null;
   guest: { employee_id: string; full_name: string; outlet: string } | null;
 };
 
@@ -27,13 +28,14 @@ export function RedemptionList() {
       {msg && <p className="adm-msg adm-msg--error">{msg}</p>}
       <div className="adm-table-wrap">
         <table className="adm-table">
-          <thead><tr><th>Time</th><th>Employee</th><th>Outlet</th><th>Booth</th><th>Status</th><th /></tr></thead>
+          <thead><tr><th>Time</th><th>Employee</th><th>Outlet</th><th>Size</th><th>Booth</th><th>Status</th><th /></tr></thead>
           <tbody>
             {rows.map((r) => (
               <tr key={r.id} className={r.status === 'voided' ? 'is-dim' : ''}>
                 <td>{formatTimeWita(r.redeemed_at)}</td>
                 <td>{r.guest ? `${r.guest.employee_id} — ${r.guest.full_name}` : '?'}</td>
                 <td>{r.guest?.outlet}</td>
+                <td>{!r.given_size ? '–' : r.reserved_size && r.reserved_size !== r.given_size ? `${r.reserved_size} → ${r.given_size}` : r.given_size}</td>
                 <td>{r.station_label}</td>
                 <td>{r.status === 'voided' ? `voided: ${r.void_reason}` : 'handed over'}</td>
                 <td>
@@ -48,7 +50,7 @@ export function RedemptionList() {
                 </td>
               </tr>
             ))}
-            {!loading && rows.length === 0 && <tr><td colSpan={6} className="adm-muted">No merchandise handed over yet.</td></tr>}
+            {!loading && rows.length === 0 && <tr><td colSpan={7} className="adm-muted">No merchandise handed over yet.</td></tr>}
           </tbody>
         </table>
       </div>
```

- [ ] **Step 6: Add the size correction to the guest editor**

```diff
--- a/src/components/admin/GuestEditor.tsx
+++ b/src/components/admin/GuestEditor.tsx
@@ -1,12 +1,14 @@
 'use client';
 import { useState } from 'react';
 import { api } from '@/lib/client';
+import { SIZES, type Size } from '@/lib/sizes';
 
 export type AdminGuest = {
   id: string; employee_id: string; full_name: string; outlet: string; department: string | null; position: string | null;
   phone: string | null; opened: boolean; active: boolean; flagged_missing: boolean; is_walk_in: boolean;
   checked_in_at: string | null; prize_number: number | null; merch: string;
   beverage?: 'beer' | 'soft_drink' | null; beverage_source?: string | null; beverage_redeemed?: boolean;
+  merch_size?: Size | null; merch_size_source?: string | null; merch_given_size?: Size | null;
 };
 
 const DRINK = { beer: 'Beer', soft_drink: 'Soft Drink' } as const;
@@ -44,6 +46,40 @@ function DrinkControl({ guest, onSaved }: { guest: AdminGuest; onSaved: () => vo
   );
 }
 
+const SIZE_ERR: Record<string, string> = {
+  REASON_REQUIRED: 'Give a reason of at least 5 characters.',
+  ALREADY_REDEEMED: 'This T-shirt was already handed over. Void it on the Merchandise page first.',
+};
+
+/** Wrong size picked: admin sets or changes the T-shirt size, with a reason. Blocked while a redemption is active. */
+function SizeControl({ guest, onSaved }: { guest: AdminGuest; onSaved: () => void }) {
+  const [size, setSize] = useState<Size>(guest.merch_size ?? 'M');
+  const [reason, setReason] = useState('');
+  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
+  const current = guest.merch_size ? `${guest.merch_size} (${guest.merch_size_source})` : 'not chosen';
+  const handed = guest.merch_given_size ? ` · handed over ${guest.merch_given_size}` : '';
+
+  async function save() {
+    const r = await api(`/api/admin/guests/${guest.id}/merch-size`, { size, reason });
+    if (r.status === 'OK') { setMsg({ ok: true, text: 'Size saved.' }); setReason(''); onSaved(); }
+    else setMsg({ ok: false, text: SIZE_ERR[r.status] ?? 'Could not save. Try again.' });
+  }
+
+  return (
+    <div className="adm-field">
+      <span>T-shirt size: {current}{handed}</span>
+      <span className="adm-row" style={{ margin: 0 }}>
+        <select className="adm-select" value={size} onChange={(e) => setSize(e.target.value as Size)} aria-label="T-shirt size">
+          {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
+        </select>
+        <input className="adm-input" placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
+        <button className="btn" onClick={save} disabled={!!guest.merch_given_size}>Set size</button>
+      </span>
+      {msg && <p className={`adm-msg ${msg.ok ? 'adm-msg--ok' : 'adm-msg--error'}`}>{msg.text}</p>}
+    </div>
+  );
+}
+
 export function GuestEditor({ guest, onClose, onSaved }: { guest: AdminGuest; onClose: () => void; onSaved: () => void }) {
   const [name, setName] = useState(guest.full_name);
   const [outlet, setOutlet] = useState(guest.outlet);
@@ -74,6 +110,7 @@ export function GuestEditor({ guest, onClose, onSaved }: { guest: AdminGuest; on
       <label className="adm-field"><span>Phone (WhatsApp)</span><input className="adm-input" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
       <label className="adm-row"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active (inactive employees are not eligible at the desks)</label>
       <DrinkControl guest={guest} onSaved={onSaved} />
+      <SizeControl guest={guest} onSaved={onSaved} />
       {msg && <p className="adm-msg adm-msg--error">{msg}</p>}
       <div className="adm-row">
         <button className="btn btn--gold" onClick={save} disabled={busy}>Save</button>
```

- [ ] **Step 7: Add the amber warning cell**

```diff
--- a/src/styles/admin.css
+++ b/src/styles/admin.css
@@ -46,3 +46,4 @@
 .adm-msg--ok { border-color: var(--nf-green); color: var(--nf-green); }
 .adm-list { margin: 6px 0 0; padding-left: 18px; max-height: 220px; overflow: auto; }
 .adm-login { max-width: 420px; margin: 12vh auto 0; padding: 0 var(--nf-gutter); }
+.adm-table td.is-warn { background: var(--nf-gold); color: var(--nf-black); font-weight: 600; }
```

- [ ] **Step 8: Add "T-shirts to order" to the dashboard**

```diff
--- a/src/app/admin/(console)/page.tsx
+++ b/src/app/admin/(console)/page.tsx
@@ -3,6 +3,7 @@ import { OutletTable, type OutletRow } from '@/components/admin/OutletTable';
 import { stageLinkText } from '@/lib/admin-draw-text';
 import { heartbeatState } from '@/lib/draw-ui';
 import type { PrizeRow } from '@/lib/prizes';
+import type { SizeSummary } from '@/lib/sizes';
 import { useLoad } from '@/lib/use-load';
 
 type Dash = {
@@ -15,6 +16,7 @@ type Dash = {
     beer: number; soft_drink: number; no_choice: number; total: number;
     redeemed_beer: number; redeemed_soft_drink: number; deadline: string | null; final: boolean;
   };
+  merch_size?: SizeSummary;
   recent: { at: string; actor: string; action: string }[];
 };
 
@@ -80,6 +82,35 @@ export default function Dashboard() {
         );
       })()}
 
+      {data.merch_size && (() => {
+        const m = data.merch_size;
+        const tiles: [string, number | string][] = [
+          ...m.sizes.map((r): [string, number] => [r.size, r.reserved]), ['No size yet', m.no_size], ['Total', m.total],
+        ];
+        return (
+          <>
+            <h2 className="adm-sub">
+              T-shirts to order{' '}
+              <span className={`adm-badge ${m.final ? 'adm-badge--green' : 'adm-badge--gold'}`}>{m.final ? 'FINAL' : 'live'}</span>
+            </h2>
+            <p className="adm-muted">
+              {m.deadline
+                ? `Size deadline ${new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Makassar', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(m.deadline))} WITA; after it, guests without a size count as ${m.default_size}. `
+                : 'No size deadline set (Settings). '}
+              Active guests only. Walk-ins and late additions after the deadline still raise these numbers, so keep a buffer. Stock and hand-overs are on the Merchandise page.
+            </p>
+            <div className="adm-grid">
+              {tiles.map(([label, n]) => (
+                <div className="adm-stat" key={label}>
+                  <div className="adm-stat__n">{n}</div>
+                  <div className="adm-stat__l">{label}</div>
+                </div>
+              ))}
+            </div>
+          </>
+        );
+      })()}
+
       <h2 className="adm-sub">Door prize</h2>
       <div className="adm-grid">
         {drawStats.map(([label, n]) => (
```

- [ ] **Step 9: Run the checks**

Run: `npx tsc --noEmit -p . && npx eslint src/components/admin src/app/admin src/app/api/admin && npm run test:unit`
Expected: no errors; 213 tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/app/api/admin/merch-stock "src/app/api/admin/guests/[id]/merch-size" src/app/api/admin/redemptions/route.ts src/components/admin "src/app/admin/(console)" src/styles/admin.css
git commit -m "feat(admin): T-shirt stock, size corrections and order count"
```

---

### Task 10: Reports, full verification, rehearsal check and go-live

**Files:**
- Modify: `tests/unit/reports.test.ts`
- Modify: `src/lib/reports.ts`
- Modify: `src/components/admin/ReportsPanel.tsx`
- Create: `docs/plans/Nourishfest-plan-merch-size.md` (this plan)

**Interfaces:**
- Consumes: `report_rows('merch_sizes' | 'merch_size_pending')` (Task 3).
- Produces: `GET /api/admin/reports/merch-sizes` and `/merch-size-pending` CSV downloads (the existing `[name]` route serves any key in `REPORTS`).

- [ ] **Step 1: Write the failing test**

```diff
--- a/tests/unit/reports.test.ts
+++ b/tests/unit/reports.test.ts
@@ -10,11 +10,19 @@ describe('witaStamp', () => {
 });
 
 describe('isReportName', () => {
-  it.each(['guests', 'check-ins', 'merchandise', 'beverages', 'beverage-pending', 'draws', 'audit'])('knows %s', (n) => expect(isReportName(n)).toBe(true));
+  it.each(['guests', 'check-ins', 'merchandise', 'beverages', 'beverage-pending', 'merch-sizes', 'merch-size-pending', 'draws', 'audit'])('knows %s', (n) => expect(isReportName(n)).toBe(true));
   it.each(['rsvp-pending', 'invitations', '../etc', 'toString', '__proto__', ''])('rejects %s', (n) => expect(isReportName(n)).toBe(false));
 });
 
 describe('buildReportCsv', () => {
+  it('writes the T-shirt size report with yes/no substitutions', () => {
+    const row = parse(buildReportCsv('merch-sizes', [
+      { employee_id: 'E1', full_name: 'Ayu', reserved_size: 'L', given_size: 'XL', substituted: true },
+    ])).data[0];
+    expect(row['Reserved size']).toBe('L');
+    expect(row['Given size']).toBe('XL');
+    expect(row['Substituted']).toBe('yes');
+  });
   it('starts with a BOM and writes the header row even when there are no rows', () => {
     const csv = buildReportCsv('draws', []);
     expect(csv.startsWith('\uFEFF')).toBe(true);
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/unit/reports.test.ts`
Expected: FAIL — `isReportName('merch-sizes')` is false and `buildReportCsv('merch-sizes', …)` throws.

- [ ] **Step 3: Add the two reports**

```diff
--- a/src/lib/reports.ts
+++ b/src/lib/reports.ts
@@ -53,6 +53,21 @@ export const REPORTS = {
     sql: 'beverage_pending', file: 'nourishfest-beverage-pending.csv',
     cols: [...person, { key: 'phone', header: 'Phone' }],
   },
+  'merch-sizes': {
+    sql: 'merch_sizes', file: 'nourishfest-merch-sizes.csv',
+    cols: [
+      ...person,
+      { key: 'reserved_size', header: 'Reserved size' }, { key: 'source', header: 'Source' },
+      { key: 'chosen_at', header: 'Chosen at', kind: 'time' }, { key: 'given_size', header: 'Given size' },
+      { key: 'substituted', header: 'Substituted', kind: 'bool' }, { key: 'redeemed_at', header: 'Redeemed at', kind: 'time' },
+      { key: 'station', header: 'Booth' }, { key: 'actor', header: 'Staff' }, { key: 'status', header: 'Status' },
+      { key: 'void_reason', header: 'Void reason' },
+    ],
+  },
+  'merch-size-pending': {
+    sql: 'merch_size_pending', file: 'nourishfest-merch-size-pending.csv',
+    cols: [...person, { key: 'phone', header: 'Phone' }],
+  },
   draws: {
     sql: 'draws', file: 'nourishfest-draw-history.csv',
     cols: [
```

```diff
--- a/src/components/admin/ReportsPanel.tsx
+++ b/src/components/admin/ReportsPanel.tsx
@@ -4,6 +4,8 @@ const REPORTS: { href: string; title: string; text: string }[] = [
   { href: '/api/admin/reports/merchandise', title: 'Merchandise', text: 'Every hand-over and void, with booth and staff.' },
   { href: '/api/admin/reports/beverages', title: 'Beverages', text: 'Every guest with a drink: source, chosen at, hand-over, bar, voids.' },
   { href: '/api/admin/reports/beverage-pending', title: 'Beverage pending', text: 'Guests with no drink yet, with phone, for the reminder through the Fonnte sheet.' },
+  { href: '/api/admin/reports/merch-sizes', title: 'T-shirt sizes', text: 'Every guest: reserved size, source, size handed over, substitutions, booth, voids.' },
+  { href: '/api/admin/reports/merch-size-pending', title: 'T-shirt size pending', text: 'Guests with no size yet, with phone, for the reminder through the Fonnte sheet.' },
   { href: '/api/admin/reports/draws', title: 'Draw history', text: 'Every draw: prize, slot, winner, outcome, who resolved it, void reasons.' },
   { href: '/api/admin/reports/audit', title: 'Audit log', text: 'Every recorded action, oldest first.' },
   { href: '/api/admin/invitations.csv', title: 'Invitation links', text: 'Personal pass link per employee, for the WhatsApp broadcast.' },
```

- [ ] **Step 4: Run every automated check**

Run:
```bash
npx tsc --noEmit -p .
npm run lint
npm run test:unit
npx supabase db reset && npx supabase test db
npm run build
```
Expected: `tsc` clean; lint shows only the two existing `Scanner.tsx` warnings; **216 unit tests** pass; pgTAP `003` 11, `004` 49, `005` 34, `006` 28, `007` 32; build succeeds (it needs network access to Google Fonts).

- [ ] **Step 5: Rehearsal check on a local stack** (`npm run dev` against `npx supabase start`, rehearsal mode)

1. Settings: the size guide shows the vendor chart. Set a size deadline with no default → "Pick a default T-shirt size…". Set default **M** and a deadline in the future → Saved.
2. Open a guest pass on a 360 px wide phone view: the Size card shows the fit note, the deadline and five buttons in one row. "Panduan ukuran" opens the table. Tap **L** → confirm repeats "lebar dada 63 cm, panjang 72 cm" → KONFIRMASI → card shows **L**, "Final…". Toggle EN and check the copy.
3. "Putar undangan": the size scene sits after the drink scene and shows the saved **L**. On a second guest, choose in the invitation and confirm the pass updates when the invitation ends. Lewati and scrolling still work without choosing.
4. Merchandise admin: enter stock S 5, M 5, L 1, XL 5, XXL 5 → Save. Check in the guest. The pass's Merchandise card shows **SIZE L** above the pink QR.
5. Booth: the strip shows `SISA S 5 · M 5 · L 1 · XL 5 · XXL 5`. Scan → **SIZE L**, "Sisa L: 1" → **SERAHKAN KAOS L** → recorded; strip shows L 0 in pink.
6. Check in a second guest who reserved L → scan → **STOK L HABIS** with the picker open. Pick XL → recorded. Pass shows "Reserved L, received XL"; Merchandise admin list shows `L → XL`.
7. Third guest with L reserved: tap **L** in the picker (0) → "Stok L tercatat 0. Lanjut?" → LANJUT → recorded; strip shows L −1 (correct until HR fixes Received).
8. A checked-in guest with no size and no deadline: booth shows **BELUM PILIH UKURAN** with the picker open.
9. Void one hand-over in admin → that size goes back up in the strip and the QR works again.
10. Guest editor: change a not-yet-redeemed guest's size with a 5+ character reason; the button is disabled for a redeemed guest.
11. Move the deadline into the past: dashboard "T-shirts to order" shows **FINAL** and No size yet = 0; a guest with no size sees **M** with "Ditetapkan otomatis".
12. Download **T-shirt sizes** and **T-shirt size pending**; check the columns and the Substituted yes/no.
13. Rehearsal reset: size choices and stock stay; hand-overs are cleared.

- [ ] **Step 6: Save the plan in the repo and commit**

Save this plan as `docs/plans/Nourishfest-plan-merch-size.md`.

```bash
git add tests/unit/reports.test.ts src/lib/reports.ts src/components/admin/ReportsPanel.tsx docs/plans/Nourishfest-plan-merch-size.md
git commit -m "feat(reports): T-shirt sizes and size-pending CSV"
```

- [ ] **Step 7: Go live (migrations and app together, before the WhatsApp invitations go out)**

1. `npm run db:push` (applies `…14`, `…15`, `…16` to production).
2. Deploy the app from `main` on Vercel straight after; the old booth page cannot redeem against the new `redeem_merchandise`.
3. In production admin: set the default size and the size deadline (early enough for printing and before the invitation send), check the size guide, then enter stock when the vendor delivers.

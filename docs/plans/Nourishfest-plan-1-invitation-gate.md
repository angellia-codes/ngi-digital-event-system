# NourishFest 2026 — Plan 1: Foundation, Guest Pass, Check-in, Merchandise, Admin Import

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build everything needed to pass the **invitation gate** (before 23 Nov 2026): database and rules, guest pass page with RSVP, staff PIN login, check-in station, merchandise booth, and admin guest import with invitation CSV.

**Architecture:** Next.js (App Router) on Vercel. Every business rule lives in a `SECURITY DEFINER` Postgres function in a dedicated Supabase project; constraints and transactions enforce the rules. Browsers never touch tables. Route handlers call the functions with the service key. Plan 2 (draw, stage display, full dashboard, rollout) builds on this plan's schema and libraries.

**Tech Stack:** Next.js 15, React 19, TypeScript, Supabase (Postgres 15+, pgcrypto, pgTAP, Auth with Google), `@supabase/supabase-js`, `@supabase/ssr`, `jose` (JWT HS256), `zod`, `qrcode`, `html5-qrcode`, `papaparse`, Vitest, Playwright, Supabase CLI.

**Source documents (copied into the repo in Task 1):** `docs/spec.md` (Technical Design Spec), `docs/prd.md` (PRD v1.2), `docs/design-guide.md` (Design Guide v1.1). When this plan and the spec disagree, the spec wins; report the conflict.

## Global Constraints

Every task's requirements implicitly include this section.

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
- **QR rendering:** white tile, black modules, quiet zone of at least 4 modules, at least 5 px per module (integer), error correction **M**, no logo, `shape-rendering: crispEdges`. Check-in frame is **gold 6 px**; merchandise frame is **pink 5 px** with a "MERCHANDISE" banner.
- **Rules enforced by constraints:** one check-in per guest; unique gap-free Door Prize numbers (counter on the `events` row incremented in the same transaction); merchandise requires check-in (FK); one active redemption per guest (partial unique where `status = 'redeemed'`); audit log append-only via trigger (`DELETE` allowed only in rehearsal mode).
- **Merchandise:** two steps: `redeem_lookup` (read-only) then `redeem_merchandise` on the "Hand over" tap. A same-station replay within **10 seconds** returns `REDEEMED`, not `ALREADY_REDEEMED`.
- **Scanner:** ignores the same code for 2 seconds.
- **Design:** dark only. Fonts: Bungee (display, numbers), Anton (headings, buttons, names), Oswald (labels), Archivo regular 400/600 (body; **Archivo Black is not used**). Colours: `#0D0D0D` black, `#D4AF37` gold, `#FF1B6B` pink, `#39FF14` green; neutrals `#F5F5F0`, `#BDBDB6`, `#9A9A94`, `#141414`, `#1B1B1B`, `#2A2A28`, `#3A3A36`, `#FFFFFF` (QR tiles only). Text on gold, pink or green fills is always black; **white on pink is forbidden**.
- **Layout:** minimum design width 360 px, 20 px side gutter, touch targets at least 48 px (56 px or more on staff screens), staff primary button 64 px, captions never below 12 px.
- **Language:** bilingual ID/EN toggle, **Indonesian default**, one translation file, choice saved in the browser with a fallback if storage fails.
- **Time:** timestamps are `timestamptz`, displayed in WITA (`Asia/Makassar`).
- **Migrations:** numbered SQL files applied by the CLI. Every migration that adds a table or function ends with `select public.lock_down_public();`.

---

## File Structure

```
nourishfest/
├── docs/{spec.md, prd.md, design-guide.md, plans/}
├── scripts/
│   ├── make-env.sh                     # writes .env.local/.env.test from `supabase status`
│   ├── concurrency/{checkin.mjs, redeem.mjs}
│   └── load/{pass-pages.mjs, scans.mjs, seed-fake-guests.mjs}
├── supabase/
│   ├── config.toml
│   ├── seed.sql                        # dev event, admin allowlist, station labels
│   ├── migrations/
│   │   ├── 20261101000001_core_schema.sql
│   │   ├── 20261101000002_pin_pass_functions.sql
│   │   ├── 20261101000003_check_in.sql
│   │   ├── 20261101000004_merchandise.sql
│   │   ├── 20261101000005_import.sql
│   │   └── 20261101000006_admin_functions.sql
│   └── tests/database/{001_schema,002_pin_pass,003_check_in,004_merchandise,005_import,006_admin}.test.sql
├── src/
│   ├── middleware.ts                   # Supabase session refresh for /admin
│   ├── lib/
│   │   ├── env.ts  db.ts  api.ts  routes.ts  session.ts  admin-auth.ts
│   │   ├── pass.ts  qr.ts  qr-svg.ts  phone.ts  csv.ts  time.ts  result-panel.ts  client.ts
│   │   ├── labels.ts  code-input.ts  use-station.ts  import.ts  invitations.ts  supabase-server.ts  admin-page.ts
│   │   └── i18n/{strings.ts, index.tsx}
│   ├── components/
│   │   ├── QrTile.tsx  LangToggle.tsx  Wordmark.tsx
│   │   ├── pass/{PassView.tsx, TicketCard.tsx, RsvpBlock.tsx, PrizeNumber.tsx, MerchCard.tsx, SaveImage.tsx}
│   │   └── station/{StationShell.tsx, Scanner.tsx, ResultPanel.tsx, TabBar.tsx, ManualSearch.tsx}
│   ├── app/
│   │   ├── layout.tsx  page.tsx  robots.ts
│   │   ├── pass/[token]/page.tsx
│   │   ├── station/{page.tsx, check-in/page.tsx, merchandise/page.tsx}
│   │   ├── admin/login/page.tsx
│   │   ├── admin/(console)/{layout.tsx, page.tsx, guests/page.tsx, merchandise/page.tsx, settings/page.tsx}
│   │   ├── auth/{google,callback}/route.ts
│   │   └── api/
│   │       ├── pass/[token]/{route.ts, rsvp/route.ts}
│   │       ├── station/{login,logout,me,select-label,check-in,guests,stats}/route.ts
│   │       ├── station/merchandise/{lookup,redeem,count}/route.ts
│   │       └── admin/{import/preview,import/commit,guests,guests/walk-in,invitations.csv,redemptions,redemptions/[id]/void,settings,settings/pin,settings/pin-active,settings/station-labels,go-live,reset,dashboard,logout}/route.ts
│   └── styles/{tokens.css, pass.css, station.css, admin.css}
└── tests/{unit/*.test.ts, api/*.test.ts, e2e/*.spec.ts}
```

Responsibility notes:
- `lib/routes.ts` holds the route wrappers (`guard`, `stationPost`, `stationGet`, `adminPost`, `adminGet`) so each route file is a few lines.
- `lib/result-panel.ts` is the single mapping from API status to the staff panel (tone, icon, title key, vibration).
- SQL functions return `jsonb` shaped `{ "status": "...", ... }`. Exceptions mean a real failure only.

---

## Task 1: Project scaffold, tooling and design tokens

**Files:**
- Create: `vitest.config.ts`, `next.config.ts` (replace generated), `scripts/make-env.sh`, `supabase/seed.sql`, `src/styles/tokens.css`, `src/app/layout.tsx` (replace), `src/app/page.tsx` (replace), `src/app/robots.ts`, `tests/unit/config.test.ts`
- Modify: `package.json` (scripts), `.gitignore`

**Interfaces:**
- Produces: npm scripts `test:unit`, `test:api`, `test:db`, `db:reset`, `e2e`; env files `.env.local` and `.env.test`; fixed dev event id `00000000-0000-4000-8000-000000000001`; CSS variables from the Design Guide section 14.1.

- [ ] **Step 1: Create the app and install dependencies**

Run (in `/home/claude`):
```bash
npx create-next-app@15 nourishfest --ts --app --src-dir --eslint --no-tailwind --import-alias "@/*" --use-npm --yes
cd nourishfest
npm i @supabase/supabase-js @supabase/ssr zod jose qrcode papaparse html5-qrcode
npm i -D vitest @types/qrcode @types/papaparse pg @types/pg @playwright/test supabase tsx
mkdir -p docs/plans scripts/concurrency scripts/load tests/unit tests/api tests/e2e supabase/tests/database
cp ../docs/superpowers/specs/2026-10-10-nourishfest-2026-technical-design.md docs/spec.md
cp "../NourishFest_2026_-_Digital_Event_Experience_PRD.md" docs/prd.md
cp "../NourishFest_2026_-_Design_Guide.md" docs/design-guide.md
cp ../docs/superpowers/plans/2026-10-10-nourishfest-plan-1-invitation-gate.md docs/plans/
```
Expected: `Success! Created nourishfest`; `git log --oneline` shows the initial commit from create-next-app.

- [ ] **Step 2: Add scripts to `package.json`**

Run:
```bash
npm pkg set scripts.test:unit="vitest run tests/unit"
npm pkg set scripts.test:api="vitest run tests/api"
npm pkg set scripts.test:db="supabase test db"
npm pkg set scripts.db:reset="supabase db reset"
npm pkg set scripts.e2e="playwright test"
```

- [ ] **Step 3: Write `vitest.config.ts`**

```ts
import { defineConfig, loadEnv } from 'vitest/config';
import path from 'node:path';

export default defineConfig(({ mode }) => ({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    env: loadEnv(mode === 'test' ? 'test' : mode, process.cwd(), ''),
    fileParallelism: false, // API tests share one local database
    testTimeout: 30_000,
    include: ['tests/unit/**/*.test.ts', 'tests/api/**/*.test.ts'],
  },
}));
```

- [ ] **Step 4: Write the failing test for security headers**

Create `tests/unit/config.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import config from '../../next.config';

type Rule = { source: string; headers: { key: string; value: string }[] };
const rules = async () => (await config.headers!()) as Rule[];
const headersFor = (rs: Rule[], source: string) =>
  Object.fromEntries(rs.find((r) => r.source === source)!.headers.map((h) => [h.key, h.value]));

describe('next.config headers', () => {
  it('sets no-referrer, noindex and nosniff on every route', async () => {
    const h = headersFor(await rules(), '/:path*');
    expect(h['Referrer-Policy']).toBe('no-referrer');
    expect(h['X-Robots-Tag']).toBe('noindex, nofollow');
    expect(h['X-Content-Type-Options']).toBe('nosniff');
  });

  it.each(['/api/:path*', '/pass/:path*', '/station/:path*', '/admin/:path*'])(
    'disables caching on %s',
    async (source) => {
      expect(headersFor(await rules(), source)['Cache-Control']).toBe('no-store');
    },
  );
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npx vitest run tests/unit/config.test.ts`
Expected: FAIL (the generated `next.config.ts` has no `headers`; error `config.headers is not a function` or similar).

- [ ] **Step 6: Implement `next.config.ts`**

```ts
import type { NextConfig } from 'next';

const common = [
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
];
const noStore = [{ key: 'Cache-Control', value: 'no-store' }];

const config: NextConfig = {
  async headers() {
    return [
      { source: '/:path*', headers: common },
      { source: '/api/:path*', headers: noStore },
      { source: '/pass/:path*', headers: noStore },
      { source: '/station/:path*', headers: noStore },
      { source: '/admin/:path*', headers: noStore },
    ];
  },
};

export default config;
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run tests/unit/config.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 8: Design tokens, fonts, layout, landing page, robots**

`src/styles/tokens.css` (verbatim from Design Guide 14.1, plus a base reset):
```css
:root {
  --nf-black: #0D0D0D;
  --nf-gold:  #D4AF37;
  --nf-pink:  #FF1B6B;
  --nf-green: #39FF14;

  --nf-text:       #F5F5F0;
  --nf-text-soft:  #BDBDB6;
  --nf-text-muted: #9A9A94;
  --nf-card:       #141414;
  --nf-surface:    #1B1B1B;
  --nf-line:       #2A2A28;
  --nf-line-dash:  #3A3A36;
  --nf-white:      #FFFFFF; /* QR tiles only */

  --nf-font-display: var(--font-bungee), Impact, sans-serif;
  --nf-font-heading: var(--font-anton), Impact, 'Arial Narrow', sans-serif;
  --nf-font-label:   var(--font-oswald), 'Arial Narrow', sans-serif;
  --nf-font-body:    var(--font-archivo), system-ui, sans-serif;

  --nf-radius-btn: 12px;
  --nf-radius-card: 18px;
  --nf-radius-pill: 999px;
  --nf-gutter: 20px;
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--nf-black); color: var(--nf-text); }
body { font-family: var(--nf-font-body); font-size: 14px; line-height: 1.45; min-width: 360px; -webkit-text-size-adjust: 100%; }
button { font: inherit; cursor: pointer; }
:focus-visible { outline: 3px solid var(--nf-gold); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
```

`src/app/layout.tsx`:
```tsx
import type { Metadata, Viewport } from 'next';
import { Anton, Archivo, Bungee, Oswald } from 'next/font/google';
import '@/styles/tokens.css';
import { I18nProvider } from '@/lib/i18n';

const bungee = Bungee({ weight: '400', subsets: ['latin'], display: 'swap', variable: '--font-bungee' });
const anton = Anton({ weight: '400', subsets: ['latin'], display: 'swap', variable: '--font-anton' });
const oswald = Oswald({ weight: ['400', '600'], subsets: ['latin'], display: 'swap', variable: '--font-oswald' });
const archivo = Archivo({ weight: ['400', '600'], subsets: ['latin'], display: 'swap', variable: '--font-archivo' });

export const metadata: Metadata = {
  title: 'NourishFest 2026',
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0D0D0D' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${bungee.variable} ${anton.variable} ${oswald.variable} ${archivo.variable}`}>
      <body>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
```
(`@/lib/i18n` is created in Task 9; until then create a stub so the build passes — see Step 9.)

`src/app/page.tsx`:
```tsx
export default function Home() {
  return (
    <main style={{ padding: 'var(--nf-gutter)' }}>
      <h1 style={{ fontFamily: 'var(--nf-font-display)', color: 'var(--nf-gold)', margin: 0 }}>NOURISHFEST 2026</h1>
      <p>MOVE IN UNITY.</p>
    </main>
  );
}
```
`src/app/robots.ts`:
```ts
import type { MetadataRoute } from 'next';
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', disallow: '/' } };
}
```

- [ ] **Step 9: Temporary i18n stub so the layout compiles**

Create `src/lib/i18n/index.tsx` (replaced in Task 9):
```tsx
'use client';
export function I18nProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```

- [ ] **Step 10: Supabase local stack, env script and seed**

Run: `npx supabase init` (answer **N** to the VS Code / IntelliJ prompts). Then in `supabase/config.toml` set `[db] major_version = 15` (match the production project) and, under `[auth.external.google]`, set `enabled = true`, `client_id = "env(GOOGLE_CLIENT_ID)"`, `secret = "env(GOOGLE_CLIENT_SECRET)"`, `skip_nonce_check = true`.

`scripts/make-env.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
eval "$(npx supabase status -o env)"
ANON="${ANON_KEY:-${PUBLISHABLE_KEY:-}}"
SERVICE="${SERVICE_ROLE_KEY:-${SECRET_KEY:-}}"
[ -n "$ANON" ] && [ -n "$SERVICE" ] || { echo "Could not read keys from 'supabase status'"; exit 1; }
cat > .env.local <<EOF
SUPABASE_URL=$API_URL
SUPABASE_ANON_KEY=$ANON
SUPABASE_SERVICE_ROLE_KEY=$SERVICE
STATION_SESSION_SECRET=$(openssl rand -hex 32)
EVENT_ID=00000000-0000-4000-8000-000000000001
APP_URL=http://localhost:3000
DATABASE_URL=$DB_URL
EOF
cp .env.local .env.test
echo "Wrote .env.local and .env.test"
```

`supabase/seed.sql`:
```sql
-- Local/staging development data only. Production data is created by the admin import.
insert into public.events (id, name, event_date, starts_at, venue, config)
values (
  '00000000-0000-4000-8000-000000000001',
  'NourishFest 2026',
  '2026-12-10',
  null,
  null,
  '{"station_labels": ["Meja 1", "Meja 2", "Meja 3", "Booth 1", "Booth 2"]}'::jsonb
)
on conflict (id) do nothing;

insert into public.admins (event_id, email, name)
values ('00000000-0000-4000-8000-000000000001', 'dev-admin@example.com', 'Dev Admin')
on conflict do nothing;
```
(The seed runs after migrations on `supabase db reset`; the tables exist after Task 2.)

Run: `chmod +x scripts/make-env.sh && npx supabase start` (first run downloads images; wait for "Started supabase local development setup"), then `./scripts/make-env.sh`.
Expected: `Wrote .env.local and .env.test`.

- [ ] **Step 11: Ignore env files, verify the build, commit**

Append to `.gitignore`: `.env.local`, `.env.test`, `supabase/.temp`, `playwright-report`, `test-results`.

Run: `npm run build`
Expected: build succeeds.

```bash
git add -A
git commit -m "chore: scaffold Next.js app, tooling, design tokens and security headers"
```

---

## Task 2: Core schema, constraints and lockdown (with database tests)

**Files:**
- Create: `supabase/migrations/20261101000001_core_schema.sql`, `supabase/tests/database/001_schema.test.sql`

**Interfaces:**
- Produces (tables): `events`, `admins`, `station_pins`, `auth_attempts`, `import_batches`, `guests`, `check_ins`, `merchandise_redemptions`, `attempt_log`, `audit_log`; functions `new_token() → text`, `lock_down_public() → void`; the `audit_log` guard trigger.
- Later tasks rely on: `guests.invite_token`, `guests.merch_token`, `check_ins.prize_number`, `events.next_prize_number`, `events.mode`, `merchandise_redemptions.status in ('redeemed','voided')`.

- [ ] **Step 1: Write the failing database test**

`supabase/tests/database/001_schema.test.sql`:
```sql
begin;
select * from no_plan();

-- tables exist
select has_table('public', t, t || ' exists')
from unnest(array['events','admins','station_pins','auth_attempts','import_batches','guests',
                  'check_ins','merchandise_redemptions','attempt_log','audit_log']) as t;

-- lockdown
select is((select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
          0, 'RLS is enabled on every public table');
select is((select count(*)::int from pg_tables
           where schemaname = 'public' and tablename <> 'stage_state'
             and (has_table_privilege('anon', format('public.%I', tablename), 'select')
               or has_table_privilege('authenticated', format('public.%I', tablename), 'select'))),
          0, 'anon and authenticated cannot select any public table (stage_state excepted in Plan 2)');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and (has_function_privilege('anon', p.oid, 'execute')
               or has_function_privilege('authenticated', p.oid, 'execute'))),
          0, 'anon and authenticated cannot execute any public function');

-- fixtures
insert into events (id, name, event_date)
values ('00000000-0000-4000-8000-0000000000aa', 'Test', '2026-12-10');
insert into guests (id, event_id, employee_id, full_name, outlet) values
 ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', 'E1', 'Guest One', 'Outlet A'),
 ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000aa', 'E2', 'Guest Two', 'Outlet A');

-- guests
select throws_ok($$ insert into guests (event_id, employee_id, full_name, outlet)
                    values ('00000000-0000-4000-8000-0000000000aa', 'E1', 'Dup', 'X') $$,
                 '23505', null, 'employee id is unique per event');
select is((select length(invite_token) from guests where employee_id = 'E1'), 22, 'invite token is 22 URL-safe chars');
select isnt((select invite_token from guests where employee_id = 'E1'),
            (select merch_token from guests where employee_id = 'E1'), 'the two tokens differ');
select matches((select invite_token from guests where employee_id = 'E1'), '^[A-Za-z0-9_-]{22}$', 'token alphabet is URL-safe');

-- check-ins
select lives_ok($$ insert into check_ins (event_id, guest_id, method, station_label, actor, prize_number)
                   values ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000001', 'scan', 'Meja 1', 'checkin', 1) $$,
                'first check-in inserts');
select throws_ok($$ insert into check_ins (event_id, guest_id, method, station_label, actor, prize_number)
                    values ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000001', 'scan', 'Meja 1', 'checkin', 2) $$,
                 '23505', null, 'a guest cannot check in twice');
select throws_ok($$ insert into check_ins (event_id, guest_id, method, station_label, actor, prize_number)
                    values ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000002', 'scan', 'Meja 1', 'checkin', 1) $$,
                 '23505', null, 'a prize number cannot be reused');
select throws_ok($$ insert into check_ins (event_id, guest_id, method, station_label, actor, prize_number)
                    values ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000002', 'scan', 'Meja 1', 'checkin', null) $$,
                 '23502', null, 'a check-in cannot exist without a prize number');

-- merchandise
select throws_ok($$ insert into merchandise_redemptions (event_id, guest_id, status, station_label, actor)
                    values ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000002', 'redeemed', 'Booth 1', 'merchandise') $$,
                 '23503', null, 'merchandise requires a check-in');
select lives_ok($$ insert into merchandise_redemptions (event_id, guest_id, status, station_label, actor)
                   values ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000001', 'redeemed', 'Booth 1', 'merchandise') $$,
                'a checked-in guest can redeem');
select throws_ok($$ insert into merchandise_redemptions (event_id, guest_id, status, station_label, actor)
                    values ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000001', 'redeemed', 'Booth 2', 'merchandise') $$,
                 '23505', null, 'only one active redemption per guest');
select lives_ok($$ insert into merchandise_redemptions (event_id, guest_id, status, station_label, actor, void_reason)
                   values ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000001', 'voided', 'Booth 2', 'merchandise', 'test') $$,
                'voided rows do not count as active');

-- audit log
insert into audit_log (event_id, actor_type, actor, action)
values ('00000000-0000-4000-8000-0000000000aa', 'system', 'test', 'seed');
select throws_ok($$ update audit_log set action = 'x' $$, 'P0001', null, 'audit log rejects UPDATE');
update events set mode = 'live' where id = '00000000-0000-4000-8000-0000000000aa';
select throws_ok($$ delete from audit_log $$, 'P0001', null, 'audit log rejects DELETE in live mode');
update events set mode = 'rehearsal' where id = '00000000-0000-4000-8000-0000000000aa';
select lives_ok($$ delete from audit_log $$, 'audit log allows DELETE in rehearsal mode');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:db`
Expected: FAIL (`relation "public.events" does not exist` or `has_table` failures).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261101000001_core_schema.sql`:
```sql
create extension if not exists pgcrypto with schema extensions;

-- 128-bit URL-safe token (22 characters, no padding)
create function public.new_token() returns text
language sql volatile
set search_path = public, extensions
as $$ select translate(encode(gen_random_bytes(16), 'base64'), '+/=', '-_') $$;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_date date not null,
  starts_at timestamptz,
  venue text,
  next_prize_number int not null default 1,
  display_key_hash text,
  mode text not null default 'rehearsal' check (mode in ('rehearsal', 'live')),
  config jsonb not null default '{}'::jsonb
);

create table public.admins (
  event_id uuid not null references public.events(id) on delete cascade,
  email text not null check (email = lower(email)),
  name text,
  primary key (event_id, email)
);

create table public.station_pins (
  event_id uuid not null references public.events(id) on delete cascade,
  role text not null check (role in ('checkin', 'merchandise', 'draw', 'prizes')),
  pin_hash text not null,
  active boolean not null default true,
  session_version int not null default 1,
  updated_at timestamptz not null default now(),
  primary key (event_id, role)
);

create table public.auth_attempts (
  id bigint generated always as identity primary key,
  scope text not null,
  key text not null,
  at timestamptz not null default now(),
  success boolean not null
);
create index auth_attempts_lookup on public.auth_attempts (scope, key, at desc);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  filename text,
  uploaded_by text,
  inserted int not null default 0,
  updated int not null default 0,
  flagged_missing int not null default 0,
  created_at timestamptz not null default now()
);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  employee_id text not null,
  full_name text not null,
  outlet text not null,
  department text,
  position text,
  phone text,
  category text,
  invite_token text not null unique default public.new_token(),
  merch_token text not null unique default public.new_token(),
  rsvp_status text not null default 'pending' check (rsvp_status in ('pending', 'yes', 'no')),
  rsvp_at timestamptz,
  first_opened_at timestamptz,
  is_walk_in boolean not null default false,
  active boolean not null default true,
  last_import_id uuid references public.import_batches(id),
  flagged_missing boolean not null default false,
  created_at timestamptz not null default now(),
  unique (event_id, employee_id)
);

create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  guest_id uuid not null unique references public.guests(id),
  checked_in_at timestamptz not null default now(),
  method text not null check (method in ('scan', 'manual')),
  station_label text,
  actor text,
  prize_number int not null,
  unique (event_id, prize_number)
);

create table public.merchandise_redemptions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  guest_id uuid not null references public.check_ins(guest_id),
  status text not null default 'redeemed' check (status in ('redeemed', 'voided')),
  redeemed_at timestamptz not null default now(),
  station_label text,
  actor text,
  void_reason text
);
create unique index one_active_redemption on public.merchandise_redemptions (guest_id) where status = 'redeemed';

create table public.attempt_log (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id),
  at timestamptz not null default now(),
  kind text not null,
  token_prefix text,
  result text not null,
  actor text
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id),
  at timestamptz not null default now(),
  actor_type text not null check (actor_type in ('station', 'admin', 'system', 'guest')),
  actor text not null,
  action text not null,
  entity text,
  entity_id text,
  details jsonb not null default '{}'::jsonb
);

create function public.audit_log_guard() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'audit_log is append-only';
  end if;
  if tg_op = 'DELETE' then
    if exists (select 1 from public.events e where e.id = old.event_id and e.mode = 'rehearsal') then
      return old;
    end if;
    raise exception 'audit_log is append-only';
  end if;
  return null;
end $$;

create trigger audit_log_guard before update or delete on public.audit_log
for each row execute function public.audit_log_guard();

-- Lockdown: RLS on every table, no table access for browsers, functions callable by service_role only.
create function public.lock_down_public() returns void
language plpgsql
as $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
  execute 'revoke execute on all functions in schema public from public, anon, authenticated';
  execute 'grant execute on all functions in schema public to service_role';
end $$;

alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

select public.lock_down_public();
```

- [ ] **Step 4: Apply and run the test**

Run: `npm run db:reset && npm run test:db`
Expected: `All tests successful.` (`Result: PASS`).

- [ ] **Step 5: Commit**

```bash
git add supabase package.json
git commit -m "feat(db): core schema, constraints, audit guard and lockdown"
```

---

## Task 3: PIN login, pass, RSVP and search functions

**Files:**
- Create: `supabase/migrations/20261101000002_pin_pass_functions.sql`, `supabase/tests/database/002_pin_pass.test.sql`

**Interfaces:**
- Produces (all `jsonb` unless noted; all `security definer`):
  - `audit(p_event uuid, p_actor_type text, p_actor text, p_action text, p_entity text, p_entity_id text, p_details jsonb default '{}') → void`
  - `verify_pin(p_event uuid, p_pin text, p_device_key text, p_ip_key text)` → `{status: 'OK', role, session_version}` | `{status: 'INVALID'}` | `{status: 'LOCKED'}`
  - `station_session_valid(p_event uuid, p_role text, p_version int) → boolean`
  - `is_admin(p_event uuid, p_email text) → boolean`
  - `get_pass(p_token text)` → `{status:'INVALID'}` | `{status:'OK', event:{name,date,starts_at,venue}, guest:{full_name,outlet,department,position,rsvp_status}, invite_token, checked_in, checked_in_at, prize_number, merchandise: null | {token, claimed, redeemed_at}}`
  - `set_rsvp(p_token text, p_status text)` → `{status:'OK'|'INVALID'}` (status must be `yes` or `no`)
  - `find_guests(p_event uuid, p_q text)` → `{status:'OK', guests:[{id, full_name, outlet, employee_id, checked_in}]}` (max 20, no phone, empty list for queries under 2 characters)

- [ ] **Step 1: Write the failing test**

`supabase/tests/database/002_pin_pass.test.sql`:
```sql
begin;
select * from no_plan();

insert into events (id, name, event_date, venue)
values ('00000000-0000-4000-8000-0000000000aa', 'Test', '2026-12-10', 'Venue');
insert into guests (id, event_id, employee_id, full_name, outlet, phone) values
 ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', 'E1', 'Kadek Ayu', 'Outlet A', '+6281234567890'),
 ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000aa', 'E2', 'Made Putra', 'Outlet B', null);
insert into station_pins (event_id, role, pin_hash) values
 ('00000000-0000-4000-8000-0000000000aa', 'checkin', extensions.crypt('123456', extensions.gen_salt('bf'))),
 ('00000000-0000-4000-8000-0000000000aa', 'draw', extensions.crypt('654321', extensions.gen_salt('bf')));
insert into admins (event_id, email) values ('00000000-0000-4000-8000-0000000000aa', 'boss@example.com');

-- verify_pin
select is(verify_pin('00000000-0000-4000-8000-0000000000aa', '123456', 'dev1', 'ip1')->>'status', 'OK', 'correct PIN');
select is(verify_pin('00000000-0000-4000-8000-0000000000aa', '123456', 'dev1', 'ip1')->>'role', 'checkin', 'PIN identifies the role');
select is(verify_pin('00000000-0000-4000-8000-0000000000aa', '000000', 'dev2', 'ip2')->>'status', 'INVALID', 'wrong PIN');
select is(verify_pin('00000000-0000-4000-8000-0000000000aa', '12345', 'dev2', 'ip2')->>'status', 'INVALID', 'PIN must be 6 digits');
select is(verify_pin('00000000-0000-4000-8000-0000000000aa', 'abcdef', 'dev2', 'ip2')->>'status', 'INVALID', 'PIN must be numeric');

-- per-device lockout: 5 failures
do $$ begin for i in 1..5 loop perform verify_pin('00000000-0000-4000-8000-0000000000aa', '000000', 'devL', 'ipL1'); end loop; end $$;
select is(verify_pin('00000000-0000-4000-8000-0000000000aa', '123456', 'devL', 'ipL2')->>'status', 'LOCKED',
          'a device with 5 failures is locked even with the right PIN');
select is(verify_pin('00000000-0000-4000-8000-0000000000aa', '123456', 'devOther', 'ipL3')->>'status', 'OK',
          'other devices are not locked');

-- success clears the device failure count
do $$ begin
  for i in 1..4 loop perform verify_pin('00000000-0000-4000-8000-0000000000aa', '000000', 'devC', 'ipC'); end loop;
  perform verify_pin('00000000-0000-4000-8000-0000000000aa', '123456', 'devC', 'ipC');
  perform verify_pin('00000000-0000-4000-8000-0000000000aa', '000000', 'devC', 'ipC');
end $$;
select is(verify_pin('00000000-0000-4000-8000-0000000000aa', '123456', 'devC', 'ipC')->>'status', 'OK',
          'a success resets the device counter');

-- per-IP cap: 30 failures
do $$ begin for i in 1..30 loop perform verify_pin('00000000-0000-4000-8000-0000000000aa', '000000', 'devI' || i, 'ipBusy'); end loop; end $$;
select is(verify_pin('00000000-0000-4000-8000-0000000000aa', '123456', 'devFresh', 'ipBusy')->>'status', 'LOCKED',
          'an IP with 30 failures is locked');

-- inactive PIN
update station_pins set active = false where role = 'draw';
select is(verify_pin('00000000-0000-4000-8000-0000000000aa', '654321', 'devX', 'ipX')->>'status', 'INVALID', 'inactive PIN is refused');

-- station_session_valid and is_admin
select is(station_session_valid('00000000-0000-4000-8000-0000000000aa', 'checkin', 1), true, 'session version matches');
select is(station_session_valid('00000000-0000-4000-8000-0000000000aa', 'checkin', 2), false, 'old/new version is refused');
update station_pins set active = false where role = 'checkin';
select is(station_session_valid('00000000-0000-4000-8000-0000000000aa', 'checkin', 1), false, 'disabled role is logged out');
select is(is_admin('00000000-0000-4000-8000-0000000000aa', 'boss@example.com'), true, 'admin allowlist hit');
select is(is_admin('00000000-0000-4000-8000-0000000000aa', 'BOSS@example.com'), true, 'admin check is case-insensitive');
select is(is_admin('00000000-0000-4000-8000-0000000000aa', 'x@example.com'), false, 'not an admin');

-- get_pass
select is(get_pass('does-not-exist')->>'status', 'INVALID', 'unknown token is INVALID');
select is((select first_opened_at is null from guests where employee_id = 'E1'), true, 'not opened yet');
select is(get_pass((select invite_token from guests where employee_id = 'E1'))->>'status', 'OK', 'valid token');
select is((select first_opened_at is not null from guests where employee_id = 'E1'), true, 'first_opened_at is recorded');
select is(get_pass((select invite_token from guests where employee_id = 'E1'))->'guest'->>'full_name', 'Kadek Ayu', 'guest name returned');
select is(jsonb_typeof(get_pass((select invite_token from guests where employee_id = 'E1'))->'merchandise'), 'null',
          'merchandise token is NOT returned before check-in');
select is(get_pass((select merch_token from guests where employee_id = 'E1'))->>'status', 'INVALID',
          'the merchandise token does not open the pass');
select is(jsonb_exists(get_pass((select invite_token from guests where employee_id = 'E1')) -> 'guest', 'phone'), false, 'phone is never returned');
update guests set active = false where employee_id = 'E2';
select is(get_pass((select invite_token from guests where employee_id = 'E2'))->>'status', 'INVALID', 'inactive guest is INVALID');

-- set_rsvp
select is(set_rsvp((select invite_token from guests where employee_id = 'E1'), 'yes')->>'status', 'OK', 'rsvp yes');
select is((select rsvp_status from guests where employee_id = 'E1'), 'yes', 'rsvp stored');
select is(set_rsvp((select invite_token from guests where employee_id = 'E1'), 'no')->>'status', 'OK', 'rsvp can change');
select is(set_rsvp((select invite_token from guests where employee_id = 'E1'), 'maybe')->>'status', 'INVALID', 'bad status refused');
select is(set_rsvp('nope', 'yes')->>'status', 'INVALID', 'bad token refused');

-- find_guests
update guests set active = true where employee_id = 'E2';
select is(jsonb_array_length(find_guests('00000000-0000-4000-8000-0000000000aa', 'k')->'guests'), 0, 'one-character query returns nothing');
select is(jsonb_array_length(find_guests('00000000-0000-4000-8000-0000000000aa', 'kadek')->'guests'), 1, 'matches by name (case-insensitive)');
select is(jsonb_array_length(find_guests('00000000-0000-4000-8000-0000000000aa', 'e2')->'guests'), 1, 'matches by employee id');
select is(jsonb_exists(find_guests('00000000-0000-4000-8000-0000000000aa', 'kadek')->'guests'->0, 'phone'), false, 'no phone in search results');
select is(jsonb_array_length(find_guests('00000000-0000-4000-8000-0000000000aa', '%%')->'guests'), 0, 'wildcards are literal');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:db`
Expected: FAIL (`function verify_pin(...) does not exist`).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261101000002_pin_pass_functions.sql`:
```sql
create function public.audit(
  p_event uuid, p_actor_type text, p_actor text, p_action text,
  p_entity text, p_entity_id text, p_details jsonb default '{}'::jsonb
) returns void
language sql security definer set search_path = public, extensions
as $$
  insert into public.audit_log (event_id, actor_type, actor, action, entity, entity_id, details)
  values (p_event, p_actor_type, p_actor, p_action, p_entity, p_entity_id, coalesce(p_details, '{}'::jsonb));
$$;

create function public.verify_pin(p_event uuid, p_pin text, p_device_key text, p_ip_key text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_dev int;
  v_ip int;
  r record;
begin
  select count(*) into v_dev from public.auth_attempts
   where scope = 'pin_device' and key = p_device_key and not success and at > now() - interval '5 minutes';
  select count(*) into v_ip from public.auth_attempts
   where scope = 'pin_ip' and key = p_ip_key and not success and at > now() - interval '5 minutes';
  if v_dev >= 5 or v_ip >= 30 then
    return jsonb_build_object('status', 'LOCKED');
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    insert into public.auth_attempts (scope, key, success)
    values ('pin_device', p_device_key, false), ('pin_ip', p_ip_key, false);
    return jsonb_build_object('status', 'INVALID');
  end if;

  select sp.role, sp.session_version into r
    from public.station_pins sp
   where sp.event_id = p_event and sp.active and sp.pin_hash = crypt(p_pin, sp.pin_hash)
   limit 1;

  if not found then
    insert into public.auth_attempts (scope, key, success)
    values ('pin_device', p_device_key, false), ('pin_ip', p_ip_key, false);
    return jsonb_build_object('status', 'INVALID');
  end if;

  delete from public.auth_attempts where scope = 'pin_device' and key = p_device_key and not success;
  return jsonb_build_object('status', 'OK', 'role', r.role, 'session_version', r.session_version);
end $$;

create function public.station_session_valid(p_event uuid, p_role text, p_version int)
returns boolean
language sql stable security definer set search_path = public, extensions
as $$
  select exists (
    select 1 from public.station_pins
     where event_id = p_event and role = p_role and active and session_version = p_version
  );
$$;

create function public.is_admin(p_event uuid, p_email text)
returns boolean
language sql stable security definer set search_path = public, extensions
as $$
  select exists (select 1 from public.admins where event_id = p_event and email = lower(p_email));
$$;

create function public.get_pass(p_token text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  g public.guests%rowtype;
  e public.events%rowtype;
  ci public.check_ins%rowtype;
  mr public.merchandise_redemptions%rowtype;
  v_merch jsonb;
begin
  select * into g from public.guests where invite_token = p_token and active;
  if not found then
    return jsonb_build_object('status', 'INVALID');
  end if;

  if g.first_opened_at is null then
    update public.guests set first_opened_at = now() where id = g.id;
  end if;

  select * into e from public.events where id = g.event_id;
  select * into ci from public.check_ins where guest_id = g.id;

  if ci.id is not null then
    select * into mr from public.merchandise_redemptions where guest_id = g.id and status = 'redeemed';
    v_merch := jsonb_build_object('token', g.merch_token, 'claimed', mr.id is not null, 'redeemed_at', mr.redeemed_at);
  end if;

  return jsonb_build_object(
    'status', 'OK',
    'event', jsonb_build_object('name', e.name, 'date', e.event_date, 'starts_at', e.starts_at, 'venue', e.venue),
    'guest', jsonb_build_object('full_name', g.full_name, 'outlet', g.outlet, 'department', g.department,
                                'position', g.position, 'rsvp_status', g.rsvp_status),
    'invite_token', g.invite_token,
    'checked_in', ci.id is not null,
    'checked_in_at', ci.checked_in_at,
    'prize_number', ci.prize_number,
    'merchandise', v_merch
  );
end $$;

create function public.set_rsvp(p_token text, p_status text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare g public.guests%rowtype;
begin
  if p_status not in ('yes', 'no') then
    return jsonb_build_object('status', 'INVALID');
  end if;
  select * into g from public.guests where invite_token = p_token and active;
  if not found then
    return jsonb_build_object('status', 'INVALID');
  end if;
  update public.guests set rsvp_status = p_status, rsvp_at = now() where id = g.id;
  perform public.audit(g.event_id, 'guest', g.employee_id, 'rsvp', 'guest', g.id::text, jsonb_build_object('status', p_status));
  return jsonb_build_object('status', 'OK', 'rsvp_status', p_status);
end $$;

create function public.find_guests(p_event uuid, p_q text)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions
as $$
declare v_q text := lower(trim(coalesce(p_q, '')));
begin
  if length(v_q) < 2 then
    return jsonb_build_object('status', 'OK', 'guests', '[]'::jsonb);
  end if;
  return jsonb_build_object('status', 'OK', 'guests', coalesce((
    select jsonb_agg(x) from (
      select jsonb_build_object(
               'id', g.id, 'full_name', g.full_name, 'outlet', g.outlet, 'employee_id', g.employee_id,
               'checked_in', exists (select 1 from public.check_ins c where c.guest_id = g.id)) as x
        from public.guests g
       where g.event_id = p_event and g.active
         and (position(v_q in lower(g.full_name)) > 0 or position(v_q in lower(g.employee_id)) > 0)
       order by g.full_name
       limit 20
    ) s
  ), '[]'::jsonb));
end $$;

select public.lock_down_public();
```

- [ ] **Step 4: Apply and run the tests**

Run: `npm run db:reset && npm run test:db`
Expected: both test files pass.

- [ ] **Step 5: Commit**

```bash
git add supabase
git commit -m "feat(db): PIN verification, pass, RSVP and guest search functions"
```

---

## Task 4: `check_in` function, Door Prize numbers and concurrency proof

**Files:**
- Create: `supabase/migrations/20261101000003_check_in.sql`, `supabase/tests/database/003_check_in.test.sql`, `scripts/concurrency/lib.mjs`, `scripts/concurrency/checkin.mjs`

**Interfaces:**
- Consumes: Task 2 tables, `audit(...)` from Task 3.
- Produces:
  - `guest_brief(g public.guests) → jsonb` = `{id, full_name, outlet, department, position}`
  - `log_attempt(p_event uuid, p_kind text, p_token text, p_result text, p_actor text) → void` (stores only the first 6 characters of the token)
  - `check_in(p_event uuid, p_token text, p_guest_id uuid, p_method text, p_station_label text, p_actor text) → jsonb`:
    - `{status:'CHECKED_IN', guest, prize_number, checked_in_at, station_label}`
    - `{status:'ALREADY_CHECKED_IN', guest, prize_number, checked_in_at, station_label}` (original values; nothing written)
    - `{status:'INVALID'}` (also writes `attempt_log`), `{status:'NOT_ELIGIBLE'}` (inactive guest)
  - `scripts/concurrency/lib.mjs` exports `EVENT`, `pool`, `clean()`, `purge()`, `makeGuests(n, prefix)`, `q(sql, params)` — reused by Task 5.

- [ ] **Step 1: Write the failing database test**

`supabase/tests/database/003_check_in.test.sql`:
```sql
begin;
select * from no_plan();

insert into events (id, name, event_date) values ('00000000-0000-4000-8000-0000000000aa', 'Test', '2026-12-10');
insert into guests (id, event_id, employee_id, full_name, outlet) values
 ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', 'E1', 'Guest One', 'Outlet A'),
 ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000aa', 'E2', 'Guest Two', 'Outlet A'),
 ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000aa', 'E3', 'Guest Three', 'Outlet B');
update guests set active = false where employee_id = 'E3';

-- first check-in by invite token
select is(check_in('00000000-0000-4000-8000-0000000000aa', (select invite_token from guests where employee_id = 'E1'), null, 'scan', 'Meja 1', 'checkin')->>'status',
          'CHECKED_IN', 'first scan checks in');
select is((select prize_number from check_ins where guest_id = '00000000-0000-4000-8000-000000000001'), 1, 'first number is 1');

-- duplicate returns the original, writes nothing new
select is(check_in('00000000-0000-4000-8000-0000000000aa', (select invite_token from guests where employee_id = 'E1'), null, 'scan', 'Meja 2', 'checkin')->>'status',
          'ALREADY_CHECKED_IN', 'second scan is a duplicate');
select is(check_in('00000000-0000-4000-8000-0000000000aa', (select invite_token from guests where employee_id = 'E1'), null, 'scan', 'Meja 2', 'checkin')->>'station_label',
          'Meja 1', 'duplicate reports the original station');
select is((select count(*)::int from check_ins), 1, 'still one check-in row');
select is((select next_prize_number from events where id = '00000000-0000-4000-8000-0000000000aa'), 2, 'counter did not move on a duplicate');

-- manual check-in by guest id gets the next number
select is(check_in('00000000-0000-4000-8000-0000000000aa', null, '00000000-0000-4000-8000-000000000002', 'manual', 'Meja 1', 'checkin')->>'prize_number',
          '2', 'second guest gets number 2');
select is((select method from check_ins where guest_id = '00000000-0000-4000-8000-000000000002'), 'manual', 'method recorded');

-- invalid and ineligible
select is(check_in('00000000-0000-4000-8000-0000000000aa', 'not-a-real-token-0000', null, 'scan', 'Meja 1', 'checkin')->>'status', 'INVALID', 'unknown token');
select is((select count(*)::int from attempt_log where result = 'INVALID' and kind = 'checkin'), 1, 'rejected scan is logged');
select is((select token_prefix from attempt_log limit 1), 'not-a-', 'only a 6-character token prefix is stored');
select is(check_in('00000000-0000-4000-8000-0000000000aa', (select merch_token from guests where employee_id = 'E2'), null, 'scan', 'Meja 1', 'checkin')->>'status',
          'INVALID', 'a merchandise token cannot check in');
select is(check_in('00000000-0000-4000-8000-0000000000aa', null, null, 'manual', 'Meja 1', 'checkin')->>'status', 'INVALID', 'no token and no id');
select is(check_in('00000000-0000-4000-8000-0000000000aa', (select invite_token from guests where employee_id = 'E3'), null, 'scan', 'Meja 1', 'checkin')->>'status',
          'NOT_ELIGIBLE', 'inactive guest');
select is((select count(*)::int from check_ins), 2, 'only the two valid check-ins exist');

-- audit and pass
select is((select count(*)::int from audit_log where action = 'check_in'), 2, 'each real check-in is audited');
select is(get_pass((select invite_token from guests where employee_id = 'E1'))->>'prize_number', '1', 'pass shows the prize number');
select is(get_pass((select invite_token from guests where employee_id = 'E1'))->'merchandise'->>'token',
          (select merch_token from guests where employee_id = 'E1'), 'merchandise token appears after check-in');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:db`
Expected: FAIL (`function check_in(...) does not exist`).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261101000003_check_in.sql`:
```sql
create function public.guest_brief(g public.guests) returns jsonb
language sql immutable
as $$
  select jsonb_build_object('id', g.id, 'full_name', g.full_name, 'outlet', g.outlet,
                            'department', g.department, 'position', g.position)
$$;

create function public.log_attempt(p_event uuid, p_kind text, p_token text, p_result text, p_actor text)
returns void
language sql security definer set search_path = public, extensions
as $$
  insert into public.attempt_log (event_id, kind, token_prefix, result, actor)
  values (p_event, p_kind, left(coalesce(p_token, ''), 6), p_result, p_actor);
$$;

create function public.check_in(
  p_event uuid, p_token text, p_guest_id uuid, p_method text, p_station_label text, p_actor text
) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  g public.guests%rowtype;
  ci public.check_ins%rowtype;
  v_num int;
begin
  if p_token is not null then
    select * into g from public.guests where event_id = p_event and invite_token = p_token;
  else
    select * into g from public.guests where event_id = p_event and id = p_guest_id;
  end if;

  if not found then
    perform public.log_attempt(p_event, 'checkin', coalesce(p_token, p_guest_id::text), 'INVALID', p_actor);
    return jsonb_build_object('status', 'INVALID');
  end if;
  if not g.active then
    return jsonb_build_object('status', 'NOT_ELIGIBLE');
  end if;

  -- lock order: guest advisory lock, then events row
  perform pg_advisory_xact_lock(hashtextextended(g.id::text, 0));

  select * into ci from public.check_ins where guest_id = g.id;
  if found then
    return jsonb_build_object('status', 'ALREADY_CHECKED_IN', 'guest', public.guest_brief(g),
                              'prize_number', ci.prize_number, 'checked_in_at', ci.checked_in_at,
                              'station_label', ci.station_label);
  end if;

  update public.events set next_prize_number = next_prize_number + 1
   where id = p_event
  returning next_prize_number - 1 into v_num;

  insert into public.check_ins (event_id, guest_id, method, station_label, actor, prize_number)
  values (p_event, g.id, p_method, p_station_label, p_actor, v_num)
  returning * into ci;

  perform public.audit(p_event, 'station', coalesce(p_actor, 'unknown'), 'check_in', 'guest', g.id::text,
                       jsonb_build_object('prize_number', v_num, 'method', p_method, 'station', p_station_label));

  return jsonb_build_object('status', 'CHECKED_IN', 'guest', public.guest_brief(g),
                            'prize_number', ci.prize_number, 'checked_in_at', ci.checked_in_at,
                            'station_label', ci.station_label);
end $$;

select public.lock_down_public();
```

- [ ] **Step 4: Apply and run the tests**

Run: `npm run db:reset && npm run test:db`
Expected: all database tests pass.

- [ ] **Step 5: Write the concurrency helpers and script**

`scripts/concurrency/lib.mjs`:
```js
import pg from 'pg';

export const EVENT = process.env.EVENT_ID;
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 40 });

export const q = async (sql, params = []) => (await pool.query(sql, params)).rows;

export async function clean() {
  await q('delete from merchandise_redemptions where event_id = $1', [EVENT]);
  await q('delete from check_ins where event_id = $1', [EVENT]);
  await q('update events set next_prize_number = 1 where id = $1', [EVENT]);
}

export async function purge() {
  await clean();
  await q(`delete from guests where event_id = $1 and employee_id ~ '^(CA|CB|MA|MB)-'`, [EVENT]);
}

export async function makeGuests(n, prefix = 'CC') {
  await q(
    `insert into guests (event_id, employee_id, full_name, outlet)
     select $1::uuid, $2::text || '-' || g, 'Load Guest ' || g, 'Outlet ' || (g % 5)
       from generate_series(1, $3::int) g
     on conflict (event_id, employee_id) do nothing`,
    [EVENT, prefix, n],
  );
  return q(
    `select id, invite_token, merch_token from guests
      where event_id = $1 and employee_id like $2::text || '-%'
      order by length(employee_id), employee_id limit $3`,
    [EVENT, prefix, n],
  );
}
```

`scripts/concurrency/checkin.mjs`:
```js
import assert from 'node:assert/strict';
import { EVENT, pool, q, clean, purge, makeGuests } from './lib.mjs';

const checkIn = async (token, station = 'Meja 1') =>
  (await q(`select public.check_in($1::uuid, $2::text, null, 'scan', $3::text, 'concurrency') as r`, [EVENT, token, station]))[0].r;

// A: 50 parallel check-ins for ONE guest -> exactly one CHECKED_IN
await clean();
const [one] = await makeGuests(1, 'CA');
const resA = await Promise.all(Array.from({ length: 50 }, () => checkIn(one.invite_token)));
assert.equal(resA.filter((r) => r.status === 'CHECKED_IN').length, 1, 'exactly one CHECKED_IN');
assert.equal(resA.filter((r) => r.status === 'ALREADY_CHECKED_IN').length, 49, '49 duplicates');
assert.equal(new Set(resA.map((r) => r.prize_number)).size, 1, 'everyone sees the same number');
console.log('A ok: 50 parallel check-ins for one guest -> 1 CHECKED_IN');

// B: 215 parallel check-ins for different guests -> numbers 1..215, unique, no gaps
await clean();
const many = await makeGuests(215, 'CB');
const resB = await Promise.all(many.map((g, i) => checkIn(g.invite_token, `Meja ${(i % 3) + 1}`)));
assert.ok(resB.every((r) => r.status === 'CHECKED_IN'), 'all 215 checked in');
const nums = resB.map((r) => r.prize_number).sort((a, b) => a - b);
assert.deepEqual(nums, Array.from({ length: 215 }, (_, i) => i + 1), 'numbers are exactly 1..215');
const [{ next_prize_number }] = await q('select next_prize_number from events where id = $1', [EVENT]);
assert.equal(next_prize_number, 216, 'counter ends at 216');
console.log('B ok: 215 parallel check-ins -> numbers 1..215, no gaps');

await purge();
await pool.end();
```

- [ ] **Step 6: Run the concurrency script**

Run: `node --env-file=.env.test scripts/concurrency/checkin.mjs`
Expected output:
```
A ok: 50 parallel check-ins for one guest -> 1 CHECKED_IN
B ok: 215 parallel check-ins -> numbers 1..215, no gaps
```

- [ ] **Step 7: Commit**

```bash
git add supabase scripts
git commit -m "feat(db): check_in with gap-free prize numbers and concurrency proof"
```

---

## Task 5: Merchandise functions and concurrency proof

**Files:**
- Create: `supabase/migrations/20261101000004_merchandise.sql`, `supabase/tests/database/004_merchandise.test.sql`, `scripts/concurrency/redeem.mjs`

**Interfaces:**
- Consumes: `guest_brief`, `log_attempt`, `audit`, `check_in`.
- Produces:
  - `redeem_lookup(p_event uuid, p_token text, p_guest_id uuid, p_actor text default null) → jsonb`: `READY {guest}`, `ALREADY_REDEEMED {guest, redeemed_at, station_label}`, `NOT_CHECKED_IN {guest}`, `NOT_ELIGIBLE`, `INVALID`. Writes only `attempt_log` for rejections.
  - `redeem_merchandise(p_event uuid, p_token text, p_guest_id uuid, p_station_label text, p_actor text) → jsonb`: `REDEEMED {guest, redeemed_at, replay: boolean}` plus the blocked statuses above.
  - `void_redemption(p_event uuid, p_redemption_id uuid, p_reason text, p_actor text) → jsonb`: `OK`, `REASON_REQUIRED` (reason under 5 characters after trimming), `NOT_FOUND`.

- [ ] **Step 1: Write the failing database test**

`supabase/tests/database/004_merchandise.test.sql`:
```sql
begin;
select * from no_plan();

insert into events (id, name, event_date) values ('00000000-0000-4000-8000-0000000000aa', 'Test', '2026-12-10');
insert into guests (id, event_id, employee_id, full_name, outlet) values
 ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', 'E1', 'Guest One', 'Outlet A'),
 ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000aa', 'E2', 'Guest Two', 'Outlet A'),
 ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000aa', 'E3', 'Guest Three', 'Outlet A');
update guests set active = false where employee_id = 'E3';
select check_in('00000000-0000-4000-8000-0000000000aa', null, '00000000-0000-4000-8000-000000000001', 'manual', 'Meja 1', 'checkin');

-- lookup
select is(redeem_lookup('00000000-0000-4000-8000-0000000000aa', (select merch_token from guests where employee_id = 'E1'), null)->>'status', 'READY', 'checked-in guest is READY');
select is((select count(*)::int from merchandise_redemptions), 0, 'lookup writes no redemption');
select is(redeem_lookup('00000000-0000-4000-8000-0000000000aa', (select merch_token from guests where employee_id = 'E2'), null)->>'status', 'NOT_CHECKED_IN', 'not checked in');
select is(redeem_lookup('00000000-0000-4000-8000-0000000000aa', 'nope-nope-nope-nope-00', null)->>'status', 'INVALID', 'unknown token');
select is(redeem_lookup('00000000-0000-4000-8000-0000000000aa', (select invite_token from guests where employee_id = 'E1'), null)->>'status', 'INVALID', 'check-in token is not a merchandise token');
select is(redeem_lookup('00000000-0000-4000-8000-0000000000aa', (select merch_token from guests where employee_id = 'E3'), null)->>'status', 'NOT_ELIGIBLE', 'inactive guest');
select is((select count(*)::int from attempt_log where kind = 'merchandise'), 4, 'rejections are logged');

-- redeem
select is(redeem_merchandise('00000000-0000-4000-8000-0000000000aa', (select merch_token from guests where employee_id = 'E2'), null, 'Booth 1', 'merchandise')->>'status',
          'NOT_CHECKED_IN', 'cannot redeem without check-in');
select is(redeem_merchandise('00000000-0000-4000-8000-0000000000aa', (select merch_token from guests where employee_id = 'E1'), null, 'Booth 1', 'merchandise')->>'status',
          'REDEEMED', 'first redemption');
select is((select count(*)::int from merchandise_redemptions where status = 'redeemed'), 1, 'one redemption row');
select is(redeem_merchandise('00000000-0000-4000-8000-0000000000aa', (select merch_token from guests where employee_id = 'E1'), null, 'Booth 2', 'merchandise')->>'status',
          'ALREADY_REDEEMED', 'a second station is refused');
select is(redeem_merchandise('00000000-0000-4000-8000-0000000000aa', (select merch_token from guests where employee_id = 'E1'), null, 'Booth 1', 'merchandise')->>'status',
          'REDEEMED', 'same-station replay within 10 seconds is treated as the same tap');
select is((redeem_merchandise('00000000-0000-4000-8000-0000000000aa', (select merch_token from guests where employee_id = 'E1'), null, 'Booth 1', 'merchandise')->>'replay')::boolean,
          true, 'replay flag is set');
select is((select count(*)::int from merchandise_redemptions where status = 'redeemed'), 1, 'replay did not add a row');
update merchandise_redemptions set redeemed_at = now() - interval '1 minute';
select is(redeem_merchandise('00000000-0000-4000-8000-0000000000aa', (select merch_token from guests where employee_id = 'E1'), null, 'Booth 1', 'merchandise')->>'status',
          'ALREADY_REDEEMED', 'same station after 10 seconds is refused');
select is(redeem_lookup('00000000-0000-4000-8000-0000000000aa', (select merch_token from guests where employee_id = 'E1'), null)->>'status', 'ALREADY_REDEEMED', 'lookup now blocked');
select is(get_pass((select invite_token from guests where employee_id = 'E1'))->'merchandise'->>'claimed', 'true', 'pass shows merchandise claimed');

-- void
select is(void_redemption('00000000-0000-4000-8000-0000000000aa', (select id from merchandise_redemptions limit 1), 'abc', 'admin@example.com')->>'status', 'REASON_REQUIRED', 'reason of 3 characters is refused');
select is(void_redemption('00000000-0000-4000-8000-0000000000aa', (select id from merchandise_redemptions limit 1), '  wrong person  ', 'admin@example.com')->>'status', 'OK', 'void with reason');
select is((select void_reason from merchandise_redemptions limit 1), 'wrong person', 'reason is trimmed and stored');
select is(void_redemption('00000000-0000-4000-8000-0000000000aa', (select id from merchandise_redemptions limit 1), 'again please', 'admin@example.com')->>'status', 'NOT_FOUND', 'cannot void twice');
select is(redeem_merchandise('00000000-0000-4000-8000-0000000000aa', (select merch_token from guests where employee_id = 'E1'), null, 'Booth 2', 'merchandise')->>'status',
          'REDEEMED', 'after a void the guest can redeem again');
select is((select count(*)::int from audit_log where action in ('merchandise_redeemed', 'merchandise_voided')), 3, 'redemptions and the void are audited');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:db`
Expected: FAIL (`function redeem_lookup(...) does not exist`).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261101000004_merchandise.sql`:
```sql
create function public.redeem_lookup(p_event uuid, p_token text, p_guest_id uuid, p_actor text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  g public.guests%rowtype;
  mr public.merchandise_redemptions%rowtype;
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
                              'redeemed_at', mr.redeemed_at, 'station_label', mr.station_label);
  end if;
  return jsonb_build_object('status', 'READY', 'guest', public.guest_brief(g));
end $$;

create function public.redeem_merchandise(
  p_event uuid, p_token text, p_guest_id uuid, p_station_label text, p_actor text
) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  g public.guests%rowtype;
  mr public.merchandise_redemptions%rowtype;
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
      return jsonb_build_object('status', 'REDEEMED', 'guest', public.guest_brief(g),
                                'redeemed_at', mr.redeemed_at, 'replay', true);
    end if;
    perform public.log_attempt(p_event, 'merchandise', p_token, 'ALREADY_REDEEMED', p_actor);
    return jsonb_build_object('status', 'ALREADY_REDEEMED', 'guest', public.guest_brief(g),
                              'redeemed_at', mr.redeemed_at, 'station_label', mr.station_label);
  end if;

  insert into public.merchandise_redemptions (event_id, guest_id, status, station_label, actor)
  values (p_event, g.id, 'redeemed', p_station_label, p_actor)
  returning * into mr;

  perform public.audit(p_event, 'station', coalesce(p_actor, 'unknown'), 'merchandise_redeemed', 'guest', g.id::text,
                       jsonb_build_object('station', p_station_label));

  return jsonb_build_object('status', 'REDEEMED', 'guest', public.guest_brief(g),
                            'redeemed_at', mr.redeemed_at, 'replay', false);
end $$;

create function public.void_redemption(p_event uuid, p_redemption_id uuid, p_reason text, p_actor text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_reason text := trim(coalesce(p_reason, ''));
  mr public.merchandise_redemptions%rowtype;
begin
  if length(v_reason) < 5 then
    return jsonb_build_object('status', 'REASON_REQUIRED');
  end if;
  select * into mr from public.merchandise_redemptions
   where id = p_redemption_id and event_id = p_event and status = 'redeemed'
   for update;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  update public.merchandise_redemptions set status = 'voided', void_reason = v_reason where id = mr.id;
  perform public.audit(p_event, 'admin', p_actor, 'merchandise_voided', 'guest', mr.guest_id::text,
                       jsonb_build_object('reason', v_reason));
  return jsonb_build_object('status', 'OK');
end $$;

select public.lock_down_public();
```

- [ ] **Step 4: Apply and run the tests**

Run: `npm run db:reset && npm run test:db`
Expected: all database tests pass.

- [ ] **Step 5: Write and run the concurrency script**

`scripts/concurrency/redeem.mjs`:
```js
import assert from 'node:assert/strict';
import { EVENT, pool, q, clean, purge, makeGuests } from './lib.mjs';

const checkIn = (token) =>
  q(`select public.check_in($1::uuid, $2::text, null, 'scan', 'Meja 1', 'concurrency') as r`, [EVENT, token]);
const redeem = async (token, station) =>
  (await q(`select public.redeem_merchandise($1::uuid, $2::text, null, $3::text, 'concurrency') as r`, [EVENT, token, station]))[0].r;

// A: two stations redeem one guest at the same moment -> 1 REDEEMED, 1 ALREADY_REDEEMED
await clean();
const [g] = await makeGuests(1, 'MA');
await checkIn(g.invite_token);
const resA = await Promise.all([redeem(g.merch_token, 'Booth 1'), redeem(g.merch_token, 'Booth 2')]);
assert.deepEqual(resA.map((r) => r.status).sort(), ['ALREADY_REDEEMED', 'REDEEMED']);
console.log('A ok: two stations, one guest -> 1 REDEEMED, 1 ALREADY_REDEEMED');

// B: 20 taps from ONE station for one guest -> all report REDEEMED, only one row exists
await clean();
const [h] = await makeGuests(1, 'MB');
await checkIn(h.invite_token);
const resB = await Promise.all(Array.from({ length: 20 }, () => redeem(h.merch_token, 'Booth 1')));
assert.ok(resB.every((r) => r.status === 'REDEEMED'));
const [{ n }] = await q(`select count(*)::int as n from merchandise_redemptions where status = 'redeemed' and guest_id = $1`, [h.id]);
assert.equal(n, 1);
console.log('B ok: 20 taps from one station -> 1 redemption row');

await purge();
await pool.end();
```
Run: `node --env-file=.env.test scripts/concurrency/redeem.mjs`
Expected: `A ok: ...` and `B ok: ...`.

- [ ] **Step 6: Commit**

```bash
git add supabase scripts
git commit -m "feat(db): two-step merchandise redemption with double-tap guard"
```

---

## Task 6: Guest import functions

**Files:**
- Create: `supabase/migrations/20261101000005_import.sql`, `supabase/tests/database/005_import.test.sql`

**Interfaces:**
- Consumes: Task 2 tables, `audit`.
- Row shape accepted by both functions (a `jsonb` array of objects): `{row_no?: int, employee_id, full_name, outlet, department?, position?, phone?, category?}`. The route handler has already trimmed text and normalised phones to `+62…`.
- Produces:
  - `import_errors(p_rows jsonb) → jsonb` array of `{row, field, code}`; codes: `REQUIRED`, `TOO_LONG`, `DUPLICATE_IN_FILE`. `row` is `row_no` if present, else the 1-based array position.
  - `import_preview(p_event uuid, p_rows jsonb) → jsonb`: `{status:'OK'|'HAS_ERRORS', errors, would_insert, would_update, missing_count, missing: [{employee_id, full_name}]}` (missing list capped at 50). Writes nothing.
  - `import_guests(p_event uuid, p_rows jsonb, p_filename text, p_actor text) → jsonb`: `{status:'HAS_ERRORS', errors}` (nothing written) or `{status:'OK', batch_id, inserted, updated, flagged_missing}`. All or nothing. Existing tokens never change. Guests missing from the file are flagged, never deleted or deactivated. Walk-ins are never flagged.

- [ ] **Step 1: Write the failing database test**

`supabase/tests/database/005_import.test.sql`:
```sql
begin;
select * from no_plan();

insert into events (id, name, event_date) values ('00000000-0000-4000-8000-0000000000aa', 'Test', '2026-12-10');

-- clean import
select is(import_guests('00000000-0000-4000-8000-0000000000aa',
  '[{"row_no":2,"employee_id":" E1 ","full_name":" Kadek Ayu ","outlet":"Outlet A","department":"FOH","position":"Server","phone":"+6281234567890"},
    {"row_no":3,"employee_id":"E2","full_name":"Made Putra","outlet":"Outlet B"},
    {"row_no":4,"employee_id":"E3","full_name":"Wayan Sari","outlet":"Outlet B","phone":""}]'::jsonb,
  'first.csv', 'admin@example.com')->>'inserted', '3', 'three guests inserted');
select is((select count(*)::int from guests), 3, 'three guest rows');
select is((select employee_id from guests where full_name = 'Kadek Ayu'), 'E1', 'text is trimmed');
select is((select phone from guests where employee_id = 'E3'), null, 'blank phone becomes null');
select is((select count(distinct invite_token)::int from guests), 3, 'each guest has its own invite token');
select is((select count(*)::int from import_batches), 1, 'one import batch recorded');

-- re-import: updates, never changes tokens
create temp table tok as select employee_id, invite_token, merch_token from guests;
select is(import_guests('00000000-0000-4000-8000-0000000000aa',
  '[{"row_no":2,"employee_id":"E1","full_name":"Kadek Ayu Lestari","outlet":"Outlet A"},
    {"row_no":3,"employee_id":"E2","full_name":"Made Putra","outlet":"Outlet B"}]'::jsonb,
  'second.csv', 'admin@example.com')->>'updated', '2', 'two guests updated');
select is((select count(*)::int from guests g join tok t using (employee_id, invite_token, merch_token)), 3, 'tokens are unchanged by a re-import');
select is((select full_name from guests where employee_id = 'E1'), 'Kadek Ayu Lestari', 'details are updated');
select is((select flagged_missing from guests where employee_id = 'E3'), true, 'a guest missing from the new file is flagged');
select is((select active from guests where employee_id = 'E3'), true, 'but not deactivated');

-- walk-ins are never flagged
insert into guests (event_id, employee_id, full_name, outlet, is_walk_in)
values ('00000000-0000-4000-8000-0000000000aa', 'WALKIN-1', 'Walk In', 'Outlet A', true);
select is(import_guests('00000000-0000-4000-8000-0000000000aa',
  '[{"row_no":2,"employee_id":"E1","full_name":"Kadek Ayu Lestari","outlet":"Outlet A"},
    {"row_no":3,"employee_id":"E2","full_name":"Made Putra","outlet":"Outlet B"},
    {"row_no":4,"employee_id":"E3","full_name":"Wayan Sari","outlet":"Outlet B"}]'::jsonb,
  'third.csv', 'admin@example.com')->>'flagged_missing', '0', 'nobody missing; walk-ins are not flagged');
select is((select flagged_missing from guests where employee_id = 'E3'), false, 'flag clears when the guest returns');
select is((select flagged_missing from guests where employee_id = 'WALKIN-1'), false, 'walk-in stays unflagged');

-- errors: nothing is written
select is(import_guests('00000000-0000-4000-8000-0000000000aa',
  '[{"row_no":2,"employee_id":"E9","full_name":"Good Row","outlet":"Outlet A"},
    {"row_no":3,"employee_id":"E10","full_name":"No Outlet","outlet":""}]'::jsonb,
  'bad.csv', 'admin@example.com')->>'status', 'HAS_ERRORS', 'a bad row fails the whole file');
select is((select count(*)::int from guests where employee_id in ('E9', 'E10')), 0, 'nothing from a failed file is written');
select is((select count(*)::int from import_batches), 3, 'no batch row for a failed file');
select is(import_guests('00000000-0000-4000-8000-0000000000aa',
  '[{"row_no":2,"employee_id":"E9","full_name":"A","outlet":"O"},{"row_no":5,"employee_id":"E9","full_name":"B","outlet":"O"}]'::jsonb,
  'dup.csv', 'admin@example.com')->'errors'->0->>'code', 'DUPLICATE_IN_FILE', 'duplicate ids in a file are reported');
select is(jsonb_array_length(import_errors('[{"row_no":2,"employee_id":"E9","full_name":"A","outlet":"O"},{"row_no":5,"employee_id":"E9","full_name":"B","outlet":"O"}]'::jsonb)), 2, 'both duplicate rows are reported');
select is(import_errors('[{"row_no":7,"employee_id":"","full_name":"A","outlet":"O"}]'::jsonb)->0->>'row', '7', 'errors carry the CSV row number');
select is(import_errors('[{"employee_id":"","full_name":"A","outlet":"O"}]'::jsonb)->0->>'row', '1', 'without row_no the array position is used');
select is(import_errors(jsonb_build_array(jsonb_build_object('employee_id', repeat('x', 41), 'full_name', 'A', 'outlet', 'O')))->0->>'code', 'TOO_LONG', 'overlong id is refused');

-- preview
select is(import_preview('00000000-0000-4000-8000-0000000000aa',
  '[{"row_no":2,"employee_id":"E1","full_name":"Kadek","outlet":"A"},{"row_no":3,"employee_id":"E50","full_name":"New Person","outlet":"A"}]'::jsonb)->>'would_insert', '1', 'preview counts inserts');
select is(import_preview('00000000-0000-4000-8000-0000000000aa',
  '[{"row_no":2,"employee_id":"E1","full_name":"Kadek","outlet":"A"},{"row_no":3,"employee_id":"E50","full_name":"New Person","outlet":"A"}]'::jsonb)->>'would_update', '1', 'preview counts updates');
select is(import_preview('00000000-0000-4000-8000-0000000000aa',
  '[{"row_no":2,"employee_id":"E1","full_name":"Kadek","outlet":"A"}]'::jsonb)->>'missing_count', '2', 'preview counts guests missing from the file (E2, E3; walk-in excluded)');
select is(import_preview('00000000-0000-4000-8000-0000000000aa', '[{"employee_id":"","full_name":"A","outlet":"O"}]'::jsonb)->>'status', 'HAS_ERRORS', 'preview reports errors');
select is((select count(*)::int from guests where employee_id = 'E50'), 0, 'preview writes nothing');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:db`
Expected: FAIL (`function import_guests(...) does not exist`).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261101000005_import.sql`:
```sql
create function public.import_errors(p_rows jsonb) returns jsonb
language sql immutable
as $$
  with r as (
    select ord::int as n, coalesce((j->>'row_no')::int, ord::int) as line, j
      from jsonb_array_elements(p_rows) with ordinality as t(j, ord)
  ),
  errs as (
    select line, 'employee_id' as field, 'REQUIRED' as code from r where trim(coalesce(j->>'employee_id', '')) = ''
    union all select line, 'full_name', 'REQUIRED' from r where trim(coalesce(j->>'full_name', '')) = ''
    union all select line, 'outlet', 'REQUIRED' from r where trim(coalesce(j->>'outlet', '')) = ''
    union all select line, 'employee_id', 'TOO_LONG' from r where length(trim(coalesce(j->>'employee_id', ''))) > 40
    union all select line, 'full_name', 'TOO_LONG' from r where length(trim(coalesce(j->>'full_name', ''))) > 120
    union all select line, 'outlet', 'TOO_LONG' from r where length(trim(coalesce(j->>'outlet', ''))) > 120
    union all
      select line, 'employee_id', 'DUPLICATE_IN_FILE'
        from r
       where trim(coalesce(j->>'employee_id', '')) <> ''
         and trim(j->>'employee_id') in (
           select trim(x.j->>'employee_id') from r x group by 1 having count(*) > 1)
  )
  select coalesce(jsonb_agg(jsonb_build_object('row', line, 'field', field, 'code', code) order by line, field), '[]'::jsonb)
    from errs
$$;

create function public.import_preview(p_event uuid, p_rows jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  v_errors jsonb := public.import_errors(p_rows);
  v_ids text[];
  v_ins int;
  v_upd int;
  v_missing jsonb;
  v_missing_count int;
begin
  select array_agg(trim(j->>'employee_id')) into v_ids from jsonb_array_elements(p_rows) j;
  v_ids := coalesce(v_ids, '{}');

  select count(*) filter (where g.id is null), count(*) filter (where g.id is not null)
    into v_ins, v_upd
    from unnest(v_ids) as x(employee_id)
    left join public.guests g on g.event_id = p_event and g.employee_id = x.employee_id;

  select count(*), coalesce(jsonb_agg(jsonb_build_object('employee_id', employee_id, 'full_name', full_name)) filter (where rn <= 50), '[]'::jsonb)
    into v_missing_count, v_missing
    from (
      select employee_id, full_name, row_number() over (order by employee_id) as rn
        from public.guests
       where event_id = p_event and not is_walk_in and not (employee_id = any (v_ids))
    ) m;

  return jsonb_build_object(
    'status', case when jsonb_array_length(v_errors) > 0 then 'HAS_ERRORS' else 'OK' end,
    'errors', v_errors, 'would_insert', v_ins, 'would_update', v_upd,
    'missing_count', v_missing_count, 'missing', v_missing);
end $$;

create function public.import_guests(p_event uuid, p_rows jsonb, p_filename text, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_errors jsonb := public.import_errors(p_rows);
  v_batch uuid;
  v_ins int;
  v_upd int;
  v_missing int;
begin
  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object('status', 'HAS_ERRORS', 'errors', v_errors);
  end if;

  insert into public.import_batches (event_id, filename, uploaded_by)
  values (p_event, p_filename, p_actor)
  returning id into v_batch;

  with src as (
    select trim(j->>'employee_id') as employee_id, trim(j->>'full_name') as full_name, trim(j->>'outlet') as outlet,
           nullif(trim(j->>'department'), '') as department, nullif(trim(j->>'position'), '') as position,
           nullif(trim(j->>'phone'), '') as phone, nullif(trim(j->>'category'), '') as category
      from jsonb_array_elements(p_rows) j
  ), up as (
    insert into public.guests (event_id, employee_id, full_name, outlet, department, position, phone, category,
                               last_import_id, flagged_missing)
    select p_event, employee_id, full_name, outlet, department, position, phone, category, v_batch, false from src
    on conflict (event_id, employee_id) do update set
      full_name = excluded.full_name, outlet = excluded.outlet, department = excluded.department,
      position = excluded.position, phone = excluded.phone, category = excluded.category,
      last_import_id = excluded.last_import_id, flagged_missing = false
    returning (xmax = 0) as ins
  )
  select count(*) filter (where ins), count(*) filter (where not ins) into v_ins, v_upd from up;

  update public.guests set flagged_missing = true
   where event_id = p_event and not is_walk_in and last_import_id is distinct from v_batch;
  get diagnostics v_missing = row_count;

  update public.import_batches set inserted = v_ins, updated = v_upd, flagged_missing = v_missing where id = v_batch;
  perform public.audit(p_event, 'admin', p_actor, 'import', 'import_batch', v_batch::text,
                       jsonb_build_object('filename', p_filename, 'inserted', v_ins, 'updated', v_upd, 'flagged_missing', v_missing));

  return jsonb_build_object('status', 'OK', 'batch_id', v_batch, 'inserted', v_ins, 'updated', v_upd, 'flagged_missing', v_missing);
end $$;

select public.lock_down_public();
```

- [ ] **Step 4: Apply and run the tests**

Run: `npm run db:reset && npm run test:db`
Expected: all database tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase
git commit -m "feat(db): all-or-nothing guest import with preview and missing-guest flags"
```

---

## Task 7: Admin functions (PINs, walk-ins, counts, guest list, go-live, rehearsal reset)

**Files:**
- Create: `supabase/migrations/20261101000006_admin_functions.sql`, `supabase/tests/database/006_admin.test.sql`

**Interfaces:**
- Consumes: earlier tasks.
- Produces (`jsonb` results):
  - `set_station_pin(p_event uuid, p_role text, p_pin text, p_actor text)` → `OK`, `INVALID_ROLE`, `INVALID_PIN` (not 6 digits), `PIN_IN_USE` (another role has the same PIN). Increments `session_version`, re-activates the role. The PIN never appears in the audit log.
  - `set_station_active(p_event uuid, p_role text, p_active boolean, p_actor text)` → `OK`, `NOT_FOUND`. Bumps `session_version` so existing sessions end.
  - `set_station_labels(p_event uuid, p_labels jsonb, p_actor text)` → `OK`, `INVALID` (must be 1–20 unique non-empty strings of at most 30 characters); stored in `events.config.station_labels`.
  - `add_walk_in(p_event uuid, p_full_name text, p_outlet text, p_department text, p_position text, p_actor text)` → `{status:'OK', guest_id, employee_id, invite_token}` or `INVALID`. IDs are `WALKIN-n`.
  - `admin_update_guest(p_event uuid, p_guest_id uuid, p_changes jsonb, p_actor text)` → `OK`, `NOT_FOUND`. Allowed keys: `full_name, outlet, department, position, phone, active`.
  - `event_counts(p_event uuid)` → `{total, checked_in, redeemed, rsvp_yes, rsvp_no, rsvp_pending, opened, mode}`
  - `admin_guest_list(p_event uuid, p_q text, p_outlet text)` → `{status:'OK', guests:[{id, employee_id, full_name, outlet, department, position, phone, rsvp_status, opened, active, flagged_missing, is_walk_in, checked_in_at, prize_number, merch}]}` where `merch` is `'redeemed'` or `'none'`; max 500 rows.
  - `go_live(p_event uuid, p_actor text)` and `reset_rehearsal_data(p_event uuid, p_actor text)` → `OK` or `NOT_REHEARSAL`. **Plan 2 replaces `reset_rehearsal_data` with `create or replace` to also clear draws and reset the stage.**

- [ ] **Step 1: Write the failing database test**

`supabase/tests/database/006_admin.test.sql`:
```sql
begin;
select * from no_plan();

insert into events (id, name, event_date) values ('00000000-0000-4000-8000-0000000000aa', 'Test', '2026-12-10');
insert into guests (id, event_id, employee_id, full_name, outlet, phone) values
 ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', 'E1', 'Guest One', 'Outlet A', '+6281234567890'),
 ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000aa', 'E2', 'Guest Two', 'Outlet B', null);

-- PINs
select is(set_station_pin('00000000-0000-4000-8000-0000000000aa', 'checkin', '111111', 'admin@example.com')->>'status', 'OK', 'set a PIN');
select is(verify_pin('00000000-0000-4000-8000-0000000000aa', '111111', 'd1', 'i1')->>'role', 'checkin', 'the new PIN works');
select is(set_station_pin('00000000-0000-4000-8000-0000000000aa', 'merchandise', '111111', 'admin@example.com')->>'status', 'PIN_IN_USE', 'PINs are unique across roles');
select is(set_station_pin('00000000-0000-4000-8000-0000000000aa', 'merchandise', '12345', 'admin@example.com')->>'status', 'INVALID_PIN', 'PIN must be 6 digits');
select is(set_station_pin('00000000-0000-4000-8000-0000000000aa', 'janitor', '222222', 'admin@example.com')->>'status', 'INVALID_ROLE', 'unknown role');
select is(set_station_pin('00000000-0000-4000-8000-0000000000aa', 'checkin', '111111', 'admin@example.com')->>'status', 'OK', 'a role may re-set its own PIN');
select is((select session_version from station_pins where role = 'checkin'), 2, 'rotating bumps session_version');
select is(station_session_valid('00000000-0000-4000-8000-0000000000aa', 'checkin', 1), false, 'old sessions are logged out');
select is((select count(*)::int from audit_log where action = 'set_pin' and details::text like '%111111%'), 0, 'the PIN is never written to the audit log');
select is(set_station_active('00000000-0000-4000-8000-0000000000aa', 'checkin', false, 'admin@example.com')->>'status', 'OK', 'disable a role');
select is(verify_pin('00000000-0000-4000-8000-0000000000aa', '111111', 'd9', 'i9')->>'status', 'INVALID', 'disabled role cannot log in');
select is(set_station_active('00000000-0000-4000-8000-0000000000aa', 'prizes', false, 'admin@example.com')->>'status', 'NOT_FOUND', 'role without a PIN');

-- station labels
select is(set_station_labels('00000000-0000-4000-8000-0000000000aa', '["Meja 1","Meja 2"]'::jsonb, 'admin@example.com')->>'status', 'OK', 'set labels');
select is((select config->'station_labels'->>1 from events where id = '00000000-0000-4000-8000-0000000000aa'), 'Meja 2', 'labels stored');
select is(set_station_labels('00000000-0000-4000-8000-0000000000aa', '[]'::jsonb, 'admin@example.com')->>'status', 'INVALID', 'empty list refused');
select is(set_station_labels('00000000-0000-4000-8000-0000000000aa', '["A","A"]'::jsonb, 'admin@example.com')->>'status', 'INVALID', 'duplicates refused');
select is(set_station_labels('00000000-0000-4000-8000-0000000000aa', '"not an array"'::jsonb, 'admin@example.com')->>'status', 'INVALID', 'non-array refused');

-- walk-ins
select is(add_walk_in('00000000-0000-4000-8000-0000000000aa', 'Walk One', 'Outlet A', null, null, 'admin@example.com')->>'employee_id', 'WALKIN-1', 'first walk-in id');
select is(add_walk_in('00000000-0000-4000-8000-0000000000aa', 'Walk Two', 'Outlet A', 'FOH', 'Server', 'admin@example.com')->>'employee_id', 'WALKIN-2', 'second walk-in id');
select is(add_walk_in('00000000-0000-4000-8000-0000000000aa', ' ', 'Outlet A', null, null, 'admin@example.com')->>'status', 'INVALID', 'name required');
select is((select is_walk_in from guests where employee_id = 'WALKIN-2'), true, 'walk-in flag set');

-- update guest
select is(admin_update_guest('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000001', '{"full_name":"Guest Uno","active":false}'::jsonb, 'admin@example.com')->>'status', 'OK', 'update');
select is((select full_name from guests where employee_id = 'E1'), 'Guest Uno', 'name changed');
select is((select active from guests where employee_id = 'E1'), false, 'deactivated');
select is((select phone from guests where employee_id = 'E1'), '+6281234567890', 'untouched fields stay');
select is(admin_update_guest('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000001', '{"phone":null}'::jsonb, 'admin@example.com')->>'status', 'OK', 'clear phone');
select is((select phone from guests where employee_id = 'E1'), null, 'phone cleared');
select is(admin_update_guest('00000000-0000-4000-8000-0000000000aa', gen_random_uuid(), '{"full_name":"X"}'::jsonb, 'admin@example.com')->>'status', 'NOT_FOUND', 'unknown guest');
select is((select count(*)::int from audit_log where action = 'guest_updated' and details::text like '%Guest Uno%'), 0, 'personal data is not copied into the audit log');
update guests set active = true where employee_id = 'E1';

-- counts and list
select check_in('00000000-0000-4000-8000-0000000000aa', null, '00000000-0000-4000-8000-000000000001', 'manual', 'Meja 1', 'checkin');
select redeem_merchandise('00000000-0000-4000-8000-0000000000aa', (select merch_token from guests where employee_id = 'E1'), null, 'Booth 1', 'merchandise');
select is(event_counts('00000000-0000-4000-8000-0000000000aa')->>'checked_in', '1', 'counts: checked in');
select is(event_counts('00000000-0000-4000-8000-0000000000aa')->>'redeemed', '1', 'counts: redeemed');
select is(event_counts('00000000-0000-4000-8000-0000000000aa')->>'total', '4', 'counts: active guests');
select is(event_counts('00000000-0000-4000-8000-0000000000aa')->>'mode', 'rehearsal', 'counts: mode');
select is(jsonb_array_length(admin_guest_list('00000000-0000-4000-8000-0000000000aa', null, null)->'guests'), 4, 'list: all guests');
select is(jsonb_array_length(admin_guest_list('00000000-0000-4000-8000-0000000000aa', 'walk', null)->'guests'), 2, 'list: search');
select is(jsonb_array_length(admin_guest_list('00000000-0000-4000-8000-0000000000aa', null, 'Outlet B')->'guests'), 1, 'list: outlet filter');
select is(admin_guest_list('00000000-0000-4000-8000-0000000000aa', 'E1', null)->'guests'->0->>'merch', 'redeemed', 'list: merchandise state');
select is(admin_guest_list('00000000-0000-4000-8000-0000000000aa', 'E1', null)->'guests'->0->>'prize_number', '1', 'list: prize number');

-- rehearsal reset keeps people, clears activity
create temp table tok as select employee_id, invite_token, merch_token from guests;
update guests set rsvp_status = 'yes' where employee_id = 'E1';
select is(reset_rehearsal_data('00000000-0000-4000-8000-0000000000aa', 'admin@example.com')->>'status', 'OK', 'reset in rehearsal');
select is((select count(*)::int from check_ins), 0, 'check-ins cleared');
select is((select count(*)::int from merchandise_redemptions), 0, 'redemptions cleared');
select is((select next_prize_number from events where id = '00000000-0000-4000-8000-0000000000aa'), 1, 'counter reset');
select is((select count(*)::int from guests g join tok t using (employee_id, invite_token, merch_token)), 4, 'guests and tokens kept');
select is((select rsvp_status from guests where employee_id = 'E1'), 'yes', 'RSVPs kept');
select is((select count(*)::int from station_pins), 1, 'PINs kept');
select is((select count(*)::int from audit_log), 1, 'audit log holds only the reset entry');

-- go live is one-way and locks the reset
select is(go_live('00000000-0000-4000-8000-0000000000aa', 'admin@example.com')->>'status', 'OK', 'go live');
select is((select mode from events where id = '00000000-0000-4000-8000-0000000000aa'), 'live', 'mode is live');
select is(go_live('00000000-0000-4000-8000-0000000000aa', 'admin@example.com')->>'status', 'NOT_REHEARSAL', 'go live twice is refused');
select is(reset_rehearsal_data('00000000-0000-4000-8000-0000000000aa', 'admin@example.com')->>'status', 'NOT_REHEARSAL', 'reset is refused when live');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:db`
Expected: FAIL (`function set_station_pin(...) does not exist`).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261101000006_admin_functions.sql`:
```sql
create function public.set_station_pin(p_event uuid, p_role text, p_pin text, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if p_role not in ('checkin', 'merchandise', 'draw', 'prizes') then
    return jsonb_build_object('status', 'INVALID_ROLE');
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
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

create function public.set_station_active(p_event uuid, p_role text, p_active boolean, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  update public.station_pins set active = p_active, session_version = session_version + 1, updated_at = now()
   where event_id = p_event and role = p_role;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  perform public.audit(p_event, 'admin', p_actor, 'set_pin_active', 'station_pin', p_role, jsonb_build_object('active', p_active));
  return jsonb_build_object('status', 'OK');
end $$;

create function public.set_station_labels(p_event uuid, p_labels jsonb, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if jsonb_typeof(p_labels) is distinct from 'array' then
    return jsonb_build_object('status', 'INVALID');
  end if;
  if jsonb_array_length(p_labels) not between 1 and 20
     or exists (select 1 from jsonb_array_elements(p_labels) l
                 where jsonb_typeof(l) <> 'string' or length(trim(l #>> '{}')) not between 1 and 30)
     or (select count(distinct trim(l #>> '{}')) from jsonb_array_elements(p_labels) l) <> jsonb_array_length(p_labels) then
    return jsonb_build_object('status', 'INVALID');
  end if;
  update public.events
     set config = jsonb_set(config, '{station_labels}',
           (select jsonb_agg(trim(l #>> '{}') order by ord) from jsonb_array_elements(p_labels) with ordinality as t(l, ord)))
   where id = p_event;
  perform public.audit(p_event, 'admin', p_actor, 'set_station_labels', 'event', p_event::text, '{}'::jsonb);
  return jsonb_build_object('status', 'OK');
end $$;

create function public.add_walk_in(
  p_event uuid, p_full_name text, p_outlet text, p_department text, p_position text, p_actor text
) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_n int;
  g public.guests%rowtype;
begin
  if trim(coalesce(p_full_name, '')) = '' or trim(coalesce(p_outlet, '')) = '' then
    return jsonb_build_object('status', 'INVALID');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('walkin:' || p_event::text, 0));
  select coalesce(max(substring(employee_id from 8)::int), 0) + 1 into v_n
    from public.guests where event_id = p_event and employee_id ~ '^WALKIN-[0-9]+$';
  insert into public.guests (event_id, employee_id, full_name, outlet, department, position, is_walk_in)
  values (p_event, 'WALKIN-' || v_n, trim(p_full_name), trim(p_outlet),
          nullif(trim(coalesce(p_department, '')), ''), nullif(trim(coalesce(p_position, '')), ''), true)
  returning * into g;
  perform public.audit(p_event, 'admin', p_actor, 'walk_in_added', 'guest', g.id::text, '{}'::jsonb);
  return jsonb_build_object('status', 'OK', 'guest_id', g.id, 'employee_id', g.employee_id, 'invite_token', g.invite_token);
end $$;

create function public.admin_update_guest(p_event uuid, p_guest_id uuid, p_changes jsonb, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  update public.guests set
    full_name  = coalesce(nullif(trim(p_changes->>'full_name'), ''), full_name),
    outlet     = coalesce(nullif(trim(p_changes->>'outlet'), ''), outlet),
    department = case when jsonb_exists(p_changes, 'department') then nullif(trim(p_changes->>'department'), '') else department end,
    position   = case when jsonb_exists(p_changes, 'position') then nullif(trim(p_changes->>'position'), '') else position end,
    phone      = case when jsonb_exists(p_changes, 'phone') then nullif(trim(p_changes->>'phone'), '') else phone end,
    active     = case when jsonb_exists(p_changes, 'active') then (p_changes->>'active')::boolean else active end
   where id = p_guest_id and event_id = p_event;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  perform public.audit(p_event, 'admin', p_actor, 'guest_updated', 'guest', p_guest_id::text,
                       jsonb_build_object('fields', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(p_changes) k)));
  return jsonb_build_object('status', 'OK');
end $$;

create function public.event_counts(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object(
    'total',        count(*) filter (where g.active),
    'checked_in',   (select count(*) from public.check_ins c where c.event_id = p_event),
    'redeemed',     (select count(*) from public.merchandise_redemptions m where m.event_id = p_event and m.status = 'redeemed'),
    'rsvp_yes',     count(*) filter (where g.active and g.rsvp_status = 'yes'),
    'rsvp_no',      count(*) filter (where g.active and g.rsvp_status = 'no'),
    'rsvp_pending', count(*) filter (where g.active and g.rsvp_status = 'pending'),
    'opened',       count(*) filter (where g.active and g.first_opened_at is not null),
    'mode',         (select e.mode from public.events e where e.id = p_event))
  from public.guests g where g.event_id = p_event
$$;

create function public.admin_guest_list(p_event uuid, p_q text, p_outlet text) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object('status', 'OK', 'guests', coalesce(jsonb_agg(x order by x->>'full_name'), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'id', g.id, 'employee_id', g.employee_id, 'full_name', g.full_name, 'outlet', g.outlet,
      'department', g.department, 'position', g.position, 'phone', g.phone, 'rsvp_status', g.rsvp_status,
      'opened', g.first_opened_at is not null, 'active', g.active, 'flagged_missing', g.flagged_missing,
      'is_walk_in', g.is_walk_in, 'checked_in_at', c.checked_in_at, 'prize_number', c.prize_number,
      'merch', case when m.id is not null then 'redeemed' else 'none' end) as x
    from public.guests g
    left join public.check_ins c on c.guest_id = g.id
    left join public.merchandise_redemptions m on m.guest_id = g.id and m.status = 'redeemed'
    where g.event_id = p_event
      and (p_outlet is null or p_outlet = '' or g.outlet = p_outlet)
      and (coalesce(trim(p_q), '') = ''
           or position(lower(trim(p_q)) in lower(g.full_name)) > 0
           or position(lower(trim(p_q)) in lower(g.employee_id)) > 0)
    order by g.full_name
    limit 500
  ) s
$$;

create function public.go_live(p_event uuid, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  update public.events set mode = 'live' where id = p_event and mode = 'rehearsal';
  if not found then
    return jsonb_build_object('status', 'NOT_REHEARSAL');
  end if;
  perform public.audit(p_event, 'admin', p_actor, 'go_live', 'event', p_event::text, '{}'::jsonb);
  return jsonb_build_object('status', 'OK');
end $$;

-- Plan 2 replaces this function (create or replace) to also clear draws and reset the stage.
create function public.reset_rehearsal_data(p_event uuid, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not exists (select 1 from public.events where id = p_event and mode = 'rehearsal') then
    return jsonb_build_object('status', 'NOT_REHEARSAL');
  end if;
  delete from public.merchandise_redemptions where event_id = p_event;
  delete from public.check_ins where event_id = p_event;
  delete from public.attempt_log where event_id = p_event;
  delete from public.auth_attempts;
  delete from public.audit_log where event_id = p_event;
  update public.events set next_prize_number = 1 where id = p_event;
  perform public.audit(p_event, 'admin', p_actor, 'rehearsal_reset', 'event', p_event::text, '{}'::jsonb);
  return jsonb_build_object('status', 'OK');
end $$;

select public.lock_down_public();
```

- [ ] **Step 4: Apply and run the tests**

Run: `npm run db:reset && npm run test:db`
Expected: all six database test files pass.

- [ ] **Step 5: Commit**

```bash
git add supabase
git commit -m "feat(db): PIN management, walk-ins, counts, guest list, go-live and rehearsal reset"
```

---

## Task 8: Pure libraries — strings, QR codes, phones, CSV, time, result panels

**Files:**
- Create: `src/lib/i18n/strings.ts`, `src/lib/qr.ts`, `src/lib/qr-svg.ts`, `src/lib/phone.ts`, `src/lib/csv.ts`, `src/lib/time.ts`, `src/lib/result-panel.ts`
- Test: `tests/unit/strings.test.ts`, `tests/unit/qr.test.ts`, `tests/unit/phone.test.ts`, `tests/unit/csv.test.ts`, `tests/unit/time.test.ts`, `tests/unit/result-panel.test.ts`

**Interfaces:**
- Produces:
  - `strings.ts`: `type Lang = 'id' | 'en'`; `type StringKey`; `STRINGS: Record<Lang, Record<StringKey, string>>`; `translate(lang: Lang, key: StringKey, vars?: Record<string, string | number>): string`
  - `qr.ts`: `PREFIX = { checkin: 'NF:CI:', merch: 'NF:MR:' }`; `type ParsedCode = { kind: 'checkin' | 'merch'; token: string } | { kind: 'unknown' }`; `parseCode(raw: string): ParsedCode`; `payloadFor(kind: 'checkin' | 'merch', token: string): string`; `isToken(s: string): boolean` (22 URL-safe characters)
  - `qr-svg.ts`: `qrPath(payload: string, quiet?: number): { size: number; modules: number; d: string }` (`size` = modules + 2 × quiet; default quiet zone 4)
  - `phone.ts`: `normalisePhone(raw: string | null | undefined): { ok: true; value: string | null } | { ok: false }`
  - `csv.ts`: `type GuestRow`, `type RowError = { row: number; field: string; code: string }`, `parseGuestCsv(text: string): { rows: GuestRow[]; errors: RowError[]; missingColumns: string[] }`, `csvSafe(cell: string): string`
  - `time.ts`: `formatTimeWita(iso: string): string` (24-hour `HH:mm`), `formatDateLong(date: string, lang: Lang): string`
  - `result-panel.ts`: `type Context = 'checkin' | 'merchandise'`; `type Panel = { tone: 'green' | 'pink' | 'gold' | 'neutral'; icon: 'check' | 'alert' | 'cross' | 'swap' | 'refresh' | 'none'; titleKey: StringKey; vibrate: number[] }`; `panelFor(context: Context, status: string): Panel`

- [ ] **Step 1: Write the failing tests**

`tests/unit/strings.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { STRINGS, translate, type StringKey } from '@/lib/i18n/strings';

const keys = Object.keys(STRINGS.id) as StringKey[];
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('strings', () => {
  it('has the same keys in both languages', () => {
    expect(Object.keys(STRINGS.en).sort()).toEqual([...keys].sort());
  });
  it('has no empty strings', () => {
    for (const k of keys) {
      expect(STRINGS.id[k].trim(), `id ${k}`).not.toBe('');
      expect(STRINGS.en[k].trim(), `en ${k}`).not.toBe('');
    }
  });
  it('uses the same placeholders in both languages', () => {
    for (const k of keys) expect(placeholders(STRINGS.en[k]), k).toEqual(placeholders(STRINGS.id[k]));
  });
  it('fills placeholders', () => {
    expect(translate('id', 'pass.checked_in_at', { time: '17:42' })).toBe('CHECK-IN 17:42');
    expect(translate('en', 'pass.checked_in_at', { time: '17:42' })).toBe('CHECKED IN 17:42');
  });
});
```

`tests/unit/qr.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseCode, payloadFor, isToken, PREFIX } from '@/lib/qr';
import { qrPath } from '@/lib/qr-svg';

const TOKEN = 'AbCdEfGhIjKlMnOpQrSt_-';

describe('parseCode', () => {
  it('reads a check-in code', () => {
    expect(parseCode(PREFIX.checkin + TOKEN)).toEqual({ kind: 'checkin', token: TOKEN });
  });
  it('reads a merchandise code and tolerates surrounding whitespace', () => {
    expect(parseCode(`  ${PREFIX.merch}${TOKEN}\n`)).toEqual({ kind: 'merch', token: TOKEN });
  });
  it.each(['', 'hello', TOKEN, 'NF:CI:short', 'NF:XX:' + TOKEN, 'NF:CI:' + TOKEN + 'x', 'NF:CI:' + TOKEN.replace('_', '!')])(
    'rejects %j',
    (raw) => expect(parseCode(raw)).toEqual({ kind: 'unknown' }),
  );
  it('round-trips payloadFor', () => {
    expect(parseCode(payloadFor('merch', TOKEN))).toEqual({ kind: 'merch', token: TOKEN });
  });
  it('isToken checks length and alphabet', () => {
    expect(isToken(TOKEN)).toBe(true);
    expect(isToken(TOKEN.slice(1))).toBe(false);
  });
});

describe('qrPath', () => {
  const { size, modules, d } = qrPath(payloadFor('checkin', TOKEN));
  it('uses a version 3 symbol for a 28-character payload at level M', () => {
    expect(modules).toBe(29);
  });
  it('adds a quiet zone of 4 modules on every side', () => {
    expect(size).toBe(modules + 8);
    expect(qrPath(payloadFor('checkin', TOKEN), 6).size).toBe(modules + 12);
  });
  it('draws dark modules only inside the symbol', () => {
    const coords = [...d.matchAll(/M(\d+) (\d+)h(\d+)v1/g)].map((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
    expect(coords.length).toBeGreaterThan(50);
    for (const [x, y, run] of coords) {
      expect(x).toBeGreaterThanOrEqual(4);
      expect(y).toBeGreaterThanOrEqual(4);
      expect(x + run).toBeLessThanOrEqual(modules + 4);
      expect(y).toBeLessThan(modules + 4);
    }
  });
  it('is deterministic', () => {
    expect(qrPath(payloadFor('checkin', TOKEN)).d).toBe(d);
  });
});
```

`tests/unit/phone.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { normalisePhone } from '@/lib/phone';

describe('normalisePhone', () => {
  it.each([
    ['0812-3456-7890', '+6281234567890'],
    ['+62 812 3456 7890', '+6281234567890'],
    ['6281234567890', '+6281234567890'],
    ['81234567890', '+6281234567890'],
    ['(0361) 123456', '+62361123456'],
    ['  0812 3456 789  ', '+628123456789'],
  ])('normalises %j', (raw, expected) => {
    expect(normalisePhone(raw)).toEqual({ ok: true, value: expected });
  });
  it.each([[''], ['   '], [null], [undefined]])('treats %j as no phone', (raw) => {
    expect(normalisePhone(raw)).toEqual({ ok: true, value: null });
  });
  it.each([['abc'], ['+1 415 555 2671'], ['08'], ['+8123456789'], ['0812345678901234567']])('rejects %j', (raw) => {
    expect(normalisePhone(raw)).toEqual({ ok: false });
  });
});
```

`tests/unit/csv.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseGuestCsv, csvSafe } from '@/lib/csv';

describe('parseGuestCsv', () => {
  it('maps aliased headers, trims, strips a BOM and numbers rows from the file line', () => {
    const text = '﻿NIK,Nama,Outlet,Jabatan,No HP\n 00123 , Kadek Ayu ,Outlet A,Server,0812-3456-7890\nE2,Made,Outlet B,,\n';
    const r = parseGuestCsv(text);
    expect(r.missingColumns).toEqual([]);
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { row_no: 2, employee_id: '00123', full_name: 'Kadek Ayu', outlet: 'Outlet A', position: 'Server', phone: '+6281234567890' },
      { row_no: 3, employee_id: 'E2', full_name: 'Made', outlet: 'Outlet B' },
    ]);
  });
  it('keeps leading zeros in employee ids', () => {
    expect(parseGuestCsv('employee_id,full_name,outlet\n007,A,B').rows[0].employee_id).toBe('007');
  });
  it('reports missing required columns', () => {
    expect(parseGuestCsv('employee_id,full_name\nE1,A').missingColumns).toEqual(['outlet']);
  });
  it('reports an invalid phone but keeps the row', () => {
    const r = parseGuestCsv('employee_id,full_name,outlet,phone\nE1,A,B,abc');
    expect(r.errors).toEqual([{ row: 2, field: 'phone', code: 'INVALID_PHONE' }]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].phone).toBeUndefined();
  });
  it('skips blank lines', () => {
    expect(parseGuestCsv('employee_id,full_name,outlet\n\nE1,A,B\n\n').rows).toHaveLength(1);
  });
  it('returns no rows for an empty file', () => {
    expect(parseGuestCsv('').rows).toEqual([]);
  });
});

describe('csvSafe', () => {
  it.each([['=SUM(A1)', "'=SUM(A1)"], ['+1', "'+1"], ['-1', "'-1"], ['@cmd', "'@cmd"], ['plain', 'plain'], ['', '']])(
    'neutralises formula starts: %j',
    (cell, expected) => expect(csvSafe(cell)).toBe(expected),
  );
});
```

`tests/unit/time.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { formatTimeWita, formatDateLong } from '@/lib/time';

describe('time', () => {
  it('shows WITA (UTC+8) in 24-hour format', () => {
    expect(formatTimeWita('2026-12-10T09:42:00Z')).toBe('17:42');
    expect(formatTimeWita('2026-12-10T16:05:00Z')).toBe('00:05');
  });
  it('formats the event date in both languages', () => {
    expect(formatDateLong('2026-12-10', 'id')).toMatch(/Kamis,? 10 Desember 2026/);
    expect(formatDateLong('2026-12-10', 'en')).toMatch(/Thursday,? 10 December 2026/);
  });
});
```

`tests/unit/result-panel.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { panelFor } from '@/lib/result-panel';
import { STRINGS } from '@/lib/i18n/strings';

describe('panelFor', () => {
  it('maps check-in outcomes to the colours in the Design Guide', () => {
    expect(panelFor('checkin', 'CHECKED_IN')).toMatchObject({ tone: 'green', icon: 'check', titleKey: 'staff.success' });
    expect(panelFor('checkin', 'ALREADY_CHECKED_IN')).toMatchObject({ tone: 'pink', icon: 'alert', titleKey: 'staff.already' });
    expect(panelFor('checkin', 'WRONG_CODE_TYPE')).toMatchObject({ tone: 'gold', icon: 'swap', titleKey: 'staff.wrong_checkin' });
    expect(panelFor('checkin', 'INVALID')).toMatchObject({ tone: 'pink', icon: 'cross' });
  });
  it('maps merchandise outcomes', () => {
    expect(panelFor('merchandise', 'READY')).toMatchObject({ tone: 'neutral', titleKey: 'merch.ready' });
    expect(panelFor('merchandise', 'REDEEMED')).toMatchObject({ tone: 'green', titleKey: 'merch.recorded' });
    expect(panelFor('merchandise', 'ALREADY_REDEEMED')).toMatchObject({ tone: 'pink', titleKey: 'merch.claimed' });
    expect(panelFor('merchandise', 'NOT_CHECKED_IN')).toMatchObject({ tone: 'pink', titleKey: 'merch.not_checked_in' });
    expect(panelFor('merchandise', 'WRONG_CODE_TYPE')).toMatchObject({ tone: 'gold', titleKey: 'staff.wrong_merch' });
  });
  it('treats unknown statuses as a retryable error', () => {
    expect(panelFor('checkin', 'SOMETHING_NEW')).toMatchObject({ tone: 'gold', icon: 'refresh', titleKey: 'staff.retry' });
  });
  it('only uses title keys that exist', () => {
    for (const ctx of ['checkin', 'merchandise'] as const) {
      for (const s of ['CHECKED_IN', 'ALREADY_CHECKED_IN', 'READY', 'REDEEMED', 'ALREADY_REDEEMED', 'NOT_CHECKED_IN', 'INVALID', 'WRONG_CODE_TYPE', 'NOT_ELIGIBLE', 'RETRYABLE_ERROR']) {
        expect(STRINGS.id[panelFor(ctx, s).titleKey]).toBeTruthy();
      }
    }
  });
});
```
- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL — every test file errors with `Failed to resolve import "@/lib/..."`.

- [ ] **Step 3: Implement `src/lib/i18n/strings.ts`**

```ts
export type Lang = 'id' | 'en';

const id = {
  'brand.tagline': 'MOVE IN UNITY.',
  'brand.tagline2': 'Together, We Make a Difference',
  'common.retry_hint': 'Koneksi bermasalah. Coba lagi.',
  'common.logout': 'KELUAR',

  'pass.greeting': 'HALO,',
  'pass.checkin_label': 'PASS CHECK-IN',
  'pass.show_qr': 'Tunjukkan QR ini di meja check-in',
  'pass.brightness': 'Naikkan kecerahan layar agar mudah dipindai',
  'pass.checked_in_at': 'CHECK-IN {time}',
  'pass.prize_number': 'NOMOR DOOR PRIZE',
  'pass.prize_hint': 'Tunjukkan nomor ini ke panitia saat dipanggil',
  'pass.save': 'SIMPAN SEBAGAI GAMBAR',
  'pass.invalid_title': 'LINK TIDAK DIKENAL',
  'pass.invalid_body': 'Link ini tidak valid. Hubungi panitia (HR) untuk link baru.',
  'pass.rate_limited': 'Terlalu banyak percobaan. Coba lagi sebentar lagi.',

  'rsvp.title': 'KONFIRMASI KEHADIRAN',
  'rsvp.yes': 'AKU IKUT',
  'rsvp.no': 'TIDAK BISA',
  'rsvp.thanks_yes': 'Sip, sampai ketemu 10 Desember!',
  'rsvp.thanks_no': 'Terima kasih sudah memberi kabar',
  'rsvp.change': 'Ubah jawaban',
  'rsvp.error': 'Gagal menyimpan. Coba lagi.',

  'merch.banner': 'MERCHANDISE',
  'merch.once': '1X PER ORANG',
  'merch.show': 'Tunjukkan QR ini di booth merchandise',
  'merch.warn': 'Bukan QR check-in. Jangan dibagikan',
  'merch.claimed': 'SUDAH DIAMBIL',
  'merch.claimed_at': 'Diambil pukul {time}',
  'merch.ready': 'SIAP DISERAHKAN',
  'merch.handover': 'SERAHKAN MERCHANDISE',
  'merch.recorded': 'TERCATAT',
  'merch.not_checked_in': 'BELUM CHECK-IN',
  'merch.already_detail': 'Sudah diambil {time} di {station}',

  'staff.success': 'CHECK-IN BERHASIL',
  'staff.already': 'SUDAH CHECK-IN',
  'staff.no_new_number': 'Tidak ada nomor baru dibuat',
  'staff.first_checkin': 'Check-in pertama {time} di {station}. Tidak ada nomor baru dibuat.',
  'staff.invalid': 'QR TIDAK DIKENAL',
  'staff.wrong_checkin': 'BUKAN QR CHECK-IN',
  'staff.wrong_merch': 'BUKAN QR MERCHANDISE',
  'staff.not_eligible': 'TIDAK TERDAFTAR',
  'staff.retry': 'KONEKSI BERMASALAH, COBA LAGI',
  'staff.next': 'SCAN BERIKUTNYA',
  'staff.tab_scan': 'SCAN',
  'staff.manual': 'CARI MANUAL',
  'staff.prize_label': 'NOMOR DOOR PRIZE (TETAP)',
  'staff.camera_title': 'Izinkan kamera',
  'staff.camera_body': 'Kamera hanya dipakai untuk memindai QR tamu.',
  'staff.camera_start': 'AKTIFKAN KAMERA',
  'staff.camera_denied': 'Kamera tidak diizinkan. Pakai Cari Manual.',
  'staff.search_placeholder': 'Cari nama atau ID karyawan',
  'staff.search_empty': 'Tidak ada hasil',
  'staff.already_in': 'sudah check-in',

  'login.title': 'MASUK STAF',
  'login.pin': 'PIN 6 digit',
  'login.submit': 'MASUK',
  'login.invalid': 'PIN salah',
  'login.locked': 'Terlalu banyak percobaan. Tunggu 5 menit.',
  'login.pick_station': 'Pilih meja / booth',
  'login.continue': 'LANJUT',
  'login.coming_soon': 'Layar ini belum tersedia.',
} as const;

export type StringKey = keyof typeof id;

const en: Record<StringKey, string> = {
  'brand.tagline': 'MOVE IN UNITY.',
  'brand.tagline2': 'Together, We Make a Difference',
  'common.retry_hint': 'Connection problem. Try again.',
  'common.logout': 'LOG OUT',

  'pass.greeting': 'HELLO,',
  'pass.checkin_label': 'CHECK-IN PASS',
  'pass.show_qr': 'Show this QR at the check-in desk',
  'pass.brightness': 'Turn up your screen brightness so it scans easily',
  'pass.checked_in_at': 'CHECKED IN {time}',
  'pass.prize_number': 'DOOR PRIZE NUMBER',
  'pass.prize_hint': "Show this number to the committee when it's called",
  'pass.save': 'SAVE AS IMAGE',
  'pass.invalid_title': 'LINK NOT RECOGNISED',
  'pass.invalid_body': "This link isn't valid. Contact the committee (HR) for a new link.",
  'pass.rate_limited': 'Too many attempts. Please try again in a moment.',

  'rsvp.title': 'RSVP',
  'rsvp.yes': "I'M IN",
  'rsvp.no': "CAN'T MAKE IT",
  'rsvp.thanks_yes': "You're in. See you on 10 December!",
  'rsvp.thanks_no': 'Thanks for letting us know',
  'rsvp.change': 'Change answer',
  'rsvp.error': "Couldn't save. Try again.",

  'merch.banner': 'MERCHANDISE',
  'merch.once': '1 PER PERSON',
  'merch.show': 'Show this QR at the merchandise booth',
  'merch.warn': "Not the check-in QR. Don't share it",
  'merch.claimed': 'CLAIMED',
  'merch.claimed_at': 'Collected at {time}',
  'merch.ready': 'READY TO HAND OVER',
  'merch.handover': 'HAND OVER MERCHANDISE',
  'merch.recorded': 'RECORDED',
  'merch.not_checked_in': 'NOT CHECKED IN',
  'merch.already_detail': 'Collected {time} at {station}',

  'staff.success': 'CHECKED IN',
  'staff.already': 'ALREADY CHECKED IN',
  'staff.no_new_number': 'No new number was created',
  'staff.first_checkin': 'First check-in {time} at {station}. No new number was created.',
  'staff.invalid': 'QR NOT RECOGNISED',
  'staff.wrong_checkin': 'NOT A CHECK-IN QR',
  'staff.wrong_merch': 'NOT A MERCHANDISE QR',
  'staff.not_eligible': 'NOT ELIGIBLE',
  'staff.retry': 'CONNECTION PROBLEM, TRY AGAIN',
  'staff.next': 'SCAN NEXT',
  'staff.tab_scan': 'SCAN',
  'staff.manual': 'MANUAL SEARCH',
  'staff.prize_label': 'DOOR PRIZE NUMBER (FIXED)',
  'staff.camera_title': 'Allow the camera',
  'staff.camera_body': 'The camera is only used to scan guest QR codes.',
  'staff.camera_start': 'START CAMERA',
  'staff.camera_denied': 'Camera not allowed. Use Manual Search.',
  'staff.search_placeholder': 'Search name or employee ID',
  'staff.search_empty': 'No results',
  'staff.already_in': 'already checked in',

  'login.title': 'STAFF LOGIN',
  'login.pin': '6-digit PIN',
  'login.submit': 'LOG IN',
  'login.invalid': 'Wrong PIN',
  'login.locked': 'Too many attempts. Wait 5 minutes.',
  'login.pick_station': 'Choose your desk / booth',
  'login.continue': 'CONTINUE',
  'login.coming_soon': "This screen isn't available yet.",
};

export const STRINGS: Record<Lang, Record<StringKey, string>> = { id, en };

export function translate(lang: Lang, key: StringKey, vars?: Record<string, string | number>): string {
  let s = STRINGS[lang][key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
```

- [ ] **Step 4: Implement `src/lib/qr.ts` and `src/lib/qr-svg.ts`**

`src/lib/qr.ts`:
```ts
export const PREFIX = { checkin: 'NF:CI:', merch: 'NF:MR:' } as const;
const TOKEN = /^[A-Za-z0-9_-]{22}$/;

export type ParsedCode = { kind: 'checkin' | 'merch'; token: string } | { kind: 'unknown' };

export const isToken = (s: string): boolean => TOKEN.test(s);

export function parseCode(raw: string): ParsedCode {
  const s = raw.trim();
  for (const kind of ['checkin', 'merch'] as const) {
    const prefix = PREFIX[kind];
    if (s.startsWith(prefix)) {
      const token = s.slice(prefix.length);
      return isToken(token) ? { kind, token } : { kind: 'unknown' };
    }
  }
  return { kind: 'unknown' };
}

export const payloadFor = (kind: 'checkin' | 'merch', token: string): string => PREFIX[kind] + token;
```

`src/lib/qr-svg.ts`:
```ts
import QRCode from 'qrcode';

export const QUIET_ZONE = 4;

/** One SVG path of 1×1 module runs, offset by the quiet zone. Error correction M, no logo. */
export function qrPath(payload: string, quiet: number = QUIET_ZONE): { size: number; modules: number; d: string } {
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const data = qr.modules.data;
  let d = '';
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      if (data[y * n + x]) {
        let run = 1;
        while (x + run < n && data[y * n + x + run]) run++;
        d += `M${x + quiet} ${y + quiet}h${run}v1h-${run}z`;
        x += run;
      } else {
        x++;
      }
    }
  }
  return { size: n + quiet * 2, modules: n, d };
}
```

- [ ] **Step 5: Implement `src/lib/phone.ts`, `src/lib/csv.ts`, `src/lib/time.ts`**

`src/lib/phone.ts`:
```ts
export type PhoneResult = { ok: true; value: string | null } | { ok: false };

/** Normalises Indonesian numbers to +62…; blank means "no phone". */
export function normalisePhone(raw: string | null | undefined): PhoneResult {
  const s = (raw ?? '').trim();
  if (s === '') return { ok: true, value: null };
  let d = s.replace(/[^\d+]/g, '');
  const plus = d.startsWith('+');
  d = d.replace(/\+/g, '');
  if (d.startsWith('62')) {
    // already international
  } else if (d.startsWith('0')) {
    d = '62' + d.slice(1);
  } else if (d.startsWith('8') && !plus) {
    d = '62' + d;
  }
  const out = '+' + d;
  return /^\+62\d{8,12}$/.test(out) ? { ok: true, value: out } : { ok: false };
}
```

`src/lib/csv.ts`:
```ts
import Papa from 'papaparse';
import { normalisePhone } from './phone';

export type GuestRow = {
  row_no: number;
  employee_id: string;
  full_name: string;
  outlet: string;
  department?: string;
  position?: string;
  phone?: string;
  category?: string;
};
export type RowError = { row: number; field: string; code: string };

type Field = 'employee_id' | 'full_name' | 'outlet' | 'department' | 'position' | 'phone' | 'category';
const REQUIRED: Field[] = ['employee_id', 'full_name', 'outlet'];

const norm = (h: string) => h.replace(/^﻿/, '').trim().toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ');
const ALIASES: Record<string, Field> = {
  'employee id': 'employee_id', employeeid: 'employee_id', nik: 'employee_id', id: 'employee_id',
  'full name': 'full_name', name: 'full_name', nama: 'full_name', 'nama lengkap': 'full_name',
  outlet: 'outlet', unit: 'outlet',
  department: 'department', dept: 'department', departemen: 'department',
  position: 'position', jabatan: 'position',
  phone: 'phone', hp: 'phone', 'no hp': 'phone', whatsapp: 'phone', wa: 'phone', 'phone number': 'phone',
  category: 'category', kategori: 'category',
};
const canonical = (h: string): string => ALIASES[norm(h)] ?? norm(h).replace(/ /g, '_');

export function parseGuestCsv(text: string): { rows: GuestRow[]; errors: RowError[]; missingColumns: string[] } {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: canonical,
  });
  const fields = parsed.meta.fields ?? [];
  const missingColumns = REQUIRED.filter((f) => !fields.includes(f));
  const errors: RowError[] = [];
  const rows: GuestRow[] = [];

  parsed.data.forEach((raw, i) => {
    const line = i + 2; // header is line 1
    const get = (f: Field) => (raw[f] ?? '').toString().trim();
    const row: GuestRow = { row_no: line, employee_id: get('employee_id'), full_name: get('full_name'), outlet: get('outlet') };
    for (const f of ['department', 'position', 'category'] as const) if (get(f)) row[f] = get(f);
    const phone = normalisePhone(get('phone'));
    if (!phone.ok) errors.push({ row: line, field: 'phone', code: 'INVALID_PHONE' });
    else if (phone.value) row.phone = phone.value;
    rows.push(row);
  });

  for (const e of parsed.errors) {
    if (typeof e.row === 'number') errors.push({ row: e.row + 2, field: '', code: 'MALFORMED_ROW' });
  }
  return { rows, errors, missingColumns };
}

/** Neutralise spreadsheet formulas in exported text cells. */
export function csvSafe(cell: string): string {
  return /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
}
```

`src/lib/time.ts`:
```ts
import type { Lang } from './i18n/strings';

const TZ = 'Asia/Makassar'; // WITA, UTC+8

export function formatTimeWita(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

export function formatDateLong(date: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-GB', {
    timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(date));
}
```

- [ ] **Step 6: Implement `src/lib/result-panel.ts`**

```ts
import type { StringKey } from './i18n/strings';

export type Context = 'checkin' | 'merchandise';
export type Tone = 'green' | 'pink' | 'gold' | 'neutral';
export type Icon = 'check' | 'alert' | 'cross' | 'swap' | 'refresh' | 'none';
export type Panel = { tone: Tone; icon: Icon; titleKey: StringKey; vibrate: number[] };

const SHORT = [80];
const DOUBLE = [80, 60, 80];
const p = (tone: Tone, icon: Icon, titleKey: StringKey, vibrate: number[]): Panel => ({ tone, icon, titleKey, vibrate });

const RETRY = p('gold', 'refresh', 'staff.retry', []);
const COMMON: Record<string, Panel> = {
  INVALID: p('pink', 'cross', 'staff.invalid', DOUBLE),
  NOT_ELIGIBLE: p('pink', 'cross', 'staff.not_eligible', DOUBLE),
  RETRYABLE_ERROR: RETRY,
};

const TABLE: Record<Context, Record<string, Panel>> = {
  checkin: {
    ...COMMON,
    CHECKED_IN: p('green', 'check', 'staff.success', SHORT),
    ALREADY_CHECKED_IN: p('pink', 'alert', 'staff.already', DOUBLE),
    WRONG_CODE_TYPE: p('gold', 'swap', 'staff.wrong_checkin', DOUBLE),
  },
  merchandise: {
    ...COMMON,
    READY: p('neutral', 'none', 'merch.ready', []),
    REDEEMED: p('green', 'check', 'merch.recorded', SHORT),
    ALREADY_REDEEMED: p('pink', 'alert', 'merch.claimed', DOUBLE),
    NOT_CHECKED_IN: p('pink', 'alert', 'merch.not_checked_in', DOUBLE),
    WRONG_CODE_TYPE: p('gold', 'swap', 'staff.wrong_merch', DOUBLE),
  },
};

export function panelFor(context: Context, status: string): Panel {
  return TABLE[context][status] ?? RETRY;
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm run test:unit`
Expected: all unit tests PASS. If `qrPath` reports a different module count, fix the test expectation only after confirming the payload length is 28 characters (`NF:CI:` + 22).

- [ ] **Step 8: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src tests
git commit -m "feat: pure libraries for strings, QR codes, phones, CSV, time and result panels"
```

---

## Task 9: Server infrastructure and station PIN login

**Files:**
- Create: `src/lib/env.ts`, `src/lib/db.ts`, `src/lib/labels.ts`, `src/lib/api.ts`, `src/lib/session.ts`, `src/lib/admin-auth.ts`, `src/lib/routes.ts`, `src/app/api/station/login/route.ts`, `src/app/api/station/logout/route.ts`, `src/app/api/station/me/route.ts`, `src/app/api/station/select-label/route.ts`
- Test: `tests/unit/api.test.ts`, `tests/api/helpers.ts`, `tests/api/station-auth.test.ts`

**Interfaces:**
- Consumes: SQL functions `verify_pin`, `station_session_valid`, `is_admin`, `log_attempt`, `set_station_pin`, `reset_rehearsal_data`.
- Produces:
  - `env(): Env` (validated, cached). `db(): SupabaseClient` (service role). `rpc<T>(fn: string, args: Record<string, unknown>): Promise<T>` throws `RetryableError` on any database error. `logAttempt(kind, raw, result, actor): Promise<void>`.
  - `api.ts`: `ok(status: string, data?: unknown)`, `fail(http: number, status: string)`, `sameOrigin(req: Request): boolean`, `readJson<S extends ZodTypeAny>(req, schema): Promise<z.infer<S> | null>`, `guard(fn)`, `parseCookies(header: string | null): Record<string, string>`, `ipFromHeader(value: string | null): string`, `clientIp(req: Request): string`.
  - `session.ts`: `type Role = 'checkin' | 'merchandise' | 'draw' | 'prizes'`; `ROLES`; `type StationSession = { role: Role; label: string; v: number }`; `signStation(s): Promise<string>`; `readStation(req): Promise<StationSession | null>` (verifies the signature **and** `station_session_valid`; throws `RetryableError` if the database check fails); `stationCookie(value)`, `deviceCookie(value)`, `STATION_COOKIE = 'nf_station'`, `DEVICE_COOKIE = 'nf_device'`.
  - `admin-auth.ts`: `getAdmin(req: Request): Promise<{ email: string } | null>`.
  - `routes.ts`: `type Actor = { type: 'station'; role: Role; label: string; v: number } | { type: 'admin'; email: string }`; `actorId(a)` (role or email), `actorLabel(a)` (station label or `'admin'`); wrappers `stationPost(roles, schema, fn)`, `stationGet(roles, fn)`, `adminPost(schema, fn)`, `adminGet(fn)` where `fn` receives `{ req, actor, body, params }`. Station routes also accept a signed-in admin.
  - HTTP: `POST /api/station/login {pin}` → `{ok:true,status:'OK',data:{role,labels}}` + cookies, or `status:'INVALID'` (200), or 429 `LOCKED`. `GET /api/station/me` → `{role,label,labels}`. `POST /api/station/select-label {label}`. `POST /api/station/logout`.

- [ ] **Step 1: Write the failing unit test for the API helpers**

`tests/unit/api.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { sameOrigin, parseCookies, ipFromHeader, ok, fail, guard } from '@/lib/api';
import { RetryableError } from '@/lib/db';

const req = (headers: Record<string, string>, url = 'https://nourishfest.example/api/x') => new Request(url, { method: 'POST', headers });

describe('sameOrigin', () => {
  it('accepts a matching Origin', () => expect(sameOrigin(req({ origin: 'https://nourishfest.example' }))).toBe(true));
  it('rejects a different Origin', () => expect(sameOrigin(req({ origin: 'https://evil.example' }))).toBe(false));
  it('rejects a missing Origin', () => expect(sameOrigin(req({}))).toBe(false));
});

describe('parseCookies', () => {
  it('parses and decodes', () => {
    expect(parseCookies('a=1; b=hello%20world; c=')).toEqual({ a: '1', b: 'hello world', c: '' });
  });
  it('handles null and malformed input', () => {
    expect(parseCookies(null)).toEqual({});
    expect(parseCookies('novalue; x=%E0%A4%A')).toEqual({ x: '%E0%A4%A' });
  });
});

describe('ipFromHeader', () => {
  it('takes the first address', () => expect(ipFromHeader('1.2.3.4, 10.0.0.1')).toBe('1.2.3.4'));
  it('falls back to unknown', () => expect(ipFromHeader(null)).toBe('unknown'));
});

describe('responses', () => {
  it('ok() is HTTP 200 with the contract shape and no-store', async () => {
    const res = ok('DONE', { a: 1 });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ ok: true, status: 'DONE', data: { a: 1 } });
  });
  it('fail() carries the HTTP code', async () => {
    const res = fail(403, 'WRONG_ROLE');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, status: 'WRONG_ROLE' });
  });
  it('guard() turns a RetryableError into a 500 RETRYABLE_ERROR', async () => {
    const res = await guard(async () => { throw new RetryableError('boom'); })(new Request('http://x'), undefined);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, status: 'RETRYABLE_ERROR' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/api.test.ts`
Expected: FAIL — cannot resolve `@/lib/api`.

- [ ] **Step 3: Implement `env.ts`, `db.ts`, `api.ts`**

`src/lib/env.ts`:
```ts
import { z } from 'zod';

const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  STATION_SESSION_SECRET: z.string().min(32),
  EVENT_ID: z.string().uuid(),
  APP_URL: z.string().url(),
});
export type Env = z.infer<typeof schema>;

let cached: Env | undefined;
export function env(): Env {
  return (cached ??= schema.parse(process.env));
}
```

`src/lib/db.ts`:
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

let client: SupabaseClient | undefined;
export function db(): SupabaseClient {
  client ??= createClient(env().SUPABASE_URL, env().SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export class RetryableError extends Error {}

/** Calls a SQL function. Business outcomes come back as data; any database error becomes RetryableError. */
export async function rpc<T = Record<string, unknown>>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) {
    console.error('rpc_failed', fn, error.code, error.message.slice(0, 120)); // never log arguments (tokens, PINs)
    throw new RetryableError(fn);
  }
  return data as T;
}

export async function logAttempt(kind: string, raw: string, result: string, actor: string): Promise<void> {
  await rpc('log_attempt', { p_event: env().EVENT_ID, p_kind: kind, p_token: raw, p_result: result, p_actor: actor });
}
```

`src/lib/api.ts`:
```ts
import { NextResponse } from 'next/server';
import type { ZodTypeAny, z } from 'zod';
import { RetryableError } from './db';

const NO_STORE = { 'Cache-Control': 'no-store' };

export function ok(status: string, data: unknown = null): NextResponse {
  return NextResponse.json({ ok: true, status, data }, { status: 200, headers: NO_STORE });
}

export function fail(http: number, status: string): NextResponse {
  return NextResponse.json({ ok: false, status }, { status: http, headers: NO_STORE });
}

export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  return !!origin && origin === new URL(req.url).origin;
}

export async function readJson<S extends ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S> | null> {
  try {
    return schema.parse(await req.json());
  } catch {
    return null;
  }
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    const raw = part.slice(i + 1).trim();
    try {
      out[name] = decodeURIComponent(raw);
    } catch {
      out[name] = raw;
    }
  }
  return out;
}

export function ipFromHeader(value: string | null): string {
  return value ? value.split(',')[0].trim() || 'unknown' : 'unknown';
}
export const clientIp = (req: Request): string => ipFromHeader(req.headers.get('x-forwarded-for'));

type Handler<C> = (req: Request, ctx?: C) => Promise<Response>;

/** Any failure becomes 500 RETRYABLE_ERROR. Retrying is always safe. */
export function guard<C = undefined>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (!(e instanceof RetryableError)) console.error('unhandled', e instanceof Error ? e.message : 'unknown');
      return fail(500, 'RETRYABLE_ERROR');
    }
  };
}
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `npx vitest run tests/unit/api.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `session.ts`, `admin-auth.ts`, `routes.ts`**

`src/lib/session.ts`:
```ts
import { SignJWT, jwtVerify } from 'jose';
import { env } from './env';
import { rpc } from './db';
import { parseCookies } from './api';

export const STATION_COOKIE = 'nf_station';
export const DEVICE_COOKIE = 'nf_device';
export const ROLES = ['checkin', 'merchandise', 'draw', 'prizes'] as const;
export type Role = (typeof ROLES)[number];
export type StationSession = { role: Role; label: string; v: number };

const key = () => new TextEncoder().encode(env().STATION_SESSION_SECRET);
const secure = () => process.env.NODE_ENV === 'production';

export async function signStation(s: StationSession): Promise<string> {
  return new SignJWT({ role: s.role, label: s.label, v: s.v })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('14h')
    .sign(key());
}

export async function readStation(req: Request): Promise<StationSession | null> {
  const token = parseCookies(req.headers.get('cookie'))[STATION_COOKIE];
  if (!token) return null;
  let session: StationSession;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    session = { role: payload.role as Role, label: String(payload.label ?? ''), v: Number(payload.v) };
  } catch {
    return null; // bad signature or expired
  }
  if (!ROLES.includes(session.role)) return null;
  // Database check on every request: rotating or disabling a PIN logs the role out at once.
  // A database failure throws RetryableError so a network blip does not log staff out.
  const valid = await rpc<boolean>('station_session_valid', { p_event: env().EVENT_ID, p_role: session.role, p_version: session.v });
  return valid ? session : null;
}

export const stationCookie = (value: string, maxAge = 14 * 3600) => ({
  name: STATION_COOKIE, value, httpOnly: true, secure: secure(), sameSite: 'lax' as const, path: '/', maxAge,
});
export const deviceCookie = (value: string) => ({
  name: DEVICE_COOKIE, value, httpOnly: true, secure: secure(), sameSite: 'lax' as const, path: '/', maxAge: 365 * 24 * 3600,
});
```

`src/lib/admin-auth.ts`:
```ts
import { createServerClient } from '@supabase/ssr';
import { env } from './env';
import { rpc } from './db';
import { parseCookies } from './api';

/** Verifies the Supabase Auth session with getUser() and the admins allowlist. */
export async function getAdmin(req: Request): Promise<{ email: string } | null> {
  const header = req.headers.get('cookie');
  if (!header || !header.includes('sb-')) return null;
  const jar = parseCookies(header);
  const supabase = createServerClient(env().SUPABASE_URL, env().SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })),
      setAll: () => {}, // refreshed by middleware.ts
    },
  });
  const { data, error } = await supabase.auth.getUser();
  const email = data.user?.email?.toLowerCase();
  if (error || !email) return null;
  const allowed = await rpc<boolean>('is_admin', { p_event: env().EVENT_ID, p_email: email });
  return allowed ? { email } : null;
}
```

`src/lib/routes.ts`:
```ts
import type { ZodTypeAny, z } from 'zod';
import { fail, guard, readJson, sameOrigin } from './api';
import { getAdmin } from './admin-auth';
import { readStation, type Role } from './session';

export type Actor =
  | { type: 'station'; role: Role; label: string; v: number }
  | { type: 'admin'; email: string };
export const actorId = (a: Actor): string => (a.type === 'station' ? a.role : a.email);
export const actorLabel = (a: Actor): string => (a.type === 'station' ? a.label : 'admin');

type Params = Record<string, string>;
type Ctx = { params?: Promise<Params> };
type Args<B> = { req: Request; actor: Actor; body: B; params: Params };

async function authStation(req: Request, roles: readonly Role[]): Promise<{ actor: Actor } | { res: Response }> {
  const s = await readStation(req);
  if (s) {
    return roles.includes(s.role)
      ? { actor: { type: 'station', role: s.role, label: s.label, v: s.v } }
      : { res: fail(403, 'WRONG_ROLE') };
  }
  const admin = await getAdmin(req);
  return admin ? { actor: { type: 'admin', email: admin.email } } : { res: fail(401, 'NO_SESSION') };
}

async function authAdmin(req: Request): Promise<{ actor: Actor } | { res: Response }> {
  const admin = await getAdmin(req);
  return admin ? { actor: { type: 'admin', email: admin.email } } : { res: fail(401, 'NO_SESSION') };
}

export function stationPost<S extends ZodTypeAny>(roles: readonly Role[], schema: S, fn: (a: Args<z.infer<S>>) => Promise<Response>) {
  return guard(async (req: Request, ctx?: Ctx) => {
    if (!sameOrigin(req)) return fail(403, 'BAD_ORIGIN');
    const a = await authStation(req, roles);
    if ('res' in a) return a.res;
    const body = await readJson(req, schema);
    if (body === null) return fail(400, 'BAD_INPUT');
    return fn({ req, actor: a.actor, body, params: (await ctx?.params) ?? {} });
  });
}

export function stationGet(roles: readonly Role[], fn: (a: Omit<Args<null>, 'body'>) => Promise<Response>) {
  return guard(async (req: Request, ctx?: Ctx) => {
    const a = await authStation(req, roles);
    if ('res' in a) return a.res;
    return fn({ req, actor: a.actor, params: (await ctx?.params) ?? {} });
  });
}

export function adminPost<S extends ZodTypeAny>(schema: S, fn: (a: Args<z.infer<S>>) => Promise<Response>) {
  return guard(async (req: Request, ctx?: Ctx) => {
    if (!sameOrigin(req)) return fail(403, 'BAD_ORIGIN');
    const a = await authAdmin(req);
    if ('res' in a) return a.res;
    const body = await readJson(req, schema);
    if (body === null) return fail(400, 'BAD_INPUT');
    return fn({ req, actor: a.actor, body, params: (await ctx?.params) ?? {} });
  });
}

export function adminGet(fn: (a: Omit<Args<null>, 'body'>) => Promise<Response>) {
  return guard(async (req: Request, ctx?: Ctx) => {
    const a = await authAdmin(req);
    if ('res' in a) return a.res;
    return fn({ req, actor: a.actor, params: (await ctx?.params) ?? {} });
  });
}
```

- [ ] **Step 6: Implement the four station auth routes**

`src/app/api/station/login/route.ts`:
```ts
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { clientIp, fail, guard, ok, parseCookies, readJson, sameOrigin } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { stationLabels } from '@/lib/labels';
import { DEVICE_COOKIE, deviceCookie, signStation, stationCookie, type Role } from '@/lib/session';

const schema = z.object({ pin: z.string().regex(/^\d{6}$/) });

export const POST = guard(async (req: Request) => {
  if (!sameOrigin(req)) return fail(403, 'BAD_ORIGIN');
  const body = await readJson(req, schema);
  if (!body) return fail(400, 'BAD_INPUT');

  const existing = parseCookies(req.headers.get('cookie'))[DEVICE_COOKIE];
  const device = existing && /^[a-f0-9]{32}$/.test(existing) ? existing : randomBytes(16).toString('hex');

  const r = await rpc<{ status: string; role?: Role; session_version?: number }>('verify_pin', {
    p_event: env().EVENT_ID, p_pin: body.pin, p_device_key: device, p_ip_key: clientIp(req),
  });

  const res =
    r.status === 'LOCKED' ? fail(429, 'LOCKED')
    : r.status === 'OK' ? ok('OK', { role: r.role, labels: await stationLabels() })
    : ok('INVALID');
  res.cookies.set(deviceCookie(device));
  if (r.status === 'OK' && r.role && r.session_version !== undefined) {
    res.cookies.set(stationCookie(await signStation({ role: r.role, label: '', v: r.session_version })));
  }
  return res;
});
```
`src/app/api/station/logout/route.ts`:
```ts
import { fail, guard, ok, sameOrigin } from '@/lib/api';
import { stationCookie } from '@/lib/session';

export const POST = guard(async (req: Request) => {
  if (!sameOrigin(req)) return fail(403, 'BAD_ORIGIN');
  const res = ok('OK');
  res.cookies.set(stationCookie('', 0));
  return res;
});
```
`src/app/api/station/me/route.ts`:
```ts
import { ok } from '@/lib/api';
import { stationLabels } from '@/lib/labels';
import { stationGet } from '@/lib/routes';
import { ROLES } from '@/lib/session';

export const GET = stationGet(ROLES, async ({ actor }) => {
  const labels = await stationLabels();
  return ok('OK', actor.type === 'station'
    ? { role: actor.role, label: actor.label, labels }
    : { role: 'admin', label: 'admin', labels });
});
```
`src/app/api/station/select-label/route.ts`:
```ts
import { z } from 'zod';
import { fail, ok } from '@/lib/api';
import { stationLabels } from '@/lib/labels';
import { stationPost } from '@/lib/routes';
import { ROLES, signStation, stationCookie } from '@/lib/session';

export const POST = stationPost(ROLES, z.object({ label: z.string().min(1).max(30) }), async ({ actor, body }) => {
  if (actor.type === 'admin') return ok('OK', { label: 'admin' });
  if (!(await stationLabels()).includes(body.label)) return fail(400, 'BAD_LABEL');
  const res = ok('OK', { label: body.label });
  res.cookies.set(stationCookie(await signStation({ role: actor.role, label: body.label, v: actor.v })));
  return res;
});
```
`src/lib/labels.ts` (route files may only export HTTP handlers, so shared code lives in `lib`):
```ts
import { db } from './db';
import { env } from './env';

export async function stationLabels(): Promise<string[]> {
  const { data } = await db().from('events').select('config').eq('id', env().EVENT_ID).single();
  const labels = (data?.config as { station_labels?: unknown } | null)?.station_labels;
  return Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string') : [];
}
```

- [ ] **Step 7: Write the API test helpers**

`tests/api/helpers.ts`:
```ts
import { createClient } from '@supabase/supabase-js';
import { expect } from 'vitest';
import type { Role } from '@/lib/session';

export const EVENT = process.env.EVENT_ID!;
export const svc = () =>
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
export const PINS: Record<Role, string> = { checkin: '111111', merchandise: '222222', draw: '333333', prizes: '444444' };

export async function setupPins() {
  for (const [role, pin] of Object.entries(PINS)) {
    const { data, error } = await svc().rpc('set_station_pin', { p_event: EVENT, p_role: role, p_pin: pin, p_actor: 'test' });
    expect(error).toBeNull();
    expect(data.status).toBe('OK');
  }
}

export async function resetEvent() {
  const { data, error } = await svc().rpc('reset_rehearsal_data', { p_event: EVENT, p_actor: 'test' });
  expect(error).toBeNull();
  expect(data.status).toBe('OK'); // the dev event must still be in rehearsal mode
}

export type TestGuest = { id: string; employee_id: string; full_name: string; invite_token: string; merch_token: string };

export async function seedGuests(n = 3): Promise<TestGuest[]> {
  const rows = Array.from({ length: n }, (_, i) => ({
    row_no: i + 2, employee_id: `T${i + 1}`, full_name: `Test Guest ${i + 1}`, outlet: 'Outlet A', phone: '+628123450000',
  }));
  const { data, error } = await svc().rpc('import_guests', { p_event: EVENT, p_rows: rows, p_filename: 'test.csv', p_actor: 'test' });
  expect(error).toBeNull();
  expect(data.status).toBe('OK');
  const { data: guests } = await svc()
    .from('guests').select('id, employee_id, full_name, invite_token, merch_token')
    .eq('event_id', EVENT).like('employee_id', 'T%').order('employee_id');
  return (guests ?? []).slice(0, n) as TestGuest[];
}

export function postJson(path: string, body: unknown, cookie?: string) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}
export function getReq(path: string, cookie?: string) {
  return new Request(`http://localhost${path}`, { headers: cookie ? { cookie } : {} });
}

/** Merges Set-Cookie values from a response into a Cookie header string. */
export function mergeCookies(base: string, res: Response): string {
  const jar = new Map<string, string>();
  for (const part of base.split(';').map((s) => s.trim()).filter(Boolean)) jar.set(part.split('=')[0], part);
  for (const sc of res.headers.getSetCookie()) {
    const pair = sc.split(';')[0];
    const [name, value] = [pair.split('=')[0], pair.slice(pair.indexOf('=') + 1)];
    if (value === '') jar.delete(name);
    else jar.set(name, pair);
  }
  return [...jar.values()].join('; ');
}

/** Full staff login: PIN, then station label. Returns the Cookie header to send on later requests. */
export async function loginAs(role: Role, label = 'Meja 1'): Promise<string> {
  const { POST: login } = await import('@/app/api/station/login/route');
  const { POST: pick } = await import('@/app/api/station/select-label/route');
  const res = await login(postJson('/api/station/login', { pin: PINS[role] }));
  expect((await res.clone().json()).status).toBe('OK');
  let cookie = mergeCookies('', res);
  const res2 = await pick(postJson('/api/station/select-label', { label }, cookie));
  expect(res2.status).toBe(200);
  cookie = mergeCookies(cookie, res2);
  return cookie;
}
```

- [ ] **Step 8: Write the failing API test for station auth**

`tests/api/station-auth.test.ts`:
```ts
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as login } from '@/app/api/station/login/route';
import { POST as logout } from '@/app/api/station/logout/route';
import { GET as me } from '@/app/api/station/me/route';
import { POST as pick } from '@/app/api/station/select-label/route';
import { EVENT, PINS, getReq, loginAs, mergeCookies, postJson, resetEvent, setupPins, svc } from './helpers';

beforeAll(setupPins);
beforeEach(resetEvent); // also clears auth_attempts

const body = async (r: Response) => r.json();

describe('station login', () => {
  it('logs in with the right PIN and sets httpOnly cookies', async () => {
    const res = await login(postJson('/api/station/login', { pin: PINS.checkin }));
    expect(res.status).toBe(200);
    expect(await body(res)).toMatchObject({ ok: true, status: 'OK', data: { role: 'checkin' } });
    const cookies = res.headers.getSetCookie().join('\n');
    expect(cookies).toMatch(/nf_station=.+HttpOnly/i);
    expect(cookies).toMatch(/nf_device=.+HttpOnly/i);
    expect(cookies).toMatch(/SameSite=lax/i);
  });
  it('returns INVALID for a wrong PIN and sets no session', async () => {
    const res = await login(postJson('/api/station/login', { pin: '000000' }));
    expect(await body(res)).toMatchObject({ ok: true, status: 'INVALID' });
    expect(res.headers.getSetCookie().join('\n')).not.toMatch(/nf_station/);
  });
  it('rejects malformed PINs and foreign origins', async () => {
    expect((await login(postJson('/api/station/login', { pin: '12ab56' }))).status).toBe(400);
    const bad = new Request('http://localhost/api/station/login', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://evil.example' },
      body: JSON.stringify({ pin: PINS.checkin }),
    });
    expect((await login(bad)).status).toBe(403);
  });
  it('locks a device after 5 failures, even for the right PIN, but not other devices', async () => {
    let cookie = '';
    for (let i = 0; i < 5; i++) {
      const r = await login(postJson('/api/station/login', { pin: '000000' }, cookie));
      cookie = mergeCookies(cookie, r);
    }
    const locked = await login(postJson('/api/station/login', { pin: PINS.checkin }, cookie));
    expect(locked.status).toBe(429);
    expect(await body(locked)).toEqual({ ok: false, status: 'LOCKED' });
    const other = await login(postJson('/api/station/login', { pin: PINS.checkin }));
    expect((await body(other)).status).toBe('OK');
  });
  it('caps one IP at 30 failures across devices', async () => {
    const withIp = (pin: string) => {
      const r = postJson('/api/station/login', { pin });
      r.headers.set('x-forwarded-for', '203.0.113.9');
      return r;
    };
    for (let i = 0; i < 30; i++) await login(withIp('000000'));
    expect((await login(withIp(PINS.checkin))).status).toBe(429);
  });
});

describe('station session', () => {
  it('requires a session for /me', async () => {
    const { status } = await me(getReq('/api/station/me'));
    expect(status).toBe(401);
  });
  it('returns role, label and the label list after login and label selection', async () => {
    const cookie = await loginAs('merchandise', 'Booth 1');
    const res = await me(getReq('/api/station/me', cookie));
    expect(await body(res)).toMatchObject({ status: 'OK', data: { role: 'merchandise', label: 'Booth 1' } });
    expect((await body(await me(getReq('/api/station/me', cookie)))).data.labels).toContain('Meja 1');
  });
  it('refuses a label that is not in the list', async () => {
    const res = await login(postJson('/api/station/login', { pin: PINS.checkin }));
    const cookie = mergeCookies('', res);
    expect((await pick(postJson('/api/station/select-label', { label: 'Nowhere' }, cookie))).status).toBe(400);
  });
  it('rejects a forged cookie', async () => {
    expect((await me(getReq('/api/station/me', 'nf_station=not.a.jwt'))).status).toBe(401);
  });
  it('ends the session when the PIN is rotated', async () => {
    const cookie = await loginAs('checkin');
    expect((await me(getReq('/api/station/me', cookie))).status).toBe(200);
    await svc().rpc('set_station_pin', { p_event: EVENT, p_role: 'checkin', p_pin: PINS.checkin, p_actor: 'test' });
    expect((await me(getReq('/api/station/me', cookie))).status).toBe(401);
  });
  it('ends the session when the role is disabled', async () => {
    const cookie = await loginAs('prizes');
    await svc().rpc('set_station_active', { p_event: EVENT, p_role: 'prizes', p_active: false, p_actor: 'test' });
    expect((await me(getReq('/api/station/me', cookie))).status).toBe(401);
    await setupPins(); // re-enable
  });
  it('clears the cookie on logout', async () => {
    const cookie = await loginAs('checkin');
    const res = await logout(postJson('/api/station/logout', {}, cookie));
    expect(res.headers.getSetCookie().join('\n')).toMatch(/nf_station=;/);
  });
});
```

- [ ] **Step 9: Run it; fix until it passes**

Run: `npm run db:reset && ./scripts/make-env.sh && npm run test:api`
Expected first run (before Step 6's route files exist) FAIL; after Steps 5–7 all PASS. Note `make-env.sh` regenerates `STATION_SESSION_SECRET`, which is fine for tests.

- [ ] **Step 10: Typecheck, build and commit**

Run: `npx tsc --noEmit && npm run build`
Expected: success (the build proves no illegal exports exist in `route.ts` files).

```bash
git add src tests
git commit -m "feat: server infrastructure, route wrappers and station PIN login"
```

---

## Task 10: Guest pass — API, page, RSVP, QR tiles, language toggle

**Files:**
- Create: `src/lib/i18n/index.tsx` (replace the Task 1 stub), `src/lib/client.ts`, `src/lib/pass.ts`, `src/app/api/pass/[token]/route.ts`, `src/app/api/pass/[token]/rsvp/route.ts`, `src/app/pass/[token]/page.tsx`, `src/components/QrTile.tsx`, `src/components/LangToggle.tsx`, `src/components/Wordmark.tsx`, `src/components/pass/{PassView,TicketCard,RsvpBlock,PrizeNumber,MerchCard,SaveImage,PassMessage}.tsx`, `src/styles/pass.css`
- Test: `tests/api/pass.test.ts`

**Interfaces:**
- Consumes: `get_pass`, `set_rsvp`, `check_in` (tests), `isToken`/`payloadFor` (`qr.ts`), `qrPath`, `translate`, `ok/fail/guard/clientIp/sameOrigin`.
- Produces:
  - `useI18n(): { lang: Lang; setLang(l: Lang): void; t(key: StringKey, vars?): string }` and `<I18nProvider>`.
  - `api<T>(path: string, body?: unknown): Promise<{ http: number; ok: boolean; status: string; data: T | null }>` (POST when `body` is given; network failure → `status: 'RETRYABLE_ERROR'`, `http: 0`).
  - `loadPass(token: string, ip: string): Promise<{status:'OK'; data: PassData} | {status:'INVALID'} | {status:'RATE_LIMITED'}>` and the `PassData` type.
  - `<QrTile payload frame ppm? alt />` (frame `'gold'` or `'pink'`).
  - `GET /api/pass/[token]` → `ok('OK', PassData)` | `ok('INVALID')` | 429 `RATE_LIMITED`; `POST /api/pass/[token]/rsvp {status:'yes'|'no'}` → `ok('OK')` | `ok('INVALID')`.

- [ ] **Step 1: Write the failing API test**

`tests/api/pass.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { GET as getPass } from '@/app/api/pass/[token]/route';
import { POST as postRsvp } from '@/app/api/pass/[token]/rsvp/route';
import { EVENT, getReq, postJson, resetEvent, seedGuests, svc, type TestGuest } from './helpers';

let g: TestGuest;
const ctx = (token: string) => ({ params: Promise.resolve({ token }) });
const pass = (token: string, ip = '198.51.100.1') => {
  const r = getReq(`/api/pass/${token}`);
  r.headers.set('x-forwarded-for', ip);
  return getPass(r, ctx(token));
};

beforeEach(async () => {
  await resetEvent();
  [g] = await seedGuests(1);
  await svc().from('guests').update({ first_opened_at: null, rsvp_status: 'pending' }).eq('id', g.id);
});

describe('GET /api/pass/[token]', () => {
  it('returns the guest pass before check-in without the merchandise token or phone', async () => {
    const res = await pass(g.invite_token);
    const text = await res.text();
    const json = JSON.parse(text);
    expect(json).toMatchObject({ ok: true, status: 'OK', data: { guest: { full_name: g.full_name }, checked_in: false, merchandise: null } });
    expect(text).not.toContain(g.merch_token);
    expect(text).not.toContain('628123450000');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
  it('records the first open', async () => {
    await pass(g.invite_token);
    const { data } = await svc().from('guests').select('first_opened_at').eq('id', g.id).single();
    expect(data?.first_opened_at).not.toBeNull();
  });
  it('adds the prize number and merchandise token after check-in', async () => {
    await svc().rpc('check_in', { p_event: EVENT, p_token: g.invite_token, p_guest_id: null, p_method: 'scan', p_station_label: 'Meja 1', p_actor: 'test' });
    const json = await (await pass(g.invite_token)).json();
    expect(json.data).toMatchObject({ checked_in: true, prize_number: 1, merchandise: { token: g.merch_token, claimed: false } });
  });
  it('answers INVALID for unknown or malformed tokens without any data', async () => {
    for (const t of ['AAAAAAAAAAAAAAAAAAAAAA', 'short', g.merch_token]) {
      expect(await (await pass(t)).json()).toEqual({ ok: true, status: 'INVALID', data: null });
    }
  });
  it('rate-limits invalid lookups at 20 per minute per IP, but valid lookups never count', async () => {
    for (let i = 0; i < 40; i++) expect((await pass(g.invite_token, '198.51.100.7')).status).toBe(200);
    for (let i = 0; i < 20; i++) expect((await pass('AAAAAAAAAAAAAAAAAAAAAA', '198.51.100.8')).status).toBe(200);
    const limited = await pass('AAAAAAAAAAAAAAAAAAAAAA', '198.51.100.8');
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ ok: false, status: 'RATE_LIMITED' });
    expect((await pass(g.invite_token, '198.51.100.9')).status).toBe(200); // other IPs unaffected
  });
});

describe('POST /api/pass/[token]/rsvp', () => {
  const rsvp = (token: string, status: unknown, origin = 'http://localhost') => {
    const r = new Request(`http://localhost/api/pass/${token}/rsvp`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ status }),
    });
    return postRsvp(r, ctx(token));
  };
  it('stores yes and lets the guest change to no', async () => {
    expect(await (await rsvp(g.invite_token, 'yes')).json()).toMatchObject({ status: 'OK' });
    expect(await (await rsvp(g.invite_token, 'no')).json()).toMatchObject({ status: 'OK' });
    const { data } = await svc().from('guests').select('rsvp_status').eq('id', g.id).single();
    expect(data?.rsvp_status).toBe('no');
  });
  it('rejects bad status values and foreign origins', async () => {
    expect((await rsvp(g.invite_token, 'maybe')).status).toBe(400);
    expect((await rsvp(g.invite_token, 'yes', 'http://evil.example')).status).toBe(403);
  });
  it('answers INVALID for an unknown token', async () => {
    expect(await (await rsvp('AAAAAAAAAAAAAAAAAAAAAA', 'yes')).json()).toMatchObject({ status: 'INVALID' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:api -- pass`
Expected: FAIL — cannot resolve the route modules.

- [ ] **Step 3: Implement `lib/pass.ts` and the two routes**

`src/lib/pass.ts`:
```ts
import { db, rpc } from './db';
import { isToken } from './qr';

export type PassData = {
  event: { name: string; date: string; starts_at: string | null; venue: string | null };
  guest: { full_name: string; outlet: string; department: string | null; position: string | null; rsvp_status: 'pending' | 'yes' | 'no' };
  invite_token: string;
  checked_in: boolean;
  checked_in_at: string | null;
  prize_number: number | null;
  merchandise: null | { token: string; claimed: boolean; redeemed_at: string | null };
};
export type PassResult = { status: 'OK'; data: PassData } | { status: 'INVALID' } | { status: 'RATE_LIMITED' };

const LIMIT = 20;

/** True when this IP already made 20 invalid lookups in the last minute. */
export async function checkLimit(ip: string): Promise<boolean> {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await db().from('auth_attempts').select('id', { count: 'exact', head: true })
    .eq('scope', 'token_ip').eq('key', ip).gte('at', since);
  return (count ?? 0) >= LIMIT;
}
export const noteInvalid = async (ip: string) => {
  await db().from('auth_attempts').insert({ scope: 'token_ip', key: ip, success: false });
};

export async function loadPass(token: string, ip: string): Promise<PassResult> {
  if (await checkLimit(ip)) return { status: 'RATE_LIMITED' };
  if (!isToken(token)) {
    await noteInvalid(ip);
    return { status: 'INVALID' };
  }
  const r = await rpc<{ status: string } & Partial<PassData>>('get_pass', { p_token: token });
  if (r.status !== 'OK') {
    await noteInvalid(ip);
    return { status: 'INVALID' };
  }
  return { status: 'OK', data: r as unknown as PassData };
}
```

`src/app/api/pass/[token]/route.ts`:
```ts
import { clientIp, fail, guard, ok } from '@/lib/api';
import { loadPass } from '@/lib/pass';

export const GET = guard(async (req: Request, ctx?: { params: Promise<{ token: string }> }) => {
  const { token } = await ctx!.params;
  const r = await loadPass(token, clientIp(req));
  if (r.status === 'RATE_LIMITED') return fail(429, 'RATE_LIMITED');
  if (r.status === 'INVALID') return ok('INVALID');
  return ok('OK', r.data);
});
```
`src/app/api/pass/[token]/rsvp/route.ts`:
```ts
import { z } from 'zod';
import { clientIp, fail, guard, ok, readJson, sameOrigin } from '@/lib/api';
import { rpc } from '@/lib/db';
import { checkLimit, noteInvalid } from '@/lib/pass';
import { isToken } from '@/lib/qr';

const schema = z.object({ status: z.enum(['yes', 'no']) });

export const POST = guard(async (req: Request, ctx?: { params: Promise<{ token: string }> }) => {
  if (!sameOrigin(req)) return fail(403, 'BAD_ORIGIN');
  const body = await readJson(req, schema);
  if (!body) return fail(400, 'BAD_INPUT');
  const { token } = await ctx!.params;
  const ip = clientIp(req);
  if (await checkLimit(ip)) return fail(429, 'RATE_LIMITED');
  if (!isToken(token)) { await noteInvalid(ip); return ok('INVALID'); }
  const r = await rpc<{ status: string }>('set_rsvp', { p_token: token, p_status: body.status });
  if (r.status !== 'OK') { await noteInvalid(ip); return ok('INVALID'); }
  return ok('OK', { rsvp_status: body.status });
});
```

- [ ] **Step 4: Run the API test to verify it passes**

Run: `npm run test:api -- pass`
Expected: PASS. (`rate-limits` needs `resetEvent` to clear `auth_attempts`, which it does.)

- [ ] **Step 5: Language provider and client helper**

`src/lib/i18n/index.tsx`:
```tsx
'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { translate, type Lang, type StringKey } from './strings';

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (key: StringKey, vars?: Record<string, string | number>) => string };
const KEY = 'nf_lang';
const I18n = createContext<Ctx>({ lang: 'id', setLang: () => {}, t: (k, v) => translate('id', k, v) });

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('id'); // Indonesian is the default
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === 'id' || saved === 'en') setLangState(saved);
    } catch { /* storage unavailable: keep the default */ }
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  }, []);
  const value = useMemo<Ctx>(() => ({ lang, setLang, t: (k, v) => translate(lang, k, v) }), [lang, setLang]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}
export const useI18n = () => useContext(I18n);
```
`src/lib/client.ts`:
```ts
export type ApiResult<T = unknown> = { http: number; ok: boolean; status: string; data: T | null };

/** POST when `body` is given, otherwise GET. Never throws. */
export async function api<T = unknown>(path: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      credentials: 'same-origin',
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; status?: string; data?: T } | null;
    return { http: res.status, ok: !!json?.ok, status: json?.status ?? 'RETRYABLE_ERROR', data: json?.data ?? null };
  } catch {
    return { http: 0, ok: false, status: 'RETRYABLE_ERROR', data: null };
  }
}
```

- [ ] **Step 6: Shared components**

`src/components/Wordmark.tsx`:
```tsx
export function Wordmark() {
  return (
    <h1 className="wordmark" aria-label="NourishFest 2026">
      <span>NOURISH</span>
      <span>FEST 2026</span>
    </h1>
  );
}
```
`src/components/LangToggle.tsx`:
```tsx
'use client';
import { useI18n } from '@/lib/i18n';

export function LangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div className="lang" role="group" aria-label="Language">
      {(['id', 'en'] as const).map((l) => (
        <button key={l} type="button" aria-pressed={lang === l} className={lang === l ? 'lang__btn lang__btn--on' : 'lang__btn'} onClick={() => setLang(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
```
`src/components/QrTile.tsx`:
```tsx
'use client';
import { useMemo } from 'react';
import { qrPath } from '@/lib/qr-svg';

/** White tile, black modules, quiet zone of 4 modules, integer pixels per module (at least 5). */
export function QrTile({ payload, frame, ppm = 6, alt }: { payload: string; frame: 'gold' | 'pink'; ppm?: number; alt: string }) {
  const { size, d } = useMemo(() => qrPath(payload), [payload]);
  const px = size * Math.max(5, Math.floor(ppm));
  return (
    <div className={`qr-frame qr-frame--${frame}`}>
      <svg role="img" aria-label={alt} width={px} height={px} viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges">
        <rect width={size} height={size} fill="#FFFFFF" />
        <path d={d} fill="#000000" />
      </svg>
    </div>
  );
}
```

- [ ] **Step 7: Pass components**

`src/components/pass/TicketCard.tsx`:
```tsx
'use client';
import { QrTile } from '@/components/QrTile';
import { useI18n } from '@/lib/i18n';
import { payloadFor } from '@/lib/qr';
import type { PassData } from '@/lib/pass';

export function TicketCard({ data }: { data: PassData }) {
  const { t } = useI18n();
  const meta = [data.guest.outlet, data.guest.department, data.guest.position].filter(Boolean).join(' · ');
  return (
    <section className="ticket">
      <div className="ticket__top">
        <span className="label">{t('pass.greeting')}</span>
        <p className="ticket__name">{data.guest.full_name}</p>
        <p className="ticket__meta">{meta}</p>
      </div>
      <div className="ticket__divider" aria-hidden="true" />
      <div className="ticket__bottom">
        <span className="pill">{t('pass.checkin_label')}</span>
        <QrTile payload={payloadFor('checkin', data.invite_token)} frame="gold" alt={`QR check-in ${data.guest.full_name}`} />
        <p className="helper">{t('pass.show_qr')}</p>
        <p className="caption">{t('pass.brightness')}</p>
      </div>
    </section>
  );
}
```
`src/components/pass/RsvpBlock.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import { useI18n } from '@/lib/i18n';

export function RsvpBlock({ token, status, onChange }: { token: string; status: 'pending' | 'yes' | 'no'; onChange: (s: 'yes' | 'no') => void }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const answered = status !== 'pending' && !editing;

  async function send(s: 'yes' | 'no') {
    setBusy(true);
    setError(false);
    const r = await api(`/api/pass/${token}/rsvp`, { status: s });
    setBusy(false);
    if (r.ok && r.status === 'OK') { onChange(s); setEditing(false); } else setError(true);
  }

  return (
    <section className="rsvp" aria-live="polite">
      <span className="label">{t('rsvp.title')}</span>
      {answered ? (
        <>
          <p className="rsvp__thanks">{t(status === 'yes' ? 'rsvp.thanks_yes' : 'rsvp.thanks_no')}</p>
          <button type="button" className="link" onClick={() => setEditing(true)}>{t('rsvp.change')}</button>
        </>
      ) : (
        <div className="rsvp__buttons">
          <button type="button" className="btn btn--primary" disabled={busy} aria-disabled={busy} onClick={() => send('yes')}>{t('rsvp.yes')}</button>
          <button type="button" className="btn btn--secondary" disabled={busy} aria-disabled={busy} onClick={() => send('no')}>{t('rsvp.no')}</button>
        </div>
      )}
      {error && <p className="error" role="alert">{t('rsvp.error')}</p>}
    </section>
  );
}
```
`src/components/pass/PrizeNumber.tsx`:
```tsx
'use client';
import { useI18n } from '@/lib/i18n';

export const padPrize = (n: number) => String(n).padStart(3, '0');

export function PrizeNumber({ n, reveal }: { n: number; reveal: boolean }) {
  const { t } = useI18n();
  return (
    <section className={reveal ? 'prize prize--reveal' : 'prize'}>
      <span className="label">{t('pass.prize_number')}</span>
      <p className="prize__number" aria-label={String(n)}>{padPrize(n)}</p>
      <p className="helper">{t('pass.prize_hint')}</p>
    </section>
  );
}
```
`src/components/pass/MerchCard.tsx`:
```tsx
'use client';
import { QrTile } from '@/components/QrTile';
import { useI18n } from '@/lib/i18n';
import { payloadFor } from '@/lib/qr';
import { formatTimeWita } from '@/lib/time';
import type { PassData } from '@/lib/pass';

export function MerchCard({ merch, name, reveal }: { merch: NonNullable<PassData['merchandise']>; name: string; reveal: boolean }) {
  const { t } = useI18n();
  if (merch.claimed) {
    return (
      <section className="merch merch--claimed">
        <div className="merch__banner merch__banner--muted">{t('merch.claimed')}</div>
        {merch.redeemed_at && <p className="helper">{t('merch.claimed_at', { time: formatTimeWita(merch.redeemed_at) })}</p>}
      </section>
    );
  }
  return (
    <section className={reveal ? 'merch merch--reveal' : 'merch'}>
      <div className="merch__banner">{t('merch.banner')}</div>
      <span className="pill pill--pink">{t('merch.once')}</span>
      <QrTile payload={payloadFor('merch', merch.token)} frame="pink" alt={`QR merchandise ${name}`} />
      <p className="helper">{t('merch.show')}</p>
      <p className="caption caption--warn">{t('merch.warn')}</p>
    </section>
  );
}
```
`src/components/pass/SaveImage.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { padPrize } from './PrizeNumber';

async function render(name: string, outlet: string, n: number): Promise<Blob> {
  const css = getComputedStyle(document.body);
  const display = css.getPropertyValue('--nf-font-display') || 'Impact, sans-serif';
  const heading = css.getPropertyValue('--nf-font-heading') || 'Impact, sans-serif';
  const label = css.getPropertyValue('--nf-font-label') || 'sans-serif';
  await Promise.all([`150px ${display}`, `40px ${heading}`, `30px ${label}`].map((f) => document.fonts.load(f).catch(() => [])));
  const c = document.createElement('canvas');
  c.width = 1080; c.height = 1920; // 9:16
  const x = c.getContext('2d')!;
  x.fillStyle = '#0D0D0D'; x.fillRect(0, 0, 1080, 1920);
  x.textAlign = 'center';
  x.fillStyle = '#D4AF37'; x.font = `64px ${display}`; x.fillText('NOURISHFEST 2026', 540, 220);
  x.fillStyle = '#F5F5F0'; x.font = `34px ${label}`; x.fillText('DOOR PRIZE', 540, 860);
  x.fillStyle = '#FF1B6B'; x.font = `420px ${display}`; x.fillText(padPrize(n), 548, 1240); // hard pink shadow
  x.fillStyle = '#D4AF37'; x.fillText(padPrize(n), 540, 1232);
  x.fillStyle = '#F5F5F0'; x.font = `84px ${heading}`; x.fillText(name.toUpperCase().slice(0, 28), 540, 1480);
  x.fillStyle = '#D4AF37'; x.font = `44px ${label}`; x.fillText(outlet.toUpperCase().slice(0, 36), 540, 1560);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/png'));
}

export function SaveImage({ name, outlet, n }: { name: string; outlet: string; n: number }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const blob = await render(name, outlet, n);
      const file = new File([blob], `nourishfest-${padPrize(n)}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
      else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      }
    } catch { /* user cancelled the share sheet or canvas failed: nothing to do */ }
    setBusy(false);
  }
  return <button type="button" className="btn btn--outline" onClick={save} disabled={busy} aria-disabled={busy}>{t('pass.save')}</button>;
}
```
`src/components/pass/PassMessage.tsx`:
```tsx
'use client';
import { LangToggle } from '@/components/LangToggle';
import { useI18n } from '@/lib/i18n';
import '@/styles/pass.css';

export function PassMessage({ kind }: { kind: 'INVALID' | 'RATE_LIMITED' }) {
  const { t } = useI18n();
  return (
    <main className="pass">
      <header className="pass__top"><span className="label">NOURISHFEST 2026</span><LangToggle /></header>
      <section className="notice">
        {kind === 'INVALID' ? (<><h2>{t('pass.invalid_title')}</h2><p>{t('pass.invalid_body')}</p></>) : <p>{t('pass.rate_limited')}</p>}
      </section>
    </main>
  );
}
```
`src/components/pass/PassView.tsx`:
```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { LangToggle } from '@/components/LangToggle';
import { Wordmark } from '@/components/Wordmark';
import { api } from '@/lib/client';
import { useI18n } from '@/lib/i18n';
import type { PassData } from '@/lib/pass';
import { formatDateLong, formatTimeWita } from '@/lib/time';
import { MerchCard } from './MerchCard';
import { PrizeNumber } from './PrizeNumber';
import { RsvpBlock } from './RsvpBlock';
import { SaveImage } from './SaveImage';
import { TicketCard } from './TicketCard';
import '@/styles/pass.css';

export function PassView({ token, initial }: { token: string; initial: PassData }) {
  const { t, lang } = useI18n();
  const [data, setData] = useState(initial);
  const [reveal, setReveal] = useState(false);
  const wasChecked = useRef(initial.checked_in);
  const flag = `nf_seen_${token.slice(0, 8)}`;

  // First view after check-in plays the reveal once.
  useEffect(() => {
    if (!initial.checked_in) return;
    try { if (!localStorage.getItem(flag)) { setReveal(true); localStorage.setItem(flag, '1'); } } catch { /* ignore */ }
  }, [initial.checked_in, flag]);

  // Poll: quickly until checked in (so the pass flips by itself), slowly afterwards (merchandise state).
  useEffect(() => {
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      const r = await api<PassData>(`/api/pass/${token}`);
      if (r.ok && r.status === 'OK' && r.data) {
        setData(r.data);
        if (r.data.checked_in && !wasChecked.current) {
          wasChecked.current = true;
          setReveal(true);
          try { localStorage.setItem(flag, '1'); } catch { /* ignore */ }
        }
      }
    };
    const id = setInterval(tick, data.checked_in ? 15_000 : 6_000);
    return () => clearInterval(id);
  }, [token, data.checked_in, flag]);

  // Keep the screen awake at the door.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const ask = async () => { try { lock = (await navigator.wakeLock?.request('screen')) ?? null; } catch { /* unsupported */ } };
    ask();
    const onVis = () => { if (document.visibilityState === 'visible') ask(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); lock?.release().catch(() => {}); };
  }, []);

  const when = [formatDateLong(data.event.date, lang), data.event.venue].filter(Boolean).join(' · ');

  return (
    <main className="pass">
      <header className="pass__top"><span className="label">NOURISHFEST 2026</span><LangToggle /></header>
      {!data.checked_in ? (
        <>
          <div className="pass__hero">
            <Wordmark />
            <p className="sticker">{t('brand.tagline')}</p>
            <p className="pass__when">{when}</p>
          </div>
          <TicketCard data={data} />
          <RsvpBlock token={token} status={data.guest.rsvp_status} onChange={(s) => setData({ ...data, guest: { ...data.guest, rsvp_status: s } })} />
        </>
      ) : (
        <>
          <div className="pass__who">
            <p className="pass__name">{data.guest.full_name}</p>
            {data.checked_in_at && <span className="chip chip--ok">{t('pass.checked_in_at', { time: formatTimeWita(data.checked_in_at) })}</span>}
          </div>
          {data.prize_number !== null && <PrizeNumber n={data.prize_number} reveal={reveal} />}
          {data.merchandise && <MerchCard merch={data.merchandise} name={data.guest.full_name} reveal={reveal} />}
          {data.prize_number !== null && <SaveImage name={data.guest.full_name} outlet={data.guest.outlet} n={data.prize_number} />}
        </>
      )}
    </main>
  );
}
```
`src/app/pass/[token]/page.tsx`:
```tsx
import { headers } from 'next/headers';
import { ipFromHeader } from '@/lib/api';
import { loadPass } from '@/lib/pass';
import { PassMessage } from '@/components/pass/PassMessage';
import { PassView } from '@/components/pass/PassView';

export const dynamic = 'force-dynamic';

export default async function PassPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = ipFromHeader((await headers()).get('x-forwarded-for'));
  const r = await loadPass(token, ip);
  if (r.status === 'OK') return <PassView token={token} initial={r.data} />;
  return <PassMessage kind={r.status} />;
}
```

- [ ] **Step 8: Styles**

`src/styles/pass.css` (Block Party mode; mobile first; no fixed text widths; hard pink shadows, no blur except the gold glow):
```css
.pass { max-width: 480px; margin: 0 auto; padding: 14px var(--nf-gutter) 48px; display: flex; flex-direction: column; gap: 18px; }
.pass__top { display: flex; align-items: center; justify-content: space-between; min-height: 48px; }
.label { font-family: var(--nf-font-label); font-weight: 600; font-size: 14px; letter-spacing: 0.28em; color: var(--nf-gold); text-transform: uppercase; }
.pill { align-self: center; font-family: var(--nf-font-label); font-weight: 600; font-size: 13px; letter-spacing: 0.2em; color: var(--nf-black); background: var(--nf-gold); padding: 4px 14px; border-radius: var(--nf-radius-pill); }
.pill--pink { background: var(--nf-pink); }
.helper { margin: 0; text-align: center; color: var(--nf-text-soft); }
.caption { margin: 0; text-align: center; font-size: 12px; color: var(--nf-text-muted); }
.caption--warn { color: var(--nf-pink); font-weight: 600; font-size: 13px; }
.error { color: var(--nf-pink); margin: 0; }

.lang { display: inline-flex; border: 2px solid var(--nf-gold); border-radius: var(--nf-radius-pill); overflow: hidden; }
.lang__btn { min-width: 48px; min-height: 40px; border: 0; background: transparent; color: var(--nf-gold); font-family: var(--nf-font-label); font-weight: 600; letter-spacing: 0.12em; }
.lang__btn--on { background: var(--nf-gold); color: var(--nf-black); }

.pass__hero { padding: 20px 0 8px; text-align: center; background:
  radial-gradient(circle at 0% 0%, rgba(255,27,107,0.28), transparent 50%),
  radial-gradient(circle at 100% 40%, rgba(212,175,55,0.14), transparent 45%),
  radial-gradient(rgba(212,175,55,0.2) 1.2px, transparent 1.6px); background-size: auto, auto, 14px 14px; }
.wordmark { margin: 0; display: flex; flex-direction: column; font-family: var(--nf-font-display); font-weight: 400; font-size: 54px; line-height: 0.95; color: var(--nf-gold); text-shadow: 3px 3px 0 var(--nf-pink); }
.sticker { display: inline-block; margin: 14px 0 6px; padding: 4px 16px; background: var(--nf-pink); color: var(--nf-black); font-family: var(--nf-font-heading); font-size: 22px; letter-spacing: 0.06em; transform: rotate(-2deg); }
.pass__when { margin: 6px 0 0; color: var(--nf-text); font-family: var(--nf-font-label); letter-spacing: 0.08em; }

.ticket { background: var(--nf-card); border: 3px solid var(--nf-gold); border-radius: var(--nf-radius-card); padding: 16px; }
.ticket__top { display: flex; flex-direction: column; gap: 4px; }
.ticket__name { margin: 0; font-family: var(--nf-font-heading); font-size: 38px; line-height: 1.05; text-transform: uppercase; overflow-wrap: anywhere; }
.ticket__meta { margin: 0; font-family: var(--nf-font-label); font-weight: 600; letter-spacing: 0.08em; color: var(--nf-gold); }
.ticket__divider { margin: 16px -16px; border-top: 3px dashed var(--nf-line-dash); }
.ticket__bottom { display: flex; flex-direction: column; align-items: center; gap: 12px; }

.qr-frame { display: inline-block; line-height: 0; background: var(--nf-white); border-style: solid; }
.qr-frame--gold { border-width: 6px; border-color: var(--nf-gold); }
.qr-frame--pink { border-width: 5px; border-color: var(--nf-pink); }
.qr-frame svg { display: block; max-width: 100%; height: auto; }

.btn { min-height: 52px; padding: 0 20px; border-radius: var(--nf-radius-btn); border: 2px solid transparent; font-family: var(--nf-font-heading); font-size: 18px; letter-spacing: 0.04em; }
.btn--primary { background: var(--nf-pink); color: var(--nf-black); }
.btn--secondary { background: transparent; border-color: var(--nf-text); color: var(--nf-text); }
.btn--outline { background: transparent; border-color: var(--nf-gold); color: var(--nf-gold); }
.btn[disabled] { opacity: 0.4; }
.link { background: none; border: 0; color: var(--nf-gold); text-decoration: underline; min-height: 48px; padding: 0; }

.rsvp { display: flex; flex-direction: column; gap: 10px; }
.rsvp__buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.rsvp__thanks { margin: 0; font-family: var(--nf-font-heading); font-size: 22px; }

.pass__who { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.pass__name { margin: 0; font-family: var(--nf-font-heading); font-size: 24px; text-transform: uppercase; overflow-wrap: anywhere; }
.chip { display: inline-flex; align-items: center; padding: 4px 14px; border-radius: var(--nf-radius-pill); font-family: var(--nf-font-label); font-weight: 600; letter-spacing: 0.1em; }
.chip--ok { background: var(--nf-green); color: var(--nf-black); }

.prize { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 20px 0; background: radial-gradient(ellipse at 50% 40%, rgba(212,175,55,0.28), transparent 60%); }
.prize__number { margin: 0; font-family: var(--nf-font-display); font-size: 150px; line-height: 1; color: var(--nf-gold); text-shadow: 5px 5px 0 var(--nf-pink), 0 0 40px rgba(212,175,55,0.4); }

.merch { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 0 16px 16px; background: var(--nf-card); border-radius: var(--nf-radius-card); overflow: hidden; }
.merch__banner { align-self: stretch; margin: 0 -16px; padding: 8px 0; text-align: center; background: var(--nf-pink); color: var(--nf-black); font-family: var(--nf-font-heading); font-size: 26px; letter-spacing: 0.06em; }
.merch__banner--muted { background: var(--nf-line-dash); color: var(--nf-text); }
.merch--claimed { padding-bottom: 12px; }

.notice { background: var(--nf-card); border-radius: var(--nf-radius-card); padding: 20px; }
.notice h2 { margin: 0 0 8px; font-family: var(--nf-font-heading); color: var(--nf-gold); }

@keyframes nf-rise { from { opacity: 0; transform: translateY(16px) scale(0.96); } to { opacity: 1; transform: none; } }
.prize--reveal { animation: nf-rise 600ms ease-out both; }
.merch--reveal { animation: nf-rise 500ms 200ms ease-out both; }
```

- [ ] **Step 9: Verify in the browser at 360 px**

Run: `npm run dev`, then create a guest and open the pass:
```bash
node --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
s.rpc('import_guests', { p_event: process.env.EVENT_ID, p_filename: 'manual.csv', p_actor: 'me',
  p_rows: [{ row_no: 2, employee_id: 'DEV1', full_name: 'Kadek Ayu Lestari', outlet: 'Nourish Ungasan', position: 'Server' }] })
 .then(() => s.from('guests').select('invite_token').eq('employee_id', 'DEV1').single())
 .then(({ data }) => console.log('http://localhost:3000/pass/' + data.invite_token));"
```
Open the printed URL in a 360 px-wide window. Expected: wordmark, gold-framed QR on a white tile, RSVP buttons, language toggle switching ID/EN, no horizontal scroll.

- [ ] **Step 10: Typecheck, lint and commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

```bash
git add src tests
git commit -m "feat: guest pass page, RSVP, QR tiles and language toggle"
```

---

## Task 11: Check-in station — API, scanner, results, manual search

**Files:**
- Create: `src/lib/code-input.ts`, `src/app/api/station/check-in/route.ts`, `src/app/api/station/guests/route.ts`, `src/app/api/station/stats/route.ts`, `src/components/station/{StationShell,Scanner,ResultPanel,TabBar,ManualSearch}.tsx`, `src/lib/use-station.ts`, `src/app/station/page.tsx`, `src/app/station/check-in/page.tsx`, `src/styles/station.css`
- Test: `tests/api/check-in.test.ts`

**Interfaces:**
- Consumes: `stationPost/stationGet`, `parseCode`, `logAttempt`, `rpc`, `panelFor`, `api`, `useI18n`.
- Produces:
  - `POST /api/station/check-in {code?: string, guest_id?: uuid}` (exactly one) → `ok(status, data)`; statuses `CHECKED_IN`, `ALREADY_CHECKED_IN`, `INVALID`, `NOT_ELIGIBLE`, `WRONG_CODE_TYPE`. Roles: `checkin` (and admin).
  - `GET /api/station/guests?q=` → `ok('OK', { guests: [{id, full_name, outlet, employee_id, checked_in}] })`. Roles: `checkin`, `merchandise`.
  - `GET /api/station/stats` → `ok('OK', { total, checked_in, redeemed, … })` (the `event_counts` result). Any station role.
  - `useStation(required: Role): { me: { role: string; label: string; labels: string[] } | null }` — redirects to `/station` when there is no session or the role does not match.
  - `<Scanner onCode paused />`, `<ResultPanel context result busy onNext onHandOver? />`, `<ManualSearch onPick />`, `<TabBar tab onTab counter />`, `<StationShell title me>`.
  - E2E hook: when `NEXT_PUBLIC_E2E === '1'`, `Scanner` exposes `window.__nfInjectCode(text)`.

- [ ] **Step 1: Write the failing API test**

`tests/api/check-in.test.ts`:
```ts
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as checkIn } from '@/app/api/station/check-in/route';
import { GET as guestsGet } from '@/app/api/station/guests/route';
import { GET as stats } from '@/app/api/station/stats/route';
import { EVENT, getReq, loginAs, postJson, resetEvent, seedGuests, setupPins, svc, type TestGuest } from './helpers';

let g: TestGuest[];
let cookie: string;
const json = async (r: Response) => r.json();
const scan = (code: string, c = cookie) => checkIn(postJson('/api/station/check-in', { code }, c));

beforeAll(setupPins);
beforeEach(async () => {
  await resetEvent();
  g = await seedGuests(3);
  cookie = await loginAs('checkin', 'Meja 2');
});

describe('access control', () => {
  it('needs a session', async () => {
    expect((await scan(`NF:CI:${g[0].invite_token}`, '')).status).toBe(401);
  });
  it('refuses other roles', async () => {
    const merch = await loginAs('merchandise', 'Booth 1');
    expect((await scan(`NF:CI:${g[0].invite_token}`, merch)).status).toBe(403);
    const draw = await loginAs('draw');
    expect((await scan(`NF:CI:${g[0].invite_token}`, draw)).status).toBe(403);
  });
  it('refuses foreign origins and bad bodies', async () => {
    const evil = new Request('http://localhost/api/station/check-in', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://evil.example', cookie },
      body: JSON.stringify({ code: `NF:CI:${g[0].invite_token}` }),
    });
    expect((await checkIn(evil)).status).toBe(403);
    expect((await checkIn(postJson('/api/station/check-in', {}, cookie))).status).toBe(400);
    expect((await checkIn(postJson('/api/station/check-in', { code: 'x', guest_id: g[0].id }, cookie))).status).toBe(400);
  });
});

describe('check-in', () => {
  it('checks a guest in by QR and issues number 1', async () => {
    const j = await json(await scan(`NF:CI:${g[0].invite_token}`));
    expect(j).toMatchObject({ ok: true, status: 'CHECKED_IN', data: { prize_number: 1, station_label: 'Meja 2', guest: { full_name: g[0].full_name } } });
  });
  it('reports a duplicate with the original number and issues no new one', async () => {
    await scan(`NF:CI:${g[0].invite_token}`);
    const dup = await json(await scan(`NF:CI:${g[0].invite_token}`));
    expect(dup).toMatchObject({ status: 'ALREADY_CHECKED_IN', data: { prize_number: 1 } });
    const next = await json(await scan(`NF:CI:${g[1].invite_token}`));
    expect(next.data.prize_number).toBe(2);
  });
  it('answers WRONG_CODE_TYPE for a merchandise QR without touching check-ins', async () => {
    const j = await json(await scan(`NF:MR:${g[0].merch_token}`));
    expect(j.status).toBe('WRONG_CODE_TYPE');
    const { count } = await svc().from('check_ins').select('id', { count: 'exact', head: true }).eq('event_id', EVENT);
    expect(count).toBe(0);
    const { data } = await svc().from('attempt_log').select('result').eq('event_id', EVENT);
    expect(data).toContainEqual({ result: 'WRONG_CODE_TYPE' });
  });
  it.each(['hello', 'NF:CI:short', 'NF:CI:AAAAAAAAAAAAAAAAAAAAAA'])('answers INVALID for %s', async (code) => {
    expect((await json(await scan(code))).status).toBe('INVALID');
  });
  it('checks in manually by guest id', async () => {
    const j = await json(await checkIn(postJson('/api/station/check-in', { guest_id: g[2].id }, cookie)));
    expect(j).toMatchObject({ status: 'CHECKED_IN', data: { prize_number: 1 } });
    const { data } = await svc().from('check_ins').select('method').eq('guest_id', g[2].id).single();
    expect(data?.method).toBe('manual');
  });
  it('refuses an inactive guest', async () => {
    await svc().from('guests').update({ active: false }).eq('id', g[0].id);
    expect((await json(await scan(`NF:CI:${g[0].invite_token}`))).status).toBe('NOT_ELIGIBLE');
  });
});

describe('search and stats', () => {
  it('searches by name without returning phone numbers', async () => {
    const res = await guestsGet(getReq('/api/station/guests?q=test%20guest%201', cookie));
    const j = await json(res);
    expect(j.data.guests).toHaveLength(1);
    expect(JSON.stringify(j)).not.toContain('628123450000');
    expect(j.data.guests[0]).toMatchObject({ full_name: 'Test Guest 1', checked_in: false });
  });
  it('lets the merchandise role search too, and refuses the draw role', async () => {
    expect((await guestsGet(getReq('/api/station/guests?q=test', await loginAs('merchandise', 'Booth 1')))).status).toBe(200);
    expect((await guestsGet(getReq('/api/station/guests?q=test', await loginAs('draw')))).status).toBe(403);
  });
  it('returns counts to any station role', async () => {
    await scan(`NF:CI:${g[0].invite_token}`);
    const j = await json(await stats(getReq('/api/station/stats', cookie)));
    expect(j.data).toMatchObject({ checked_in: 1, mode: 'rehearsal' });
    expect(j.data.total).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:api -- check-in`
Expected: FAIL — cannot resolve the route modules.

- [ ] **Step 3: Implement the three routes**

`src/lib/code-input.ts` (shared by the check-in and merchandise routes):
```ts
import { z } from 'zod';
import { ok } from './api';
import { logAttempt } from './db';
import { parseCode } from './qr';

export const codeInput = z
  .object({ code: z.string().min(1).max(200).optional(), guest_id: z.string().uuid().optional() })
  .refine((b) => !!b.code !== !!b.guest_id, { message: 'exactly one of code or guest_id' });
export type CodeInput = z.infer<typeof codeInput>;

/** Returns the token to look up (null for a manual guest id), or a ready response for a wrong or unknown code. */
export async function resolveCode(
  body: CodeInput,
  expected: 'checkin' | 'merch',
  kind: 'checkin' | 'merchandise',
  actor: string,
): Promise<{ token: string | null } | { response: Response }> {
  if (!body.code) return { token: null };
  const parsed = parseCode(body.code);
  if (parsed.kind === expected) return { token: parsed.token };
  if (parsed.kind === 'unknown') {
    await logAttempt(kind, body.code, 'INVALID', actor);
    return { response: ok('INVALID') };
  }
  await logAttempt(kind, parsed.token, 'WRONG_CODE_TYPE', actor); // answered before any guest lookup
  return { response: ok('WRONG_CODE_TYPE') };
}
```
`src/app/api/station/check-in/route.ts`:
```ts
import { ok } from '@/lib/api';
import { codeInput, resolveCode } from '@/lib/code-input';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, actorLabel, stationPost } from '@/lib/routes';

export const POST = stationPost(['checkin'], codeInput, async ({ actor, body }) => {
  const c = await resolveCode(body, 'checkin', 'checkin', actorId(actor));
  if ('response' in c) return c.response;
  const r = await rpc<{ status: string }>('check_in', {
    p_event: env().EVENT_ID, p_token: c.token, p_guest_id: body.guest_id ?? null,
    p_method: body.code ? 'scan' : 'manual', p_station_label: actorLabel(actor), p_actor: actorId(actor),
  });
  return ok(r.status, r);
});
```
`src/app/api/station/guests/route.ts`:
```ts
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { stationGet } from '@/lib/routes';

export const GET = stationGet(['checkin', 'merchandise'], async ({ req }) => {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  const r = await rpc<{ status: string; guests: unknown[] }>('find_guests', { p_event: env().EVENT_ID, p_q: q.slice(0, 60) });
  return ok('OK', { guests: r.guests });
});
```
`src/app/api/station/stats/route.ts`:
```ts
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { stationGet } from '@/lib/routes';
import { ROLES } from '@/lib/session';

export const GET = stationGet(ROLES, async () => ok('OK', await rpc('event_counts', { p_event: env().EVENT_ID })));
```

- [ ] **Step 4: Run the API test to verify it passes**

Run: `npm run test:api -- check-in`
Expected: PASS.

- [ ] **Step 5: Station styles (Ops mode: flat, big, no decoration behind results)**

`src/styles/station.css`:
```css
.station { min-height: 100dvh; display: flex; flex-direction: column; max-width: 520px; margin: 0 auto; background: var(--nf-black); }
.station__bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 14px var(--nf-gutter); min-height: 56px; }
.station__title { margin: 0; font-family: var(--nf-font-heading); font-size: 22px; letter-spacing: 0.08em; color: var(--nf-gold); }
.station__chip { font-family: var(--nf-font-label); font-weight: 600; font-size: 13px; letter-spacing: 0.14em; border: 2px solid var(--nf-gold); color: var(--nf-gold); padding: 2px 10px; border-radius: var(--nf-radius-pill); }
.station__main { flex: 1; display: flex; flex-direction: column; }
.station__logout { background: none; border: 0; color: var(--nf-text-muted); font-family: var(--nf-font-label); letter-spacing: 0.1em; min-height: 48px; padding: 0 8px; }

.login { padding: var(--nf-gutter); display: flex; flex-direction: column; gap: 16px; max-width: 420px; margin: 0 auto; }
.login h1 { margin: 0; font-family: var(--nf-font-heading); color: var(--nf-gold); letter-spacing: 0.06em; }
.field { width: 100%; min-height: 64px; border-radius: var(--nf-radius-btn); border: 2px solid var(--nf-line-dash); background: var(--nf-card); color: var(--nf-text); font-size: 28px; letter-spacing: 0.4em; text-align: center; }
.field--text { font-size: 18px; letter-spacing: normal; text-align: left; padding: 0 16px; min-height: 56px; }
.btn--staff { min-height: 64px; width: 100%; border: 0; border-radius: 14px; background: var(--nf-gold); color: var(--nf-black); font-family: var(--nf-font-heading); font-size: 24px; letter-spacing: 0.08em; }
.btn--staff-dark { background: var(--nf-black); color: var(--nf-text); }
.choices { display: grid; gap: 10px; }
.choice { min-height: 56px; border-radius: var(--nf-radius-btn); border: 2px solid var(--nf-gold); background: transparent; color: var(--nf-gold); font-family: var(--nf-font-heading); font-size: 20px; }
.choice[aria-pressed='true'] { background: var(--nf-gold); color: var(--nf-black); }

.scanner { position: relative; height: 190px; background: var(--nf-surface); display: flex; align-items: center; justify-content: center; overflow: hidden; }
.scanner__video { position: absolute; inset: 0; }
.scanner__video video { width: 100% !important; height: 190px !important; object-fit: cover; }
.scanner__hint { position: absolute; bottom: 8px; left: 0; right: 0; text-align: center; font-family: var(--nf-font-label); font-size: 12px; letter-spacing: 0.16em; color: #8A8A84; }
.scanner__gate { position: relative; padding: 16px; text-align: center; display: flex; flex-direction: column; gap: 10px; align-items: center; }
.scanner__gate p { margin: 0; color: var(--nf-text-soft); }
.scanner__gate .btn--staff { width: auto; min-height: 56px; padding: 0 24px; }
.brackets { position: absolute; left: 50%; top: 50%; width: 170px; height: 130px; transform: translate(-50%, -55%); pointer-events: none; }
.brackets i { position: absolute; width: 28px; height: 28px; border: 0 solid var(--nf-gold); }
.brackets i:nth-child(1) { left: 0; top: 0; border-left-width: 4px; border-top-width: 4px; }
.brackets i:nth-child(2) { right: 0; top: 0; border-right-width: 4px; border-top-width: 4px; }
.brackets i:nth-child(3) { left: 0; bottom: 0; border-left-width: 4px; border-bottom-width: 4px; }
.brackets i:nth-child(4) { right: 0; bottom: 0; border-right-width: 4px; border-bottom-width: 4px; }
.brackets--problem i { border-color: var(--nf-pink); }

.panel { flex: 1; padding: 18px var(--nf-gutter) 16px; display: flex; flex-direction: column; gap: 8px; color: var(--nf-black); }
.panel--green { background: var(--nf-green); }
.panel--pink { background: var(--nf-pink); }
.panel--gold { background: var(--nf-gold); }
.panel--neutral { background: var(--nf-card); color: var(--nf-text); }
.panel__head { display: flex; align-items: center; gap: 12px; }
.panel__icon { width: 52px; height: 52px; border-radius: 999px; background: var(--nf-black); display: flex; align-items: center; justify-content: center; flex: none; }
.panel--green .panel__icon svg { stroke: var(--nf-green); }
.panel--pink .panel__icon svg { stroke: var(--nf-pink); }
.panel--gold .panel__icon svg { stroke: var(--nf-gold); }
.panel__title { font-family: var(--nf-font-heading); font-size: 32px; letter-spacing: 0.04em; line-height: 1.05; }
.panel__name { font-family: var(--nf-font-heading); font-size: 44px; line-height: 1.02; text-transform: uppercase; margin-top: 6px; overflow-wrap: anywhere; }
.panel__meta { font-family: var(--nf-font-label); font-weight: 600; font-size: 18px; letter-spacing: 0.08em; }
.panel__note { font-size: 14px; font-weight: 600; }
.panel__prize { margin-top: 10px; background: var(--nf-black); border-radius: 16px; padding: 12px 16px 6px; display: flex; flex-direction: column; align-items: center; }
.panel__prize b { font-family: var(--nf-font-label); font-weight: 600; font-size: 14px; letter-spacing: 0.3em; color: var(--nf-gold); }
.panel__prize span { font-family: var(--nf-font-display); font-size: 96px; line-height: 1.05; color: var(--nf-gold); text-shadow: 4px 4px 0 var(--nf-pink); }
.panel__actions { margin-top: auto; display: grid; gap: 10px; }

.tabs { display: flex; border-top: 2px solid var(--nf-line); height: 64px; background: var(--nf-black); }
.tabs__item { flex: 1; display: flex; align-items: center; justify-content: center; border: 0; border-top: 3px solid transparent; background: transparent; color: var(--nf-text-muted); font-family: var(--nf-font-label); font-weight: 600; font-size: 14px; letter-spacing: 0.14em; }
.tabs__item[aria-selected='true'] { color: var(--nf-gold); border-top-color: var(--nf-gold); }

.search { padding: var(--nf-gutter); display: flex; flex-direction: column; gap: 12px; }
.search__row { min-height: 64px; border: 2px solid var(--nf-line-dash); border-radius: var(--nf-radius-btn); background: var(--nf-card); color: var(--nf-text); padding: 8px 16px; display: flex; flex-direction: column; align-items: flex-start; text-align: left; gap: 2px; }
.search__row b { font-family: var(--nf-font-heading); font-size: 20px; text-transform: uppercase; font-weight: 400; }
.search__row span { color: var(--nf-text-soft); font-size: 13px; }
.search__empty { color: var(--nf-text-muted); margin: 0; }
```

- [ ] **Step 6: Station hook and shell**

`src/lib/use-station.ts`:
```ts
'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from './client';

export type Me = { role: string; label: string; labels: string[] };

/** Loads the station session; sends the user to /station when it is missing or the role does not fit. */
export function useStation(required: string): { me: Me | null } {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    let alive = true;
    api<Me>('/api/station/me').then((r) => {
      if (!alive) return;
      if (r.http === 401 || r.http === 403) return router.replace('/station');
      if (r.ok && r.data) {
        if (r.data.role !== required && r.data.role !== 'admin') return router.replace('/station');
        if (!r.data.label) return router.replace('/station'); // label not chosen yet
        setMe(r.data);
      }
    });
    return () => { alive = false; };
  }, [required, router]);
  return { me };
}
```
`src/components/station/StationShell.tsx`:
```tsx
'use client';
import { useRouter } from 'next/navigation';
import { LangToggle } from '@/components/LangToggle';
import { api } from '@/lib/client';
import { useI18n } from '@/lib/i18n';
import type { Me } from '@/lib/use-station';
import '@/styles/station.css';

export function StationShell({ title, me, children }: { title: string; me: Me; children: React.ReactNode }) {
  const router = useRouter();
  const { t } = useI18n();
  async function logout() {
    await api('/api/station/logout', {});
    router.replace('/station');
  }
  return (
    <div className="station">
      <header className="station__bar">
        <h1 className="station__title">{title}</h1>
        <span className="station__chip">{me.label.toUpperCase()}</span>
        <LangToggle />
        <button type="button" className="station__logout" onClick={logout}>{t('common.logout')}</button>
      </header>
      <main className="station__main">{children}</main>
    </div>
  );
}
```
`src/components/station/TabBar.tsx`:
```tsx
'use client';
import { useI18n } from '@/lib/i18n';

export type Tab = 'scan' | 'manual';

export function TabBar({ tab, onTab, counter }: { tab: Tab; onTab: (t: Tab) => void; counter: string }) {
  const { t } = useI18n();
  return (
    <nav className="tabs" role="tablist">
      <button type="button" role="tab" className="tabs__item" aria-selected={tab === 'scan'} onClick={() => onTab('scan')}>{t('staff.tab_scan')}</button>
      <button type="button" role="tab" className="tabs__item" aria-selected={tab === 'manual'} onClick={() => onTab('manual')}>{t('staff.manual')}</button>
      <div className="tabs__item" aria-live="polite">{counter}</div>
    </nav>
  );
}
```

- [ ] **Step 7: Scanner, result panel, manual search**

`src/components/station/Scanner.tsx`:
```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';

declare global { interface Window { __nfInjectCode?: (text: string) => void } }

/** Camera strip. The camera starts only after an explanatory screen and a tap (also required by iOS Safari). */
export function Scanner({ onCode, paused, problem }: { onCode: (text: string) => void; paused: boolean; problem?: boolean }) {
  const { t } = useI18n();
  const [started, setStarted] = useState(false);
  const [denied, setDenied] = useState(false);
  const handler = useRef(onCode);
  const isPaused = useRef(paused);
  const last = useRef({ text: '', at: 0 });
  handler.current = onCode;
  isPaused.current = paused;

  const deliver = (text: string) => {
    const now = Date.now();
    if (isPaused.current) return;
    if (text === last.current.text && now - last.current.at < 2000) return; // ignore the same code for 2 seconds
    last.current = { text, at: now };
    handler.current(text);
  };

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_E2E === '1') window.__nfInjectCode = deliver;
    return () => { delete window.__nfInjectCode; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!started) return;
    let cancelled = false;
    let scanner: import('html5-qrcode').Html5Qrcode | null = null;
    (async () => {
      const { Html5Qrcode } = await import('html5-qrcode');
      if (cancelled) return;
      scanner = new Html5Qrcode('nf-scanner');
      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.8); return { width: s, height: s }; } },
          (text) => deliver(text),
          () => {},
        );
      } catch {
        if (!cancelled) setDenied(true);
      }
    })();
    return () => {
      cancelled = true;
      const s = scanner;
      if (s?.isScanning) s.stop().then(() => s.clear()).catch(() => {});
    };
  }, [started]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!started || denied) {
    return (
      <div className="scanner">
        <div className="scanner__gate">
          {denied ? <p role="alert">{t('staff.camera_denied')}</p> : (
            <>
              <p><b>{t('staff.camera_title')}</b></p>
              <p>{t('staff.camera_body')}</p>
              <button type="button" className="btn--staff" onClick={() => setStarted(true)}>{t('staff.camera_start')}</button>
            </>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="scanner">
      <div id="nf-scanner" className="scanner__video" />
      <div className={problem ? 'brackets brackets--problem' : 'brackets'} aria-hidden="true"><i /><i /><i /><i /></div>
    </div>
  );
}
```
`src/components/station/ResultPanel.tsx`:
```tsx
'use client';
import { useEffect } from 'react';
import { useI18n } from '@/lib/i18n';
import { panelFor, type Context, type Icon } from '@/lib/result-panel';
import { formatTimeWita } from '@/lib/time';

export type Result = {
  status: string;
  guest?: { id: string; full_name: string; outlet: string; department?: string | null; position?: string | null };
  prize_number?: number;
  checked_in_at?: string;
  redeemed_at?: string;
  station_label?: string;
};

const PATHS: Record<Exclude<Icon, 'none'>, string[]> = {
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  alert: ['M12 6v8', 'M12 18.5v.5'],
  cross: ['M6 6l12 12', 'M18 6L6 18'],
  swap: ['M5 9h13l-3-3', 'M19 15H6l3 3'],
  refresh: ['M19 8a8 8 0 1 0 1 6', 'M19 3v5h-5'],
};

function PanelIcon({ icon }: { icon: Icon }) {
  if (icon === 'none') return null;
  return (
    <span className="panel__icon" aria-hidden="true">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        {PATHS[icon].map((d) => <path key={d} d={d} />)}
      </svg>
    </span>
  );
}

export function ResultPanel({ context, result, busy, onNext, onHandOver }: {
  context: Context; result: Result; busy?: boolean; onNext: () => void; onHandOver?: () => void;
}) {
  const { t } = useI18n();
  const panel = panelFor(context, result.status);
  useEffect(() => { if (panel.vibrate.length) navigator.vibrate?.(panel.vibrate); }, [result, panel.vibrate]);

  const g = result.guest;
  const meta = [g?.outlet, g?.department, g?.position].filter(Boolean).join(' · ');
  const note =
    result.status === 'ALREADY_CHECKED_IN' && result.checked_in_at
      ? t('staff.first_checkin', { time: formatTimeWita(result.checked_in_at), station: result.station_label ?? '-' })
      : result.status === 'ALREADY_REDEEMED' && result.redeemed_at
        ? t('merch.already_detail', { time: formatTimeWita(result.redeemed_at), station: result.station_label ?? '-' })
        : null;
  const ready = context === 'merchandise' && result.status === 'READY';

  return (
    <section className={`panel panel--${panel.tone}`} role="status" aria-live="assertive">
      <div className="panel__head">
        <PanelIcon icon={panel.icon} />
        <span className="panel__title">{t(panel.titleKey)}</span>
      </div>
      {g && <div className="panel__name">{g.full_name}</div>}
      {meta && <div className="panel__meta">{meta}</div>}
      {context === 'checkin' && result.prize_number !== undefined && (
        <div className="panel__prize"><b>{t('staff.prize_label')}</b><span>{String(result.prize_number).padStart(3, '0')}</span></div>
      )}
      {note && <div className="panel__note">{note}</div>}
      <div className="panel__actions">
        {ready && (
          <button type="button" className="btn--staff" disabled={busy} aria-disabled={busy} onClick={onHandOver}>{t('merch.handover')}</button>
        )}
        <button type="button" className="btn--staff btn--staff-dark" onClick={onNext}>{t('staff.next')}</button>
      </div>
    </section>
  );
}
```
(On the merchandise `READY` panel the actions are HAND OVER, then SCAN NEXT acting as cancel.)

`src/components/station/ManualSearch.tsx`:
```tsx
'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { useI18n } from '@/lib/i18n';

export type Found = { id: string; full_name: string; outlet: string; employee_id: string; checked_in: boolean };

export function ManualSearch({ onPick }: { onPick: (g: Found) => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Found[] | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setRows(null); return; }
    const id = setTimeout(async () => {
      const r = await api<{ guests: Found[] }>(`/api/station/guests?q=${encodeURIComponent(q.trim())}`);
      if (r.ok && r.data) setRows(r.data.guests);
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

  return (
    <div className="search">
      <input className="field field--text" type="search" inputMode="search" autoComplete="off" autoFocus
        placeholder={t('staff.search_placeholder')} aria-label={t('staff.search_placeholder')}
        value={q} onChange={(e) => setQ(e.target.value)} />
      {rows?.length === 0 && <p className="search__empty">{t('staff.search_empty')}</p>}
      {rows?.map((g) => (
        <button key={g.id} type="button" className="search__row" onClick={() => onPick(g)}>
          <b>{g.full_name}</b>
          <span>{g.outlet} · {g.employee_id}{g.checked_in ? ` · ${t('staff.already_in')}` : ''}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 8: Station login page and check-in page**

`src/app/station/page.tsx`:
```tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LangToggle } from '@/components/LangToggle';
import { api } from '@/lib/client';
import { useI18n } from '@/lib/i18n';
import '@/styles/station.css';

const HOME: Record<string, string | undefined> = {
  checkin: '/station/check-in',
  merchandise: '/station/merchandise',
  // draw and prizes screens are added in Plan 2
};

export default function StationLogin() {
  const router = useRouter();
  const { t } = useI18n();
  const [pin, setPin] = useState('');
  const [step, setStep] = useState<'pin' | 'label'>('pin');
  const [role, setRole] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [label, setLabel] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submitPin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    const r = await api<{ role: string; labels: string[] }>('/api/station/login', { pin });
    setBusy(false);
    if (r.http === 429) return setMessage(t('login.locked'));
    if (r.status === 'INVALID') { setPin(''); return setMessage(t('login.invalid')); }
    if (!r.ok || !r.data) return setMessage(t('common.retry_hint'));
    if (!HOME[r.data.role]) return setMessage(t('login.coming_soon'));
    setRole(r.data.role);
    setLabels(r.data.labels);
    setStep('label');
  }

  async function submitLabel() {
    setBusy(true);
    const r = await api('/api/station/select-label', { label });
    setBusy(false);
    if (r.ok) router.replace(HOME[role]!);
    else setMessage(t('common.retry_hint'));
  }

  return (
    <div className="station">
      <header className="station__bar"><span className="station__chip">NOURISHFEST 2026</span><LangToggle /></header>
      <div className="login">
        <h1>{t('login.title')}</h1>
        {step === 'pin' ? (
          <form onSubmit={submitPin} className="login">
            <input className="field" type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="off" autoFocus
              aria-label={t('login.pin')} placeholder="••••••" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
            <button className="btn--staff" type="submit" disabled={busy || pin.length !== 6}>{t('login.submit')}</button>
          </form>
        ) : (
          <>
            <p>{t('login.pick_station')}</p>
            <div className="choices">
              {labels.map((l) => (
                <button key={l} type="button" className="choice" aria-pressed={label === l} onClick={() => setLabel(l)}>{l}</button>
              ))}
            </div>
            <button className="btn--staff" type="button" disabled={busy || !label} onClick={submitLabel}>{t('login.continue')}</button>
          </>
        )}
        {message && <p role="alert" className="error">{message}</p>}
      </div>
    </div>
  );
}
```
`src/app/station/check-in/page.tsx`:
```tsx
'use client';
import { useCallback, useEffect, useState } from 'react';
import { ManualSearch, type Found } from '@/components/station/ManualSearch';
import { ResultPanel, type Result } from '@/components/station/ResultPanel';
import { Scanner } from '@/components/station/Scanner';
import { StationShell } from '@/components/station/StationShell';
import { TabBar, type Tab } from '@/components/station/TabBar';
import { api } from '@/lib/client';
import { panelFor } from '@/lib/result-panel';
import { useStation } from '@/lib/use-station';

export default function CheckInStation() {
  const { me } = useStation('checkin');
  const [tab, setTab] = useState<Tab>('scan');
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [counter, setCounter] = useState('– / –');

  const refreshCounter = useCallback(async () => {
    const r = await api<{ checked_in: number; total: number }>('/api/station/stats');
    if (r.ok && r.data) setCounter(`${r.data.checked_in} / ${r.data.total}`);
  }, []);
  useEffect(() => {
    if (!me) return;
    refreshCounter();
    const id = setInterval(refreshCounter, 10_000);
    return () => clearInterval(id);
  }, [me, refreshCounter]);

  const submit = useCallback(async (body: { code: string } | { guest_id: string }) => {
    setBusy(true);
    const r = await api<Result>('/api/station/check-in', body);
    setBusy(false);
    setResult(r.ok ? { ...(r.data ?? {}), status: r.status } : { status: 'RETRYABLE_ERROR' });
    if (r.status === 'CHECKED_IN') refreshCounter();
  }, [refreshCounter]);

  if (!me) return null;
  const problem = result ? panelFor('checkin', result.status).tone !== 'green' : false;
  return (
    <StationShell title="CHECK-IN" me={me}>
      {tab === 'scan' && <Scanner onCode={(code) => submit({ code })} paused={busy || !!result} problem={problem} />}
      {result ? (
        <ResultPanel context="checkin" result={result} busy={busy} onNext={() => setResult(null)} />
      ) : tab === 'manual' ? (
        <ManualSearch onPick={(g: Found) => submit({ guest_id: g.id })} />
      ) : (
        <div style={{ flex: 1 }} />
      )}
      <TabBar tab={tab} onTab={(t) => { setResult(null); setTab(t); }} counter={counter} />
    </StationShell>
  );
}
```

- [ ] **Step 9: Verify by hand**

Run `npm run dev`. First set the PINs and make sure the guest from Task 10 Step 9 exists:
```bash
node --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  for (const [role, pin] of [['checkin','111111'],['merchandise','222222']])
    console.log(role, (await s.rpc('set_station_pin', { p_event: process.env.EVENT_ID, p_role: role, p_pin: pin, p_actor: 'me' })).data);
})();"
```
Expected: `checkin { status: 'OK' }` and `merchandise { status: 'OK' }`. Then:
1. Open `http://localhost:3000/station`, enter `111111`, pick `Meja 1`.
2. Use the **CARI MANUAL** tab, search `kadek`, tap the row. Expected: green panel `CHECK-IN BERHASIL`, name, number `001`.
3. Search again and tap it. Expected: pink panel `SUDAH CHECK-IN`, same `001`, note with the first check-in time.
4. Reload the guest pass within 6 seconds. Expected: the pass flips to the Door Prize number and the pink merchandise QR.

- [ ] **Step 10: Typecheck, lint, build and commit**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: success.

```bash
git add src tests
git commit -m "feat: check-in station with scanner, manual search, results and counters"
```

---

## Task 12: Merchandise booth — two-step API and UI

**Files:**
- Create: `src/app/api/station/merchandise/lookup/route.ts`, `src/app/api/station/merchandise/redeem/route.ts`, `src/app/api/station/merchandise/count/route.ts`, `src/app/station/merchandise/page.tsx`
- Test: `tests/api/merchandise.test.ts`

**Interfaces:**
- Consumes: `codeInput`, `resolveCode`, `stationPost/stationGet`, `redeem_lookup`, `redeem_merchandise`, `event_counts`, `ResultPanel`, `Scanner`, `ManualSearch`, `TabBar`, `StationShell`.
- Produces:
  - `POST /api/station/merchandise/lookup {code?|guest_id?}` → `ok(status, data)`; statuses `READY`, `ALREADY_REDEEMED`, `NOT_CHECKED_IN`, `NOT_ELIGIBLE`, `INVALID`, `WRONG_CODE_TYPE`. Writes no redemption.
  - `POST /api/station/merchandise/redeem {code?|guest_id?}` → `REDEEMED` (with `replay` flag) or a blocked status. The UI sends `guest_id` taken from the lookup result.
  - `GET /api/station/merchandise/count` → `ok('OK', { redeemed, checked_in })`.
  - Roles: `merchandise` (and admin).

- [ ] **Step 1: Write the failing API test**

`tests/api/merchandise.test.ts`:
```ts
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GET as count } from '@/app/api/station/merchandise/count/route';
import { POST as lookup } from '@/app/api/station/merchandise/lookup/route';
import { POST as redeem } from '@/app/api/station/merchandise/redeem/route';
import { EVENT, getReq, loginAs, postJson, resetEvent, seedGuests, setupPins, svc, type TestGuest } from './helpers';

let g: TestGuest[];
let booth1: string;
let booth2: string;
const json = (r: Response) => r.json();
const look = (code: string, c = booth1) => lookup(postJson('/api/station/merchandise/lookup', { code }, c));
const give = (body: object, c = booth1) => redeem(postJson('/api/station/merchandise/redeem', body, c));
const checkIn = (i: number) =>
  svc().rpc('check_in', { p_event: EVENT, p_token: g[i].invite_token, p_guest_id: null, p_method: 'scan', p_station_label: 'Meja 1', p_actor: 'test' });

beforeAll(setupPins);
beforeEach(async () => {
  await resetEvent();
  g = await seedGuests(3);
  booth1 = await loginAs('merchandise', 'Booth 1');
  booth2 = await loginAs('merchandise', 'Booth 2');
});

describe('access control', () => {
  it('needs the merchandise role', async () => {
    expect((await look(`NF:MR:${g[0].merch_token}`, '')).status).toBe(401);
    expect((await look(`NF:MR:${g[0].merch_token}`, await loginAs('checkin'))).status).toBe(403);
    expect((await give({ guest_id: g[0].id }, await loginAs('draw'))).status).toBe(403);
  });
});

describe('lookup', () => {
  it('is READY for a checked-in guest and writes nothing', async () => {
    await checkIn(0);
    const j = await json(await look(`NF:MR:${g[0].merch_token}`));
    expect(j).toMatchObject({ status: 'READY', data: { guest: { id: g[0].id, full_name: g[0].full_name } } });
    const { count: n } = await svc().from('merchandise_redemptions').select('id', { count: 'exact', head: true }).eq('event_id', EVENT);
    expect(n).toBe(0);
  });
  it('is NOT_CHECKED_IN before check-in', async () => {
    expect((await json(await look(`NF:MR:${g[1].merch_token}`))).status).toBe('NOT_CHECKED_IN');
  });
  it('rejects a check-in QR with WRONG_CODE_TYPE', async () => {
    await checkIn(0);
    expect((await json(await look(`NF:CI:${g[0].invite_token}`))).status).toBe('WRONG_CODE_TYPE');
  });
  it.each(['junk', 'NF:MR:AAAAAAAAAAAAAAAAAAAAAA'])('is INVALID for %s', async (code) => {
    expect((await json(await look(code))).status).toBe('INVALID');
  });
});

describe('hand over', () => {
  it('records one redemption and blocks the second station', async () => {
    await checkIn(0);
    expect((await json(await give({ guest_id: g[0].id }))).status).toBe('REDEEMED');
    const second = await json(await give({ guest_id: g[0].id }, booth2));
    expect(second).toMatchObject({ status: 'ALREADY_REDEEMED', data: { station_label: 'Booth 1' } });
    const { count: n } = await svc().from('merchandise_redemptions').select('id', { count: 'exact', head: true }).eq('status', 'redeemed');
    expect(n).toBe(1);
  });
  it('treats a quick repeat from the same station as the same tap', async () => {
    await checkIn(0);
    await give({ guest_id: g[0].id });
    const again = await json(await give({ guest_id: g[0].id }));
    expect(again).toMatchObject({ status: 'REDEEMED', data: { replay: true } });
  });
  it('refuses a guest who has not checked in', async () => {
    expect((await json(await give({ guest_id: g[1].id }))).status).toBe('NOT_CHECKED_IN');
  });
  it('also works straight from a QR scan', async () => {
    await checkIn(2);
    expect((await json(await give({ code: `NF:MR:${g[2].merch_token}` }))).status).toBe('REDEEMED');
  });
  it('shows the claim on the guest pass', async () => {
    await checkIn(0);
    await give({ guest_id: g[0].id });
    const { data } = await svc().rpc('get_pass', { p_token: g[0].invite_token });
    expect(data.merchandise.claimed).toBe(true);
  });
  it('counts redemptions', async () => {
    await checkIn(0);
    await checkIn(1);
    await give({ guest_id: g[0].id });
    expect((await json(await count(getReq('/api/station/merchandise/count', booth1)))).data).toMatchObject({ redeemed: 1, checked_in: 2 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:api -- merchandise`
Expected: FAIL — cannot resolve the route modules.

- [ ] **Step 3: Implement the three routes**

`src/app/api/station/merchandise/lookup/route.ts`:
```ts
import { ok } from '@/lib/api';
import { codeInput, resolveCode } from '@/lib/code-input';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, stationPost } from '@/lib/routes';

export const POST = stationPost(['merchandise'], codeInput, async ({ actor, body }) => {
  const c = await resolveCode(body, 'merch', 'merchandise', actorId(actor));
  if ('response' in c) return c.response;
  const r = await rpc<{ status: string }>('redeem_lookup', {
    p_event: env().EVENT_ID, p_token: c.token, p_guest_id: body.guest_id ?? null, p_actor: actorId(actor),
  });
  return ok(r.status, r);
});
```
`src/app/api/station/merchandise/redeem/route.ts`:
```ts
import { ok } from '@/lib/api';
import { codeInput, resolveCode } from '@/lib/code-input';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, actorLabel, stationPost } from '@/lib/routes';

export const POST = stationPost(['merchandise'], codeInput, async ({ actor, body }) => {
  const c = await resolveCode(body, 'merch', 'merchandise', actorId(actor));
  if ('response' in c) return c.response;
  const r = await rpc<{ status: string }>('redeem_merchandise', {
    p_event: env().EVENT_ID, p_token: c.token, p_guest_id: body.guest_id ?? null,
    p_station_label: actorLabel(actor), p_actor: actorId(actor),
  });
  return ok(r.status, r);
});
```
`src/app/api/station/merchandise/count/route.ts`:
```ts
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { stationGet } from '@/lib/routes';

export const GET = stationGet(['merchandise'], async () => {
  const c = await rpc<{ redeemed: number; checked_in: number }>('event_counts', { p_event: env().EVENT_ID });
  return ok('OK', { redeemed: c.redeemed, checked_in: c.checked_in });
});
```

- [ ] **Step 4: Run the API test to verify it passes**

Run: `npm run test:api -- merchandise`
Expected: PASS. Also re-run `npm run test:api -- check-in` to confirm the Task 11 route still passes after moving to `codeInput`.

- [ ] **Step 5: Booth page**

`src/app/station/merchandise/page.tsx`:
```tsx
'use client';
import { useCallback, useEffect, useState } from 'react';
import { ManualSearch, type Found } from '@/components/station/ManualSearch';
import { ResultPanel, type Result } from '@/components/station/ResultPanel';
import { Scanner } from '@/components/station/Scanner';
import { StationShell } from '@/components/station/StationShell';
import { TabBar, type Tab } from '@/components/station/TabBar';
import { api } from '@/lib/client';
import { panelFor } from '@/lib/result-panel';
import { useStation } from '@/lib/use-station';

export default function MerchandiseStation() {
  const { me } = useStation('merchandise');
  const [tab, setTab] = useState<Tab>('scan');
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [counter, setCounter] = useState('– / –');

  const refreshCounter = useCallback(async () => {
    const r = await api<{ redeemed: number; checked_in: number }>('/api/station/merchandise/count');
    if (r.ok && r.data) setCounter(`${r.data.redeemed} / ${r.data.checked_in}`);
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

  // The redemption is recorded only when the "hand over" button is tapped.
  const handOver = useCallback(async () => {
    if (!result?.guest?.id) return;
    setBusy(true);
    const r = await api<Result>('/api/station/merchandise/redeem', { guest_id: result.guest.id });
    setBusy(false);
    setResult(asResult(r));
    if (r.status === 'REDEEMED') refreshCounter();
  }, [result, refreshCounter]);

  if (!me) return null;
  const problem = result ? !['green', 'neutral'].includes(panelFor('merchandise', result.status).tone) : false;
  return (
    <StationShell title="MERCHANDISE" me={me}>
      {tab === 'scan' && <Scanner onCode={(code) => doLookup({ code })} paused={busy || !!result} problem={problem} />}
      {result ? (
        <ResultPanel context="merchandise" result={result} busy={busy} onNext={() => setResult(null)} onHandOver={handOver} />
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
The `asResult` helper is repeated in the check-in page; leave both (two call sites, five lines each) rather than inventing a shared abstraction.

- [ ] **Step 6: Verify by hand**

With the guest checked in (Task 11 Step 9), open `/station`, log in with `222222`, pick `Booth 1`, use **CARI MANUAL**, search `kadek`, tap the row. Expected: panel `SIAP DISERAHKAN` with the name and a `SERAHKAN MERCHANDISE` button; no redemption yet (`select count(*) from merchandise_redemptions` is 0). Tap the button. Expected: green `TERCATAT`, counter `1 / 1`. Search again. Expected: pink `SUDAH DIAMBIL` with time and `Booth 1`. Reload the guest pass: the merchandise card shows `SUDAH DIAMBIL` and no QR.

- [ ] **Step 7: Typecheck, lint and commit**

Run: `npx tsc --noEmit && npm run lint && npm run test:api`
Expected: all pass.

```bash
git add src tests
git commit -m "feat: merchandise booth with two-step hand-over"
```

---

## Task 13: Admin sign-in, guest import, guest management, invitation export, merchandise voids

**Files:**
- Create: `src/lib/supabase-server.ts`, `src/lib/admin-page.ts`, `src/lib/import.ts`, `src/lib/invitations.ts`, `src/middleware.ts`
- Create routes: `src/app/auth/google/route.ts`, `src/app/auth/callback/route.ts`, `src/app/api/admin/logout/route.ts`, `src/app/api/admin/import/preview/route.ts`, `src/app/api/admin/import/commit/route.ts`, `src/app/api/admin/guests/route.ts`, `src/app/api/admin/guests/walk-in/route.ts`, `src/app/api/admin/invitations.csv/route.ts`, `src/app/api/admin/redemptions/route.ts`, `src/app/api/admin/redemptions/[id]/void/route.ts`
- Modify: `supabase/config.toml` (Google provider and redirect URLs)
- Test: `tests/unit/import.test.ts`, `tests/unit/invitations.test.ts`, `tests/api/admin-guests.test.ts`

**Interfaces:**
- Consumes: `getAdmin`, `adminGet`, `adminPost`, `actorId`, `rpc`, `db`, `RetryableError`, `env`, `parseGuestCsv`, `normalisePhone`, `csvSafe`, SQL `import_preview`, `import_guests`, `admin_guest_list`, `admin_update_guest`, `add_walk_in`, `void_redemption`, `is_admin`, `audit`.
- Produces:
  - `supabaseServer(): Promise<SupabaseClient>` (cookie-bound, anon key, for sign-in and sign-out only). `requireAdminPage(): Promise<{ email: string }>` (server components; redirects to `/admin/login`).
  - `prepareImport(text: string): Prepared`, `previewImport(text)`, `commitImport(text, actor)` in `lib/import.ts`. Result shape: `{ status: 'OK' | 'HAS_ERRORS' | 'BAD_COLUMNS' | 'EMPTY' | 'TOO_MANY', ... }`.
  - `passUrl(appUrl, token)`, `waLink(phone, name, url)`, `buildInvitationsCsv(rows, appUrl)` in `lib/invitations.ts`.
  - `POST /api/admin/import/preview {csv}` → `ok(status, { errors, would_insert, would_update, missing_count, missing })`. `POST /api/admin/import/commit {csv}` → `ok('OK', { batch_id, inserted, updated, flagged_missing })` or `ok('HAS_ERRORS', { errors })`.
  - `GET /api/admin/guests?q=&outlet=` → `ok('OK', { guests: GuestListRow[] })`. `POST /api/admin/guests {guest_id, changes}` → `OK | NOT_FOUND | INVALID_PHONE`. (POST, not PATCH: the route wrappers cover GET and POST only.)
  - `POST /api/admin/guests/walk-in {full_name, outlet, department?, position?}` → `ok('OK', { guest_id, employee_id, invite_token, pass_url })` | `ok('INVALID')`.
  - `GET /api/admin/invitations.csv?outlet=` → `text/csv` attachment (optional outlet filter), audited.
  - `GET /api/admin/redemptions` → `ok('OK', { redemptions: [{ id, status, redeemed_at, station_label, void_reason, guest: { id, employee_id, full_name, outlet } }] })`. `POST /api/admin/redemptions/[id]/void {reason}` → `OK | REASON_REQUIRED | NOT_FOUND`.
  - `POST /api/admin/logout` → `ok('OK')`.
  - Every `/api/admin/*` route answers 401 `NO_SESSION` without a valid admin session (a station cookie does not count).

- [ ] **Step 1: Write the failing unit tests**

`tests/unit/import.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { MAX_ROWS, prepareImport } from '@/lib/import';

describe('prepareImport', () => {
  it('accepts a good file and keeps row numbers', () => {
    const p = prepareImport('Employee ID,Nama,Outlet,No HP\nE1,Ayu,Outlet A,0812-3456-7001\nE2,Bagus,Outlet B,\n');
    expect(p.status).toBe('OK');
    if (p.status !== 'OK') return;
    expect(p.rows.map((r) => [r.row_no, r.employee_id, r.phone ?? null])).toEqual([[2, 'E1', '+6281234567001'], [3, 'E2', null]]);
    expect(p.parseErrors).toEqual([]);
  });
  it('reports missing required columns', () => {
    expect(prepareImport('a,b\n1,2\n')).toMatchObject({ status: 'BAD_COLUMNS', missingColumns: ['employee_id', 'full_name', 'outlet'] });
  });
  it('treats a header-only file as empty', () => {
    expect(prepareImport('employee_id,full_name,outlet\n').status).toBe('EMPTY');
  });
  it('rejects oversized files', () => {
    const body = Array.from({ length: MAX_ROWS + 1 }, (_, i) => `E${i},N${i},O`).join('\n');
    expect(prepareImport(`employee_id,full_name,outlet\n${body}\n`).status).toBe('TOO_MANY');
  });
  it('keeps invalid phones as row errors instead of failing the file', () => {
    const p = prepareImport('employee_id,full_name,outlet,phone\nE1,Ayu,O,123\n');
    expect(p.status).toBe('OK');
    if (p.status === 'OK') expect(p.parseErrors).toEqual([{ row: 2, field: 'phone', code: 'INVALID_PHONE' }]);
  });
});
```

`tests/unit/invitations.test.ts`:
```ts
import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import { buildInvitationsCsv, passUrl, waLink } from '@/lib/invitations';

const APP = 'https://nourishfest.example/';
const row = { employee_id: 'E1', full_name: 'Kadek Ayu', outlet: 'Outlet A', phone: '+6281234567001', invite_token: 'AAAAAAAAAAAAAAAAAAAAAA' };

describe('passUrl', () => {
  it('joins without a double slash', () => expect(passUrl(APP, 'T')).toBe('https://nourishfest.example/pass/T'));
});

describe('waLink', () => {
  it('uses digits only and an encoded Indonesian message with the link', () => {
    const link = waLink('+6281234567001', 'Kadek Ayu', 'https://x.test/pass/T');
    expect(link.startsWith('https://wa.me/6281234567001?text=')).toBe(true);
    const text = decodeURIComponent(link.split('text=')[1]);
    expect(text).toContain('Kadek');
    expect(text).toContain('https://x.test/pass/T');
    expect(text).toContain('NourishFest 2026');
  });
});

describe('buildInvitationsCsv', () => {
  const parse = (csv: string) => Papa.parse<Record<string, string>>(csv.replace(/^﻿/, ''), { header: true, skipEmptyLines: true }).data;

  it('writes one row per guest with the personal link', () => {
    const rows = parse(buildInvitationsCsv([row], APP));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ employee_id: 'E1', full_name: 'Kadek Ayu', phone: '6281234567001', pass_link: `https://nourishfest.example/pass/${row.invite_token}` });
    expect(rows[0].whatsapp_link).toContain('https://wa.me/6281234567001');
  });
  it('leaves the WhatsApp link blank when there is no phone', () => {
    expect(parse(buildInvitationsCsv([{ ...row, phone: null }], APP))[0]).toMatchObject({ phone: '', whatsapp_link: '' });
  });
  it('neutralises spreadsheet formulas in names', () => {
    expect(parse(buildInvitationsCsv([{ ...row, full_name: '=HYPERLINK("http://evil")' }], APP))[0].full_name).toBe(`'=HYPERLINK("http://evil")`);
  });
  it('starts with a BOM so Excel reads UTF-8', () => {
    expect(buildInvitationsCsv([row], APP).charCodeAt(0)).toBe(0xfeff);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run test:unit -- import invitations`
Expected: FAIL — cannot resolve `@/lib/import` and `@/lib/invitations`.

- [ ] **Step 3: Implement `lib/import.ts` and `lib/invitations.ts`**

`src/lib/import.ts`:
```ts
import { parseGuestCsv, type GuestRow, type RowError } from './csv';
import { rpc } from './db';
import { env } from './env';

export const MAX_ROWS = 1000;

export type Prepared =
  | { status: 'OK'; rows: GuestRow[]; parseErrors: RowError[] }
  | { status: 'BAD_COLUMNS'; missingColumns: string[] }
  | { status: 'EMPTY' }
  | { status: 'TOO_MANY' };

export function prepareImport(text: string): Prepared {
  const { rows, errors, missingColumns } = parseGuestCsv(text);
  if (missingColumns.length > 0) return { status: 'BAD_COLUMNS', missingColumns };
  if (rows.length === 0) return { status: 'EMPTY' };
  if (rows.length > MAX_ROWS) return { status: 'TOO_MANY' };
  return { status: 'OK', rows, parseErrors: errors };
}

type Preview = {
  status: string; errors: RowError[]; would_insert: number; would_update: number;
  missing_count: number; missing: { employee_id: string; full_name: string }[];
};

/** Dry run: parse errors and database checks merged into one list. Writes nothing. */
export async function previewImport(text: string): Promise<Record<string, unknown> & { status: string }> {
  const p = prepareImport(text);
  if (p.status !== 'OK') return p;
  const r = await rpc<Preview>('import_preview', { p_event: env().EVENT_ID, p_rows: p.rows });
  const errors = [...p.parseErrors, ...r.errors];
  return { ...r, errors, status: errors.length > 0 ? 'HAS_ERRORS' : 'OK' };
}

/** All-or-nothing: any parse or database error means nothing is written. */
export async function commitImport(text: string, actor: string): Promise<Record<string, unknown> & { status: string }> {
  const p = prepareImport(text);
  if (p.status !== 'OK') return p;
  if (p.parseErrors.length > 0) return { status: 'HAS_ERRORS', errors: p.parseErrors };
  return rpc('import_guests', { p_event: env().EVENT_ID, p_rows: p.rows, p_filename: 'upload.csv', p_actor: actor });
}
```

`src/lib/invitations.ts`:
```ts
import Papa from 'papaparse';
import { csvSafe } from './csv';

export type InviteRow = { employee_id: string; full_name: string; outlet: string; phone: string | null; invite_token: string };

export const passUrl = (appUrl: string, token: string): string => `${appUrl.replace(/\/+$/, '')}/pass/${token}`;

/** Click-to-chat link with a ready Indonesian message; the admin only presses send. */
export function waLink(phone: string, name: string, url: string): string {
  const first = name.trim().split(/\s+/)[0] ?? name;
  const text = `Halo ${first}, ini undangan pribadimu untuk NourishFest 2026. Buka linknya dan simpan QR-nya ya: ${url}`;
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

export function buildInvitationsCsv(rows: InviteRow[], appUrl: string): string {
  const data = rows.map((r) => {
    const link = passUrl(appUrl, r.invite_token);
    return {
      employee_id: csvSafe(r.employee_id),
      full_name: csvSafe(r.full_name),
      outlet: csvSafe(r.outlet),
      phone: r.phone ? r.phone.replace(/\D/g, '') : '', // digits only: a leading "+" would be read as a formula
      pass_link: link,
      whatsapp_link: r.phone ? waLink(r.phone, r.full_name, link) : '',
    };
  });
  const columns = ['employee_id', 'full_name', 'outlet', 'phone', 'pass_link', 'whatsapp_link'] as const;
  // Object form with explicit fields, so an empty list still produces the header row.
  return '\uFEFF' + Papa.unparse({ fields: [...columns], data: data.map((d) => columns.map((c) => d[c])) });
}
```

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `npm run test:unit`
Expected: PASS (all unit files).

- [ ] **Step 5: Write the failing API test**

`tests/api/admin-guests.test.ts`:
```ts
import Papa from 'papaparse';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/admin-auth', () => ({ getAdmin: vi.fn() }));

import { getAdmin } from '@/lib/admin-auth';
import { GET as invitations } from '@/app/api/admin/invitations.csv/route';
import { GET as listGuests, POST as updateGuest } from '@/app/api/admin/guests/route';
import { POST as walkIn } from '@/app/api/admin/guests/walk-in/route';
import { POST as commit } from '@/app/api/admin/import/commit/route';
import { POST as preview } from '@/app/api/admin/import/preview/route';
import { GET as listRedemptions } from '@/app/api/admin/redemptions/route';
import { POST as voidRedemption } from '@/app/api/admin/redemptions/[id]/void/route';
import { EVENT, getReq, loginAs, postJson, resetEvent, seedGuests, setupPins, svc, type TestGuest } from './helpers';

const asAdmin = () => vi.mocked(getAdmin).mockResolvedValue({ email: 'dev-admin@example.com' });
const asNobody = () => vi.mocked(getAdmin).mockResolvedValue(null);
const json = (r: Response) => r.json();
const CSV_OK = 'Employee ID,Nama,Outlet,No HP\nX1,Ayu Lestari,Outlet A,0812-3456-7001\nX2,Bagus,Outlet B,\n';

async function cleanup() {
  await svc().from('guests').delete().eq('event_id', EVENT).or('employee_id.like.X*,employee_id.like.WALKIN-*');
}

beforeAll(setupPins);
beforeEach(async () => {
  asAdmin();
  await resetEvent();
  await cleanup();
});
afterAll(cleanup);

describe('access', () => {
  it('answers 401 without an admin session, even with a station cookie', async () => {
    asNobody();
    const station = await loginAs('checkin');
    const res = await preview(postJson('/api/admin/import/preview', { csv: CSV_OK }, station));
    expect(res.status).toBe(401);
    expect((await listGuests(getReq('/api/admin/guests', station))).status).toBe(401);
  });
  it('rejects a cross-origin POST', async () => {
    const req = new Request('http://localhost/api/admin/import/preview', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: JSON.stringify({ csv: CSV_OK }),
    });
    expect((await preview(req)).status).toBe(403);
  });
});

describe('import', () => {
  const countX = async () => (await svc().from('guests').select('id', { count: 'exact', head: true }).eq('event_id', EVENT).like('employee_id', 'X%')).count;

  it('previews without writing', async () => {
    const j = await json(await preview(postJson('/api/admin/import/preview', { csv: CSV_OK })));
    expect(j).toMatchObject({ status: 'OK', data: { would_insert: 2, would_update: 0 } });
    expect(await countX()).toBe(0);
  });
  it('lists every problem at once and blocks the commit', async () => {
    const bad = 'employee_id,full_name,outlet,phone\nX1,Ayu,O,123\nX1,Bagus,O,\n';
    const p = await json(await preview(postJson('/api/admin/import/preview', { csv: bad })));
    expect(p.status).toBe('HAS_ERRORS');
    const codes = p.data.errors.map((e: { code: string }) => e.code).sort();
    expect(codes).toEqual(['DUPLICATE_IN_FILE', 'DUPLICATE_IN_FILE', 'INVALID_PHONE']);
    const c = await json(await commit(postJson('/api/admin/import/commit', { csv: bad })));
    expect(c.status).toBe('HAS_ERRORS');
    expect(await countX()).toBe(0);
  });
  it('rejects names over 120 characters', async () => {
    const csv = `employee_id,full_name,outlet\nX1,${'A'.repeat(121)},Outlet A\n`;
    const j = await json(await preview(postJson('/api/admin/import/preview', { csv })));
    expect(j.status).toBe('HAS_ERRORS');
    expect(j.data.errors).toEqual([{ row: 2, field: 'full_name', code: 'TOO_LONG' }]);
  });
  it('reports a file without the required columns', async () => {
    const j = await json(await preview(postJson('/api/admin/import/preview', { csv: 'a,b\n1,2\n' })));
    expect(j).toMatchObject({ status: 'BAD_COLUMNS' });
    expect(j.data.missingColumns).toContain('employee_id');
  });
  it('commits, then flags guests missing from the next file instead of deleting them', async () => {
    const c1 = await json(await commit(postJson('/api/admin/import/commit', { csv: CSV_OK })));
    expect(c1).toMatchObject({ status: 'OK', data: { inserted: 2 } });
    const c2 = await json(await commit(postJson('/api/admin/import/commit', { csv: 'employee_id,full_name,outlet\nX1,Ayu Lestari,Outlet A\n' })));
    expect(c2.data).toMatchObject({ inserted: 0, updated: 1 });
    const { data: x2 } = await svc().from('guests').select('flagged_missing, active').eq('event_id', EVENT).eq('employee_id', 'X2').single();
    expect(x2).toEqual({ flagged_missing: true, active: true });
  });
});

describe('guests', () => {
  let g: TestGuest[];
  beforeEach(async () => { g = await seedGuests(2); });

  it('lists and filters', async () => {
    const all = await json(await listGuests(getReq('/api/admin/guests?q=test%20guest%201')));
    expect(all.data.guests.map((x: { employee_id: string }) => x.employee_id)).toEqual(['T1']);
    const none = await json(await listGuests(getReq('/api/admin/guests?outlet=Nowhere')));
    expect(none.data.guests).toEqual([]);
  });
  it('updates a guest and normalises the phone', async () => {
    const j = await json(await updateGuest(postJson('/api/admin/guests', { guest_id: g[0].id, changes: { full_name: 'Renamed Guest', phone: '0812 3456 7002' } })));
    expect(j.status).toBe('OK');
    const { data } = await svc().from('guests').select('full_name, phone').eq('id', g[0].id).single();
    expect(data).toEqual({ full_name: 'Renamed Guest', phone: '+6281234567002' });
    await svc().from('guests').update({ full_name: g[0].full_name }).eq('id', g[0].id);
  });
  it('rejects a bad phone, an unknown guest and unknown fields', async () => {
    expect((await json(await updateGuest(postJson('/api/admin/guests', { guest_id: g[0].id, changes: { phone: '12' } })))).status).toBe('INVALID_PHONE');
    expect((await json(await updateGuest(postJson('/api/admin/guests', { guest_id: crypto.randomUUID(), changes: { outlet: 'B' } })))).status).toBe('NOT_FOUND');
    expect((await updateGuest(postJson('/api/admin/guests', { guest_id: g[0].id, changes: { invite_token: 'x' } }))).status).toBe(400);
  });
  it('adds a walk-in with a working pass link', async () => {
    const j = await json(await walkIn(postJson('/api/admin/guests/walk-in', { full_name: 'Tamu Baru', outlet: 'Outlet A' })));
    expect(j.status).toBe('OK');
    expect(j.data.employee_id).toMatch(/^WALKIN-\d+$/);
    expect(j.data.pass_url).toBe(`${process.env.APP_URL}/pass/${j.data.invite_token}`);
    const { data } = await svc().rpc('get_pass', { p_token: j.data.invite_token });
    expect(data.status).toBe('OK');
  });
  it('refuses a walk-in without a name', async () => {
    expect((await json(await walkIn(postJson('/api/admin/guests/walk-in', { full_name: ' ', outlet: 'A' })))).status).toBe('INVALID');
  });
  it('filters the invitation export by outlet', async () => {
    const parse = async (res: Response) =>
      Papa.parse<Record<string, string>>((await res.text()).replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: true }).data;
    const some = await parse(await invitations(getReq('/api/admin/invitations.csv?outlet=Outlet%20A')));
    expect(some.some((r) => r.employee_id === 'T1')).toBe(true);
    expect(some.every((r) => r.outlet === 'Outlet A')).toBe(true);
    expect(await parse(await invitations(getReq('/api/admin/invitations.csv?outlet=Nowhere')))).toEqual([]);
  });
  it('exports invitations with each active employee’s personal link and audits the download', async () => {
    const res = await invitations(getReq('/api/admin/invitations.csv'));
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const rows = Papa.parse<Record<string, string>>((await res.text()).replace(/^﻿/, ''), { header: true, skipEmptyLines: true }).data;
    const mine = rows.find((r) => r.employee_id === 'T1')!;
    expect(mine.pass_link).toBe(`${process.env.APP_URL}/pass/${g[0].invite_token}`);
    const { count } = await svc().from('audit_log').select('id', { count: 'exact', head: true }).eq('event_id', EVENT).eq('action', 'invitations_exported');
    expect(count).toBe(1);
  });
});

describe('merchandise voids', () => {
  let g: TestGuest[];
  beforeEach(async () => {
    g = await seedGuests(1);
    await svc().rpc('check_in', { p_event: EVENT, p_token: g[0].invite_token, p_guest_id: null, p_method: 'scan', p_station_label: 'Meja 1', p_actor: 'test' });
    await svc().rpc('redeem_merchandise', { p_event: EVENT, p_token: g[0].merch_token, p_guest_id: null, p_station_label: 'Booth 1', p_actor: 'test' });
  });
  const voidCall = (id: string, reason: string) =>
    voidRedemption(postJson(`/api/admin/redemptions/${id}/void`, { reason }), { params: Promise.resolve({ id }) });

  it('lists redemptions with the guest', async () => {
    const j = await json(await listRedemptions(getReq('/api/admin/redemptions')));
    expect(j.data.redemptions[0]).toMatchObject({ status: 'redeemed', station_label: 'Booth 1', guest: { employee_id: 'T1' } });
  });
  it('voids with a reason, frees the guest to collect again, and keeps the audit trail', async () => {
    const id = (await json(await listRedemptions(getReq('/api/admin/redemptions')))).data.redemptions[0].id;
    expect((await json(await voidCall(id, 'abc'))).status).toBe('REASON_REQUIRED');
    expect((await json(await voidCall(id, 'Wrong size, exchanged by mistake'))).status).toBe('OK');
    expect((await json(await voidCall(id, 'Second attempt on same row'))).status).toBe('NOT_FOUND');
    const { data } = await svc().rpc('redeem_lookup', { p_event: EVENT, p_token: g[0].merch_token, p_guest_id: null });
    expect(data.status).toBe('READY');
  });
  it('rejects a malformed id', async () => {
    expect((await voidCall('not-a-uuid', 'Some valid reason')).status).toBe(400);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm run test:api -- admin-guests`
Expected: FAIL — cannot resolve the admin route modules.

- [ ] **Step 7: Implement the Supabase helpers, middleware and sign-in routes**

`src/lib/supabase-server.ts`:
```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from './env';

/** Cookie-bound client using the anon key. Used only for Google sign-in, sign-out and page-level session checks. */
export async function supabaseServer() {
  const jar = await cookies();
  return createServerClient(env().SUPABASE_URL, env().SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) jar.set(name, value, options);
        } catch {
          // called from a server component: middleware refreshes the session instead
        }
      },
    },
  });
}
```

`src/lib/admin-page.ts`:
```ts
import { redirect } from 'next/navigation';
import { rpc } from './db';
import { env } from './env';
import { supabaseServer } from './supabase-server';

/** For admin server components: returns the signed-in allow-listed admin or redirects to the login page. */
export async function requireAdminPage(): Promise<{ email: string }> {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email?.toLowerCase();
  if (!email) redirect('/admin/login');
  const allowed = await rpc<boolean>('is_admin', { p_event: env().EVENT_ID, p_email: email }).catch(() => null);
  if (allowed === null) redirect('/admin/login?error=failed');
  if (!allowed) redirect('/admin/login?error=forbidden');
  return { email };
}
```

`src/middleware.ts`:
```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** Keeps the admin's Supabase session fresh. Authorisation is checked again in every page and route. */
export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  if (!req.cookies.getAll().some((c) => c.name.startsWith('sb-'))) return res;
  const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) req.cookies.set(name, value);
        res = NextResponse.next({ request: req });
        for (const { name, value, options } of list) res.cookies.set(name, value, options);
      },
    },
  });
  await supabase.auth.getUser();
  return res;
}

export const config = { matcher: ['/admin/:path*', '/api/admin/:path*'] };
```

`src/app/auth/google/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { supabaseServer } from '@/lib/supabase-server';

export const GET = async () => {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${env().APP_URL}/auth/callback`, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error || !data.url) return NextResponse.redirect(`${env().APP_URL}/admin/login?error=failed`);
  return NextResponse.redirect(data.url);
};
```

`src/app/auth/callback/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { supabaseServer } from '@/lib/supabase-server';

export const GET = async (req: Request) => {
  const to = (path: string) => NextResponse.redirect(`${env().APP_URL}${path}`);
  const code = new URL(req.url).searchParams.get('code');
  if (!code) return to('/admin/login?error=failed');
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    const email = data.user?.email?.toLowerCase();
    if (error || !email) return to('/admin/login?error=failed');
    const allowed = await rpc<boolean>('is_admin', { p_event: env().EVENT_ID, p_email: email });
    if (!allowed) {
      await supabase.auth.signOut();
      return to('/admin/login?error=forbidden');
    }
    await rpc('audit', { p_event: env().EVENT_ID, p_actor_type: 'admin', p_actor: email, p_action: 'admin_login', p_entity: 'admin', p_entity_id: email });
    return to('/admin');
  } catch {
    return to('/admin/login?error=failed');
  }
};
```

`src/app/api/admin/logout/route.ts`:
```ts
import { z } from 'zod';
import { ok } from '@/lib/api';
import { adminPost } from '@/lib/routes';
import { supabaseServer } from '@/lib/supabase-server';

export const POST = adminPost(z.object({}).strict(), async () => {
  await (await supabaseServer()).auth.signOut();
  return ok('OK');
});
```

- [ ] **Step 8: Implement the import and guest routes**

`src/app/api/admin/import/preview/route.ts`:
```ts
import { z } from 'zod';
import { ok } from '@/lib/api';
import { previewImport } from '@/lib/import';
import { adminPost } from '@/lib/routes';

export const POST = adminPost(z.object({ csv: z.string().min(1).max(2_000_000) }), async ({ body }) => {
  const r = await previewImport(body.csv);
  return ok(r.status, r);
});
```
`src/app/api/admin/import/commit/route.ts`:
```ts
import { z } from 'zod';
import { ok } from '@/lib/api';
import { commitImport } from '@/lib/import';
import { actorId, adminPost } from '@/lib/routes';

export const POST = adminPost(z.object({ csv: z.string().min(1).max(2_000_000) }), async ({ actor, body }) => {
  const r = await commitImport(body.csv, actorId(actor));
  return ok(r.status, r);
});
```
`src/app/api/admin/guests/route.ts`:
```ts
import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { normalisePhone } from '@/lib/phone';
import { actorId, adminGet, adminPost } from '@/lib/routes';

export const GET = adminGet(async ({ req }) => {
  const u = new URL(req.url);
  const r = await rpc<{ guests: unknown[] }>('admin_guest_list', {
    p_event: env().EVENT_ID, p_q: (u.searchParams.get('q') ?? '').slice(0, 80), p_outlet: (u.searchParams.get('outlet') ?? '').slice(0, 120),
  });
  return ok('OK', r);
});

const Update = z.object({
  guest_id: z.string().uuid(),
  changes: z
    .object({
      full_name: z.string().max(120).optional(),
      outlet: z.string().max(120).optional(),
      department: z.string().max(120).nullable().optional(),
      position: z.string().max(120).nullable().optional(),
      phone: z.string().max(40).nullable().optional(),
      active: z.boolean().optional(),
    })
    .strict(),
});

export const POST = adminPost(Update, async ({ actor, body }) => {
  const changes: Record<string, unknown> = { ...body.changes };
  if ('phone' in changes) {
    const p = normalisePhone(changes.phone as string | null);
    if (!p.ok) return ok('INVALID_PHONE');
    changes.phone = p.value;
  }
  const r = await rpc<{ status: string }>('admin_update_guest', {
    p_event: env().EVENT_ID, p_guest_id: body.guest_id, p_changes: changes, p_actor: actorId(actor),
  });
  return ok(r.status);
});
```
`src/app/api/admin/guests/walk-in/route.ts`:
```ts
import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { passUrl } from '@/lib/invitations';
import { actorId, adminPost } from '@/lib/routes';

const Body = z.object({
  full_name: z.string().max(120), outlet: z.string().max(120),
  department: z.string().max(120).optional(), position: z.string().max(120).optional(),
});

export const POST = adminPost(Body, async ({ actor, body }) => {
  const r = await rpc<{ status: string; invite_token?: string }>('add_walk_in', {
    p_event: env().EVENT_ID, p_full_name: body.full_name, p_outlet: body.outlet,
    p_department: body.department ?? null, p_position: body.position ?? null, p_actor: actorId(actor),
  });
  if (r.status !== 'OK' || !r.invite_token) return ok(r.status);
  return ok('OK', { ...r, pass_url: passUrl(env().APP_URL, r.invite_token) });
});
```

- [ ] **Step 9: Implement invitations and redemptions routes**

`src/app/api/admin/invitations.csv/route.ts`:
```ts
import { db, RetryableError, rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { buildInvitationsCsv, type InviteRow } from '@/lib/invitations';
import { actorId, adminGet } from '@/lib/routes';

export const GET = adminGet(async ({ req, actor }) => {
  const outlet = (new URL(req.url).searchParams.get('outlet') ?? '').slice(0, 120);
  let query = db()
    .from('guests')
    .select('employee_id, full_name, outlet, phone, invite_token')
    .eq('event_id', env().EVENT_ID).eq('active', true).eq('is_walk_in', false);
  if (outlet) query = query.eq('outlet', outlet);
  const { data, error } = await query.order('full_name');
  if (error) throw new RetryableError('invitations');
  await rpc('audit', {
    p_event: env().EVENT_ID, p_actor_type: 'admin', p_actor: actorId(actor), p_action: 'invitations_exported',
    p_entity: 'event', p_entity_id: env().EVENT_ID, p_details: { rows: data.length, outlet: outlet || null },
  });
  return new Response(buildInvitationsCsv(data as InviteRow[], env().APP_URL), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="nourishfest-invitations.csv"',
      'Cache-Control': 'no-store',
    },
  });
});
```
`src/app/api/admin/redemptions/route.ts`:
```ts
import { ok } from '@/lib/api';
import { db, RetryableError } from '@/lib/db';
import { env } from '@/lib/env';
import { adminGet } from '@/lib/routes';

export const GET = adminGet(async () => {
  const { data: reds, error } = await db()
    .from('merchandise_redemptions')
    .select('id, guest_id, status, redeemed_at, station_label, void_reason')
    .eq('event_id', env().EVENT_ID)
    .order('redeemed_at', { ascending: false })
    .limit(500);
  if (error) throw new RetryableError('redemptions');
  const ids = [...new Set(reds.map((r) => r.guest_id))];
  const { data: guests, error: e2 } = ids.length
    ? await db().from('guests').select('id, employee_id, full_name, outlet').in('id', ids)
    : { data: [], error: null };
  if (e2) throw new RetryableError('redemptions');
  const byId = new Map((guests ?? []).map((g) => [g.id, g]));
  return ok('OK', { redemptions: reds.map(({ guest_id, ...r }) => ({ ...r, guest: byId.get(guest_id) ?? null })) });
});
```
`src/app/api/admin/redemptions/[id]/void/route.ts`:
```ts
import { z } from 'zod';
import { fail, ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminPost } from '@/lib/routes';

export const POST = adminPost(z.object({ reason: z.string().max(200) }), async ({ actor, body, params }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) return fail(400, 'BAD_INPUT');
  const r = await rpc<{ status: string }>('void_redemption', {
    p_event: env().EVENT_ID, p_redemption_id: id.data, p_reason: body.reason, p_actor: actorId(actor),
  });
  return ok(r.status);
});
```

- [ ] **Step 10: Run the API tests to verify they pass**

Run: `npm run test:api -- admin-guests`
Expected: PASS. If `get_pass` returns a status other than `OK` for the walk-in, read `supabase/migrations/20261101000002_pin_pass_functions.sql` for the exact status name and fix the test, not the function.

- [ ] **Step 11: Configure Google sign-in for local development**

Append to `supabase/config.toml` (replace the existing `[auth]` `site_url` and `additional_redirect_urls` values if the file already defines them):
```toml
[auth]
site_url = "http://localhost:3000"
additional_redirect_urls = ["http://localhost:3000/auth/callback"]

[auth.external.google]
enabled = true
client_id = "env(GOOGLE_CLIENT_ID)"
secret = "env(GOOGLE_CLIENT_SECRET)"
skip_nonce_check = true
```
Create an OAuth client in Google Cloud Console (type **Web application**). Authorised redirect URIs: `http://127.0.0.1:54321/auth/v1/callback` for local, and `https://<project-ref>.supabase.co/auth/v1/callback` for production (Task 16). Export `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the shell before `supabase start`, then:
```bash
supabase stop && supabase start
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "insert into admins (event_id, email, name) values ('00000000-0000-4000-8000-000000000001', lower('YOUR_GOOGLE_EMAIL'), 'Me') on conflict do nothing;"
```
Expected: Supabase restarts with the Google provider enabled; the insert reports `INSERT 0 1`. The browser flow is checked in Task 15 once the login page exists.

- [ ] **Step 12: Typecheck, lint and commit**

Run: `npx tsc --noEmit && npm run lint && npm run test:unit && npm run test:api`
Expected: all pass.

```bash
git add src tests supabase/config.toml
git commit -m "feat: admin Google sign-in, guest import, guest management, invitation export, merchandise voids"
```

---

## Task 14: Admin settings, dashboard, go-live and rehearsal reset APIs

**Files:**
- Create: `src/app/api/admin/settings/route.ts`, `src/app/api/admin/settings/pin/route.ts`, `src/app/api/admin/settings/pin-active/route.ts`, `src/app/api/admin/settings/station-labels/route.ts`, `src/app/api/admin/go-live/route.ts`, `src/app/api/admin/reset/route.ts`, `src/app/api/admin/dashboard/route.ts`
- Test: `tests/api/admin-settings.test.ts`

**Interfaces:**
- Consumes: `adminGet`, `adminPost`, `actorId`, `rpc`, `db`, `RetryableError`, SQL `set_station_pin`, `set_station_active`, `set_station_labels`, `go_live`, `reset_rehearsal_data`, `event_counts`.
- Produces:
  - `GET /api/admin/settings` → `ok('OK', { event: { name, event_date }, mode: 'rehearsal'|'live', station_labels: string[], pins: [{ role, is_set, active, updated_at }] })` — one entry per role in the order checkin, merchandise, draw, prizes. Never returns hashes.
  - `POST /api/admin/settings/pin {role, pin}` → `OK | INVALID_PIN | INVALID_ROLE | PIN_IN_USE`. A new PIN signs out every device on that role (the SQL function bumps `session_version`).
  - `POST /api/admin/settings/pin-active {role, active}` → `OK | NOT_FOUND`; also signs those devices out.
  - `POST /api/admin/settings/station-labels {labels: string[]}` → `OK | INVALID`.
  - `POST /api/admin/go-live {confirm: 'GO LIVE'}` → `OK | NOT_REHEARSAL`. `POST /api/admin/reset {confirm: 'RESET'}` → `OK | NOT_REHEARSAL`. Any other `confirm` value is HTTP 400.
  - `GET /api/admin/dashboard` → `ok('OK', { counts: { total, checked_in, redeemed, rsvp_yes, rsvp_no, rsvp_pending, opened, mode }, recent: [{ at, actor, action }] })` (the last 10 audit rows, newest first). Plan 2 extends this with the draw state.

- [ ] **Step 1: Write the failing API test**

`tests/api/admin-settings.test.ts`:
```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/admin-auth', () => ({ getAdmin: vi.fn() }));

import { getAdmin } from '@/lib/admin-auth';
import { GET as dashboard } from '@/app/api/admin/dashboard/route';
import { POST as goLive } from '@/app/api/admin/go-live/route';
import { POST as reset } from '@/app/api/admin/reset/route';
import { GET as getSettings } from '@/app/api/admin/settings/route';
import { POST as setLabels } from '@/app/api/admin/settings/station-labels/route';
import { POST as setActive } from '@/app/api/admin/settings/pin-active/route';
import { POST as setPin } from '@/app/api/admin/settings/pin/route';
import { GET as me } from '@/app/api/station/me/route';
import { EVENT, getReq, loginAs, postJson, resetEvent, seedGuests, setupPins, svc } from './helpers';

const asAdmin = () => vi.mocked(getAdmin).mockResolvedValue({ email: 'dev-admin@example.com' });
const json = (r: Response) => r.json();
const DEFAULT_LABELS = ['Meja 1', 'Meja 2', 'Meja 3', 'Booth 1', 'Booth 2'];

beforeAll(setupPins);
beforeEach(async () => {
  asAdmin();
  await resetEvent();
});
afterAll(async () => {
  await setupPins();
  await svc().rpc('set_station_labels', { p_event: EVENT, p_labels: DEFAULT_LABELS, p_actor: 'test' });
  for (const role of ['checkin', 'merchandise', 'draw', 'prizes']) {
    await svc().rpc('set_station_active', { p_event: EVENT, p_role: role, p_active: true, p_actor: 'test' });
  }
});

describe('access', () => {
  it('answers 401 for every settings route without an admin session', async () => {
    vi.mocked(getAdmin).mockResolvedValue(null);
    const posts = [
      [setPin, '/api/admin/settings/pin', { role: 'checkin', pin: '123456' }],
      [setActive, '/api/admin/settings/pin-active', { role: 'checkin', active: false }],
      [setLabels, '/api/admin/settings/station-labels', { labels: ['A'] }],
      [goLive, '/api/admin/go-live', { confirm: 'GO LIVE' }],
      [reset, '/api/admin/reset', { confirm: 'RESET' }],
    ] as const;
    for (const [handler, path, body] of posts) expect((await handler(postJson(path, body))).status).toBe(401);
    expect((await getSettings(getReq('/api/admin/settings'))).status).toBe(401);
    expect((await dashboard(getReq('/api/admin/dashboard'))).status).toBe(401);
  });
});

describe('settings', () => {
  it('lists the four roles without exposing hashes', async () => {
    const j = await json(await getSettings(getReq('/api/admin/settings')));
    expect(j.data.mode).toBe('rehearsal');
    expect(j.data.station_labels).toEqual(DEFAULT_LABELS);
    expect(j.data.pins.map((p: { role: string }) => p.role)).toEqual(['checkin', 'merchandise', 'draw', 'prizes']);
    expect(j.data.pins.every((p: { is_set: boolean; active: boolean }) => p.is_set && p.active)).toBe(true);
    expect(JSON.stringify(j)).not.toContain('pin_hash');
  });

  it('changes a PIN, rejects bad or duplicate PINs, and signs out devices on that role', async () => {
    const cookie = await loginAs('checkin');
    expect((await me(getReq('/api/station/me', cookie))).status).toBe(200);

    expect((await json(await setPin(postJson('/api/admin/settings/pin', { role: 'checkin', pin: '12' })))).status).toBe('INVALID_PIN');
    expect((await json(await setPin(postJson('/api/admin/settings/pin', { role: 'prizes', pin: '111111' })))).status).toBe('PIN_IN_USE');
    expect((await setPin(postJson('/api/admin/settings/pin', { role: 'bogus', pin: '123456' }))).status).toBe(400);

    expect((await json(await setPin(postJson('/api/admin/settings/pin', { role: 'checkin', pin: '135790' })))).status).toBe('OK');
    expect((await me(getReq('/api/station/me', cookie))).status).toBe(401);
    await setupPins();
  });

  it('deactivates and reactivates a role', async () => {
    const cookie = await loginAs('merchandise');
    expect((await json(await setActive(postJson('/api/admin/settings/pin-active', { role: 'merchandise', active: false })))).status).toBe('OK');
    expect((await me(getReq('/api/station/me', cookie))).status).toBe(401);
    expect((await json(await setActive(postJson('/api/admin/settings/pin-active', { role: 'merchandise', active: true })))).status).toBe('OK');
  });

  it('replaces station labels and rejects duplicates', async () => {
    expect((await json(await setLabels(postJson('/api/admin/settings/station-labels', { labels: ['Meja A', 'Meja B'] })))).status).toBe('OK');
    expect((await json(await getSettings(getReq('/api/admin/settings')))).data.station_labels).toEqual(['Meja A', 'Meja B']);
    expect((await json(await setLabels(postJson('/api/admin/settings/station-labels', { labels: ['X', 'X'] })))).status).toBe('INVALID');
    await setLabels(postJson('/api/admin/settings/station-labels', { labels: DEFAULT_LABELS }));
  });
});

describe('rehearsal reset and go-live', () => {
  it('reset clears check-ins and restarts prize numbers', async () => {
    const g = await seedGuests(1);
    await svc().rpc('check_in', { p_event: EVENT, p_token: g[0].invite_token, p_guest_id: null, p_method: 'scan', p_station_label: 'Meja 1', p_actor: 'test' });
    expect((await json(await reset(postJson('/api/admin/reset', { confirm: 'RESET' })))).status).toBe('OK');
    const { count } = await svc().from('check_ins').select('id', { count: 'exact', head: true }).eq('event_id', EVENT);
    expect(count).toBe(0);
  });
  it('requires the exact confirmation words', async () => {
    expect((await reset(postJson('/api/admin/reset', { confirm: 'reset' }))).status).toBe(400);
    expect((await goLive(postJson('/api/admin/go-live', { confirm: 'go live' }))).status).toBe(400);
    expect((await goLive(postJson('/api/admin/go-live', {}))).status).toBe(400);
    const { data } = await svc().from('events').select('mode').eq('id', EVENT).single();
    expect(data?.mode).toBe('rehearsal'); // go-live itself is covered by the database test; running it here would lock the dev event
  });
});

describe('dashboard', () => {
  it('returns counts and the latest audit rows', async () => {
    const g = await seedGuests(2);
    await svc().rpc('check_in', { p_event: EVENT, p_token: g[0].invite_token, p_guest_id: null, p_method: 'scan', p_station_label: 'Meja 1', p_actor: 'test' });
    const j = await json(await dashboard(getReq('/api/admin/dashboard')));
    expect(j.data.counts).toMatchObject({ checked_in: 1, redeemed: 0, mode: 'rehearsal' });
    expect(j.data.counts.total).toBeGreaterThanOrEqual(2);
    expect(j.data.recent.length).toBeGreaterThan(0);
    expect(j.data.recent[0]).toHaveProperty('action');
    expect(j.data.recent.length).toBeLessThanOrEqual(10);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:api -- admin-settings`
Expected: FAIL — cannot resolve the settings route modules.

- [ ] **Step 3: Implement the routes**

`src/app/api/admin/settings/route.ts`:
```ts
import { ok } from '@/lib/api';
import { db, RetryableError } from '@/lib/db';
import { env } from '@/lib/env';
import { stationLabels } from '@/lib/labels';
import { ROLES } from '@/lib/session';
import { adminGet } from '@/lib/routes';

export const GET = adminGet(async () => {
  const [{ data: ev, error: e1 }, { data: pins, error: e2 }, labels] = await Promise.all([
    db().from('events').select('name, event_date, mode').eq('id', env().EVENT_ID).single(),
    db().from('station_pins').select('role, active, updated_at').eq('event_id', env().EVENT_ID),
    stationLabels(),
  ]);
  if (e1 || e2 || !ev) throw new RetryableError('settings');
  const byRole = new Map((pins ?? []).map((p) => [p.role, p]));
  return ok('OK', {
    event: { name: ev.name, event_date: ev.event_date },
    mode: ev.mode,
    station_labels: labels,
    pins: ROLES.map((role) => ({
      role, is_set: byRole.has(role), active: byRole.get(role)?.active ?? false, updated_at: byRole.get(role)?.updated_at ?? null,
    })),
  });
});
```
`src/app/api/admin/settings/pin/route.ts`:
```ts
import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { ROLES } from '@/lib/session';
import { actorId, adminPost } from '@/lib/routes';

export const POST = adminPost(z.object({ role: z.enum(ROLES), pin: z.string().max(20) }), async ({ actor, body }) => {
  const r = await rpc<{ status: string }>('set_station_pin', {
    p_event: env().EVENT_ID, p_role: body.role, p_pin: body.pin, p_actor: actorId(actor),
  });
  return ok(r.status);
});
```
`src/app/api/admin/settings/pin-active/route.ts`:
```ts
import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { ROLES } from '@/lib/session';
import { actorId, adminPost } from '@/lib/routes';

export const POST = adminPost(z.object({ role: z.enum(ROLES), active: z.boolean() }), async ({ actor, body }) => {
  const r = await rpc<{ status: string }>('set_station_active', {
    p_event: env().EVENT_ID, p_role: body.role, p_active: body.active, p_actor: actorId(actor),
  });
  return ok(r.status);
});
```
`src/app/api/admin/settings/station-labels/route.ts`:
```ts
import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminPost } from '@/lib/routes';

export const POST = adminPost(z.object({ labels: z.array(z.string().max(60)).max(40) }), async ({ actor, body }) => {
  const r = await rpc<{ status: string }>('set_station_labels', {
    p_event: env().EVENT_ID, p_labels: body.labels, p_actor: actorId(actor),
  });
  return ok(r.status);
});
```
`src/app/api/admin/go-live/route.ts`:
```ts
import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminPost } from '@/lib/routes';

export const POST = adminPost(z.object({ confirm: z.literal('GO LIVE') }), async ({ actor }) => {
  const r = await rpc<{ status: string }>('go_live', { p_event: env().EVENT_ID, p_actor: actorId(actor) });
  return ok(r.status);
});
```
`src/app/api/admin/reset/route.ts`:
```ts
import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminPost } from '@/lib/routes';

export const POST = adminPost(z.object({ confirm: z.literal('RESET') }), async ({ actor }) => {
  const r = await rpc<{ status: string }>('reset_rehearsal_data', { p_event: env().EVENT_ID, p_actor: actorId(actor) });
  return ok(r.status);
});
```
`src/app/api/admin/dashboard/route.ts`:
```ts
import { ok } from '@/lib/api';
import { db, RetryableError, rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { adminGet } from '@/lib/routes';

export const GET = adminGet(async () => {
  const counts = await rpc<Record<string, unknown>>('event_counts', { p_event: env().EVENT_ID });
  const { data, error } = await db()
    .from('audit_log').select('at, actor, action')
    .eq('event_id', env().EVENT_ID).order('id', { ascending: false }).limit(10);
  if (error) throw new RetryableError('dashboard');
  return ok('OK', { counts, recent: data });
});
```

- [ ] **Step 4: Run the API tests to verify they pass**

Run: `npm run test:api -- admin-settings`
Expected: PASS. Then run the whole suite (`npm run test:unit && npm run test:api`) to confirm the PIN and label changes were restored and no other file is affected.

- [ ] **Step 5: Typecheck, lint and commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

```bash
git add src tests
git commit -m "feat: admin settings, dashboard, go-live and rehearsal reset APIs"
```

---

## Task 15: Admin console — login, layout, dashboard, guests, merchandise, settings

The admin console is desktop-first, English-only and visually flat (Design Guide: staff Ops screens are flat, no hip-hop decoration). It is used by HR before the event, and on the day only by whoever handles walk-ins, voids and PIN changes.

**Files:**
- Create: `src/lib/admin-text.ts`, `src/lib/use-load.ts`, `src/styles/admin.css`
- Create: `src/app/admin/login/page.tsx`, `src/app/admin/(console)/layout.tsx`, `src/app/admin/(console)/page.tsx`, `src/app/admin/(console)/guests/page.tsx`, `src/app/admin/(console)/merchandise/page.tsx`, `src/app/admin/(console)/settings/page.tsx`
- Create: `src/components/admin/{AdminNav,ImportPanel,GuestTable,GuestEditor,WalkInForm,RedemptionList,StationSettings,RehearsalPanel}.tsx`
- Test: `tests/unit/admin-text.test.ts`

**Interfaces:**
- Consumes: `requireAdminPage`, `api<T>()`, `formatTimeWita`, `ROLES`, `Role`, all `/api/admin/*` routes from Tasks 13–14.
- Produces:
  - `describeImportError(e: { row: number; field: string; code: string }): string`; `ROLE_NAME: Record<Role, string>`; `randomPin(): string` (six digits).
  - `useLoad<T>(path: string, intervalMs?: number): { loading: boolean; status: string; data: T | null; reload(): Promise<void> }`. A 401 answer sends the browser to `/admin/login`.
  - Pages `/admin/login`, `/admin`, `/admin/guests`, `/admin/merchandise`, `/admin/settings`. Everything under `(console)` is behind `requireAdminPage()`.

- [ ] **Step 1: Write the failing unit test for the text helpers**

`tests/unit/admin-text.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { describeImportError, randomPin, ROLE_NAME } from '@/lib/admin-text';

describe('describeImportError', () => {
  it('names the row, the column and the problem', () => {
    expect(describeImportError({ row: 5, field: 'employee_id', code: 'DUPLICATE_IN_FILE' })).toBe('Row 5, employee_id: appears more than once in the file');
    expect(describeImportError({ row: 2, field: 'phone', code: 'INVALID_PHONE' })).toBe('Row 2, phone: is not a valid Indonesian phone number');
  });
  it('omits the column when the error is about the whole row', () => {
    expect(describeImportError({ row: 7, field: '', code: 'MALFORMED_ROW' })).toBe('Row 7: could not be read');
  });
  it('falls back to the raw code for an unknown error', () => {
    expect(describeImportError({ row: 3, field: 'outlet', code: 'SOMETHING_NEW' })).toBe('Row 3, outlet: SOMETHING_NEW');
  });
});

describe('randomPin', () => {
  it('is always six digits, leading zeros included', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const p = randomPin();
      expect(p).toMatch(/^\d{6}$/);
      seen.add(p);
    }
    expect(seen.size).toBeGreaterThan(250);
  });
});

describe('ROLE_NAME', () => {
  it('names all four station roles', () => {
    expect(Object.keys(ROLE_NAME).sort()).toEqual(['checkin', 'draw', 'merchandise', 'prizes']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:unit -- admin-text`
Expected: FAIL — cannot resolve `@/lib/admin-text`.

- [ ] **Step 3: Implement the helpers**

`src/lib/admin-text.ts`:
```ts
import type { Role } from './session';

const PROBLEM: Record<string, string> = {
  REQUIRED: 'is required',
  TOO_LONG: 'is too long',
  DUPLICATE_IN_FILE: 'appears more than once in the file',
  INVALID_PHONE: 'is not a valid Indonesian phone number',
  MALFORMED_ROW: 'could not be read',
};

export function describeImportError(e: { row: number; field: string; code: string }): string {
  const where = e.field ? `Row ${e.row}, ${e.field}` : `Row ${e.row}`;
  return `${where}: ${PROBLEM[e.code] ?? e.code}`;
}

export const ROLE_NAME: Record<Role, string> = {
  checkin: 'Check-in desk',
  merchandise: 'Merchandise booth',
  draw: 'Draw operator (MC)',
  prizes: 'Prize table',
};

/** Six random digits from the browser or Node crypto source. */
export function randomPin(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, '0');
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:unit -- admin-text`
Expected: PASS.

- [ ] **Step 5: Add `useLoad` and the stylesheet**

`src/lib/use-load.ts`:
```ts
'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from './client';

type State<T> = { loading: boolean; status: string; data: T | null };

/** GETs an admin endpoint, optionally on an interval. A 401 sends the browser to the login page. */
export function useLoad<T>(path: string, intervalMs?: number) {
  const [state, setState] = useState<State<T>>({ loading: true, status: '', data: null });

  const reload = useCallback(async () => {
    const r = await api<T>(path);
    if (r.http === 401) {
      window.location.href = '/admin/login';
      return;
    }
    setState((prev) => ({ loading: false, status: r.status, data: r.ok ? r.data : prev.data }));
  }, [path]);

  useEffect(() => {
    reload();
    if (!intervalMs) return;
    const id = setInterval(reload, intervalMs);
    return () => clearInterval(id);
  }, [reload, intervalMs]);

  return { ...state, reload };
}
```

`src/styles/admin.css`:
```css
.adm { max-width: 1100px; margin: 0 auto; padding: 0 var(--nf-gutter) 64px; }
.adm-nav { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; padding: 14px 0; margin-bottom: 24px; border-bottom: 1px solid var(--nf-line); }
.adm-nav__brand { font-family: var(--nf-font-display); color: var(--nf-gold); font-size: 18px; margin-right: 16px; }
.adm-nav a { font-family: var(--nf-font-label); text-transform: uppercase; letter-spacing: .06em; padding: 8px 12px; border-radius: 8px; color: var(--nf-text-soft); text-decoration: none; }
.adm-nav a[aria-current='page'] { background: var(--nf-gold); color: var(--nf-black); }
.adm-nav__spacer { flex: 1; }
.adm-nav__who { color: var(--nf-text-muted); font-size: 13px; margin-right: 8px; }

.adm-title { font-family: var(--nf-font-heading); font-weight: 400; font-size: 32px; text-transform: uppercase; margin: 0 0 16px; }
.adm-sub { font-family: var(--nf-font-label); text-transform: uppercase; letter-spacing: .06em; color: var(--nf-gold); font-size: 14px; margin: 28px 0 10px; }
.adm-muted { color: var(--nf-text-muted); }
.adm-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
.adm-spacer { flex: 1; }

.adm-card { background: var(--nf-card); border: 1px solid var(--nf-line); border-radius: 12px; padding: 16px; margin-bottom: 16px; }
.adm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; margin-bottom: 20px; }
.adm-stat { background: var(--nf-card); border: 1px solid var(--nf-line); border-radius: 12px; padding: 14px; }
.adm-stat__n { font-family: var(--nf-font-heading); font-size: 34px; line-height: 1; }
.adm-stat__l { color: var(--nf-text-soft); font-size: 13px; margin-top: 6px; }

.adm-badge { display: inline-block; font-family: var(--nf-font-label); text-transform: uppercase; letter-spacing: .06em; font-size: 12px; padding: 3px 10px; border-radius: 999px; border: 1px solid var(--nf-line-dash); color: var(--nf-text-soft); }
.adm-badge--gold { border-color: var(--nf-gold); color: var(--nf-gold); }
.adm-badge--pink { border-color: var(--nf-pink); color: var(--nf-pink); }
.adm-badge--green { border-color: var(--nf-green); color: var(--nf-green); }

.adm-table-wrap { overflow-x: auto; border: 1px solid var(--nf-line); border-radius: 12px; }
.adm-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.adm-table th { text-align: left; font-family: var(--nf-font-label); text-transform: uppercase; letter-spacing: .05em; font-weight: 400; color: var(--nf-text-soft); padding: 10px 12px; background: var(--nf-surface); white-space: nowrap; }
.adm-table td { padding: 9px 12px; border-top: 1px solid var(--nf-line); vertical-align: middle; }
.adm-table tr.is-dim td { color: var(--nf-text-muted); }

.adm-input, .adm-select, .adm-textarea { background: var(--nf-surface); color: var(--nf-text); border: 1px solid var(--nf-line-dash); border-radius: 8px; padding: 9px 12px; font: inherit; min-width: 0; }
.adm-textarea { width: 100%; min-height: 110px; resize: vertical; }
.adm-field { display: grid; gap: 4px; margin-bottom: 10px; }
.adm-field > span { color: var(--nf-text-soft); font-size: 12px; }

.btn { font-family: var(--nf-font-label); text-transform: uppercase; letter-spacing: .06em; font-size: 13px; padding: 9px 16px; border-radius: var(--nf-radius-btn); border: 1px solid var(--nf-line-dash); background: var(--nf-surface); color: var(--nf-text); cursor: pointer; text-decoration: none; display: inline-block; }
.btn:disabled { opacity: .45; cursor: not-allowed; }
.btn--gold { background: var(--nf-gold); border-color: var(--nf-gold); color: var(--nf-black); }
.btn--danger { background: transparent; border-color: var(--nf-pink); color: var(--nf-pink); }

.adm-drop { border: 2px dashed var(--nf-line-dash); border-radius: 12px; padding: 22px; text-align: center; color: var(--nf-text-soft); }
.adm-drop.is-over { border-color: var(--nf-gold); color: var(--nf-gold); }
.adm-msg { padding: 10px 14px; border-radius: 8px; margin: 10px 0; border: 1px solid var(--nf-line-dash); }
.adm-msg--error { border-color: var(--nf-pink); color: var(--nf-pink); }
.adm-msg--ok { border-color: var(--nf-green); color: var(--nf-green); }
.adm-list { margin: 6px 0 0; padding-left: 18px; max-height: 220px; overflow: auto; }
.adm-login { max-width: 420px; margin: 12vh auto 0; padding: 0 var(--nf-gutter); }
```

- [ ] **Step 6: Login page, console layout and navigation**

`src/app/admin/login/page.tsx`:
```tsx
import '@/styles/admin.css';

const MESSAGES: Record<string, string> = {
  forbidden: 'That Google account is not on the admin list. Ask HR to add it.',
  failed: 'Sign-in failed. Please try again.',
};

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="adm-login">
      <h1 className="adm-title">NourishFest admin</h1>
      <p className="adm-muted">Sign in with the Google account HR registered for this event.</p>
      {error && <p className="adm-msg adm-msg--error">{MESSAGES[error] ?? MESSAGES.failed}</p>}
      <a className="btn btn--gold" href="/auth/google">Sign in with Google</a>
    </main>
  );
}
```
`src/app/admin/(console)/layout.tsx`:
```tsx
import { AdminNav } from '@/components/admin/AdminNav';
import { requireAdminPage } from '@/lib/admin-page';
import '@/styles/admin.css';

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
`src/components/admin/AdminNav.tsx`:
```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/client';

const LINKS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/guests', label: 'Guests' },
  { href: '/admin/merchandise', label: 'Merchandise' },
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

- [ ] **Step 7: Dashboard page**

`src/app/admin/(console)/page.tsx`:
```tsx
'use client';
import { useLoad } from '@/lib/use-load';

type Dash = {
  counts: { total: number; checked_in: number; redeemed: number; rsvp_yes: number; rsvp_no: number; rsvp_pending: number; opened: number; mode: string };
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

- [ ] **Step 8: Typecheck and commit this half**

Run: `npx tsc --noEmit && npm run lint && npm run test:unit`
Expected: no errors; unit tests pass.

```bash
git add src tests
git commit -m "feat(admin): login, console layout and dashboard"
```

- [ ] **Step 9: Test fixtures**

`tests/fixtures/guests-sample.csv`:
```csv
employee_id,full_name,outlet,department,position,phone
E001,Kadek Ayu Lestari,Outlet Ubud,Service,Barista,0812-3456-7001
E002,Made Wirawan,Outlet Ubud,Kitchen,Cook,0812-3456-7002
E003,Putu Sinta,Outlet Seminyak,Service,Cashier,+62 812 3456 7003
E004,Komang Adi,Outlet Seminyak,Service,Service crew,081234567004
E005,Nyoman Dewi,Central Kitchen,Kitchen,Prep cook,
E006,Wayan Budi,Head Office,HR,Staff,0812-3456-7006
```
`tests/fixtures/guests-errors.csv`:
```csv
employee_id,full_name,outlet,phone
E001,Kadek Ayu Lestari,Outlet Ubud,0812-3456-7001
E001,Duplicate Person,Outlet Ubud,0812-3456-7002
E003,No Outlet,,0812-3456-7003
E004,Bad Phone,Outlet Ubud,12345
```

- [ ] **Step 10: Import panel**

`src/components/admin/ImportPanel.tsx`:
```tsx
'use client';
import { useRef, useState } from 'react';
import { describeImportError } from '@/lib/admin-text';
import { api } from '@/lib/client';

type Err = { row: number; field: string; code: string };
type Preview = {
  status: string; errors?: Err[]; would_insert?: number; would_update?: number;
  missing_count?: number; missing?: { employee_id: string; full_name: string }[]; missingColumns?: string[];
};
type Done = { inserted: number; updated: number; flagged_missing: number };

const TEMPLATE = 'employee_id,full_name,outlet,department,position,phone,category\nE001,Kadek Ayu,Outlet Ubud,Service,Barista,0812-3456-7890,\n';

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'nourishfest-guests-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportPanel({ onDone }: { onDone: () => void }) {
  const [csv, setCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setDone(null);
    setError('');
    setPreview(null);
    const text = await file.text();
    setCsv(text);
    setBusy(true);
    const r = await api<Preview>('/api/admin/import/preview', { csv: text });
    setBusy(false);
    if (!r.ok) return setError('Could not check the file. Try again.');
    setPreview({ ...(r.data ?? {}), status: r.status });
  }

  async function commit() {
    if (!csv) return;
    setBusy(true);
    const r = await api<Done & { errors?: Err[] }>('/api/admin/import/commit', { csv });
    setBusy(false);
    if (r.ok && r.status === 'OK' && r.data) {
      setDone(r.data);
      setPreview(null);
      setCsv(null);
      onDone();
    } else if (r.status === 'HAS_ERRORS') {
      setPreview({ status: 'HAS_ERRORS', errors: r.data?.errors ?? [] });
    } else {
      setError('Import failed. Nothing was changed. Try again.');
    }
  }

  const blocked = preview && preview.status !== 'OK';
  return (
    <div className="adm-card">
      <div
        className={`adm-drop${over ? ' is-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}
      >
        <p>Drop the employee CSV here, or</p>
        <button className="btn" onClick={() => input.current?.click()} disabled={busy}>Choose file</button>{' '}
        <button className="btn" onClick={downloadTemplate}>Download template</button>
        <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        <p className="adm-muted">Required columns: employee_id, full_name, outlet. Optional: department, position, phone, category. Uploading the same employee_id again updates that person.</p>
      </div>

      {busy && <p className="adm-muted">Working…</p>}
      {error && <p className="adm-msg adm-msg--error">{error}</p>}
      {done && <p className="adm-msg adm-msg--ok">Imported: {done.inserted} new, {done.updated} updated, {done.flagged_missing} flagged as missing from this file.</p>}

      {preview?.status === 'BAD_COLUMNS' && <p className="adm-msg adm-msg--error">Missing required column(s): {preview.missingColumns?.join(', ')}. Use the template.</p>}
      {preview?.status === 'EMPTY' && <p className="adm-msg adm-msg--error">The file has a header but no rows.</p>}
      {preview?.status === 'TOO_MANY' && <p className="adm-msg adm-msg--error">The file has more than 1000 rows. Split it.</p>}
      {preview?.status === 'HAS_ERRORS' && (
        <div className="adm-msg adm-msg--error">
          <strong>Nothing was imported. Fix these {preview.errors?.length} problem(s) and upload again:</strong>
          <ul className="adm-list">{preview.errors?.map((e, i) => <li key={i}>{describeImportError(e)}</li>)}</ul>
        </div>
      )}

      {preview?.status === 'OK' && (
        <div>
          <p><strong>{preview.would_insert}</strong> new, <strong>{preview.would_update}</strong> updated, <strong>{preview.missing_count}</strong> existing employees not in this file.</p>
          {(preview.missing_count ?? 0) > 0 && (
            <>
              <p className="adm-muted">These will be flagged, not deleted. Their QR codes keep working until you deactivate them.</p>
              <ul className="adm-list">{preview.missing?.map((m) => <li key={m.employee_id}>{m.employee_id} — {m.full_name}</li>)}</ul>
            </>
          )}
          <div className="adm-row">
            <button className="btn btn--gold" onClick={commit} disabled={busy}>Import now</button>
            <button className="btn" onClick={() => { setPreview(null); setCsv(null); }}>Cancel</button>
          </div>
        </div>
      )}
      {blocked && <button className="btn" onClick={() => { setPreview(null); setCsv(null); }}>Clear</button>}
    </div>
  );
}
```

- [ ] **Step 11: Guest table, editor and walk-in form**

`src/components/admin/GuestEditor.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { api } from '@/lib/client';

export type AdminGuest = {
  id: string; employee_id: string; full_name: string; outlet: string; department: string | null; position: string | null;
  phone: string | null; rsvp_status: string; opened: boolean; active: boolean; flagged_missing: boolean; is_walk_in: boolean;
  checked_in_at: string | null; prize_number: number | null; merch: string;
};

export function GuestEditor({ guest, onClose, onSaved }: { guest: AdminGuest; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(guest.full_name);
  const [outlet, setOutlet] = useState(guest.outlet);
  const [phone, setPhone] = useState(guest.phone ?? '');
  const [active, setActive] = useState(guest.active);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    const changes: Record<string, unknown> = {};
    if (name !== guest.full_name) changes.full_name = name;
    if (outlet !== guest.outlet) changes.outlet = outlet;
    if (phone !== (guest.phone ?? '')) changes.phone = phone.trim() === '' ? null : phone;
    if (active !== guest.active) changes.active = active;
    if (Object.keys(changes).length === 0) return onClose();
    setBusy(true);
    const r = await api('/api/admin/guests', { guest_id: guest.id, changes });
    setBusy(false);
    if (r.status === 'OK') { onSaved(); onClose(); }
    else setMsg(r.status === 'INVALID_PHONE' ? 'That phone number is not valid.' : 'Could not save. Try again.');
  }

  return (
    <div className="adm-card">
      <h3 className="adm-sub" style={{ marginTop: 0 }}>Edit {guest.employee_id}</h3>
      <label className="adm-field"><span>Full name</span><input className="adm-input" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="adm-field"><span>Outlet</span><input className="adm-input" value={outlet} onChange={(e) => setOutlet(e.target.value)} /></label>
      <label className="adm-field"><span>Phone (WhatsApp)</span><input className="adm-input" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
      <label className="adm-row"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active (inactive employees are not eligible at the desks)</label>
      {msg && <p className="adm-msg adm-msg--error">{msg}</p>}
      <div className="adm-row">
        <button className="btn btn--gold" onClick={save} disabled={busy}>Save</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
```
`src/components/admin/GuestTable.tsx`:
```tsx
'use client';
import { useEffect, useState } from 'react';
import { formatTimeWita } from '@/lib/time';
import { useLoad } from '@/lib/use-load';
import { GuestEditor, type AdminGuest } from './GuestEditor';

export function GuestTable() {
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [outlet, setOutlet] = useState('');
  const [outlets, setOutlets] = useState<string[]>([]);
  const [editing, setEditing] = useState<AdminGuest | null>(null);
  const { data, loading, reload } = useLoad<{ guests: AdminGuest[] }>(
    `/api/admin/guests?q=${encodeURIComponent(dq)}&outlet=${encodeURIComponent(outlet)}`,
  );

  useEffect(() => {
    const id = setTimeout(() => setDq(q), 250);
    return () => clearTimeout(id);
  }, [q]);
  useEffect(() => {
    if (data && !dq && !outlet) setOutlets([...new Set(data.guests.map((g) => g.outlet))].sort());
  }, [data, dq, outlet]);

  const guests = data?.guests ?? [];
  return (
    <>
      <div className="adm-row">
        <input className="adm-input" placeholder="Search name or employee ID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <select className="adm-select" value={outlet} onChange={(e) => setOutlet(e.target.value)} aria-label="Outlet">
          <option value="">All outlets</option>
          {outlets.map((o) => <option key={o}>{o}</option>)}
        </select>
        <span className="adm-muted">{loading ? 'Loading…' : `${guests.length} shown`}</span>
      </div>
      {editing && <GuestEditor guest={editing} onClose={() => setEditing(null)} onSaved={reload} />}
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr><th>ID</th><th>Name</th><th>Outlet</th><th>RSVP</th><th>Opened</th><th>Checked in</th><th>Prize no.</th><th>Merch</th><th>Notes</th><th /></tr>
          </thead>
          <tbody>
            {guests.map((g) => (
              <tr key={g.id} className={g.active ? '' : 'is-dim'}>
                <td>{g.employee_id}</td>
                <td>{g.full_name}</td>
                <td>{g.outlet}</td>
                <td>{g.rsvp_status}</td>
                <td>{g.opened ? 'yes' : '–'}</td>
                <td>{g.checked_in_at ? formatTimeWita(g.checked_in_at) : '–'}</td>
                <td>{g.prize_number ?? '–'}</td>
                <td>{g.merch === 'redeemed' ? 'taken' : '–'}</td>
                <td>
                  {g.flagged_missing && <span className="adm-badge adm-badge--pink">missing from file</span>}{' '}
                  {g.is_walk_in && <span className="adm-badge">walk-in</span>}{' '}
                  {!g.active && <span className="adm-badge">inactive</span>}
                </td>
                <td><button className="btn" onClick={() => setEditing(g)}>Edit</button></td>
              </tr>
            ))}
            {!loading && guests.length === 0 && <tr><td colSpan={10} className="adm-muted">No employees yet. Import the CSV above.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
```
`src/components/admin/WalkInForm.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { api } from '@/lib/client';

export function WalkInForm({ onAdded }: { onAdded: () => void }) {
  const [f, setF] = useState({ full_name: '', outlet: '', department: '', position: '' });
  const [link, setLink] = useState('');
  const [msg, setMsg] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function add() {
    setMsg('');
    setLink('');
    const r = await api<{ pass_url: string }>('/api/admin/guests/walk-in', {
      full_name: f.full_name, outlet: f.outlet, ...(f.department && { department: f.department }), ...(f.position && { position: f.position }),
    });
    if (r.status === 'OK' && r.data) {
      setLink(r.data.pass_url);
      setF({ full_name: '', outlet: '', department: '', position: '' });
      onAdded();
    } else {
      setMsg(r.status === 'INVALID' ? 'Name and outlet are required.' : 'Could not add. Try again.');
    }
  }

  return (
    <div className="adm-card">
      <p className="adm-muted">For someone who is not in the employee file. They get a normal pass link and can be checked in like anyone else. Walk-ins are never flagged as missing.</p>
      <div className="adm-row">
        <input className="adm-input" placeholder="Full name" value={f.full_name} onChange={set('full_name')} />
        <input className="adm-input" placeholder="Outlet" value={f.outlet} onChange={set('outlet')} />
        <input className="adm-input" placeholder="Department (optional)" value={f.department} onChange={set('department')} />
        <input className="adm-input" placeholder="Position (optional)" value={f.position} onChange={set('position')} />
        <button className="btn btn--gold" onClick={add}>Add walk-in</button>
      </div>
      {msg && <p className="adm-msg adm-msg--error">{msg}</p>}
      {link && (
        <p className="adm-msg adm-msg--ok">
          Added. Pass link: <code>{link}</code>{' '}
          <button className="btn" onClick={() => navigator.clipboard?.writeText(link)}>Copy</button>
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 12: Guests page**

`src/app/admin/(console)/guests/page.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { GuestTable } from '@/components/admin/GuestTable';
import { ImportPanel } from '@/components/admin/ImportPanel';
import { WalkInForm } from '@/components/admin/WalkInForm';

export default function GuestsPage() {
  const [version, setVersion] = useState(0); // remounts the table after an import or a walk-in
  const refresh = () => setVersion((v) => v + 1);
  return (
    <>
      <div className="adm-row">
        <h1 className="adm-title" style={{ margin: 0 }}>Guests</h1>
        <span className="adm-spacer" />
        <a className="btn btn--gold" href="/api/admin/invitations.csv" download>Download invitations CSV</a>
      </div>
      <p className="adm-muted">The invitations file has each employee’s personal pass link and a ready WhatsApp message link. Treat it like a list of passwords: send each link only to its owner.</p>
      <h2 className="adm-sub">Import employees</h2>
      <ImportPanel onDone={refresh} />
      <h2 className="adm-sub">Add a walk-in</h2>
      <WalkInForm onAdded={refresh} />
      <h2 className="adm-sub">Employees</h2>
      <GuestTable key={version} />
    </>
  );
}
```

- [ ] **Step 13: Merchandise page**

`src/components/admin/RedemptionList.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import { formatTimeWita } from '@/lib/time';
import { useLoad } from '@/lib/use-load';

type Red = {
  id: string; status: 'redeemed' | 'voided'; redeemed_at: string; station_label: string | null; void_reason: string | null;
  guest: { employee_id: string; full_name: string; outlet: string } | null;
};

export function RedemptionList() {
  const { data, loading, reload } = useLoad<{ redemptions: Red[] }>('/api/admin/redemptions', 15_000);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');

  async function confirmVoid(id: string) {
    const r = await api(`/api/admin/redemptions/${id}/void`, { reason });
    if (r.status === 'OK') { setVoiding(null); setReason(''); setMsg(''); reload(); }
    else setMsg(r.status === 'REASON_REQUIRED' ? 'Give a reason of at least 5 characters.' : 'Could not void. Refresh and try again.');
  }

  const rows = data?.redemptions ?? [];
  return (
    <>
      {msg && <p className="adm-msg adm-msg--error">{msg}</p>}
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Time</th><th>Employee</th><th>Outlet</th><th>Booth</th><th>Status</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.status === 'voided' ? 'is-dim' : ''}>
                <td>{formatTimeWita(r.redeemed_at)}</td>
                <td>{r.guest ? `${r.guest.employee_id} — ${r.guest.full_name}` : '?'}</td>
                <td>{r.guest?.outlet}</td>
                <td>{r.station_label}</td>
                <td>{r.status === 'voided' ? `voided: ${r.void_reason}` : 'handed over'}</td>
                <td>
                  {r.status === 'redeemed' && voiding !== r.id && <button className="btn btn--danger" onClick={() => { setVoiding(r.id); setMsg(''); }}>Void</button>}
                  {voiding === r.id && (
                    <span className="adm-row" style={{ margin: 0 }}>
                      <input className="adm-input" placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
                      <button className="btn btn--danger" onClick={() => confirmVoid(r.id)}>Confirm void</button>
                      <button className="btn" onClick={() => setVoiding(null)}>Cancel</button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && <tr><td colSpan={6} className="adm-muted">No merchandise handed over yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
```
`src/app/admin/(console)/merchandise/page.tsx`:
```tsx
import { RedemptionList } from '@/components/admin/RedemptionList';

export default function MerchandisePage() {
  return (
    <>
      <h1 className="adm-title">Merchandise</h1>
      <p className="adm-muted">Voiding frees that employee to collect again (for example after a wrong-size exchange). The reason is kept in the audit log.</p>
      <RedemptionList />
    </>
  );
}
```

- [ ] **Step 14: Settings page**

`src/components/admin/StationSettings.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { randomPin, ROLE_NAME } from '@/lib/admin-text';
import { api } from '@/lib/client';
import type { Role } from '@/lib/session';

export type PinRow = { role: Role; is_set: boolean; active: boolean; updated_at: string | null };

function PinLine({ row, reload }: { row: PinRow; reload: () => void }) {
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState('');

  async function save() {
    const r = await api('/api/admin/settings/pin', { role: row.role, pin });
    if (r.status === 'OK') { setMsg(`PIN set to ${pin}. Write it down now; it cannot be shown again. Devices on this role were signed out.`); setPin(''); reload(); }
    else setMsg(r.status === 'INVALID_PIN' ? 'The PIN must be exactly 6 digits.' : r.status === 'PIN_IN_USE' ? 'Another role already uses that PIN.' : 'Could not save. Try again.');
  }
  async function toggle() {
    const r = await api('/api/admin/settings/pin-active', { role: row.role, active: !row.active });
    if (r.status === 'OK') reload();
    else setMsg('Could not change. Set a PIN first.');
  }

  return (
    <tr>
      <td>{ROLE_NAME[row.role]}</td>
      <td>{!row.is_set ? <span className="adm-badge adm-badge--pink">not set</span> : row.active ? <span className="adm-badge adm-badge--green">active</span> : <span className="adm-badge">off</span>}</td>
      <td>
        <span className="adm-row" style={{ margin: 0 }}>
          <input className="adm-input" inputMode="numeric" maxLength={6} placeholder="6 digits" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} style={{ width: 110 }} aria-label={`New PIN for ${ROLE_NAME[row.role]}`} />
          <button className="btn" onClick={() => setPin(randomPin())}>Generate</button>
          <button className="btn btn--gold" onClick={save} disabled={pin.length !== 6}>Set PIN</button>
          {row.is_set && <button className="btn" onClick={toggle}>{row.active ? 'Turn off' : 'Turn on'}</button>}
        </span>
        {msg && <div className="adm-msg adm-msg--ok">{msg}</div>}
      </td>
    </tr>
  );
}

export function StationSettings({ pins, labels, reload }: { pins: PinRow[]; labels: string[]; reload: () => void }) {
  const [text, setText] = useState(labels.join('\n'));
  const [msg, setMsg] = useState('');

  async function saveLabels() {
    const list = text.split('\n').map((s) => s.trim()).filter(Boolean);
    const r = await api('/api/admin/settings/station-labels', { labels: list });
    if (r.status === 'OK') { setMsg('Saved.'); reload(); }
    else setMsg('Use 1 to 20 different names, up to 30 characters each.');
  }

  return (
    <>
      <h2 className="adm-sub">Station PINs</h2>
      <p className="adm-muted">One PIN per role, shared by the people on that desk. Changing or turning off a PIN signs out every device using it.</p>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Role</th><th>Status</th><th>New PIN</th></tr></thead>
          <tbody>{pins.map((p) => <PinLine key={p.role} row={p} reload={reload} />)}</tbody>
        </table>
      </div>
      <h2 className="adm-sub">Station names</h2>
      <p className="adm-muted">One per line. Staff pick one after entering the PIN; it is recorded on every scan.</p>
      <textarea className="adm-textarea" value={text} onChange={(e) => setText(e.target.value)} aria-label="Station names" />
      <div className="adm-row"><button className="btn btn--gold" onClick={saveLabels}>Save names</button>{msg && <span>{msg}</span>}</div>
    </>
  );
}
```
`src/components/admin/RehearsalPanel.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { api } from '@/lib/client';

export function RehearsalPanel({ mode, reload }: { mode: string; reload: () => void }) {
  const [resetText, setResetText] = useState('');
  const [liveText, setLiveText] = useState('');
  const [msg, setMsg] = useState('');

  async function run(path: string, confirm: string, okMsg: string) {
    const r = await api(path, { confirm });
    setMsg(r.status === 'OK' ? okMsg : r.status === 'NOT_REHEARSAL' ? 'The event is already live. This is locked.' : 'Could not do that. Try again.');
    setResetText('');
    setLiveText('');
    reload();
  }

  if (mode === 'live') {
    return (
      <>
        <h2 className="adm-sub">Event mode</h2>
        <p className="adm-msg adm-msg--ok">The event is LIVE. Rehearsal reset is locked and the audit log can no longer be deleted.</p>
      </>
    );
  }
  return (
    <>
      <h2 className="adm-sub">Event mode</h2>
      <p className="adm-muted">Now in <strong>rehearsal</strong>: test scans are allowed and can be wiped. Do the reset after the final rehearsal, then go live before doors open.</p>
      <div className="adm-card">
        <p>Reset rehearsal data: removes all check-ins, merchandise records, prize numbers and logs. Employees and PINs stay.</p>
        <div className="adm-row">
          <input className="adm-input" placeholder="Type RESET" value={resetText} onChange={(e) => setResetText(e.target.value)} aria-label="Type RESET to confirm" />
          <button className="btn btn--danger" disabled={resetText !== 'RESET'} onClick={() => run('/api/admin/reset', 'RESET', 'Rehearsal data cleared.')}>Reset rehearsal data</button>
        </div>
      </div>
      <div className="adm-card">
        <p>Go live: one-way. After this, resets are impossible and the audit log is permanent.</p>
        <div className="adm-row">
          <input className="adm-input" placeholder="Type GO LIVE" value={liveText} onChange={(e) => setLiveText(e.target.value)} aria-label="Type GO LIVE to confirm" />
          <button className="btn btn--gold" disabled={liveText !== 'GO LIVE'} onClick={() => run('/api/admin/go-live', 'GO LIVE', 'The event is live.')}>Go live</button>
        </div>
      </div>
      {msg && <p className="adm-msg adm-msg--ok">{msg}</p>}
    </>
  );
}
```
`src/app/admin/(console)/settings/page.tsx`:
```tsx
'use client';
import { RehearsalPanel } from '@/components/admin/RehearsalPanel';
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
      <RehearsalPanel mode={data.mode} reload={reload} />
    </>
  );
}
```

- [ ] **Step 15: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. If lint flags `react-hooks/exhaustive-deps` on the debounce effects, fix the dependency array rather than disabling the rule.

- [ ] **Step 16: Verify by hand in the browser**

Prerequisites: Task 13 Step 11 (Google provider and your email in `admins`), `npm run dev`. Open `http://localhost:3000/admin`.

| # | Do | Expect |
|---|---|---|
| 1 | Open `/admin` signed out | Redirected to `/admin/login` |
| 2 | Click **Sign in with Google** with an account that is **not** in `admins` | Back on login with “not on the admin list”; opening `/admin` still redirects |
| 3 | Sign in with your listed account | Dashboard with `rehearsal` badge and zeros |
| 4 | Guests → upload `tests/fixtures/guests-errors.csv` | Red list: duplicate `E001` (two rows), `outlet` required on row 4, invalid phone on row 5. No **Import now** button |
| 5 | Upload `tests/fixtures/guests-sample.csv` | “6 new, 0 updated, 0 existing not in file”. Click **Import now** |
| 6 | Look at the table | 6 employees, `E005` has no phone, header counts update |
| 7 | **Download invitations CSV**, open it, copy one `pass_link` into a private window | The guest pass for that employee opens |
| 8 | Edit `sample.csv` (delete the E006 row), upload it | Preview says 1 existing employee not in file (`E006`), flagged not deleted. Import. `E006` shows the pink “missing from file” badge and its pass link still opens |
| 9 | Add a walk-in | Pass link shown; row appears with `walk-in`; open the link |
| 10 | Edit `E002`: change outlet, save | Table shows the change; set an invalid phone `12` → error message |
| 11 | Settings → **Generate**, **Set PIN** for Check-in | PIN shown once; a station tab logged in with the old PIN is signed out on its next action |
| 12 | Check a guest in and hand over merchandise at the station (Tasks 11–12), then Merchandise → **Void** with a short reason (`abc`) | “at least 5 characters”; with a real reason the row shows voided and the station lets that guest collect again |
| 13 | Settings → type `reset` (lowercase) | **Reset** button stays disabled; `RESET` enables it |
| 14 | **Sign out** | Login page; `/admin/guests` redirects to login |

Do **not** click **Go live** on a development database you still need.

- [ ] **Step 17: Commit**

```bash
git add src tests
git commit -m "feat(admin): guest import, guest table, walk-ins, merchandise voids and settings"
```

---

## Task 16: Invitation gate — end-to-end, security and load tests, device checklist, production setup

This task proves the gate in spec section 8 ("Invitation gate, before 23 Nov") and writes down how to run it. Nothing here adds product features.

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/helpers.ts`, `tests/e2e/pass.spec.ts`, `tests/e2e/station.spec.ts`
- Create: `tests/api/security.test.ts`
- Create: `scripts/load/util.mjs`, `scripts/load/seed-fake-guests.mjs`, `scripts/load/pass-pages.mjs`, `scripts/load/scans.mjs`
- Create: `docs/runbooks/invitation-gate-checklist.md`, `docs/runbooks/device-qr-checklist.md`, `docs/runbooks/production-setup.md`

**Interfaces:**
- Consumes: every route and page from Tasks 9–15, `window.__nfInjectCode` (enabled by `NEXT_PUBLIC_E2E=1`), `scripts/concurrency/*.mjs`, `.env.test` (including `DATABASE_URL`).
- Produces: `npm run e2e` (Playwright, 360 px viewport, Indonesian locale, WITA time zone); `node --env-file=.env.test scripts/load/<name>.mjs`; the three runbooks.

- [ ] **Step 1: Playwright configuration and helpers**

Run once: `npx playwright install chromium` (on a machine that already has Chromium, set `PW_CHROMIUM=/path/to/chromium` instead).

`playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test';

process.loadEnvFile('.env.test'); // Node 20.12 or newer

export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1, // one shared local database
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: 'http://localhost:3000',
    viewport: { width: 360, height: 780 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'id-ID',
    timezoneId: 'Asia/Makassar',
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: false, // stop any running dev server first: the E2E flag is compiled in at start
    timeout: 120_000,
    env: { NEXT_PUBLIC_E2E: '1' },
  },
});
```
`tests/e2e/helpers.ts`:
```ts
import { createClient } from '@supabase/supabase-js';
import { expect, type Page } from '@playwright/test';

export const EVENT = process.env.EVENT_ID!;
export const PINS = { checkin: '111111', merchandise: '222222', draw: '333333', prizes: '444444' };
export const svc = () =>
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

export type E2eGuest = { id: string; full_name: string; invite_token: string; merch_token: string };

/** Known PINs, an empty rehearsal event, and n guests (employee ids T1..Tn). */
export async function prepare(n = 1): Promise<E2eGuest[]> {
  const s = svc();
  for (const [role, pin] of Object.entries(PINS)) {
    const { error } = await s.rpc('set_station_pin', { p_event: EVENT, p_role: role, p_pin: pin, p_actor: 'e2e' });
    if (error) throw error;
  }
  const reset = await s.rpc('reset_rehearsal_data', { p_event: EVENT, p_actor: 'e2e' });
  if (reset.error || reset.data?.status !== 'OK') throw new Error('reset failed: the dev event must be in rehearsal mode');
  const rows = Array.from({ length: n }, (_, i) => ({
    row_no: i + 2, employee_id: `T${i + 1}`, full_name: `Test Guest ${i + 1}`, outlet: 'Outlet A', phone: '+628123450000',
  }));
  const imp = await s.rpc('import_guests', { p_event: EVENT, p_rows: rows, p_filename: 'e2e.csv', p_actor: 'e2e' });
  if (imp.error || imp.data?.status !== 'OK') throw new Error('import failed');
  const { data } = await s.from('guests').select('id, full_name, invite_token, merch_token')
    .eq('event_id', EVENT).like('employee_id', 'T%').order('employee_id');
  return (data ?? []).slice(0, n) as E2eGuest[];
}

export async function checkInViaDb(g: E2eGuest) {
  const { data, error } = await svc().rpc('check_in', {
    p_event: EVENT, p_token: g.invite_token, p_guest_id: null, p_method: 'scan', p_station_label: 'Meja 1', p_actor: 'e2e',
  });
  if (error || data?.status !== 'CHECKED_IN') throw new Error('check-in setup failed');
}

export async function stationLogin(page: Page, pin: string, label: string, home: string) {
  await page.goto('/station');
  await page.getByPlaceholder('••••••').fill(pin);
  await page.getByRole('button', { name: 'MASUK' }).click();
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('button', { name: 'LANJUT' }).click();
  await page.waitForURL(`**${home}`);
}

/** Stands in for the camera: hands a decoded QR string to the scanner. */
export async function inject(page: Page, code: string) {
  await page.waitForFunction(() => typeof (window as unknown as { __nfInjectCode?: unknown }).__nfInjectCode === 'function');
  await page.evaluate((c) => (window as unknown as { __nfInjectCode: (x: string) => void }).__nfInjectCode(c), code);
}

export async function noHorizontalScroll(page: Page) {
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits, 'page is wider than the 360 px viewport').toBe(true);
}
```

- [ ] **Step 2: Guest pass end-to-end spec**

`tests/e2e/pass.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { checkInViaDb, noHorizontalScroll, prepare } from './helpers';

test('pass renders at 360 px in Indonesian and English, with safe headers', async ({ page }) => {
  const [g] = await prepare(1);
  const res = await page.goto(`/pass/${g.invite_token}`);
  const h = res!.headers();
  expect(h['referrer-policy']).toBe('no-referrer');
  expect(h['x-robots-tag']).toContain('noindex');
  expect(h['cache-control']).toBe('no-store');

  await expect(page.getByText('PASS CHECK-IN', { exact: true })).toBeVisible();
  const qr = page.getByRole('img', { name: /QR check-in/ });
  await expect(qr).toBeVisible();
  // Version 3 symbol (29 modules) plus a 4-module quiet zone each side is 37 modules: whole pixels per module, at least 5.
  const box = (await qr.boundingBox())!;
  expect(box.width / 37).toBeGreaterThanOrEqual(5);
  expect(Number.isInteger(box.width / 37)).toBe(true);
  await noHorizontalScroll(page);

  await page.getByRole('button', { name: 'EN' }).click();
  await expect(page.getByText('CHECK-IN PASS', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: "I'M IN" })).toBeVisible();
  await noHorizontalScroll(page);
});

test('RSVP is saved and survives a reload', async ({ page }) => {
  const [g] = await prepare(1);
  await page.goto(`/pass/${g.invite_token}`);
  await page.getByRole('button', { name: 'AKU IKUT' }).click();
  await expect(page.getByText('Sip, sampai ketemu 10 Desember!')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Sip, sampai ketemu 10 Desember!')).toBeVisible();
});

test('an unknown link shows a neutral message and no guest data', async ({ page }) => {
  await prepare(1);
  await page.goto('/pass/AAAAAAAAAAAAAAAAAAAAAA');
  await expect(page.getByText('LINK TIDAK DIKENAL')).toBeVisible();
  await expect(page.getByText('Test Guest')).toHaveCount(0);
});

test('after check-in the pass shows the fixed prize number and the merchandise QR', async ({ page }) => {
  const [g] = await prepare(1);
  await checkInViaDb(g);
  await page.goto(`/pass/${g.invite_token}`);
  await expect(page.getByText('NOMOR DOOR PRIZE')).toBeVisible();
  await expect(page.getByText('001', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: /QR merchandise/ })).toBeVisible();
  await noHorizontalScroll(page);
  await page.getByRole('button', { name: 'EN' }).click();
  await expect(page.getByText('DOOR PRIZE NUMBER')).toBeVisible();
  await noHorizontalScroll(page);
});
```

- [ ] **Step 3: Staff stations end-to-end spec**

`tests/e2e/station.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { checkInViaDb, inject, noHorizontalScroll, PINS, prepare, stationLogin } from './helpers';

const next = (page: import('@playwright/test').Page) => page.getByRole('button', { name: 'SCAN BERIKUTNYA' }).click();
const title = (page: import('@playwright/test').Page, text: string) => expect(page.getByText(text, { exact: true })).toBeVisible();
// The scanner ignores an identical code for 2 seconds, so a deliberate repeat has to wait that long.
const waitOutDebounce = (page: import('@playwright/test').Page) => page.waitForTimeout(2100);

test('check-in desk: first scan, repeat scan, wrong QR, garbage', async ({ page }) => {
  const [a] = await prepare(1);
  await stationLogin(page, PINS.checkin, 'Meja 1', '/station/check-in');
  await noHorizontalScroll(page);

  await inject(page, `NF:CI:${a.invite_token}`);
  await title(page, 'CHECK-IN BERHASIL');
  await expect(page.getByText(a.full_name)).toBeVisible();
  await expect(page.getByText('001', { exact: true })).toBeVisible();
  await noHorizontalScroll(page);

  await next(page);
  await waitOutDebounce(page);
  await inject(page, `NF:CI:${a.invite_token}`);
  await title(page, 'SUDAH CHECK-IN');
  await expect(page.getByText(/Tidak ada nomor baru dibuat/)).toBeVisible();

  await next(page);
  await inject(page, `NF:MR:${a.merch_token}`);
  await title(page, 'BUKAN QR CHECK-IN');

  await next(page);
  await inject(page, 'hello');
  await title(page, 'QR TIDAK DIKENAL');
});

test('check-in desk: manual search finds a guest by name', async ({ page }) => {
  await prepare(2);
  await stationLogin(page, PINS.checkin, 'Meja 2', '/station/check-in');
  await page.getByRole('button', { name: 'CARI MANUAL' }).click();
  await page.getByPlaceholder('Cari nama atau ID karyawan').fill('guest 2');
  await page.getByText('Test Guest 2').click();
  await title(page, 'CHECK-IN BERHASIL');
});

test('merchandise booth: look up, hand over once, block the repeat and the wrong QR', async ({ page }) => {
  const [a, b] = await prepare(2);
  await checkInViaDb(a);
  await stationLogin(page, PINS.merchandise, 'Booth 1', '/station/merchandise');
  await noHorizontalScroll(page);

  await inject(page, `NF:MR:${a.merch_token}`);
  await title(page, 'SIAP DISERAHKAN');
  await page.getByRole('button', { name: 'SERAHKAN MERCHANDISE' }).click();
  await title(page, 'TERCATAT');

  await next(page);
  await waitOutDebounce(page);
  await inject(page, `NF:MR:${a.merch_token}`);
  await title(page, 'SUDAH DIAMBIL');

  await next(page);
  await inject(page, `NF:MR:${b.merch_token}`);
  await title(page, 'BELUM CHECK-IN');

  await next(page);
  await inject(page, `NF:CI:${a.invite_token}`);
  await title(page, 'BUKAN QR MERCHANDISE');

  await page.goto(`/pass/${a.invite_token}`);
  await expect(page.getByText('SUDAH DIAMBIL')).toBeVisible();
  await expect(page.getByRole('img', { name: /QR merchandise/ })).toHaveCount(0);
});

test('a wrong PIN is refused and a role without a screen yet says so', async ({ page }) => {
  await prepare(1);
  await page.goto('/station');
  await page.getByPlaceholder('••••••').fill('999999');
  await page.getByRole('button', { name: 'MASUK' }).click();
  await expect(page.getByText('PIN salah')).toBeVisible();
  await page.getByPlaceholder('••••••').fill(PINS.draw);
  await page.getByRole('button', { name: 'MASUK' }).click();
  await expect(page.getByText('Layar ini belum tersedia.')).toBeVisible(); // draw screen arrives with Plan 2
});
```

- [ ] **Step 4: Run the end-to-end specs**

Stop any running `npm run dev`, then run: `npm run e2e`
Expected: all specs pass (about 1–2 minutes). On a failure, open `playwright-report/index.html`; a title mismatch means the string in `src/lib/i18n/strings.ts` differs from the spec, so fix whichever side is wrong against the Design Guide wording rather than loosening the assertion.

- [ ] **Step 5: Write the failing security test**

`tests/api/security.test.ts`:
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EVENT, svc } from './helpers';

const mk = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const TABLES = ['events', 'admins', 'station_pins', 'auth_attempts', 'import_batches', 'guests', 'check_ins', 'merchandise_redemptions', 'attempt_log', 'audit_log'];
const FUNCTIONS: [string, Record<string, unknown>][] = [
  ['get_pass', { p_token: 'AAAAAAAAAAAAAAAAAAAAAA' }],
  ['verify_pin', { p_event: EVENT, p_pin: '111111', p_device_key: 'x', p_ip_key: 'x' }],
  ['check_in', { p_event: EVENT, p_token: 'AAAAAAAAAAAAAAAAAAAAAA', p_guest_id: null, p_method: 'scan', p_station_label: 'x', p_actor: 'x' }],
  ['redeem_merchandise', { p_event: EVENT, p_token: 'AAAAAAAAAAAAAAAAAAAAAA', p_guest_id: null, p_station_label: 'x', p_actor: 'x' }],
  ['void_redemption', { p_event: EVENT, p_redemption_id: '00000000-0000-4000-8000-000000000000', p_reason: 'none', p_actor: 'x' }],
  ['import_guests', { p_event: EVENT, p_rows: [], p_filename: 'x', p_actor: 'x' }],
  ['set_station_pin', { p_event: EVENT, p_role: 'checkin', p_pin: '123456', p_actor: 'x' }],
  ['is_admin', { p_event: EVENT, p_email: 'dev-admin@example.com' }],
  ['go_live', { p_event: EVENT, p_actor: 'x' }],
  ['reset_rehearsal_data', { p_event: EVENT, p_actor: 'x' }],
  ['event_counts', { p_event: EVENT }],
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
});

describe.each([['anon', () => anonClient], ['authenticated', () => authedClient]] as const)('%s role', (_name, client) => {
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
```

- [ ] **Step 6: Run it**

Run: `npm run test:api -- security`
Expected: PASS (about 66 assertions). A failure that says `PGRST202` means a parameter name in `FUNCTIONS` does not match the SQL signature; fix the test arguments. A failure that returns data or `null` error means a grant leaked: fix the migration's `lock_down_public()`, never the test.

- [ ] **Step 7: Load-test helpers and seed script**

`scripts/load/util.mjs`:
```js
export const BASE = process.env.APP_URL ?? 'http://localhost:3000';

/** Runs fn over items with at most `size` in flight. */
export async function runPool(items, size, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

export const percentile = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] ?? 0;
};

export function finish(name, checks) {
  let failed = false;
  for (const [label, pass, detail] of checks) {
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}  ${detail ?? ''}`);
    failed ||= !pass;
  }
  console.log(failed ? `\n${name}: FAILED` : `\n${name}: all checks passed`);
  process.exit(failed ? 1 : 0);
}
```
`scripts/load/seed-fake-guests.mjs`:
```js
// Usage: node --env-file=.env.test scripts/load/seed-fake-guests.mjs [count]
// Seeds fake employees L001.. into the event. Use only on local or staging.
import pg from 'pg';

const n = Number(process.argv[2] ?? 215);
const outlets = ['Outlet Ubud', 'Outlet Seminyak', 'Central Kitchen', 'Head Office'];
const rows = Array.from({ length: n }, (_, i) => ({
  row_no: i + 2,
  employee_id: `L${String(i + 1).padStart(3, '0')}`,
  full_name: `Load Guest ${i + 1}`,
  outlet: outlets[i % outlets.length],
  phone: `+628120000${String(i).padStart(4, '0')}`,
}));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const { rows: [r] } = await pool.query('select public.import_guests($1, $2::jsonb, $3, $4) as r', [
  process.env.EVENT_ID, JSON.stringify(rows), 'load.csv', 'load',
]);
console.log(r.r);
await pool.end();
process.exit(r.r.status === 'OK' ? 0 : 1);
```

- [ ] **Step 8: Pass-page and scan load scripts**

`scripts/load/pass-pages.mjs`:
```js
// Usage: node --env-file=.env.test scripts/load/pass-pages.mjs
// Spec: 215 pass pages inside one minute. Run against a production build (`npm run build && npm run start`), not `next dev`.
import pg from 'pg';
import { BASE, finish, percentile, runPool } from './util.mjs';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const { rows } = await pool.query("select invite_token from guests where event_id = $1 and employee_id like 'L%' order by employee_id", [process.env.EVENT_ID]);
await pool.end();
if (rows.length < 215) { console.error(`Seed first: only ${rows.length} fake guests (need 215).`); process.exit(2); }

const lat = [];
let bad = 0;
const t0 = performance.now();
await runPool(rows.slice(0, 215), 40, async ({ invite_token }) => {
  const s = performance.now();
  try {
    const res = await fetch(`${BASE}/pass/${invite_token}`);
    await res.text();
    if (!res.ok) bad++;
  } catch { bad++; }
  lat.push(performance.now() - s);
});
const total = (performance.now() - t0) / 1000;
finish('pass-pages', [
  ['215 pages served inside 60 s', total < 60, `${total.toFixed(1)} s`],
  ['no failed responses', bad === 0, `${bad} failed`],
  ['p95 under 3 s', percentile(lat, 95) < 3000, `${Math.round(percentile(lat, 95))} ms`],
]);
```
`scripts/load/scans.mjs`:
```js
// Usage: node --env-file=.env.test scripts/load/scans.mjs
// Spec: 20 simultaneous scans, check_in p95 under 1.5 s, prize numbers 1..215 unique with no gaps.
// WARNING: resets rehearsal data first. Refuses to run on a live event.
import pg from 'pg';
import { BASE, finish, percentile, runPool } from './util.mjs';

const PIN = process.env.CHECKIN_PIN ?? '111111';
const headers = { 'content-type': 'application/json', origin: BASE };

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const reset = await pool.query("select public.reset_rehearsal_data($1, 'load') as r", [process.env.EVENT_ID]);
if (reset.rows[0].r.status !== 'OK') { console.error('Event is not in rehearsal mode. Aborting.'); process.exit(2); }
const { rows } = await pool.query("select invite_token from guests where event_id = $1 and employee_id like 'L%' order by employee_id", [process.env.EVENT_ID]);
await pool.end();
if (rows.length < 215) { console.error(`Seed first: only ${rows.length} fake guests (need 215).`); process.exit(2); }

const jar = new Map();
const absorb = (res) => { for (const c of res.headers.getSetCookie()) { const p = c.split(';')[0]; jar.set(p.split('=')[0], p); } };
const cookie = () => [...jar.values()].join('; ');

const login = await fetch(`${BASE}/api/station/login`, { method: 'POST', headers, body: JSON.stringify({ pin: PIN }) });
absorb(login);
if ((await login.json()).status !== 'OK') { console.error('Station login failed'); process.exit(2); }
const pick = await fetch(`${BASE}/api/station/select-label`, { method: 'POST', headers: { ...headers, cookie: cookie() }, body: JSON.stringify({ label: 'Meja 1' }) });
absorb(pick);

const lat = [];
const numbers = [];
let notChecked = 0;
let errors = 0;
await runPool(rows.slice(0, 215), 20, async ({ invite_token }) => {
  const s = performance.now();
  try {
    const res = await fetch(`${BASE}/api/station/check-in`, { method: 'POST', headers: { ...headers, cookie: cookie() }, body: JSON.stringify({ code: `NF:CI:${invite_token}` }) });
    const j = await res.json();
    if (j.status === 'CHECKED_IN') numbers.push(j.data.prize_number); else notChecked++;
  } catch { errors++; }
  lat.push(performance.now() - s);
});

numbers.sort((a, b) => a - b);
const gapFree = numbers.length === 215 && numbers.every((n, i) => n === i + 1);
finish('scans', [
  ['all 215 scans were CHECKED_IN', notChecked === 0 && errors === 0, `${notChecked} other status, ${errors} errors`],
  ['prize numbers are exactly 1..215', gapFree, `${numbers.length} numbers`],
  ['p95 under 1.5 s with 20 in flight', percentile(lat, 95) < 1500, `${Math.round(percentile(lat, 95))} ms`],
]);
```

- [ ] **Step 9: Run the load scripts**

Run:
```bash
node --env-file=.env.test scripts/load/seed-fake-guests.mjs 215
npm run build && (npm run start & sleep 6)
node --env-file=.env.test scripts/load/pass-pages.mjs
node --env-file=.env.test scripts/load/scans.mjs
node --env-file=.env.test scripts/concurrency/checkin.mjs
node --env-file=.env.test scripts/concurrency/redeem.mjs
kill %1
```
Expected: each script ends with `all checks passed`. Local numbers are a lower bound: repeat `pass-pages.mjs` and `scans.mjs` against staging (Task 16 runbook) before the gate. After the run, clean up with `reset_rehearsal_data` through the admin settings page and delete the fake guests: `psql "$DATABASE_URL" -c "delete from guests where employee_id like 'L%';"`.

- [ ] **Step 10: Commit**

```bash
git add playwright.config.ts tests scripts
git commit -m "test: end-to-end, security and load tests for the invitation gate"
```

---

- [ ] **Step 11: Write the invitation-gate checklist**

`docs/runbooks/invitation-gate-checklist.md`:
```markdown
# Invitation gate checklist

Nobody sends a single invitation link until every line is ticked. Target: before 23 November 2026.
Record the commit hash tested and the date next to each automated line.

## 1. Automated checks (run on the commit that will be deployed)

| Check | Command | Result / date |
| :---- | :---- | :---- |
| Database tests | `supabase test db` | |
| Unit tests | `npm run test:unit` | |
| API tests | `npm run test:api` | |
| Concurrency: 50 parallel check-ins, one guest | `node --env-file=.env.test scripts/concurrency/checkin.mjs` | |
| Concurrency: two stations, one merchandise | `node --env-file=.env.test scripts/concurrency/redeem.mjs` | |
| End to end at 360 px (ID and EN) | `npm run e2e` | |
| Load on staging: 215 pass pages in 60 s | `scripts/load/pass-pages.mjs` | |
| Load on staging: 20 simultaneous scans, p95 under 1.5 s, numbers 1–215 | `scripts/load/scans.mjs` | |

## 2. Security

- [ ] `tests/api/security.test.ts` passes (anon and authenticated roles cannot read or write any table or call any function).
- [ ] Supabase dashboard, Advisors, Security, on the **production** project: no ERROR or WARN. INFO notices "RLS enabled, no policy" on every table are expected and intentional (browsers never touch tables).
- [ ] `curl -sI https://<production-domain>/pass/AAAAAAAAAAAAAAAAAAAAAA` shows `referrer-policy: no-referrer`, `x-robots-tag: noindex, nofollow`, `cache-control: no-store`.
- [ ] `NEXT_PUBLIC_E2E` is **not** set in the Vercel production environment.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` exists only in Vercel (marked sensitive) and in nobody's chat history.
- [ ] Two admins can sign in with Google; a third, unlisted Google account is turned away.

## 3. Data

- [ ] HR uploaded the final employee CSV on production. Preview counts match the HR headcount.
- [ ] HR spot-checked at least 10 employees across all outlets (name, outlet, phone).
- [ ] Phone numbers: every employee who should get a WhatsApp link has one. Employees with no phone are listed and have a delivery plan.
- [ ] Employee list **frozen** on 20 November (proposed). After the freeze, new people are added only as walk-ins or by a re-import that HR approves.

## 4. Pass page on real phones

- [ ] Device checklist (`device-qr-checklist.md`) completed and signed off.
- [ ] At least three personal links opened from WhatsApp on Android and one on iPhone, in Indonesian and in English.

## 5. Operations

- [ ] Four station PINs set on production and stored in the HR password manager (not in chat).
- [ ] Station names match the real desks and booths.
- [ ] Event is still in **rehearsal** mode (never click Go live before the morning of 10 December).
- [ ] Supabase Pro plan active with daily backups. Billing owner confirmed (open decision 14).
- [ ] Named technical contact for 10 December confirmed (open decision 13, due 28 November).
- [ ] Invitation CSV downloaded once, stored in the HR drive with restricted access, and deleted from Downloads. It contains every employee’s personal link.

## 6. Sending

- [ ] Each employee receives **only their own** link, one-to-one (the CSV has a WhatsApp link per row). Links are never posted in a group chat.
- [ ] The dashboard “Opened their invitation” count is watched daily; HR follows up with those who have not opened it after 3 days.

## Sign-off

| Role | Name | Date |
| :---- | :---- | :---- |
| HR (Angel) | | |
| Technical contact | | |
```

- [ ] **Step 12: Write the device QR checklist**

`docs/runbooks/device-qr-checklist.md`:
```markdown
# Device QR checklist

Goal: every guest phone can be scanned by the station phones in under 2 seconds, in a bright or dim room.
Use the staging site with fake guests, or production in rehearsal mode. Test with the **staff** device doing the scanning.

## Devices

| # | Guest phone (OS, model, browser) | Notes |
| :---- | :---- | :---- |
| 1 | Android, low-end model | |
| 2 | Android, mid-range | |
| 3 | Android, older version | |
| 4 | iPhone, Safari | |

Staff scanners: one Android with Chrome and one iPhone with Safari. Both must pass the camera step.

## For each guest phone

| Test | Pass when | D1 | D2 | D3 | D4 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| Open the personal link from a WhatsApp message (WhatsApp’s built-in browser) | Pass loads, QR visible, no sideways scrolling | | | | |
| Open the same link in Chrome / Safari | Same | | | | |
| Brightness at 30% | Scans in under 2 s at about 25–35 cm | | | | |
| Brightness at 100% | Scans in under 2 s | | | | |
| Phone dark mode on | QR tile is still white with black modules | | | | |
| “Save as image”, then scan the saved image from the gallery | Scans in under 2 s | | | | |
| Screenshot of the pass, then scan the screenshot | Scans in under 2 s | | | | |
| Airplane mode after the page has loaded | QR still shown | | | | |
| Language toggle ID then EN, reload | Choice remembered; no layout break | | | | |
| After check-in: prize number and merchandise QR appear | Both visible; merchandise QR scans at the booth | | | | |

## For each staff scanner

| Test | Pass when | Android | iPhone |
| :---- | :---- | :---- | :---- |
| Camera permission prompt | Appears only after tapping “AKTIFKAN KAMERA” | | |
| Deny the permission | Message points to Cari Manual; manual search works | | |
| Scan three different guest phones in a row | Each result appears in under 2 s; same code is ignored for 2 s | | |
| Scan with the room lights dimmed | Still scans | | |
| Vibration on success / problem | Short on success, double on problem (Android only) | | |

## If a phone fails

1. Raise `ppm` on `QrTile` from 6 to 7 (the tile gets bigger, the QR stays the same) and retest that phone.
2. Check that the pass is not being scaled by CSS: the QR width must be 37 × an integer number of pixels (the end-to-end test asserts this).
3. If a particular browser still fails, record it here and add the workaround to the staff briefing (use Cari Manual).

Signed off by: ____________  Date: ____________
```

- [ ] **Step 13: Write the production setup runbook and `vercel.json`**

`vercel.json`:
```json
{
  "regions": ["sin1"]
}
```
`docs/runbooks/production-setup.md`:
```markdown
# Production and staging setup

Do this for **staging first**, then production. Staging is a second Supabase project plus a Vercel preview deployment, seeded with 215 fake employees. Never run `supabase/seed.sql` on production.

## Before you start

- Open decision 14 is closed: a named person owns the Supabase organisation and its billing (needed by 17 October).
- A Google account with access to Google Cloud Console (for the admin sign-in client).
- The repository is connected to a Vercel team.

## 1. Supabase project

1. Create a **Pro** project in **Singapore (ap-southeast-1)**. Name it `nourishfest-prod` (`nourishfest-staging` for staging). Save the database password in the password manager.
2. Link and apply the schema. Nothing is ever edited by hand in the dashboard.
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```
   Expected: six migrations applied, no errors.
3. Create the event and the admin allow-list (SQL editor or `psql`). Note the returned id: it becomes `EVENT_ID`.
   ```sql
   insert into public.events (name, event_date, venue, config)
   values ('NourishFest 2026', '2026-12-10', null,
           '{"station_labels": ["Meja 1", "Meja 2", "Meja 3", "Booth 1", "Booth 2"]}')
   returning id;

   insert into public.admins (event_id, email, name) values
     ('<event id>', 'angelliaokta@gmail.com', 'Angel'),
     ('<event id>', '<second admin email in lower case>', '<name>');
   ```
   Use at least two admins. Emails must be lower case.
4. Authentication: turn **Email** provider off (not used). Turn **Google** on with the client id and secret from step 2 below. Set **Site URL** to the app URL and add `https://<app-domain>/auth/callback` to the redirect allow-list.

## 2. Google sign-in client

Google Cloud Console, APIs and Services, Credentials, **OAuth client ID**, type **Web application**.
Authorised redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`. Copy the client id and secret into Supabase (step 1.4). Any Google account can create a Supabase user, but only addresses in `admins` get any access.

## 3. Vercel project

1. Import the repository. Framework: Next.js. `vercel.json` already pins functions to Singapore (`sin1`) next to the database.
2. Environment variables (Production, and Preview for staging):

   | Name | Value |
   | :---- | :---- |
   | `SUPABASE_URL` | Project URL |
   | `SUPABASE_ANON_KEY` | anon / publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service role / secret key (mark **Sensitive**) |
   | `STATION_SESSION_SECRET` | output of `openssl rand -hex 32` |
   | `EVENT_ID` | the id from step 1.3 |
   | `APP_URL` | `https://<app-domain>` with no trailing slash |

   Do **not** add `NEXT_PUBLIC_E2E`.
3. Deploy. Then confirm the headers:
   ```bash
   curl -sI https://<app-domain>/pass/AAAAAAAAAAAAAAAAAAAAAA | grep -i -E 'referrer-policy|x-robots-tag|cache-control'
   ```
   Expected: `no-referrer`, `noindex, nofollow`, `no-store`.

## 4. First-run smoke test (production, still in rehearsal mode)

1. Open `/admin`, sign in with Google, see the dashboard with the `rehearsal` badge.
2. Settings: generate and set all four PINs; write them in the password manager. Check the station names.
3. Guests: import the real CSV (or the fake one on staging). Confirm the preview counts, import, spot-check rows.
4. Download the invitations CSV and open your own pass link on your phone. RSVP.
5. At a station phone, log in with the Check-in PIN, scan your pass, then hand over merchandise with the Merchandise PIN.
6. Settings: **Reset rehearsal data**. Confirm the dashboard returns to zero check-ins. Guests, RSVPs and PINs stay.

## 5. Staging load run

Seed and run the load scripts against the staging database and staging URL:
```bash
export DATABASE_URL='<staging connection string>' APP_URL='https://<staging-domain>' EVENT_ID='<staging event id>'
node scripts/load/seed-fake-guests.mjs 215
node scripts/load/pass-pages.mjs
node scripts/load/scans.mjs
```
Staging uses its own PINs: pass `CHECKIN_PIN=<staging check-in PIN>` to `scans.mjs`.

## 6. Backups and watching

- Supabase Pro daily backups are on (Database, Backups). Note the retention shown.
- Bookmark Vercel runtime logs and Supabase logs for the event day. Logs contain no full tokens or PINs by design.

## 7. Never do early

- Do not click **Go live** before the morning of 10 December. It is one-way and locks the rehearsal reset.
- Do not share the service role key. If it ever leaks, rotate it in Supabase and in Vercel, then redeploy.
```

- [ ] **Step 14: Final full run and commit**

Run: `npx tsc --noEmit && npm run lint && supabase test db && npm run test:unit && npm run test:api`
Expected: everything passes. Then tick the automated rows of the gate checklist for this commit.

```bash
git add docs vercel.json
git commit -m "docs: invitation gate checklist, device QR checklist and production setup runbook"
```

---

## Plan 1 done: what exists, and what Plan 2 adds

After Task 16 the invitation gate can be passed: guests can open personal passes, RSVP, be checked in, collect merchandise once, and HR can import, invite, void, manage PINs and reset rehearsal data.

**Plan 2 (written next, delivered before Rehearsal 1 on 1 December)** covers: door-prize draw and the MC confirm / no-show flow, stage display with the reveal-after-confirm rule and realtime plus polling, prize verification screen, full dashboard, stage heartbeat, replacing `reset_rehearsal_data` to clear draws and reset the stage, the draw and prizes station pages (the Task 11 login map already routes to them), the rollout rehearsal scripts and the failure playbook printout.

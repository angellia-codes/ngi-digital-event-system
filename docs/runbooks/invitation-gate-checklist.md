# Invitation gate checklist

Nobody sends a single invitation link until every line is ticked. Target: before 23 November 2026.
Record the commit hash tested and the date next to each automated line.

## 1. Automated checks (run on the commit that will be deployed)

| Check | Command | Result / date |
| :---- | :---- | :---- |
| Database tests | `npm run test:db` (pgTAP over `DATABASE_URL`) | PASS, 6 files, 41dd50e, 2026-10-11 (dev project) |
| Unit tests | `npm run test:unit` | PASS, 83 tests, 41dd50e, 2026-10-11 |
| API tests | `npm run test:api` | PASS, 133 tests, 41dd50e, 2026-10-11 (dev project, from a laptop) |
| Concurrency: 50 parallel check-ins, one guest | `node --env-file=.env.test scripts/concurrency/checkin.mjs` | PASS (also 215 parallel, numbers 1-215), 41dd50e, 2026-10-11 |
| Concurrency: two stations, one merchandise | `node --env-file=.env.test scripts/concurrency/redeem.mjs` | PASS, 41dd50e, 2026-10-11 |
| End to end at 360 px (EN default, ID toggle) | `npm run e2e` (set `E2E_NO_BUILD=1` to reuse an existing `NEXT_PUBLIC_E2E=1` build) | PASS, 8 specs, twice in a row, 41dd50e, 2026-10-11 |
| Load on staging: 215 pass pages in 60 s | `scripts/load/pass-pages.mjs` | NOT YET on staging. Laptop to dev project: 215 pages in 24.8 s, 0 failed, p95 8.4 s (target 3 s). Repeat on staging. |
| Load on staging: 20 simultaneous scans, p95 under 1.5 s, numbers 1–215 | `scripts/load/scans.mjs` | NOT YET on staging. Laptop to dev project: 215 scans all CHECKED_IN, numbers exactly 1-215, p95 2.1 s (target 1.5 s). Repeat on staging. |

## 2. Security

- [x] `tests/api/security.test.ts` passes (anon and authenticated roles cannot read or write any table or call any function). (62 assertions, 41dd50e, 2026-10-11)
- [ ] Supabase dashboard, Advisors, Security, on the **production** project: no ERROR or WARN. INFO notices "RLS enabled, no policy" on every table are expected and intentional (browsers never touch tables).
- [ ] `curl -sI https://<production-domain>/pass/AAAAAAAAAAAAAAAAAAAAAA` shows `referrer-policy: no-referrer`, `x-robots-tag: noindex, nofollow` and a `cache-control` that contains `no-store` (Next adds `must-revalidate`).
- [ ] `NEXT_PUBLIC_E2E` is **not** set in the Vercel production environment.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` exists only in Vercel (marked sensitive) and in nobody's chat history.
- [ ] The admin PIN opens `/admin`; a wrong PIN and a desk PIN do not; Sign out ends the session.

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

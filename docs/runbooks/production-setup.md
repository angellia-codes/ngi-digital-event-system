# Production setup

There is one Supabase project and one Vercel project: production. Rehearsals run on it in **rehearsal mode** and are wiped with Reset rehearsal data. There is no staging or test project, and the automated database, API and browser tests were removed on purpose (only unit tests remain). Never run `supabase/seed.sql` here.

## Before you start

- Open decision 14 is closed: a named person owns the Supabase organisation and its billing (needed by 17 October).
- The repository is connected to a Vercel team.

## 1. Supabase project

1. Create a **Pro** project in **Singapore (ap-southeast-1)**. Name it `nourishfest-prod`. Save the database password in the password manager.
2. Link and apply the schema. Nothing is ever edited by hand in the dashboard.
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```
   Expected: all migrations applied (Plan 1 has seven, Plan 2 adds seven more), no errors (the seventh fixes `reset_rehearsal_data` for the REST layer).
3. Create the event (SQL editor or `psql`). Note the returned id: it becomes `EVENT_ID`.
   ```sql
   insert into public.events (name, event_date, venue, config)
   values ('NourishFest 2026', '2026-12-10', null,
           '{"station_labels": ["Meja 1", "Meja 2", "Meja 3", "Booth 1", "Booth 2"]}')
   returning id;
   ```
4. Authentication: there is no Google or e-mail sign-in. The admin console uses an **admin PIN** (a four-digit PIN like the station PINs, role `admin`). Set the first one from your laptop; the PIN stays in your environment and is never typed into chat:
   ```powershell
   $env:ADMIN_PIN = '<4 digits>'; node --env-file=.env.local scripts/set-admin-pin.mjs
   ```
   After that the admin PIN can be changed in Settings. Whoever holds it can go live, reset, void draws and download every report: share it with two people at most, and keep it different from every desk PIN.

## 3. Vercel project

1. Import the repository. Framework: Next.js. `vercel.json` already pins functions to Singapore (`sin1`) next to the database.
2. Environment variables (Production):

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

1. Open `/station`, enter the admin PIN (it opens `/admin`), see the dashboard with the `rehearsal` badge.
2. Settings: generate and set the four desk PINs; write them in the password manager. Check the station names.
3. Guests: import the real CSV. Confirm the preview counts, import, spot-check rows.
4. Download the invitations CSV and open your own pass link on your phone.
5. At a station phone, log in with the Check-in PIN, scan your pass, then hand over merchandise with the Merchandise PIN.
6. Settings: **Reset rehearsal data**. Confirm the dashboard returns to zero check-ins. Guests and PINs stay.

## 5. Backups and watching

- Supabase Pro daily backups are on (Database, Backups). Note the retention shown.
- Bookmark Vercel runtime logs and Supabase logs for the event day. Logs contain no full tokens or PINs by design.

## 6. Never do early

- Do not click **Go live** before the morning of 10 December. It is one-way and locks the rehearsal reset.
- Do not share the service role key. If it ever leaks, rotate it in Supabase and in Vercel, then redeploy.

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
   Expected: seven migrations applied, no errors (the seventh fixes `reset_rehearsal_data` for the REST layer).
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

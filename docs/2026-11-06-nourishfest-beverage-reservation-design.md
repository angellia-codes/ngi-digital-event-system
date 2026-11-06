# NourishFest 2026 — Beverage Reservation and Bar QR: Design Spec

**Date:** 6 November 2026
**Status:** Approved in brainstorming, awaiting written-spec review
**Owner:** HR (Angel)
**Builds on:** Technical Design Spec, Invitation Design Spec, Invitation Motion Spec, and the current `ngi-digital-event-system` repository (latest migration `20261115000012_pass_nickname.sql`)
**Goal:** Know how many beers and soft drinks to purchase, and enforce one drink per employee at the bar.
**Deadline:** Live before the WhatsApp invitations are sent.

---

## 1. Summary

Each employee chooses Beer or Soft Drink once, in the invitation or on their pass. The choice generates a single-use beverage QR, which they redeem at a new Bar station after checking in. Admin shows a live purchase count, which becomes final at a deadline set by HR.

### 1.1 Decisions

| # | Decision |
|:--|:--|
| 1 | One drink per employee for the whole event. The QR works once |
| 2 | The choice is final after the first confirmed tap. Only an admin can change it |
| 3 | HR sets a purchase deadline in admin. Anyone without a choice at the deadline gets Soft Drink |
| 4 | Everyone on the guest list is 21+. HR confirms this against its records. Beer is shown to everyone and there is no age field |
| 5 | Dedicated QR with the prefix `NF:BV:` and a dedicated Bar station, modelled on the merchandise flow |
| 6 | The choice appears in the invitation **and** on the pass, because the invitation plays once and can be skipped |
| 7 | The QR appears as soon as a drink is set. The bar accepts it only after check-in |
| 8 | The choice never blocks check-in, the invitation or anything else |

### 1.2 Out of scope

Stock tracking, purchase quantities in crates or cases, buffer calculation, more than two drink types, multiple drinks per person, age checks, and changes to the Fonnte Google Sheet automation.

---

## 2. Employee experience

### 2.1 Invitation scene

A new scene sits between Do's & Don'ts and the Outro. It is titled **PILIH MINUMANMU / CHOOSE YOUR DRINK** and has two buttons, BEER and SOFT DRINK.

1. A tap opens an inline confirm step with **KONFIRMASI** and **BATAL**, stating that the choice is final. It is not a browser dialog.
2. On confirm, the app saves the choice and shows the QR only after the server confirms.
3. The guest continues to the Outro.

The scene never blocks progress. Scrolling past it and Lewati both still work. On replay it shows the current state, not the buttons, if a drink is already set.

### 2.2 Pass card

A new Beverage card sits below the ticket before check-in, and below the merchandise card after check-in. It uses the same component as the scene.

| Situation | Card shows |
|:--|:--|
| No choice, deadline not passed or not set | Both buttons. "Pilih sebelum {deadline}" when a deadline is set |
| Drink set by guest or admin | Drink name, QR, "1x" label, "Tukar di bar setelah check-in" |
| No choice, deadline passed | SOFT DRINK, QR, and a note that it was set automatically |
| Redeemed | SUDAH DIAMBIL with the time, and no QR |

### 2.3 Visual rules

- The beverage QR uses a new green frame (`qr-frame--green`). Check-in stays gold and merchandise stays pink. Black text on green.
- QR tile rules follow Design Guide 8.2. On the pass it scales to card width, max 300 px.
- After check-in the merchandise and beverage QRs can both be on the pass. This is a deliberate exception to the "one code on screen at the booth" rule. A wrong scan returns `WRONG_CODE_TYPE` and records nothing.
- The drink is shown only to the guest, at the bar and in admin. It does not appear on check-in or merchandise screens.
- The scene follows the existing invitation motion rules, including reduced motion and the 60 KB budget.

---

## 3. Bar station

Route: `/station/bar`. New role `bar` with its own PIN, a Bar tile on the hub, and station labels such as Bar 1 and Bar 2 from admin settings.

1. Staff scan the QR. This is a lookup and records nothing except rejected attempts.
2. The screen shows **BEER** or **SOFT DRINK** in large type, with the name and outlet.
3. Staff tap **SERAHKAN MINUMAN** to record the redemption.

Manual search by name or employee ID works as it does for merchandise. A live counter shows redeemed and total per drink, for example Beer 40/90 and Soft Drink 20/125. Totals are the current purchase-count numbers (section 4.2).

| Status | Panel | Staff action |
|:--|:--|:--|
| `READY` | Drink in large type | Hand over and tap |
| `REDEEMED` | Recorded | Next |
| `ALREADY_REDEEMED` | SUDAH DIAMBIL, with time and bar | No drink |
| `NOT_CHECKED_IN` | BELUM CHECK-IN | Send to the gate |
| `NO_CHOICE` | BELUM PILIH MINUMAN (manual search only, when no drink is set) | Guest chooses on their phone, or admin sets it |
| `WRONG_CODE_TYPE` | BUKAN QR MINUMAN | Ask for the right QR |
| `INVALID` / `NOT_ELIGIBLE` | QR TIDAK DIKENAL / TIDAK TERDAFTAR | Send to the admin desk |
| `RETRYABLE_ERROR` | Connection retry panel | Retry |

---

## 4. Admin

### 4.1 Deadline

`Beverage deadline` is a date and time in WITA in the Event details panel. It must be before `doors_at`. Blank means choices stay open and nothing converts to Soft Drink. Moving it later reopens the choice for anyone who has no stored choice and has not redeemed. A person who redeemed an automatic Soft Drink keeps that record.

### 4.2 Purchase count

The dashboard shows Beer, Soft Drink, No choice yet and Total for active guests. After the deadline, No choice yet is 0, those guests are included in Soft Drink, and the panel is labelled FINAL. It also shows how many of each drink have been redeemed.

Walk-ins and late additions after the deadline raise the live count. HR's buffer needs to cover them.

### 4.3 Corrections

- **Wrong tap:** admin can set or change a guest's drink in the guest editor with a required reason (minimum 5 characters, as for voids). The change is audited and `beverage_source` becomes `admin`. It is blocked with `ALREADY_REDEEMED` while an active redemption exists.
- **Bar mistake:** a new Beverage page in admin lists redemptions. Void requires a reason. Voiding makes the QR work again.

### 4.4 Reports

| Report | Contents |
|:--|:--|
| `beverages` | Employee ID, name, outlet, department, drink, source (guest, auto, admin), chosen at, redeemed at, bar, staff, status, void reason |
| `beverage-pending` | Guests with no drink set: employee ID, name, outlet, department, phone. HR uses this for a reminder through the Fonnte sheet |

The automatic H-1 reminder on 7 December is likely after the purchase deadline. The pre-deadline reminder is HR's manual step and is not part of this build.

---

## 5. Data

### 5.1 Migration `20261115000013_beverage_reservation.sql`

Use the next free number at build time.

```sql
alter table public.guests
  add column beverage_token text not null unique default public.new_token(),
  add column beverage_choice text check (beverage_choice in ('beer', 'soft_drink')),
  add column beverage_chosen_at timestamptz,
  add column beverage_source text check (beverage_source in ('guest', 'admin'));

alter table public.events add column beverage_deadline timestamptz;

create table public.beverage_redemptions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  guest_id uuid not null references public.check_ins (guest_id),
  beverage text not null check (beverage in ('beer', 'soft_drink')),
  source text not null check (source in ('guest', 'admin', 'auto')),
  status text not null check (status in ('redeemed', 'voided')),
  redeemed_at timestamptz not null default now(),
  station_label text,
  actor text,
  void_reason text
);
create unique index on public.beverage_redemptions (guest_id) where status = 'redeemed';
```

The migration also adds `bar` to the `station_pins.role` check, and ends with `select public.lock_down_public();`. The import upsert lists its columns, so re-imports leave tokens and choices untouched.

### 5.2 Effective drink

No job runs at the deadline. A SQL helper works out the drink on every read:

```
effective drink = stored beverage_choice
                  else 'soft_drink' if beverage_deadline is set and now() >= beverage_deadline
                  else none
```

Source is `guest` or `admin` from the stored row, or `auto` when the helper supplied Soft Drink. `redeem_beverage` copies the effective drink and source into the redemption row, so the record holds what was handed over even if the deadline moves later.

### 5.3 Functions

All follow the existing rules: `SECURITY DEFINER`, fixed `search_path`, service role only, business outcomes as return values, audit in the same transaction.

| Function | Called by | Result `status` |
|:--|:--|:--|
| `set_beverage(token, choice)` | Guest | `OK` (also on an identical repeat), `ALREADY_CHOSEN` (returns the saved drink), `CLOSED` (deadline passed), `INVALID` |
| `beverage_lookup(event, token or guest_id, actor)` | Bar scan or search | `READY`, `ALREADY_REDEEMED`, `NOT_CHECKED_IN`, `NO_CHOICE`, `NOT_ELIGIBLE`, `INVALID` |
| `redeem_beverage(event, token or guest_id, station_label, actor)` | Hand-over tap | `REDEEMED`, plus the blocked states above. Same guest lock and 10-second double-tap guard as merchandise |
| `void_beverage(event, redemption_id, reason, actor)` | Admin | `OK`, `REASON_REQUIRED`, `NOT_FOUND` |
| `admin_set_beverage(event, guest_id, choice, reason, actor)` | Admin | `OK`, `REASON_REQUIRED`, `ALREADY_REDEEMED`, `NOT_FOUND`, `INVALID` |
| `beverage_summary(event)` | Bar counter, admin | `OK` with counts per drink, no choice, redeemed, deadline and `final` |

`set_beverage` saves with `update … where beverage_choice is null`, so the first write wins. It returns `ALREADY_CHOSEN` when a different drink was already saved, and `CLOSED` once the deadline has passed. It also refuses when an active redemption exists, by returning `ALREADY_CHOSEN` with the redeemed drink.

**Updated functions**

- `get_pass`: adds `event.beverage_deadline` and a top-level `beverage`, `{ choice, source, token, redeemed, redeemed_at }`. `token` is null until a drink is set. Once redeemed, `choice` and `source` come from the redemption row.
- `set_event_details`: accepts `beverage_deadline`, returns `INVALID_TIMES` when it is not before `doors_at`.
- `reset_rehearsal_data`: deletes `beverage_redemptions` before `check_ins`, and **keeps** choices, because invitations go out before rehearsal.
- `admin_dashboard`: adds the beverage summary.
- `report_rows`: adds `beverages` and `beverage-pending`.
- `verify_pin`, `station_session_valid` and PIN settings: accept the `bar` role.

---

## 6. API and front end

### 6.1 Routes

| Route | Access |
|:--|:--|
| `POST /api/pass/[token]/beverage` `{choice}` | Guest token. Same rate limit as pass lookups. JSON POST with Origin check |
| `POST /api/station/bar/lookup`, `/redeem`; `GET /api/station/bar/count` | `bar` |
| `GET /api/station/guests` | Add `bar` |
| `GET /api/admin/beverages`, `POST /api/admin/beverages/[id]/void` | Admin |
| `POST /api/admin/guests/[id]/beverage` `{choice, reason}` | Admin |
| `POST /api/admin/settings/event` | Add `beverage_deadline` as WITA date and time, combined with `+08:00` |

### 6.2 Files

```
src/lib/qr.ts                          add the 'beverage' kind and the NF:BV: prefix
src/lib/code-input.ts                  accept the new kind
src/lib/session.ts                     add the 'bar' role
src/lib/pass.ts                        extend PassData
src/lib/result-panel.ts                add the 'bar' context
src/lib/reports.ts                     add the two reports
src/lib/i18n/strings.ts, invite-strings.ts   ID and EN keys
src/components/QrTile.tsx              add the 'green' frame
src/components/pass/BeverageChoice.tsx shared buttons, confirm, QR and redeemed states
src/components/pass/PassView.tsx       render the card, hold the state
src/components/invite/Invitation.tsx, Scenes.tsx   new scene, passes the update to PassView
src/components/station/ResultPanel.tsx add the bar READY view and hand-over label
src/components/Hub.tsx, src/app/station/page.tsx   Bar tile and route
src/app/station/bar/page.tsx           modelled on the merchandise station
src/app/api/pass/[token]/beverage/, src/app/api/station/bar/, src/app/api/admin/beverages/
src/components/admin/                  purchase panel, deadline field, drink control in GuestEditor, Beverage list
src/app/admin/(console)/beverages/page.tsx, AdminNav.tsx, StationSettings
supabase/migrations/…_beverage_reservation.sql
supabase/tests/database/…_beverage.test.sql
```

`BeverageChoice` is one component used by the scene and the card, so their behaviour cannot drift. A choice saved in the invitation updates `PassView` data through a callback. The pass poll keeps the card current, including the switch to Soft Drink after the deadline.

---

## 7. Edge cases

| Situation | Behaviour |
|:--|:--|
| Two phones or tabs pick different drinks | First saved wins. The other shows the saved drink |
| Tap after the deadline | Server time decides. `CLOSED`, and the card reloads as Soft Drink |
| Wrong phone clock | The deadline is checked on the server, and the display uses `server_now` |
| No signal when tapping | Retry message. Nothing is saved and no QR appears until the server confirms |
| Two bars scan one QR at once | One `REDEEMED`, one `ALREADY_REDEEMED` |
| Double tap on hand-over | Same bar within 10 seconds counts as one drink |
| QR redeemed before check-in | Refused with `NOT_CHECKED_IN` |
| Walk-in or late addition before the deadline | Chooses on their pass |
| Walk-in or late addition after the deadline | Gets Soft Drink. Admin can change it |
| Deadline never set | Choices stay open. Bar shows `NO_CHOICE` for anyone found by manual search with no drink set |
| Deadline moved later | Automatic Soft Drink guests can choose again unless already redeemed |
| Guest deactivated | Removed from counts. Bar shows `NOT_ELIGIBLE` |
| Guest list re-imported | Tokens and choices stay as they are |
| Event day | The invitation is bypassed, so the pass card handles everything |
| Opened the invitation before this ships | The guest chooses on the pass |
| Rehearsal reset | Bar redemptions are cleared and choices are kept |

---

## 8. Testing

| Level | Cases |
|:--|:--|
| Database (pgTAP) | Every status of every function; effective drink before and after the deadline, and with no deadline; first write wins; redemption requires check-in; one active redemption per guest; void allows a new redemption; reset keeps choices and clears redemptions; `get_pass` hides the token until a drink is set; anon and authenticated cannot execute |
| Concurrency | 50 parallel `set_beverage` calls with mixed drinks give one saved choice. Two bars on one QR give one `REDEEMED` |
| Unit (Vitest) | `parseCode` and `payloadFor` for `NF:BV:`; `panelFor` for every bar status; ID and EN key and placeholder parity; report columns |
| API | Role matrix for bar and admin routes, wrong code types, cross-origin refusal, deadline conversion from WITA, `INVALID_TIMES` |
| End to end (360 px) | Choose in the invitation and see the QR on the pass; skip the invitation and choose on the pass; cancel at the confirm step; reduced motion; deadline passed shows Soft Drink; full bar flow |
| Real devices | Scan the green QR on at least 3 Android phones and 1 iPhone at low brightness. Run the scene from a WhatsApp link on Android Chrome and iPhone Safari |

Invitation chunk stays within 60 KB gzipped.

---

## 9. Rollout

1. Build and test on staging.
2. Apply the migration by CLI to production, and deploy.
3. HR sets the Bar PIN, bar labels and the beverage deadline.
4. Send invitations.
5. HR sends a reminder from the `beverage-pending` report before the deadline.
6. Deadline passes. HR reads the FINAL count and places the order.
7. Rehearse the Bar station with the other stations, then run `reset_rehearsal_data`.

---

## 10. Content (draft, fixed in the strings files)

| Key | ID (default) | EN |
|:--|:--|:--|
| bev.title | PILIH MINUMANMU | CHOOSE YOUR DRINK |
| bev.beer | BEER | BEER |
| bev.soft | SOFT DRINK | SOFT DRINK |
| bev.one | Satu minuman untuk setiap karyawan. | One drink for every employee. |
| bev.deadline | Pilih sebelum {deadline} | Choose by {deadline} |
| bev.confirm | {drink}? Pilihan ini final dan tidak bisa diubah. | {drink}? This choice is final and can't be changed. |
| bev.confirm_yes | KONFIRMASI | CONFIRM |
| bev.confirm_no | BATAL | CANCEL |
| bev.once | 1x | 1x |
| bev.show | Tukar di bar setelah check-in | Redeem at the bar after check-in |
| bev.auto | Otomatis Soft Drink karena belum memilih sampai batas waktu | Automatically Soft Drink, no choice made by the deadline |
| bev.claimed | SUDAH DIAMBIL | ALREADY CLAIMED |
| bev.claimed_at | Diambil pukul {time} | Claimed at {time} |
| bev.handover | SERAHKAN MINUMAN | HAND OVER DRINK |
| bev.recorded | TERCATAT | RECORDED |
| bev.wrong_code | BUKAN QR MINUMAN | NOT A DRINK QR |
| bev.no_choice | BELUM PILIH MINUMAN | NO DRINK CHOSEN |
| hub.bar | Bar | Bar |
| hub.bar_sub | Tukar minuman, 1x per tamu | Redeem drinks, once per guest |

All Indonesian copy goes through the existing wording review.

---

## 11. Open items

| # | Item | Owner | Needed by |
|:--|:--|:--|:--|
| 1 | Set the purchase deadline, based on supplier lead time. Bintang and Coca-Cola are listed as sponsors, so confirm whether they supply the drinks | HR | Before invitations go out |
| 2 | Confirm against HR records that everyone on the guest list is 21+ | HR | Before invitations go out |
| 3 | Decide the buffer for walk-ins, breakage and late additions | HR | At the deadline |
| 4 | Bar staff and device count, for PINs and labels | HR | Before rehearsal |
| 5 | ID wording review of section 10 | HR | With the existing review |

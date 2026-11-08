# NourishFest 2026 — Merchandise T-shirt Size: Design Spec

**Date:** 8 November 2026
**Status:** Approved 8 November 2026. Implementation plan: `docs/plans/Nourishfest-plan-merch-size.md`
**Owner:** HR (Angel)
**Builds on:** PRD §4.6 Merchandise Redemption, Beverage Reservation Design Spec (6 Nov 2026), Invitation Design Spec, Invitation Motion Spec, and the current `ngi-digital-event-system` repository
**Goal:** Know how many T-shirts to order per size, and hand each employee their reserved size at the merchandise booth.
**Deadline:** Live before the WhatsApp invitations are sent.

---

## 1. Summary

Each employee picks a T-shirt size (S, M, L, XL, XXL) once, in the invitation or on their pass. The size appears on the existing Merchandise QR and on the booth screen at redemption. Admin shows a live order count per size, which becomes final at a size deadline set by HR. HR enters stock received per size, and the booth shows stock left in real time.

### 1.1 Decisions

| # | Decision |
|:--|:--|
| 1 | Size data serves both ordering (count per size) and booth stock on event night |
| 2 | The choice is final after the first confirmed tap. Only an admin can change it, with a reason |
| 3 | HR sets a **merchandise size deadline**, separate from the beverage deadline. Anyone without a size at the deadline gets the **default size** set by admin |
| 4 | A size guide is shown, using the vendor's oversized T-shirt chart, entered and editable in admin |
| 5 | No new QR and no new station. The existing pink Merchandise QR and booth show the size |
| 6 | The booth can hand over a different size when needed. The redemption records both reserved and given size |
| 7 | Admin enters stock received per size. The booth shows stock left per size |
| 8 | The size choice appears in the invitation **and** on the pass, because the invitation plays once and can be skipped |
| 9 | The size choice never blocks check-in, the invitation or anything else |
| 10 | Build mirrors the beverage pattern (Approach A). No shared "guest choices" engine |

### 1.2 Out of scope

Order buffer calculation, vendor ordering or invoicing, sizes beyond S–XXL, more than one shirt per person, multiple merchandise items or categories, hard stock enforcement in the database, and changes to the Fonnte Google Sheet automation.

---

## 2. Size chart

Vendor chart: **Oversized T-shirt**, measurements in cm, measured flat.

| Size | Chest | Bottom | Length | Sleeve |
|:--|:--|:--|:--|:--|
| S | 59 | 56 | 68 | 20 |
| M | 61 | 58 | 70 | 21 |
| L | 63 | 60 | 72 | 22 |
| XL | 65 | 62 | 74 | 23 |
| XXL | 67 | 64 | 76 | 24 |

Display rules:

- Chest and Bottom are **flat widths**, not circumference. Labels read "Lebar dada (diukur rata)" / "Chest width (laid flat)" and "Lebar bawah" / "Bottom width".
- Tip under the table: "Bandingkan dengan kaos favoritmu yang diletakkan rata." / "Compare with your favourite T-shirt laid flat."
- Fit note (shown when `merch_fit_note` is on): "Oversized fit — pilih ukuran biasamu." / "Oversized fit — pick your usual size."
- The chart is rendered as a native bilingual table in the app theme, not as the vendor image.
- These values are the migration's seed for `merch_size_chart`. If admin clears the chart, the guide toggle is hidden.

---

## 3. Employee experience

### 3.1 Invitation scene

A new scene sits after the drink scene (PILIH MINUMANMU) and before the Outro. Scene order: Do's & Don'ts → Drink → **Size** → Outro.

Title: **PILIH UKURAN KAOSMU / CHOOSE YOUR T-SHIRT SIZE**

1. The fit note and a **Panduan ukuran / Size guide** toggle sit above five buttons in one row: **S · M · L · XL · XXL**. The toggle opens the chart from section 2 inline.
2. A tap opens an inline confirm step (not a browser dialog) that repeats the key measurements and states that the choice is final, for example: "L — lebar dada 63 cm, panjang 72 cm. Pilihan final, tidak bisa diubah." Buttons: **KONFIRMASI** and **BATAL**.
3. On confirm, the app saves the size and shows it as saved only after the server confirms.
4. The guest continues to the Outro.

The scene never blocks progress. Scrolling past it and Lewati both still work. On replay it shows the saved size, not the buttons. The scene follows the existing invitation motion rules, including reduced motion and the 60 KB budget.

### 3.2 Pass

Before check-in, a **Size card** sits below the Beverage card. After check-in, the size moves onto the existing Merchandise card and the separate Size card is no longer shown. Both use the same `SizeChoice` component as the invitation scene.

| Situation | Shows |
|:--|:--|
| No size, deadline not passed or not set | Fit note, guide toggle, five buttons, "Pilih sebelum {deadline}" when a deadline is set |
| Size set (by guest or admin), before check-in | **UKURAN KAOS: L**, "Final. Tukar di booth merchandise setelah check-in." No QR |
| No size, deadline passed, before check-in | Default size, with "Ditetapkan otomatis" |
| After check-in | Existing pink Merchandise QR, with a large **SIZE L** label above the QR |
| Redeemed | SUDAH DIAMBIL with the time and the size given. If substituted, shows "L → XL" |

### 3.3 Visual rules

- No new QR and no new frame colour. The Merchandise QR stays pink, as in the PRD.
- The Merchandise QR still appears only after check-in, as in PRD §4.6. Choosing a size does not change that.
- Size buttons fit one row at 360 px width with the 16 px gutter. Minimum tap target 44 px.
- The size is shown only to the guest, at the merchandise booth and in admin. It does not appear on check-in, bar or draw screens.

---

## 4. Merchandise booth

The existing merchandise station, route and role. No new PIN or station type.

### 4.1 Flow

1. Staff scan the Merchandise QR. This is a lookup and records nothing except rejected attempts, as today.
2. The panel shows the name and outlet, the reserved size in large type (**SIZE L**), and stock left for that size ("Sisa L: 12").
3. Primary button: **SERAHKAN KAOS L**. One tap records the redemption with `reserved_size = L` and `given_size = L`.
4. Secondary button: **Ganti ukuran** opens a size picker showing stock left per size. Staff pick the size actually handed over and confirm. The redemption records `reserved_size = L` and `given_size = XL`.

Manual search by name or employee ID works as today and shows the same panel.

### 4.2 Stock strip

A strip pinned to the top of the booth screen shows stock left per size, for example `S 5 · M 12 · L 0 · XL 8 · XXL 3`. Left = received − active redemptions with that `given_size`. A size at 0 is shown in red. If no stock has been entered in admin, the strip shows claimed per size instead.

The strip refreshes after each redemption and on the station's existing poll.

### 4.3 Statuses

| Status | Panel | Staff action |
|:--|:--|:--|
| `READY` | Size in large type, stock left | Hand over, tap SERAHKAN |
| `READY`, reserved size at 0 stock | **STOK L HABIS** in red, picker opens automatically | Pick the nearest available size and hand it over |
| `READY`, no size (no deadline set and guest never chose) | **BELUM PILIH UKURAN**, picker opens automatically | Ask the guest, pick, hand over |
| `REDEEMED` | Recorded, with size given | Next |
| `ALREADY_REDEEMED` | SUDAH DIAMBIL, with time, booth and size given | No shirt |
| `NOT_CHECKED_IN` | Unchanged from today | Send to the gate |
| `WRONG_CODE_TYPE` | Unchanged from today | Ask for the right QR |
| `INVALID` / `NOT_ELIGIBLE` | Unchanged from today | Send to the admin desk |
| `RETRYABLE_ERROR` | Unchanged from today | Retry |

### 4.4 Rules

- A size at 0 stock stays tappable in the picker, behind a confirm: "Stok tercatat 0, lanjut?" The physical box count on the night beats the system count. A wrong number never blocks a handover.
- Redeem always requires `given_size`. The SERAHKAN button sends the reserved size; the picker sends the picked size.
- One shirt per guest is still enforced by the existing partial unique index on active redemptions.

---

## 5. Admin

### 5.1 Event details

Two new fields in the Event details panel:

| Field | Rules |
|:--|:--|
| `Merchandise size deadline` | Date and time in WITA, combined with `+08:00`. Must be before `doors_at`. Independent of the beverage deadline |
| `Default size` | S, M, L, XL or XXL. Required whenever a deadline is set. The deadline cannot be saved without it |

Blank deadline means choices stay open and nothing is auto-assigned. Moving the deadline later reopens the choice for anyone who has no stored size and has not redeemed. A guest who already redeemed an auto-assigned size keeps that record.

### 5.2 Size chart

A 5 × 4 grid (Chest, Bottom, Length, Sleeve, in cm) pre-filled with section 2, plus an **Oversized fit note** toggle. Values must be positive whole numbers. Clearing all values hides the guide on the guest side.

### 5.3 Order count

The dashboard shows, for active guests:

| | S | M | L | XL | XXL | No size yet | Total |
|:--|:--|:--|:--|:--|:--|:--|:--|
| Reserved | count | count | count | count | count | count | count |

After the deadline, No size yet is 0, those guests are counted in the default size, and the panel is labelled **FINAL**. Walk-ins and late additions after the deadline still raise the live count; HR's own buffer needs to cover them.

### 5.4 Stock

A Stock panel on the Merchandise admin page. HR enters received quantity per size and can edit it (for example after a second delivery). The edit is audited.

| | S | M | L | XL | XXL |
|:--|:--|:--|:--|:--|:--|
| Received | entered | | | | |
| Given | active redemptions by `given_size` | | | | |
| Left | Received − Given | | | | |
| Still to claim | effective sizes of active guests not yet redeemed | | | | |

A size is highlighted amber where Still to claim > Left. This is the early warning before event night.

### 5.5 Corrections

- **Wrong size picked:** admin can set or change a guest's size in the guest editor with a required reason (minimum 5 characters, as for voids). The change is audited and `merch_size_source` becomes `admin`. It is blocked with `ALREADY_REDEEMED` while an active redemption exists.
- **Booth mistake:** void on the existing Merchandise admin page, reason required. Voiding makes the QR work again and returns the given size to stock.

### 5.6 Reports

| Report | Contents |
|:--|:--|
| `merch-sizes` | Employee ID, name, outlet, department, reserved size, source (guest, admin, auto), chosen at, given size, substituted (Y/N), redeemed at, booth, staff, status, void reason |
| `merch-size-pending` | Guests with no size set: employee ID, name, outlet, department, phone. HR uses this for a reminder through the Fonnte sheet before the deadline |

The pre-deadline reminder is HR's manual step and is not part of this build.

---

## 6. Data

### 6.1 Migration `…_merch_size.sql`

Use the next free number after the beverage reservation migration at build time.

```sql
alter table public.guests
  add column merch_size text check (merch_size in ('S','M','L','XL','XXL')),
  add column merch_size_chosen_at timestamptz,
  add column merch_size_source text check (merch_size_source in ('guest','admin'));

alter table public.events
  add column merch_size_deadline timestamptz,
  add column merch_default_size text check (merch_default_size in ('S','M','L','XL','XXL')),
  add column merch_size_chart jsonb not null default '{
    "S":   {"chest":59,"bottom":56,"length":68,"sleeve":20},
    "M":   {"chest":61,"bottom":58,"length":70,"sleeve":21},
    "L":   {"chest":63,"bottom":60,"length":72,"sleeve":22},
    "XL":  {"chest":65,"bottom":62,"length":74,"sleeve":23},
    "XXL": {"chest":67,"bottom":64,"length":76,"sleeve":24}
  }'::jsonb,
  add column merch_fit_note boolean not null default true,
  add constraint merch_deadline_needs_default
    check (merch_size_deadline is null or merch_default_size is not null);

create table public.merch_stock (
  event_id uuid not null references public.events (id),
  size text not null check (size in ('S','M','L','XL','XXL')),
  received integer not null default 0 check (received >= 0),
  updated_at timestamptz not null default now(),
  primary key (event_id, size)
);

alter table public.merchandise_redemptions
  add column reserved_size text check (reserved_size in ('S','M','L','XL','XXL')),
  add column reserved_source text check (reserved_source in ('guest','admin','auto')),
  add column given_size text check (given_size in ('S','M','L','XL','XXL'));
```

`given_size` stays nullable for any redemptions recorded before this migration (rehearsal data). The redeem RPC requires it for every new redemption.

The migration ends with `select public.lock_down_public();`. The import upsert lists its columns, so re-imports leave size choices untouched.

### 6.2 Functions

- `effective_merch_size(guest)` returns `merch_size` if set; otherwise the event's `merch_default_size` if `now() >= merch_size_deadline`; otherwise null. Its source is `guest`, `admin` or `auto`. Auto-assign is computed on read, so there is no scheduled job. If admin changes the default after the deadline, unredeemed auto guests follow the new default.
- `set_merch_size(token, size)` updates `where merch_size is null and (merch_size_deadline is null or now() < merch_size_deadline)`. Returns `SAVED`, `ALREADY_SET` (with the stored size) or `CLOSED`. First save wins at the database level.
- Merchandise redeem: takes `given_size`, stores `reserved_size` and `reserved_source` from `effective_merch_size` at that moment.
- `merch_stock_summary(event)` returns Received, Given, Left and Still to claim per size.
- `reset_rehearsal_data`: still deletes merchandise redemptions as today, and **keeps** size choices and stock, because invitations go out before rehearsal.
- `admin_dashboard`: adds the size order count.
- `report_rows`: adds `merch-sizes` and `merch-size-pending`.

The implementation plan records small deviations from this section (status names, function names, three migrations); see its "Deviations from the spec" table.

---

## 7. API and front end

### 7.1 Routes

| Route | Access |
|:--|:--|
| `POST /api/pass/[token]/merch-size` `{size}` | Guest token. Same rate limit as pass lookups. JSON POST with Origin check |
| Merchandise station `lookup` | Existing role. Response adds effective size, source and stock left |
| Merchandise station `redeem` | Existing role. Body adds required `given_size` |
| `GET /api/station/merchandise/stock` | Existing merchandise role |
| `POST /api/admin/guests/[id]/merch-size` `{size, reason}` | Admin |
| `POST /api/admin/merch-stock` `{size: received, …}` | Admin |
| `POST /api/admin/settings/event` | Adds `merch_size_deadline` (WITA date and time, combined with `+08:00`), `merch_default_size`, `merch_size_chart`, `merch_fit_note` |

### 7.2 Files

```
src/lib/pass.ts                              extend PassData with size, source, deadline, chart
src/lib/result-panel.ts                      merchandise context: size, stock, substitution
src/lib/reports.ts                           add the two reports
src/lib/i18n/strings.ts, invite-strings.ts   ID and EN keys
src/components/pass/SizeChoice.tsx           shared buttons, confirm, saved and auto states
src/components/pass/SizeGuide.tsx            bilingual chart table and fit note
src/components/pass/PassView.tsx             render the Size card before check-in, size label on Merchandise card after
src/components/invite/Invitation.tsx, Scenes.tsx   new scene, passes the update to PassView
src/components/station/SizePicker.tsx        size buttons with stock left, zero-stock confirm
src/components/station/StockStrip.tsx        stock left per size
src/components/station/ResultPanel.tsx       merchandise READY view with size and SERAHKAN KAOS label
existing merchandise station page and API routes   lookup/redeem changes, stock route
src/app/api/pass/[token]/merch-size/
src/app/api/admin/merch-stock/, src/app/api/admin/guests/[id]/merch-size/
src/components/admin/                        deadline and default fields, size chart grid, order count panel, stock panel, size control in GuestEditor
supabase/migrations/…_merch_size.sql
supabase/tests/database/…_merch_size.test.sql
```

`SizeChoice` is one component used by the scene and the card, so their behaviour cannot drift. A size saved in the invitation updates `PassView` data through a callback. The pass poll keeps the card current, including the switch to the default size after the deadline.

---

## 8. Edge cases

| Situation | Behaviour |
|:--|:--|
| Two phones or tabs pick different sizes | First saved wins. The other shows the saved size |
| Tap after the deadline | Server time decides. `CLOSED`, and the card reloads with the default size |
| Wrong phone clock | The deadline is checked on the server, and the display uses `server_now` |
| No signal when tapping | Retry message. Nothing shows as saved until the server confirms |
| Admin changes a size after the guest chose | Allowed with reason until redeemed. Pass shows the new size on next poll |
| Admin changes the default size after the deadline | Unredeemed auto guests follow the new default. Redeemed records keep what was given |
| Reserved size out of stock at the booth | Picker opens; staff hand over another size, recorded as a substitution |
| System stock shows 0 but a shirt is in the box | Staff confirm "Stok tercatat 0, lanjut?" and hand it over. Left shows negative until HR corrects Received |
| No deadline set and guest never chose | Booth shows BELUM PILIH UKURAN; staff ask and pick. `reserved_size` is null, `given_size` is recorded |
| Guest deactivated after choosing | Excluded from counts and Still to claim, as for other active-guest counts |
| Redemption voided | QR works again; given size returns to stock |

---

## 9. Testing

**Database (pgTAP)**
- First save wins; second save returns `ALREADY_SET`.
- Save after the deadline returns `CLOSED`.
- `effective_merch_size` returns null before the deadline, the default after it, and the stored size whenever set.
- Deadline cannot be saved without a default size.
- Redeem without `given_size` is rejected.
- Stock math: Left = Received − active `given_size`; a void restores it.
- Admin size change is blocked while an active redemption exists.
- `reset_rehearsal_data` keeps size choices and stock.

**Front end**
- `SizeChoice` renders each state in section 3.2, in ID and EN.
- Confirm step shows the measurements from the admin chart.
- Booth panel opens the picker automatically for zero stock and for no size.

**Manual run (rehearsal)**
- Pick a size in the invitation; confirm it shows on the pass and, after check-in, on the Merchandise QR.
- Redeem with and without a substitution; check the stock strip and the `merch-sizes` report.
- Set a deadline in the past for a test guest with no size; confirm the default appears on the pass and in the FINAL count.

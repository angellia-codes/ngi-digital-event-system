# Rehearsal 1 — staff on real devices (1–3 December)

> The screens show **English** by default (tap ID for Indonesian). This guide uses the Indonesian button names. English: KONFIRMASI = CONFIRM, TIDAK HADIR = NOT HERE, UNDI SEKARANG = DRAW NOW, TAMPILKAN HADIAH = SHOW PRIZE, LAYAR KOSONG = BLANK SCREEN, UNDIAN BERIKUTNYA = NEXT DRAW, TERCATAT = RECORDED, KONFIRMASI SEMUA = CONFIRM ALL, CARI = LOOK UP.

Goal: every person who will work on 10 December has used their own screen on a real phone, and every scenario below has been run once. Production, still in **rehearsal mode**, with test data.

## Before (by 27 November)

- [ ] `npm run test:unit`, `npm run lint` and `npm run build` pass on the commit that is deployed (record the commit): ____________
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

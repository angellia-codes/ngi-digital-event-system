# Rehearsal 2 — at the venue (about 7 December)

> The screens show **English** by default (tap ID for Indonesian). This guide uses the Indonesian button names. English: KONFIRMASI = CONFIRM, TIDAK HADIR = NOT HERE, UNDI SEKARANG = DRAW NOW, TAMPILKAN HADIAH = SHOW PRIZE, LAYAR KOSONG = BLANK SCREEN, UNDIAN BERIKUTNYA = NEXT DRAW, TERCATAT = RECORDED, KONFIRMASI SEMUA = CONFIRM ALL, CARI = LOOK UP.

Goal: the real projector, the real Wi-Fi and the real room, with a full draw. Production, still in **rehearsal mode**.

## Arrive two hours early with

Projector laptop and its cable, the phone hotspot SIM, staff phones, the spare display device, chargers and extension cords, the printed `failure-playbook.md` (2 copies), the display link and PINs from the password manager.

## 1. Network (30 minutes)

- [ ] The projector laptop runs on its **own** connection (hotspot or cable), not guest Wi-Fi. Note which: ____________
- [ ] Walk to each place where a desk or booth will stand (check-in 1 and 2, merchandise, prize desk, MC position). On a staff phone, open `/station`, log in, and load one result. Note any spot with no signal: ____________
- [ ] If Wi-Fi is the only option for staff, test at full load: 10 phones on the SSID at once.

## 2. Projector (30 minutes)

Follow `stage-setup.md` steps 1 to 7 on the real projector.

- [ ] Number and name readable from the back row of the seating.
- [ ] Gold, pink and green are distinguishable. If not, tick **Projector-safe look** and look again. Decision: normal / projector-safe.
- [ ] Sound audible in the room at a normal volume. Decision: sound on / off.
- [ ] 16:9 fills the screen; nothing is cut off; no scrollbars; cursor hidden after 3 seconds.
- [ ] The MC's dot turns green and stays green for 10 minutes.

## 3. Scanning in the room's light (15 minutes)

- [ ] Three guest phones (at least one iPhone, one low-end Android) scan in under 2 seconds at the real check-in position, in the room's lighting.

## 4. Full draw (60 minutes)

1. Enter the **real** prize list in Admin, Prizes, in the real order. (Or use placeholders and replace them later.)
2. Create a full pool without 150 people queuing: `node --env-file=.env.local scripts/rehearsal/simulate-arrivals.mjs 150 --per-minute 600`.
3. The MC runs the whole prize list from the stage position, reading the real script, including: one no-show, one batch, one confirm from the prize desk, and one admin void.
4. HR stands at the back of the room and checks the projector for the whole run.

- [ ] Every prize can be drawn to the end. Total time of the draw: ______ minutes (plan the programme around it).
- [ ] The MC knows the 60-second rule and the TIDAK HADIR flow without looking.
- [ ] The prize desk knows what to do when a name is called.
- [ ] Everyone has read the failure playbook row for their own role.

## 5. After

- [ ] Remove placeholder prizes if used. Admin, Settings: **Reset rehearsal data** (type RESET). Dashboard shows zeros.
- [ ] Confirm the PINs still work (they are rotated the day before the event, not now).
- [ ] Record the decisions: look ____________, sound ____________, projector connection ____________, MC position ____________.
- [ ] Write the problem list (owner, due date) and send it to the technical contact. After 8 December only critical fixes go out, each tested on staging first.

Signed off by: ____________  Date: ____________

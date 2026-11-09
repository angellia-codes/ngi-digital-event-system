# MC cue card — setup and rehearsal

> The screens show **English** by default (tap ID for Indonesian). Indonesian button names: MULAI ACARA = START SHOW, YA, LANJUT = YES, CONTINUE, HANYA YANG HADIR = PRESENT ONLY.

The MC runs the whole show from `/station/mc` on one phone: **Rundown · VIP · Pax · Draw**. The co-MC and the show director can log in with the same **MC PIN** on their own phones and see the same screen. Whoever taps NEXT first moves the show on; a second tap from another phone changes nothing.

## Before rehearsal 1 (admin, about 1 hour)

- [ ] **Settings → Station PINs:** set the **MC cue card** PIN. Write it in the password manager. It is different from the draw operator PIN.
- [ ] **Rundown:** enter every segment in show order: start time (WITA), title, minutes, PIC, MC script. Mark the door-prize segments and tick their prizes. A prize can sit in only one segment.
- [ ] **Prizes:** add an MC line to any prize with a sponsor mention.
- [ ] **Guests:** tag every BOD and HOD (Edit → MC VIP list): title (Bapak / Ibu), protocol order (1 is read first), and how to say the name if it is easy to get wrong.
- [ ] **Rundown → Print cue card:** print two copies (MC + show director). Re-print after any change.

## At each rehearsal (30 minutes, two MC phones + admin laptop)

- [ ] Both phones log in with the MC PIN and show **NOT STARTED**.
- [ ] Phone A taps **START SHOW**; phone B follows within 2 seconds.
- [ ] Both phones tap **NEXT** at the same moment: the show moves on **one** segment, and one phone shows "Already moved on from another device".
- [ ] The header clock turns pink when a segment runs over; the drift line turns pink when a segment starts late.
- [ ] Entering a door-prize segment opens the **Draw** tab on both phones, with only that segment's prizes and their MC lines.
- [ ] Draw at least one prize end to end (DRAW → KONFIRMASI) from the Draw tab; the prize shows **DONE** with the winner's name.
- [ ] Tap NEXT with prizes still undrawn: the "prizes not drawn yet — continue?" warning appears; **CANCEL** keeps you in the segment.
- [ ] **VIP:** checked-in BOD/HOD show **ARRIVED**; untick "Present only" to see who is still missing. Read every name aloud once using the pronunciation notes.
- [ ] **Pax:** the total matches the admin dashboard; tap an outlet to see its departments.
- [ ] Put phone B in airplane mode for one segment: the gold **OFFLINE** banner shows and the clock keeps running. Turn it back on: it catches up within 2 seconds.
- [ ] Admin: **Rundown → Make current** on the previous segment with a reason (practice for a mistaken NEXT). Both phones follow.
- [ ] Download **Reports → Rundown** and check planned vs actual times.
- [ ] Reset rehearsal data (Settings): the rundown, VIP tags and scripts stay; the show is back to **NOT STARTED**.

## On the night

- The MC phone stays on charge between segments. The printed cue card is in the MC's pocket.
- Mistaken NEXT: tell the admin desk. The admin uses **Rundown → Make current** with a reason. The MC does nothing.
- Network down: read from the printed cue card. The draw falls back to the paper procedure in `failure-playbook.md`.
- After the show: download **Reports → Rundown** with the other reports.

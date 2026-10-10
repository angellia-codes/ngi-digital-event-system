# Failure playbook (print two copies: HR and the technical contact)

> The screens show **English** by default (tap ID for Indonesian). This guide uses the Indonesian button names. English: KONFIRMASI = CONFIRM, TIDAK HADIR = NOT HERE, UNDI SEKARANG = DRAW NOW, TAMPILKAN HADIAH = SHOW PRIZE, LAYAR KOSONG = BLANK SCREEN, UNDIAN BERIKUTNYA = NEXT DRAW, TERCATAT = RECORDED, KONFIRMASI SEMUA = CONFIRM ALL, CARI = LOOK UP.

Decide in 30 seconds, fix properly afterwards. Every action below is safe to repeat.

| # | What you see | First 30 seconds | Then |
| :---- | :---- | :---- | :---- |
| 1 | **App will not load / "KONEKSI BERMASALAH"** on every device (Supabase or Vercel down) | Switch to the **paper guest list**. Write each arrival's name and the time. Tell the MC the draw is on hold | Technical contact checks Vercel and Supabase status pages. When back, an admin checks the people in using Cari Manual, in the order of the paper times, and keeps the paper. See open decision A below for the draw |
| 2 | **Camera will not scan** a guest's QR | Use **CARI MANUAL** on the check-in screen: type the name or employee ID | If many phones fail, raise the guest's screen brightness; if the desk camera is the problem, swap to the second staff phone |
| 3 | **Projector shows nothing or freezes** | MC keeps going from the **phone**: it shows number, name and outlet. MC reads them aloud | Press F5 on the projector laptop. Still nothing: open the link on the spare device. The draw is unaffected |
| 4 | **Projector shows the number but the name never appears** | Check the MC phone: did KONFIRMASI register ("TERCATAT")? If yes, press F5 on the projector | If the phone does not show TERCATAT, tap KONFIRMASI again (a repeat is harmless) |
| 5 | **MC phone loses connection or dies** | Second staff member logs into `/station` with the draw PIN on another phone. The current draw appears within 2 seconds | Or use the **Prize Verification** phone: it shows the same draw with KONFIRMASI & SERAHKAN and TIDAK HADIR |
| 6 | **Winner is not present** (60 seconds passed) | MC taps **TIDAK HADIR**. The stage says "TIDAK HADIR — UNDI ULANG". Tap UNDI SEKARANG again | The absent person stays eligible for other prizes |
| 7 | **A winner was confirmed by mistake** (wrong person came up, or a tap was too early) | Tell HR. Admin console, **Draws**, **Void** on that draw, with a reason of 5 or more characters. The stage returns to idle | MC draws again for the freed slot. The reason is kept in the audit log |
| 8 | **Merchandise was handed over by mistake** | Admin console, **Merchandise**, **Void** with a reason | The person can collect again |
| 9 | **A device is locked out / forgot the PIN** | Admin console, Settings, Station PINs: set a new PIN for that role (or turn it off and on). Every device on that role is signed out | Give the new PIN to the desk lead in person, not in a group chat |
| 10 | **Guest has no phone or lost the link** | Cari Manual at the check-in desk. The check-in screen shows their number; write it on paper or on their hand | Admin, Reports, **Invitation links** lists every personal pass link, to re-send later |
| 11 | **Guest is not on the list** | Admin console, Guests, **Add walk-in**. Then check in as normal | Walk-ins have a "Walk-in" column in the Guests report |
| 12 | **Two people claim the same Door Prize number** | Prize Verification, type the number, **CARI**: the card shows who the number belongs to. Ask for the name | Each person has exactly one number; the system never issues a number twice |
| 13 | **The draw says "Belum ada tamu yang memenuhi syarat"** | Everyone checked in has already won, or nobody has checked in. Check the dashboard "Still eligible to win" count | Do not reset anything. HR decides: wait for more arrivals, or skip the prize |
| 14 | **The stage shows a name before KONFIRMASI** | This must never happen. Press the **LAYAR KOSONG** button, photograph the screen, tell the technical contact | Do not continue the draw until the cause is found. Keep the photo and the time |
| 15 | **Any screen shows something odd** | Do not guess. Take a photo of the screen with the clock visible and tell the technical contact | The audit log has the sequence of actions |

## Open decision A (HR to decide before Rehearsal 2)

If the app is down at the time the draw is scheduled, do we (a) postpone the draw until it is back, or (b) draw on paper from the numbers already issued? There is no paper draw procedure in this plan. Choose one and write it here: ______________________

## Who to call

| Role | Name | Phone |
| :---- | :---- | :---- |
| HR lead | | |
| Technical contact (open decision 13) | | |
| Venue AV | | |

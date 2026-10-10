# Stage display setup (projector laptop)

> The screens show **English** by default (tap ID for Indonesian). This guide uses the Indonesian button names. English: KONFIRMASI = CONFIRM, TIDAK HADIR = NOT HERE, UNDI SEKARANG = DRAW NOW, TAMPILKAN HADIAH = SHOW PRIZE, LAYAR KOSONG = BLANK SCREEN, UNDIAN BERIKUTNYA = NEXT DRAW, TERCATAT = RECORDED, KONFIRMASI SEMUA = CONFIRM ALL, CARI = LOOK UP.

Used at Rehearsal 2 (at the venue) and on 10 December. About 15 minutes.

## What you need

- A laptop with Chrome or Edge and a cable to the projector.
- **Its own internet connection**, separate from guest Wi-Fi: a phone hotspot or a cable. A crowded venue Wi-Fi is the most likely thing to slow the stage down.
- Power, and the laptop's sleep and screensaver turned off (the page also asks the screen to stay awake, but do both).
- A second device (tablet or laptop) charged and ready as a spare display. Two displays can be open at once; both are read-only.

## Steps

1. **Get the link.** Admin, Settings, Stage display, **Create display key**. The link is shown once. Copy it and keep it in the HR password manager. Making a new key signs out every open display.
2. **Open the link on the projector laptop.** The address bar changes to `…/stage` (the key disappears). The board shows the wordmark and "UNDIAN DIMULAI SEBENTAR LAGI". The cookie lasts 36 hours; opening the link again is always safe.
3. **Full screen.** Press **F** (or move the mouse and click "Layar penuh"). Set the laptop display to 1920 × 1080 or 1280 × 720, mirrored to the projector. The picture scales to any 16:9 screen; it is never cropped.
4. **Sound.** Press **S** (or click "Aktifkan suara") once; you hear a short beep. Browsers refuse audio until someone clicks, so this must be done on the day. Sound is off in the projector-safe look.
5. **Look.** If the projector is dim or washes out colours, tick **Projector-safe look** in Admin, Settings, Stage display (flat black, white names, no glows, no sound). Decide at Rehearsal 2, on the real projector, and leave it.
6. **Connection check.** On the MC phone, open the draw screen. The dot at the top turns green ("LAYAR PANGGUNG TERHUBUNG") within about 15 seconds. Pink means no heartbeat for 15 seconds or more.
7. **Test a draw** (rehearsal mode only, never after Go live): MC taps TAMPILKAN HADIAH, then UNDI SEKARANG, then KONFIRMASI. Check that the number is readable from the back row, the name appears only after KONFIRMASI, and nothing says "selamat" or "congratulations".

## Messages on a black page

| Message | Meaning | Do this |
| :---- | :---- | :---- |
| Buka link layar panggung dari Admin → Settings. | No valid cookie | Open the display link from the password manager |
| Kunci layar tidak valid. | Wrong or old key | Open the current link; if lost, make a new key |
| Terlalu banyak percobaan. Tunggu beberapa menit. | 20 wrong keys from this network | Wait 5 minutes, then use the right link |
| Kunci layar belum dibuat. | No key yet | Admin, Settings, Create display key |
| Koneksi bermasalah. Muat ulang halaman. | Database did not answer | Reload (F5) |
| Kunci layar sudah diganti. (over the board) | Someone made a new key | Open the new link |

## Good to know

- Reloading the page is harmless: it rebuilds the screen from the database. A winner already confirmed stays on screen.
- If the stage lags, the MC phone is unaffected. The MC can read the number and name from the phone.
- If Realtime is blocked on the network, the page polls every 3 seconds on its own; the delay is a few seconds, not a failure.

# Stage display setup (projector laptop)

> The screens show **English** by default (tap ID for Indonesian). This guide uses the Indonesian button names. English: KONFIRMASI = CONFIRM, TIDAK HADIR = NOT HERE, UNDI SEKARANG = DRAW NOW, TAMPILKAN HADIAH = SHOW PRIZE, LAYAR KOSONG = BLANK SCREEN, UNDIAN BERIKUTNYA = NEXT DRAW, TERCATAT = RECORDED, KONFIRMASI SEMUA = CONFIRM ALL, CARI = LOOK UP.

Used at Rehearsal 2 (at the venue) and on 8 December. About 15 minutes.

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

## Stage videos (background loops and the opening film)

Four silent loops (Welcome, Synthwave Sunset, Retro TV, Neon City) and the 16:9 **NourishFest Opening** film can play on the stage display. They are controlled from **Admin → Stage videos** only.

**Once, before Rehearsal 1:** upload the five MP4s in the Supabase dashboard → Storage → bucket `stage-videos`, with exactly these names:

| Video | File name |
| :---- | :---- |
| Welcome | `nf26-welcome.mp4` |
| Synthwave Sunset | `nf26-synthwave-sunset.mp4` |
| Retro TV | `nf26-retro-tv.mp4` |
| Neon City | `nf26-neoncity.mp4` |
| NourishFest Opening | `NourishFest_Opening.mp4` (rename `NourishFest2026_Opening_Backup_16x9_v4.mp4` from Drive) |

Each file must be under 100 MB. If the dashboard refuses the opening film as too large, raise the upload limit in Supabase → Project Settings → Storage first. To replace a file, upload under the same name, then on the projector laptop click the **Videos 5/5 ready** button (bottom-left; move the mouse) to download them again.

**On the day:**

1. Open the stage link at least 10 minutes early on the event connection (hotspot or cable). The laptop downloads all five videos in the background. Move the mouse: the button bottom-left must say **Videos 5/5 ready** before doors open. After that the videos play from the laptop itself, even if the internet drops.
2. Admin → Stage videos → **▶ Play** on a loop. It appears within a second or two and repeats until you stop it. Tap another loop's Play to switch straight to it.
3. **■ Stop video** returns the screen to the draw board.
4. **NourishFest Opening** plays **once, with sound**, then the draw board shows by itself. Sound needs **S** pressed on the stage laptop beforehand (you hear a beep); without it the film plays silent. Connect the laptop's audio to the venue sound desk and test the level at Rehearsal 2. If the stage page is reloaded during the film, it picks up where the film is instead of starting again.
5. When the MC taps SHOW PRIZE, the draw takes the screen automatically. Play is refused while a number is waiting for the MC's confirmation.

A video always fills as much of the screen as it can without cropping. Loops made for the LED wall (1520 × 640) fill the wall edge to edge and show with black bars above and below on a 16:9 projector; the 16:9 opening film fills the projector and shows with black bars at the sides on the LED wall.

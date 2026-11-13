# Videotron screen switcher — setup and rehearsal

> The screens show **English** by default (tap ID for Indonesian). Indonesian button names: TAYANGKAN = GO LIVE, BERIKUTNYA = UP NEXT, PUTAR ULANG = REPLAY, LAYAR HITAM = BLACKOUT, YA = YES, BATAL = CANCEL.

One operator at the FOH desk runs the videotron from `/station/screen` on a phone or tablet, with the **Screen PIN**. The stage laptop wired to the LED wall shows `/stage` full screen. When the MC picks a door prize, the draw board takes over the videotron by itself.

## Once, before the first upload (admin, 15 minutes)

- [ ] **Supabase → Storage → Settings:** set the **Global file size limit** to at least **300 MB** (the Pro plan allows it; the default is 50 MB and uploads over it fail).
- [ ] **LED vendor:** confirm the **pixel resolution** and that the input is **HDMI from our laptop**. If it is not 1920 × 1080 (16:9), stop and tell the video team before anything is rendered.
- [ ] **Settings → Station PINs:** set the **Screen control (videotron)** PIN. Write it in the password manager.

## Loading the videos (admin, whenever a file is ready)

- [ ] **Admin → Screens:** upload each MP4 on its row (16:9, H.264, fast start, up to 300 MB). The page refuses anything else and says why.
- [ ] Preview each file on the page once.
- [ ] One-off videos: set **At the end** (hold the last frame, or go to another screen). The Door Prize intro always holds.
- [ ] **Closing card:** check both lines in ID and EN.
- [ ] **Admin → Rundown → Screen:** set the suggested screen for each segment that has one (it shows as **UP NEXT** on the panel while that segment runs).
- [ ] **USB fallback:** after the last upload, download every file from **Admin → Screens → USB fallback** onto a USB stick for the LED vendor.

## Stage laptop (every rehearsal and on the night, at least 1 hour before gates)

- [ ] Chrome only. Plug in power. Turn off sleep, screen saver and OS updates.
- [ ] Open the stage link from **Settings → Stage display** on a good connection. Move the mouse: the corner shows **Videos 9/9** when every file is on the laptop. Pink means a download failed — reload the page.
- [ ] Click **Turn on sound** once (or press **S**), then **F** for full screen. Without that click the one-off videos play muted.
- [ ] Laptop audio out → sound mixer. Check the level with the Welcome video.

## At each rehearsal (45 minutes: stage laptop + LED, sound desk, one screen phone, one MC phone, admin laptop)

- [ ] Screen phone logs in with the Screen PIN. Header shows **Stage laptop connected** and **Videos ready 9/9**.
- [ ] Tap **Ambient — Dinner**, then **GO LIVE**: the LED cuts with no black frame.
- [ ] Put **Welcome** live: the sound comes through the mixer; the progress bar runs on the phone; at the end it does what **At the end** says.
- [ ] Tap Welcome again: **Replay?** appears.
- [ ] Unplug the laptop's network. Switch nothing for 2 minutes: the video keeps playing. Plug it back in: the next switch arrives within a few seconds.
- [ ] Reload the stage laptop in the middle of a one-off video: it comes back at the right second.
- [ ] MC phone picks a prize during a video: the draw board takes over at once and the screen phone shows **Door Prize draw · AUTO**. Draw and confirm one prize.
- [ ] While a number is unconfirmed, switch away on the screen phone: **Draw not finished — switch screen?** appears.
- [ ] Two screen phones tap GO LIVE at the same moment: one switches, the other shows **Screen already changed**.
- [ ] **Blackout** is one tap. **Closing** shows the closing card.
- [ ] Play every file from the USB stick on the LED vendor's player once.
- [ ] Download **Reports → Screens** and check the switches are all there.
- [ ] Reset rehearsal data (Settings): videos, end actions and suggested screens stay; the videotron goes back to **Ambient — Arrival**.

## On the night

- The screen phone stays on charge. The operator follows the rundown and the **UP NEXT** card; the MC finishes speaking, then the operator taps **GO LIVE**.
- Sound desk: fade the DJ down before a 🔊 screen goes live.
- Stage laptop shows the wrong thing or freezes: reload it (it resumes). Still wrong: the LED vendor plays the file from the USB stick and the draw runs on the paper procedure in `failure-playbook.md`.
- After the show: download **Reports → Screens** with the other reports.

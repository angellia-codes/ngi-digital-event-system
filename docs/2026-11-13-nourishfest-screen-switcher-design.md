# NourishFest 2026 — Videotron Screen Switcher (Design)

**Date:** 2026-11-13
**Status:** Approved in brainstorming, pending spec review
**Owner:** HR (Angel)
**Depends on:** existing NourishFest digital event system (Next.js + Supabase): `/stage` display and `stage_state`, draw functions, station PIN login, rundown module (`/station/mc`, `rundown_segments`)
**Deadline:** must pass the full rehearsal on the real laptop + LED wall before the 6 December code freeze
**Related:** Videotron Video Pack (separate spec, follows this one; must meet the contract in §9)

---

## 1. Goal

Let one operator control what the videotron shows from guest arrival to closing: ambient loops, one-off motion videos, the Candid Cam how-to loop, the live door prize draw and a closing card. Video playback must keep working when the beach venue's internet drops.

### Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Scope | Two projects: (A) this switcher, (B) the video pack. A first, because it fixes the video format and has the code freeze |
| Control model | **Cued manual.** A dedicated operator puts screens live. Each rundown segment carries a *suggested* screen shown as "Up next"; the MC's NEXT never switches the videotron |
| Videotron shape | Design for **16:9, 1920×1080**; size kept in config. LED vendor to confirm pixel resolution and HDMI input from our laptop before any video renders |
| Screens | Fixed set of 12, defined in code (§2) |
| Video storage | Uploaded in admin to Supabase Storage; pre-loaded into the stage laptop's browser cache; played locally. USB stick with all MP4s handed to the LED vendor as fallback |
| Operator | New `screen` role PIN, panel at `/station/screen`. Admins can use it too. Uploads and screen settings are admin-only |
| Draw interaction | **Draw takes over automatically**: the MC selecting a prize puts the draw board on the videotron, whatever was showing. It stays until the operator switches away |
| Candid Cam | Fully rendered looping video with `https://ngi-nf26-candid-cam.netlify.app/` baked in as QR + short URL (part of the video pack) |
| Sound | Ambient and Candid Cam loops are **silent** (music from DJ / sound operator). One-off videos carry their own audio from the stage laptop into the mixer |
| Ambient loops | Three: Arrival, Dinner, After-party |
| Architecture | **Extend the existing `stage_state` row** with a `screen` field; `/stage` becomes a screen router. Same URL, display key, Realtime channel and polling fallback as today |

### Out of scope

- Auto-switching on the MC's NEXT
- Several displays showing different screens
- Scheduling screens by clock time
- Editing or trimming videos in the app
- Producing the videos (Video Pack spec)

---

## 2. Screens

Keys are fixed in code (`src/lib/screens.ts`). Admin fills in content only.

| Key | Label (ID / EN) | Kind | Audio | Ends |
|---|---|---|---|---|
| `ambient_arrival` | Ambient — Kedatangan / Arrival | `loop` | No | Never |
| `ambient_dinner` | Ambient — Makan Malam / Dinner | `loop` | No | Never |
| `ambient_afterparty` | Ambient — After-party | `loop` | No | Never |
| `candid_cam` | Cara pakai Candid Cam / Candid Cam how-to | `loop` | No | Never |
| `welcome` | Selamat Datang / Welcome | `once` | 🔊 | `end_action` |
| `director_gm` | Pesan Direktur & GM / Director & GM message | `once` | 🔊 | `end_action` |
| `award_intro` | Nourish Award — Intro | `once` | 🔊 | `end_action` |
| `nominees` | Nominasi Nourish Award / Award nominees | `once` | 🔊 | `end_action` |
| `doorprize_intro` | Door Prize — Intro | `once` | 🔊 | Always `hold` (the MC's prize pick takes over) |
| `draw` | Undian Door Prize / Door Prize draw | `draw` | Existing draw sounds | — |
| `closing` | Penutup / Closing | `card` | No | — |
| `blackout` | Layar hitam / Blackout | `black` | No | — |

- `end_action` per `once` screen: `hold` (pause on the last frame, the default) or `goto` + `end_target` (any other key except `draw`).
- `closing` is rendered in-app in the brand look (Retro Rewind palette and fonts, Design Guide) with admin-set text (two lines, ID and EN). Seed text (HR edits before the show): "TERIMA KASIH, NOURISH FAMILY" / "MOVE IN UNITY. Together, We Make a Difference".
- Default screen after Go-live or rehearsal reset: `ambient_arrival`.

---

## 3. Data model

All timestamps UTC, shown in WITA.

### 3.1 New table `screens`

| Column | Type | Notes |
|---|---|---|
| `event_id` | uuid | PK part |
| `key` | text | PK part; check in the 12 keys |
| `video_path` | text null | Storage path in bucket `screens` |
| `video_version` | int not null default 0 | Bumped on every upload; cache key |
| `video_bytes` | bigint null | |
| `duration_s` | numeric null | Read from the file in the browser at upload |
| `end_action` | text not null default `hold` | `hold` / `goto`; ignored for non-`once` keys |
| `end_target` | text null | Required when `goto`; not `draw`, not itself |
| `card_text` | jsonb null | `closing` only: `{ id: [line1, line2], en: [line1, line2] }` |
| `updated_at` | timestamptz | |

Seeded with all 12 keys for every event (same trigger pattern as `stage_state`). RLS on, no policies (server only).

Storage bucket `screens`: private. Reads through signed URLs from route handlers only.

### 3.2 Changed tables

| Table | Change |
|---|---|
| `stage_state` | Add `screen jsonb not null default '{"key":"ambient_arrival","started_at":null,"by":null,"auto":false}'` and `screen_rev bigint not null default 0`. `screen_rev` bumps only when the screen changes (row `rev` also bumps on draw phases and options, so it cannot be the stale check). Public read is acceptable: no names, no URLs |
| `stage_heartbeat` | Add `cache jsonb` (`{ ready, total, failed: [key], sound_on }`) |
| `rundown_segments` | Add `suggested_screen text null` (check in the 12 keys) |
| `station_pins` | Role check adds `screen` |

### 3.3 Functions

- **`stage_write` (changed).** When `p_phase <> 'idle'` and `screen->>'key' <> 'draw'`, the same `update` also sets `screen = { key: 'draw', started_at: now(), by: 'draw', auto: true }` and bumps `screen_rev`. Row `rev` bumps once. This is the only takeover code path, so a number can never roll off-screen. `idle` (the MC's "Layar kosong") leaves `screen` untouched.
- **`set_screen(p_event, p_key, p_from_screen_rev, p_actor)`.** Locks the row. If `screen_rev <> p_from_screen_rev` → `CHANGED` with current state. If the key needs a video and `video_path` is null → `NO_VIDEO`. Otherwise sets `screen = { key, started_at: now(), by: actor, auto: false }`, bumps `screen_rev` and `rev`, audits `screen_set` with `{ key, from }`. Returns `OK` with the new state. Selecting the live key again is a replay (new `started_at`).
- **`stage_screen_ended(p_event, p_screen_rev)`.** If `screen_rev = p_screen_rev`, the live key is `once` and `end_action = 'goto'` → same as `set_screen` to `end_target` with actor `stage`, audited as `screen_auto_end`. Otherwise `IGNORED`.
- **`admin_save_screen(p_event, p_key, p_data, p_actor)`.** Updates `end_action`, `end_target`, `card_text`; validates targets; audits.
- **`admin_set_screen_video(p_event, p_key, p_path, p_bytes, p_duration, p_actor)`.** Called after a successful upload; bumps `video_version`; audits.
- **`reset_rehearsal_data` and `go_live` (changed).** Also set `screen` to `ambient_arrival` (`started_at = now()`, `auto = false`) and clear `stage_heartbeat.cache`. Videos and screen settings are kept.
- **`report_rows` (changed).** New report `screens`: time (WITA), key, by, auto (yes/no), from — from the audit log entries `screen_set` and `screen_auto_end`, plus `stage_*` takeovers.

---

## 4. Screen Control panel — `/station/screen`

Phone-first, ops styling as `/station/draw` and `/station/mc`. UI follows the EN/ID toggle (ID default). Polls `GET /api/station/screen/state` every 2 s; no Realtime dependency.

**Top bar**
- **ON SCREEN:** live screen label. For `once` videos, a progress bar `elapsed / duration` computed from `started_at` and server time; for loops, "LOOP"; for `draw`, "LIVE (auto)" when `auto`.
- **Stage laptop:** dot green if heartbeat age < 15 s, red otherwise. "Video siap 9/9" from `cache`; red with the failed screen names if `failed` is not empty.
- Gold "OFFLINE — mencoba lagi" banner when polling fails.

**Up next card**
- Shown when the current rundown segment has `suggested_screen`: segment title → screen label (+ 🔊), and a big **TAYANGKAN** button that calls `set` for that key.

**Screen grid**
- All 12 buttons in groups: Ambient · Video · Live · Kartu.
- **Two-step:** tap selects (outlined), **TAYANGKAN** puts it live. **Blackout** is the only one-tap button.
- 🔊 tag on audio screens. Screens without a video are greyed out and cannot be selected.
- Selecting the live screen shows "Putar ulang?" (replay) with a confirm.
- Switching away from `draw` while the draw phase is `intro`, `rolling` or `void`, or a draw is unconfirmed, asks "Undian belum selesai — pindah layar?". Allowed after confirm; the draw keeps running on the MC screen.
- If a 🔊 screen is selected while `cache.sound_on` is false: warning "⚠ Suara stage belum aktif".
- On `CHANGED`: toast "Layar sudah diganti — cek lagi", refresh, selection kept so the operator can re-tap.

---

## 5. Stage laptop — `/stage`

Existing entry, display key, fit-to-16:9, Realtime + 3 s polling fallback, heartbeat, fullscreen (F), sound (S) all unchanged. `StageClient` routes on `row.screen.key`.

### 5.1 Pre-load

1. After the display key, fetch `GET /api/stage/screens`: for each key with a video, `{ key, version, url (signed, 6 h), bytes, duration_s }`.
2. Call `navigator.storage.persist()`. Download every missing `key@version` into Cache Storage `nf-screens`, one at a time, largest last. Delete entries whose version is no longer current.
3. Re-fetch the manifest every 60 s and when the tab becomes visible; download new versions in the background.
4. Progress in the corner controls (visible on mouse move only) and in every heartbeat: `{ ready, total, failed, sound_on }`.
5. Playback source: an object URL from the cached response. If not cached yet: the signed URL (streaming).

Requirement: Chrome on one dedicated laptop, `/stage` opened at least 1 hour before gates on a good connection; all items ready before doors.

### 5.2 Playback

- Two `<video>` layers. A switch loads the new source into the hidden layer and shows it on its `playing` event, so there is no black frame between screens. Non-video screens (`draw`, `closing`, `blackout`) switch immediately.
- `loop` screens: `loop`, `muted` always.
- `once` screens: `muted` unless sound is unlocked. Start position = `server_now − started_at` (server time from the state response); if past the duration, show the end state directly.
- On `ended`: `hold` → pause on the last frame. `goto` → `POST /api/stage/ended { screen_rev }`; the screen changes when the new state arrives.
- `doorprize_intro` always holds; the MC's prize pick switches to `draw` through `stage_write`.
- `draw`: today's `StageView`, unchanged, including its sounds and safe mode.
- `closing`: in-app card with `card_text` in the stage language option. `blackout`: solid black, cursor hidden.
- If a video is neither cached nor reachable: show the brand card (closing styling, NourishFest 2026 wordmark only, no text from `card_text`) instead of black; the heartbeat lists the key in `failed`.

---

## 6. Admin — `/admin/screens`

- One row per key: label, kind, 🔊, file name, size, duration, version, preview player, end action (`once` keys), closing text (`closing`).
- **Upload:** the browser checks the file before uploading: MP4 container, H.264 video, ≤ 300 MB, aspect ratio 16:9 (±1%) from `videoWidth / videoHeight`; anything else is rejected with the actual values shown. Then `POST /api/admin/screens/upload-url` returns a signed upload URL; the browser uploads straight to Storage (Vercel's 4.5 MB request limit rules out passing the file through the app); then `POST /api/admin/screens` with `{ key, path, bytes, duration_s }` records it.
- **USB fallback:** a "Unduh semua" list with a signed download link per current file, named `NN_key.mp4` in show order.
- **Rundown editor (extended):** a "Layar disarankan" dropdown per segment (`suggested_screen`, optional).

---

## 7. Routes

| Route | Who | Purpose |
|---|---|---|
| `GET /api/station/screen/state` | `screen`, admin | `screen`, `screen_rev`, server time, per-key `{ has_video, duration_s, audio, kind }`, current segment + `suggested_screen`, draw phase, heartbeat age, `cache` |
| `POST /api/station/screen/set` | `screen`, admin | `{ key, from_screen_rev }` → `set_screen` → `OK` / `CHANGED` / `NO_VIDEO` |
| `GET /api/stage/screens` | Stage cookie | Manifest with signed URLs |
| `POST /api/stage/ended` | Stage cookie | `{ screen_rev }` → `stage_screen_ended` |
| `POST /api/stage/heartbeat` | Stage cookie | Extended body `{ ready, total, failed, sound_on }` |
| `GET /api/admin/screens` | Admin | Settings, file info, signed preview and download URLs |
| `POST /api/admin/screens` | Admin | Save settings (`admin_save_screen`) or record an upload (`admin_set_screen_video`) |
| `POST /api/admin/screens/upload-url` | Admin | Signed upload URL for a key |
| `GET /api/admin/reports/screens` | Admin | CSV |

`GET /api/stage/state` already returns the whole row, so it carries `screen` with no change.

---

## 8. Failure handling and edge cases

| Case | Behaviour |
|---|---|
| Venue internet drops | Cached videos keep playing; the live screen holds. Switches apply when Realtime or polling reconnects. If the outage lasts, the LED vendor plays from the USB stick |
| Stage laptop reloads or crashes | Returns to the live screen at the right second (§5.2) |
| Video neither cached nor reachable | Brand card instead of black; panel shows the key in red |
| Two operators switch at once | First wins; the second gets `CHANGED` |
| Operator switch crosses a draw takeover | `CHANGED` (`screen_rev` moved); operator sees the draw is live before re-tapping |
| MC picks a prize during a video | Draw board takes over immediately (`auto: true`) |
| MC taps "Layar kosong" | Draw board's empty view stays until the operator switches |
| Sound not unlocked | One-off video plays muted; panel warns |
| Wrong-ratio or oversized file | Rejected at upload with the actual values |
| `goto` target later loses its video | `stage_screen_ended` returns `NO_VIDEO`; the video holds its last frame |
| File replaced during the show | Laptop downloads the new version in the background; the next play uses it |
| Rehearsal reset / Go-live | Screen back to `ambient_arrival`; videos and settings kept |

---

## 9. Contract for the Video Pack

Every file uploaded here must meet this; the Video Pack spec builds to it.

| Item | Value |
|---|---|
| Resolution | 1920 × 1080 (16:9). Change only if the LED vendor confirms a different pixel size; then re-confirm this table |
| Frame rate | 30 fps |
| Codec | H.264 MP4, yuv420p, `+faststart` |
| Size | ≤ 300 MB per file |
| Loops (`ambient_*`, `candid_cam`) | Seamless (last frame flows into the first), no audio track |
| One-offs | End on a clean still hold frame (≥ 1 s); audio AAC, −14 LUFS integrated, ≤ −1 dBTP |
| Safe area | Key text inside the central 90% of the frame (LED edges and bezels) |

---

## 10. Testing

- **SQL:** `stage_write` with a non-idle phase sets `screen.key = 'draw'`, `auto = true`; `idle` leaves it. `set_screen` returns `CHANGED` on a stale `screen_rev` and `NO_VIDEO` for an empty video key. `stage_screen_ended` with a stale `screen_rev` returns `IGNORED`. Draw phase changes and option edits do not cause `CHANGED`; with `goto` it switches. `end_target` validation (not `draw`, not itself). Reset and Go-live restore `ambient_arrival`.
- **API:** role guards on every new route; `screen` is rejected on admin routes; the stage cookie cannot call `/api/station/screen/set`; `mc` and `draw` roles cannot switch screens.
- **Unit:** resume position from `started_at` and server time; manifest diff (download / delete by version); upload validator (ratio, codec, size).
- **UI:** panel on a real phone (two-step switch, blackout, replay, leave-draw confirm, `CHANGED` toast).
- **Rehearsal on the real stage laptop + LED wall + mixer:** pre-load all videos; unplug the network and run the full rundown; MC picks a prize mid-video (takeover); reload the laptop mid-video (resume); check one-off audio through the mixer and the "suara belum aktif" warning; play every file from the USB stick on the vendor's player; reset to live.

---
target: src/components/pass
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
target_identity: "file:C:\\Users\\centr\\Documents\\ANGEL FILE\\WEB-APP\\practice\\digital-event-experience\\nourishfest\\src\\components\\pass"
timestamp: 2026-10-18T17-34-31Z
slug: src-components-pass
---
⚠️ Browser inspection skipped: the only data is the production rehearsal DB, and reading a guest token was denied by the permission check. Source review + detector only.
Method: dual-agent (A: design review sub-agent · B: detector sub-agent)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Server sends a blank black frame until JS decides the view (PassView.tsx:76); failed polls are silent |
| 2 | Match System / Real World | 3 | Prize hint never says "be in the room, 60 seconds" |
| 3 | User Control and Freedom | 3 | Check-in QR disappears after check-in, though the guide says it remains available |
| 4 | Consistency and Standards | 3 | QR alt text hard-coded Indonesian in EN (TicketCard.tsx:20, MerchCard.tsx:21); saved image EN-only |
| 5 | Error Prevention | 3 | Nothing tells guests to save the ticket before the event |
| 6 | Recognition Rather Than Recall | 2 | Pass shows date · venue only (PassView.tsx:74); gate time and Maps live only inside the invitation |
| 7 | Flexibility and Efficiency | 2 | No offline copy; "Save as image" exists only after check-in and saves the number, not the QR |
| 8 | Aesthetic and Minimalist Design | 3 | Hero wordmark pushes the QR below the fold |
| 9 | Error Recovery | 2 | No app/error.tsx; RATE_LIMITED has no retry; save-image failures are silent |
| 10 | Help and Documentation | 2 | Only the brightness hint; nothing for "it won't load at the door" or how the draw works |
| **Total** | | **25/40** | **Acceptable** |

## Design Specificity Verdict

LLM assessment: authored, not generic. The ticket stub (5 px gold border, dashed tear), gold-vs-pink code frames, the 150 px Bungee prize number with hard pink offset and gold glow, and glows that move after check-in could only belong to NourishFest. Coherence drops after check-in: the ticket object vanishes (PassView.tsx:93-102) and the page becomes a name row, a number and a pink card. On-brand, but no longer a pass. The Mixtape North Star lives only in the invitation; the pass carries no tape/J-card cue.

Deterministic scan: TSX targets clean (0 findings across src/components/pass, src/app/pass, QrTile, Wordmark, LangToggle), but regex-only: contrast, tiny-text and element rules did not run, so this is an undercount. src/styles/pass.css: 5 advisory findings, 1 true positive (.sticker 22 px off the type ramp, line 19) and 4 false positives (15 px outline radius, 16 px prize label, 26 px merch banner, 15 px pill), all sanctioned in DESIGN.md prose but missing from its YAML scales.

Visual overlays: none. Browser inspection was not possible.

## Overall Impression
The pass gets the hard parts right (two codes that can't be confused, a white-tiled QR built to spec, a screen that stays awake), then trips at the moment it exists for: at the door, on weak Wi-Fi, held out to a stranger. The biggest opportunity is making the ticket a server-rendered, screenshot-complete artifact first and an experience second.

## What's Working
1. One Job Per Code is executed properly: gold frame + "CHECK-IN PASS" pill vs pink frame + MERCHANDISE banner + "not the check-in QR"; the merch QR is withheld until check-in and again once claimed.
2. Door craft: wake lock re-requested on visibility change; QR on a white tile with 4-module quiet zone, EC level M, crispEdges; the page flips itself after check-in with no reload.
3. The prize number moment: zero-padded to match the stage, Bungee with hard offset, reduced motion lands on the final state cleanly.

## Priority Issues

**[P1] Nothing renders until JavaScript decides.** Server HTML is a black div (PassView.tsx:28,76); on weak Wi-Fi the guest stares at black and the QR cannot show without JS. On event day or after check-in the server already knows the answer. Fix: decide those cases in page.tsx and server-render the pass; mount the invitation as a client overlay only when needed; add the §10.2 skeleton. Command: /impeccable harden

**[P1] The QR sits below the fold, so a plain screenshot crops it.** Estimated QR bottom edge ~700–740 px against ~650–670 px in-app viewports at 360/390 px; long names make it worse (pass.css:16-35, PassView.tsx:87-91). Fix: fold the wordmark into the top bar (or one 28–32 px line), add "Screenshot this ticket for the door", and offer a pre-check-in "Save ticket" image reusing the SaveImage canvas with the QR. Command: /impeccable layout

**[P1] No gate time and no map on the pass.** PassView.tsx:74 joins only date and venue; on event day the invitation never plays, so GATES 17:00 and Maps hide behind "Replay invitation". Fix: date · GATES {doors} WITA · venue, plus a 48 px Maps link when maps_url is set. Command: /impeccable clarify

**[P1] The reveal plays to the staff member.** The poll flips the page within ~6 s while the phone still faces the scanner, and marks the reveal seen immediately (PassView.tsx:53-56). Fix: hold the reveal until the guest's next touch (or ~3 s), add vibration and an aria-live "Checked in. Your Door Prize number is 007." Command: /impeccable delight

**[P2] The prize number overflows at larger text.** Fixed 150 px Bungee (pass.css:53): "007" ≈ 315 px in a 320 px column at 360, ≈ 410 px at 130% text. Fix: font-size: clamp(96px, 38vw, 150px). Command: /impeccable adapt

## Persona Red Flags

Casey (weak Wi-Fi, one thumb): black screen while JS loads; reopening at the venue with no signal gives a browser error page; polls fail silently; QR needs a scroll.

Sam (screen reader, 130% text): no h1 anywhere, the name after check-in is a <p> (PassView.tsx:96); aria-label on a <p> for the number is unreliable (PrizeNumber.tsx:11); check-in and merch changes never announced; Indonesian alt text read with an English voice; prize number overflows at 130%.

Ibu Wayan (Indonesian-first, opens once, screenshots): first screen is English ("PRESS PLAY", "Skip") with no language toggle on the gate (Invitation.tsx:96-104); her screenshot crops the QR; if she skips the invitation she never learns the gate time; "SAVE AS IMAGE" appears only after check-in and saves the number, not the ticket.

## Minor Observations
- QR scales by CSS width:100% (pass.css:34-35): ~7.08 px per module at 360 px, breaking the integer pixels-per-module rule. Size the tile in whole pixels.
- Prize helper text sits on halftone + glow, against the Clean Ground rule.
- Claimed merch banner has no icon (MerchCard.tsx:13), against colour + icon + words.
- SaveImage: names cut with slice(0,28) and no ellipsis; no "Saving…" state; iOS share after async render can throw NotAllowedError, swallowed silently.
- Polls every 6 s for weeks before the event; could be event-day only.
- Date line isn't the §9.1 uppercase short form ("10 DES 2026").
- Pass rate limit is per IP; a venue sharing one IP could lock out everyone's reload (pass.ts:22-27).
- .sticker 22 px is off the documented type ramp (detector TP).

## Questions to Consider
1. If the phone is the ticket, why does the ticket only exist when the network and React both cooperate?
2. Who is the reveal for: the guest, or the staff member holding their phone? Should the guest trigger it ("Tap to see your number")?
3. After check-in, is it still the Mixtape Pass? What if the after state were the same ticket flipped to its B-side, number and merch added, check-in QR still there?

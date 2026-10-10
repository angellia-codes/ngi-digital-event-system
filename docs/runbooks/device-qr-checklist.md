# Device QR checklist

Goal: every guest phone can be scanned by the station phones in under 2 seconds, in a bright or dim room.
Use the staging site with fake guests, or production in rehearsal mode. Test with the **staff** device doing the scanning.

## Devices

| # | Guest phone (OS, model, browser) | Notes |
| :---- | :---- | :---- |
| 1 | Android, low-end model | |
| 2 | Android, mid-range | |
| 3 | Android, older version | |
| 4 | iPhone, Safari | |

Staff scanners: one Android with Chrome and one iPhone with Safari. Both must pass the camera step.

## For each guest phone

| Test | Pass when | D1 | D2 | D3 | D4 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| Open the personal link from a WhatsApp message (WhatsApp’s built-in browser) | Pass loads, QR visible, no sideways scrolling | | | | |
| Open the same link in Chrome / Safari | Same | | | | |
| Brightness at 30% | Scans in under 2 s at about 25–35 cm | | | | |
| Brightness at 100% | Scans in under 2 s | | | | |
| Phone dark mode on | QR tile is still white with black modules | | | | |
| “Save as image”, then scan the saved image from the gallery | Scans in under 2 s | | | | |
| Screenshot of the pass, then scan the screenshot | Scans in under 2 s | | | | |
| Airplane mode after the page has loaded | QR still shown | | | | |
| Language toggle ID then EN, reload | Choice remembered; no layout break | | | | |
| After check-in: prize number and merchandise QR appear | Both visible; merchandise QR scans at the booth | | | | |

## For each staff scanner

| Test | Pass when | Android | iPhone |
| :---- | :---- | :---- | :---- |
| Camera permission prompt | Appears only after tapping “AKTIFKAN KAMERA” | | |
| Deny the permission | Message points to Cari Manual; manual search works | | |
| Scan three different guest phones in a row | Each result appears in under 2 s; same code is ignored for 2 s | | |
| Scan with the room lights dimmed | Still scans | | |
| Vibration on success / problem | Short on success, double on problem (Android only) | | |

## If a phone fails

1. Raise `ppm` on `QrTile` from 6 to 7 (the tile gets bigger, the QR stays the same) and retest that phone.
2. Check that the pass is not being scaled by CSS: the QR width must be 37 × an integer number of pixels (the end-to-end test asserts this).
3. If a particular browser still fails, record it here and add the workaround to the staff briefing (use Cari Manual).

Signed off by: ____________  Date: ____________

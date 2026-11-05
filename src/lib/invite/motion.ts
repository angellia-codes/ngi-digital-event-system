/**
 * Invitation motion timing (motion spec 2026-10-19 §3–§4). Everything is counted in beats.
 * BEAT_MS must match `--beat` in src/styles/invite.css.
 */
export const BPM = 104;
export const BEAT_MS = 577; // Math.round(60000 / BPM)
/** The tape clicks into the boombox on beat 2 of the opening; the music drops there. */
export const DROP_BEATS = 2;
/** Glass blur switches on this many beats after a scene starts, once its cards have stopped moving. */
export const SETTLE_BEATS = 3;
/** Backup end of the opening if `animationend` never arrives, counted in visible time only. */
export const OPENING_BACKUP_MS = 10_000;
/** The opening is drawn on a fixed set and scaled to fit the screen. */
export const STAGE_W = 360;
export const STAGE_H = 640;

/** Milliseconds to wait before starting the song so it lands on the click. 0 means start now. */
export function musicDropDelay(nowMs: number, dropAtMs: number): number {
  return Math.max(0, dropAtMs - nowMs);
}

/** Scale that fits the 360 x 640 set inside a box. 1 when the box has not been measured. */
export function stageScale(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return 1;
  return Math.min(width / STAGE_W, height / STAGE_H);
}

/** Adds a timer step only while the page is visible, so a hidden tab never ends the opening early. */
export function tickVisible(elapsedMs: number, stepMs: number, visible: boolean): number {
  return visible ? elapsedMs + stepMs : elapsedMs;
}

/** Splits copy after each full stop or colon, so the About scene can settle it line by line. */
export function splitLines(text: string): string[] {
  return text.split(/(?<=[.:])\s+/).filter((s) => s.length > 0);
}

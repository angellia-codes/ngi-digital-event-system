export const ARTBOARD = { w: 1280, h: 720 } as const;

/** The stage is designed on a 1280 × 720 board and scaled, never cropped, to whatever the projector reports. */
export function fitScale(w: number, h: number): number {
  if (!(w > 0) || !(h > 0)) return 1;
  return Math.min(w / ARTBOARD.w, h / ARTBOARD.h);
}

/** Columns for a batch grid. Few winners get big tiles; 20+ winners still fit on one board. */
export function gridColumns(n: number): number {
  if (n <= 3) return Math.max(1, n);
  if (n === 4) return 2;
  if (n <= 6) return 3;
  if (n <= 12) return 4;
  if (n <= 20) return 5;
  return 6;
}

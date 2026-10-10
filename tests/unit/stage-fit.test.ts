import { describe, expect, it } from 'vitest';
import { ARTBOARD, fitScale, gridColumns } from '@/lib/stage-fit';

describe('fitScale', () => {
  it('scales the 1280 × 720 artboard to the screen without cropping', () => {
    expect(ARTBOARD).toEqual({ w: 1280, h: 720 });
    expect(fitScale(1280, 720)).toBe(1);
    expect(fitScale(1920, 1080)).toBe(1.5);
    expect(fitScale(1000, 1000)).toBe(1000 / 1280); // width is the limit
    expect(fitScale(2560, 720)).toBe(1); // height is the limit
  });
  it('falls back to 1 for a window that reports no size', () => {
    expect(fitScale(0, 0)).toBe(1);
    expect(fitScale(Number.NaN, 720)).toBe(1);
  });
});

describe('gridColumns', () => {
  it('keeps batch tiles large enough to read from the back of the room', () => {
    expect([1, 2, 3, 4, 6, 7, 12, 13, 20, 21, 50].map(gridColumns)).toEqual([1, 2, 3, 2, 3, 4, 4, 5, 5, 6, 6]);
  });
});

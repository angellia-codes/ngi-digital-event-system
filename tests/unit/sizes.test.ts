import { describe, it, expect } from 'vitest';
import { SIZES, hasChart, isSize, leftFor, sizeChartSchema, type SizeSummary } from '@/lib/sizes';

const SEED = {
  S: { chest: 59, bottom: 56, length: 68, sleeve: 20 },
  M: { chest: 61, bottom: 58, length: 70, sleeve: 21 },
  L: { chest: 63, bottom: 60, length: 72, sleeve: 22 },
  XL: { chest: 65, bottom: 62, length: 74, sleeve: 23 },
  XXL: { chest: 67, bottom: 64, length: 76, sleeve: 24 },
};
const summary = (stock_set: boolean): SizeSummary => ({
  sizes: SIZES.map((size) => ({ size, reserved: 0, received: 3, given: 0, left: size === 'L' ? 0 : 3, to_claim: 0 })),
  no_size: 0, total: 0, deadline: null, default_size: null, final: false, stock_set,
});

describe('sizes', () => {
  it('lists the five sizes in order', () => expect(SIZES).toEqual(['S', 'M', 'L', 'XL', 'XXL']));
  it('recognises sizes', () => {
    expect(isSize('XL')).toBe(true);
    expect(isSize('XS')).toBe(false);
    expect(isSize(undefined)).toBe(false);
  });
  it('treats an empty chart as no chart', () => {
    expect(hasChart(SEED)).toBe(true);
    expect(hasChart({})).toBe(false);
    expect(hasChart(null)).toBe(false);
  });
  it('accepts the vendor chart and an empty chart', () => {
    expect(sizeChartSchema.safeParse(SEED).success).toBe(true);
    expect(sizeChartSchema.safeParse({}).success).toBe(true);
  });
  it('rejects partial, zero and decimal charts', () => {
    expect(sizeChartSchema.safeParse({ S: SEED.S }).success).toBe(false);
    expect(sizeChartSchema.safeParse({ ...SEED, L: { ...SEED.L, chest: 0 } }).success).toBe(false);
    expect(sizeChartSchema.safeParse({ ...SEED, L: { ...SEED.L, chest: 63.5 } }).success).toBe(false);
  });
  it('gives stock left only once stock was entered', () => {
    expect(leftFor(summary(true), 'L')).toBe(0);
    expect(leftFor(summary(true), 'M')).toBe(3);
    expect(leftFor(summary(false), 'M')).toBeNull();
    expect(leftFor(null, 'M')).toBeNull();
  });
});

import { z } from 'zod';

/** T-shirt sizes in display order (merch size spec 2026-11-08 §1.1). Same list as the SQL check constraints. */
export const SIZES = ['S', 'M', 'L', 'XL', 'XXL'] as const;
export type Size = (typeof SIZES)[number];
export const MEASURES = ['chest', 'bottom', 'length', 'sleeve'] as const;
export type Measure = (typeof MEASURES)[number];
export type FullChart = Record<Size, Record<Measure, number>>;
/** `{}` when admin cleared the chart; the guide is then hidden. */
export type SizeChart = FullChart | Record<string, never>;

export const isSize = (s: unknown): s is Size => typeof s === 'string' && (SIZES as readonly string[]).includes(s);
export const hasChart = (c: SizeChart | null | undefined): c is FullChart => !!c && SIZES.every((s) => s in c);

const cm = z.number().int().positive().max(300);
const dims = z.object({ chest: cm, bottom: cm, length: cm, sleeve: cm }).strict();
/** Same rule as valid_size_chart() in SQL: all five sizes with four whole-number measurements in cm, or empty. */
export const sizeChartSchema = z.union([
  z.object({ S: dims, M: dims, L: dims, XL: dims, XXL: dims }).strict(),
  z.object({}).strict(),
]);

/** One row of merch_size_summary(). left = received − given; to_claim = guests with that size not yet redeemed. */
export type SizeRow = { size: Size; reserved: number; received: number; given: number; left: number; to_claim: number };
export type SizeSummary = {
  sizes: SizeRow[]; no_size: number; total: number; deadline: string | null;
  default_size: Size | null; final: boolean; stock_set: boolean;
};

/** Stock left for a size, or null when HR has not entered stock yet (the booth then shows claimed counts). */
export const leftFor = (summary: SizeSummary | null, size: Size): number | null =>
  summary?.stock_set ? (summary.sizes.find((r) => r.size === size)?.left ?? 0) : null;

/** One row of `prize_list` (SQL, Task 18). Counts are live: a no-show or an admin void frees the slot again. */
export type PrizeRow = {
  id: string;
  name: string;
  tier: string | null;
  sort_order: number;
  quantity: number;
  draw_as_batch: boolean;
  confirmed: number;
  pending: number;
  no_shows: number;
  admin_voids: number;
  remaining: number;
  has_draws: boolean;
};

export const firstOpenPrize = (prizes: PrizeRow[]): string | null => prizes.find((p) => p.remaining > 0)?.id ?? null;

export const prizeLabel = (p: { tier: string | null; name: string }): string => [p.tier, p.name].filter(Boolean).join(' · ');

export const WINNER_SECONDS = 60;

export type DrawRow = {
  id: string; slot: number; status: 'drawn' | 'confirmed' | 'void_no_show' | 'void_admin';
  number: number; name: string; outlet: string; department: string | null; drawn_at: string; redraw_of: string | null;
};
export type Round = {
  round_id: string;
  prize: { id: string; name: string; tier: string | null; quantity: number; batch: boolean };
  pending: number;
  draws: DrawRow[];
};
export type Current = {
  round: Round | null;
  oldest_pending_at: string | null;
  stage: { rev: number; phase: string; options: { safe_mode: boolean; reduce_effects: boolean; language: 'id' | 'en' } };
  heartbeat_age: number | null;
};

/** Whole seconds left of the 60-second "winner must be present" window. Advisory: nothing is voided automatically. */
export function secondsLeft(drawnAt: string | null, now: number): number {
  if (!drawnAt) return WINNER_SECONDS;
  const elapsed = Math.floor((now - new Date(drawnAt).getTime()) / 1000);
  return Math.max(0, Math.min(WINNER_SECONDS, WINNER_SECONDS - elapsed));
}

export type Link = 'ok' | 'down' | 'never';

/** Green when the projector checked in less than 15 seconds ago. */
export function heartbeatState(age: number | null | undefined): Link {
  if (age === null || age === undefined) return 'never';
  return age < 15 ? 'ok' : 'down';
}

/**
 * One request id per prize, kept until the server has answered. A retry after a dropped connection or a double tap
 * reuses the id, so the server returns the same draw instead of drawing twice.
 */
export function requestIds(gen: () => string = () => crypto.randomUUID()) {
  const open = new Map<string, string>();
  return {
    idFor(prizeId: string): string {
      let id = open.get(prizeId);
      if (!id) { id = gen(); open.set(prizeId, id); }
      return id;
    },
    done(prizeId: string): void { open.delete(prizeId); },
  };
}

export const pendingDraws = (round: Round | null): DrawRow[] => (round ? round.draws.filter((d) => d.status === 'drawn') : []);

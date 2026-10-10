import { pendingDraws, type Round } from './draw-ui';
import type { StringKey } from './i18n/strings';

export type Screen = 'pick' | 'active' | 'recorded' | 'redraw';

/**
 * A fingerprint of everything the operator could have seen in a round. "UNDIAN BERIKUTNYA" stores it, so the dismissal
 * lasts only until the round changes again (a redraw into the same round, or an admin void).
 */
export const roundKey = (round: Round): string => `${round.round_id}:${round.draws.map((d) => `${d.id}=${d.status}`).join(',')}`;

/**
 * Which of the four views the operator sees.
 *  active   — a draw is waiting for KONFIRMASI / TIDAK HADIR
 *  recorded — everything is confirmed: "TERCATAT" and UNDIAN BERIKUTNYA
 *  redraw   — a slot was freed by a no-show or an admin void: the picker, with the prize still selected
 *  pick     — nothing in progress
 */
export function screenFor(round: Round | null, dismissedKey: string | null): Screen {
  if (!round) return 'pick';
  if (pendingDraws(round).length > 0) return 'active';
  if (round.draws.some((d) => d.status === 'void_no_show' || d.status === 'void_admin')) return 'redraw';
  if (round.draws.some((d) => d.status === 'confirmed')) return roundKey(round) === dismissedKey ? 'pick' : 'recorded';
  return 'pick';
}

/** The string that explains a `draw_prize` answer which did not produce a draw; null when it did. */
export function drawProblem(status: string): StringKey | null {
  switch (status) {
    case 'DRAWN': return null;
    case 'DRAW_IN_PROGRESS': return 'draw.in_progress';
    case 'NO_ELIGIBLE_GUESTS': return 'draw.no_eligible';
    case 'PRIZE_COMPLETE': return 'draw.prize_complete';
    default: return 'draw.error';
  }
}

/** Admin console wording for rundown, VIP and MC-line results (English, like the rest of the console). */
const RUNDOWN: Record<string, string> = {
  INVALID: 'Check the fields: title, start time (HH:MM) and duration (1–600 min) are required; prizes only on a door-prize segment.',
  LOCKED: 'This segment has already finished, so it can no longer be edited.',
  PRIZE_TAKEN: 'A prize you picked already belongs to another segment.',
  HAS_RUNS: 'This segment has already run, so it cannot be deleted.',
  REASON_REQUIRED: 'Give a reason of at least 5 characters.',
  ALREADY_CURRENT: 'That segment is already the current one.',
  NOT_FOUND: 'That segment no longer exists. Reload the page.',
};

export function describeRundown(status: string, prize?: string): string {
  if (status === 'PRIZE_TAKEN' && prize) return `“${prize}” already belongs to another segment.`;
  return RUNDOWN[status] ?? 'Could not save. Try again.';
}

/** "17:05" from a WITA time input; null for anything else. */
export function parseTime(s: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h <= 23 && min <= 59 ? `${String(h).padStart(2, '0')}:${m[2]}` : null;
}

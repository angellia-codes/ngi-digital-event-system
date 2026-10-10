const PRIZE_PROBLEM: Record<string, string> = {
  INVALID: 'Check the fields: a name is required, the quantity is 1 to 500, and the tier is at most 30 characters.',
  BAD_INPUT: 'Check the fields: a name is required, the quantity is 1 to 500, and the tier is at most 30 characters.',
  NAME_IN_USE: 'Another prize already has that name.',
  QUANTITY_TOO_LOW: 'The quantity cannot be lower than the slots already drawn.',
  LOCKED_BY_DRAWS: 'Batch mode cannot be changed once this prize has been drawn.',
  NOT_FOUND: 'That prize no longer exists. Refresh the page.',
  HAS_DRAWS: 'A prize that has been drawn cannot be deleted.',
};
export const describePrize = (status: string): string => PRIZE_PROBLEM[status] ?? 'Could not save. Try again.';

const VOID_PROBLEM: Record<string, string> = {
  REASON_REQUIRED: 'Give a reason of at least 5 characters.',
  NOT_VOIDABLE: 'That draw is already void.',
  NOT_FOUND: 'That draw no longer exists. Refresh the page.',
};
export const describeVoid = (status: string): string => VOID_PROBLEM[status] ?? 'Could not void. Refresh and try again.';

export type Tone = 'green' | 'gold' | 'pink' | 'plain';
const DRAW_STATUS: Record<string, { label: string; tone: Tone }> = {
  drawn: { label: 'waiting for MC', tone: 'gold' },
  confirmed: { label: 'confirmed', tone: 'green' },
  void_no_show: { label: 'not here', tone: 'pink' },
  void_admin: { label: 'voided by admin', tone: 'pink' },
};
export const drawStatus = (s: string): { label: string; tone: Tone } => DRAW_STATUS[s] ?? { label: s, tone: 'plain' };

/** Projector connection from the age (seconds) of its last heartbeat. Green below 15 seconds, as on the MC screen. */
export function stageLinkText(age: number | null | undefined): string {
  if (age === null || age === undefined) return 'Never connected';
  if (age < 15) return `Connected, seen ${Math.round(age)} s ago`;
  return age >= 120 ? `Not seen for ${Math.round(age / 60)} min` : `Not seen for ${Math.round(age)} s`;
}

const STAMP = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Makassar', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
/** "2026-12-10 17:42:05" in WITA, the same shape as the CSV exports. */
export const formatStampWita = (iso: string | null | undefined): string => (iso ? STAMP.format(new Date(iso)) : '');

/** One short line for the audit table. Audit details never hold names or tokens (checked in the API tests). */
export function auditSummary(details: unknown, max = 140): string {
  if (!details || typeof details !== 'object') return '';
  const text = Object.entries(details as Record<string, unknown>)
    .map(([k, v]) => `${k.replaceAll('_', ' ')}: ${typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}`)
    .join(' · ');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export const percent = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 100) : 0);

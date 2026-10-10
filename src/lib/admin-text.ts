import type { Role } from './session';

const PROBLEM: Record<string, string> = {
  REQUIRED: 'is required',
  TOO_LONG: 'is too long',
  DUPLICATE_IN_FILE: 'appears more than once in the file',
  INVALID_PHONE: 'is not a valid Indonesian phone number',
  MALFORMED_ROW: 'could not be read',
};

export function describeImportError(e: { row: number; field: string; code: string }): string {
  const where = e.field ? `Row ${e.row}, ${e.field}` : `Row ${e.row}`;
  return `${where}: ${PROBLEM[e.code] ?? e.code}`;
}

export const ROLE_NAME: Record<Role, string> = {
  checkin: 'Check-in desk',
  merchandise: 'Merchandise booth',
  draw: 'Draw operator (MC)',
  prizes: 'Prize table',
  admin: 'Admin console',
};

/** Four random digits from the browser or Node crypto source. */
export function randomPin(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 10_000;
  return String(n).padStart(4, '0');
}

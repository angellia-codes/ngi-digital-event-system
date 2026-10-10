import { parseGuestCsv, type GuestRow, type RowError } from './csv';
import { rpc } from './db';
import { env } from './env';

export const MAX_ROWS = 1000;

export type Prepared =
  | { status: 'OK'; rows: GuestRow[]; parseErrors: RowError[] }
  | { status: 'BAD_COLUMNS'; missingColumns: string[] }
  | { status: 'EMPTY' }
  | { status: 'TOO_MANY' };

export function prepareImport(text: string): Prepared {
  const { rows, errors, missingColumns } = parseGuestCsv(text);
  if (missingColumns.length > 0) return { status: 'BAD_COLUMNS', missingColumns };
  if (rows.length === 0) return { status: 'EMPTY' };
  if (rows.length > MAX_ROWS) return { status: 'TOO_MANY' };
  return { status: 'OK', rows, parseErrors: errors };
}

type Preview = {
  status: string; errors: RowError[]; would_insert: number; would_update: number;
  missing_count: number; missing: { employee_id: string; full_name: string }[];
};

/** Dry run: parse errors and database checks merged into one list. Writes nothing. */
export async function previewImport(text: string): Promise<Record<string, unknown> & { status: string }> {
  const p = prepareImport(text);
  if (p.status !== 'OK') return p;
  const r = await rpc<Preview>('import_preview', { p_event: env().EVENT_ID, p_rows: p.rows });
  const errors = [...p.parseErrors, ...r.errors];
  return { ...r, errors, status: errors.length > 0 ? 'HAS_ERRORS' : 'OK' };
}

/** All-or-nothing: any parse or database error means nothing is written. */
export async function commitImport(text: string, actor: string): Promise<Record<string, unknown> & { status: string }> {
  const p = prepareImport(text);
  if (p.status !== 'OK') return p;
  if (p.parseErrors.length > 0) return { status: 'HAS_ERRORS', errors: p.parseErrors };
  return rpc('import_guests', { p_event: env().EVENT_ID, p_rows: p.rows, p_filename: 'upload.csv', p_actor: actor });
}

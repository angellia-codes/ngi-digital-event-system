import Papa from 'papaparse';
import { normalisePhone } from './phone';

export type GuestRow = {
  row_no: number;
  employee_id: string;
  full_name: string;
  outlet: string;
  department?: string;
  position?: string;
  phone?: string;
  category?: string;
};
export type RowError = { row: number; field: string; code: string };

type Field = 'employee_id' | 'full_name' | 'outlet' | 'department' | 'position' | 'phone' | 'category';
const REQUIRED: Field[] = ['employee_id', 'full_name', 'outlet'];

const norm = (h: string) => h.replace(/^﻿/, '').trim().toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ');
const ALIASES: Record<string, Field> = {
  'employee id': 'employee_id', employeeid: 'employee_id', nik: 'employee_id', id: 'employee_id',
  'full name': 'full_name', name: 'full_name', nama: 'full_name', 'nama lengkap': 'full_name',
  outlet: 'outlet', unit: 'outlet',
  department: 'department', dept: 'department', departemen: 'department',
  position: 'position', jabatan: 'position',
  phone: 'phone', hp: 'phone', 'no hp': 'phone', whatsapp: 'phone', wa: 'phone', 'phone number': 'phone',
  category: 'category', kategori: 'category',
};
const canonical = (h: string): string => ALIASES[norm(h)] ?? norm(h).replace(/ /g, '_');

export function parseGuestCsv(text: string): { rows: GuestRow[]; errors: RowError[]; missingColumns: string[] } {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: canonical,
  });
  const fields = parsed.meta.fields ?? [];
  const missingColumns = REQUIRED.filter((f) => !fields.includes(f));
  const errors: RowError[] = [];
  const rows: GuestRow[] = [];

  parsed.data.forEach((raw, i) => {
    const line = i + 2; // header is line 1
    const get = (f: Field) => (raw[f] ?? '').toString().trim();
    const row: GuestRow = { row_no: line, employee_id: get('employee_id'), full_name: get('full_name'), outlet: get('outlet') };
    for (const f of ['department', 'position', 'category'] as const) if (get(f)) row[f] = get(f);
    const phone = normalisePhone(get('phone'));
    if (!phone.ok) errors.push({ row: line, field: 'phone', code: 'INVALID_PHONE' });
    else if (phone.value) row.phone = phone.value;
    rows.push(row);
  });

  for (const e of parsed.errors) {
    if (typeof e.row === 'number') errors.push({ row: e.row + 2, field: '', code: 'MALFORMED_ROW' });
  }
  return { rows, errors, missingColumns };
}

/** Neutralise spreadsheet formulas in exported text cells. */
export function csvSafe(cell: string): string {
  return /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
}

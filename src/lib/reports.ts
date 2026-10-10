import Papa from 'papaparse';
import { csvSafe } from './csv';

type Kind = 'text' | 'time' | 'bool' | 'phone';
type Col = { key: string; header: string; kind?: Kind };
type Report = { sql: string; file: string; cols: Col[] };

const person: Col[] = [
  { key: 'employee_id', header: 'Employee ID' },
  { key: 'full_name', header: 'Name' },
  { key: 'outlet', header: 'Outlet' },
  { key: 'department', header: 'Department' },
];

/** `sql` is the report name `report_rows` expects. Column order lives here because jsonb objects have no order. */
export const REPORTS = {
  guests: {
    sql: 'guests', file: 'nourishfest-guests.csv',
    cols: [
      ...person,
      { key: 'position', header: 'Position' }, { key: 'category', header: 'Category' }, { key: 'rsvp_status', header: 'RSVP' },
      { key: 'opened', header: 'Opened invitation', kind: 'bool' }, { key: 'checked_in_at', header: 'Checked in at', kind: 'time' },
      { key: 'prize_number', header: 'Door Prize no.' }, { key: 'merchandise', header: 'Merchandise' },
      { key: 'walk_in', header: 'Walk-in', kind: 'bool' }, { key: 'active', header: 'Active', kind: 'bool' },
    ],
  },
  'check-ins': {
    sql: 'check_ins', file: 'nourishfest-check-ins.csv',
    cols: [
      { key: 'checked_in_at', header: 'Time', kind: 'time' }, { key: 'prize_number', header: 'Door Prize no.' }, ...person,
      { key: 'method', header: 'Method' }, { key: 'station', header: 'Station' }, { key: 'actor', header: 'Staff' },
    ],
  },
  merchandise: {
    sql: 'merchandise', file: 'nourishfest-merchandise.csv',
    cols: [
      { key: 'redeemed_at', header: 'Time', kind: 'time' }, { key: 'status', header: 'Status' },
      { key: 'employee_id', header: 'Employee ID' }, { key: 'full_name', header: 'Name' }, { key: 'outlet', header: 'Outlet' },
      { key: 'station', header: 'Booth' }, { key: 'actor', header: 'Staff' }, { key: 'void_reason', header: 'Void reason' },
    ],
  },
  draws: {
    sql: 'draws', file: 'nourishfest-draw-history.csv',
    cols: [
      { key: 'drawn_at', header: 'Drawn at', kind: 'time' }, { key: 'prize', header: 'Prize' }, { key: 'slot', header: 'Slot' },
      { key: 'prize_number', header: 'Door Prize no.' }, ...person,
      { key: 'status', header: 'Status' }, { key: 'drawn_by', header: 'Drawn by' },
      { key: 'resolved_at', header: 'Resolved at', kind: 'time' }, { key: 'resolved_by', header: 'Resolved by' },
      { key: 'void_reason', header: 'Void reason' },
    ],
  },
  audit: {
    sql: 'audit', file: 'nourishfest-audit.csv',
    cols: [
      { key: 'at', header: 'Time', kind: 'time' }, { key: 'actor_type', header: 'Actor type' }, { key: 'actor', header: 'Actor' },
      { key: 'action', header: 'Action' }, { key: 'entity', header: 'Entity' }, { key: 'entity_id', header: 'Entity ID' },
      { key: 'details', header: 'Details' },
    ],
  },
  'rsvp-pending': {
    sql: 'rsvp_pending', file: 'nourishfest-rsvp-not-answered.csv',
    cols: [
      ...person, { key: 'phone', header: 'Phone', kind: 'phone' }, { key: 'opened', header: 'Opened invitation', kind: 'bool' },
    ],
  },
} satisfies Record<string, Report>;

export type ReportName = keyof typeof REPORTS;
export const isReportName = (s: string): s is ReportName => Object.hasOwn(REPORTS, s);

const stamp = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Makassar', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
/** "2026-12-10 17:42:05" in WITA. */
export const witaStamp = (iso: string | null | undefined): string => (iso ? stamp.format(new Date(iso)) : '');

function cell(value: unknown, kind: Kind = 'text'): string {
  if (value === null || value === undefined) return '';
  if (kind === 'time') return witaStamp(String(value));
  if (kind === 'bool') return value ? 'yes' : 'no';
  if (kind === 'phone') return String(value).replace(/\D/g, ''); // digits only: a leading "+" would be read as a formula
  return csvSafe(String(value));
}

export function buildReportCsv(name: ReportName, rows: Record<string, unknown>[]): string {
  const { cols } = REPORTS[name];
  // Object form with explicit fields, so an empty list still produces the header row.
  return '\uFEFF' + Papa.unparse({
    fields: cols.map((c) => c.header),
    data: rows.map((r) => cols.map((c) => cell(r[c.key], c.kind))),
  });
}

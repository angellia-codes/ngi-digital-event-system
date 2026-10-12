import Papa from 'papaparse';
import { describe, it, expect } from 'vitest';
import { REPORTS, buildReportCsv, isReportName, witaStamp } from '@/lib/reports';

const parse = (csv: string) => Papa.parse<Record<string, string>>(csv.replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: true });

describe('witaStamp', () => {
  it('shows date and time in WITA', () => expect(witaStamp('2026-12-10T09:42:05Z')).toBe('2026-12-10 17:42:05'));
  it('is empty for null', () => expect(witaStamp(null)).toBe(''));
});

describe('isReportName', () => {
  it.each(['guests', 'check-ins', 'merchandise', 'draws', 'audit'])('knows %s', (n) => expect(isReportName(n)).toBe(true));
  it.each(['rsvp-pending', 'invitations', '../etc', 'toString', '__proto__', ''])('rejects %s', (n) => expect(isReportName(n)).toBe(false));
});

describe('buildReportCsv', () => {
  it('starts with a BOM and writes the header row even when there are no rows', () => {
    const csv = buildReportCsv('draws', []);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(parse(csv).meta.fields).toEqual(REPORTS.draws.cols.map((c) => c.header));
    expect(parse(csv).data).toEqual([]);
  });
  it('keeps the column order and formats times and booleans', () => {
    const csv = buildReportCsv('guests', [
      { employee_id: 'E1', full_name: 'Ayu', outlet: 'A', department: null, opened: false },
    ]);
    const row = parse(csv).data[0];
    expect(Object.keys(row)).toEqual(REPORTS.guests.cols.map((c) => c.header));
    expect(row['Opened invitation']).toBe('no');
    expect(row.Department).toBe('');

    const g = buildReportCsv('check-ins', [
      { checked_in_at: '2026-12-10T01:30:00Z', prize_number: 7, employee_id: 'E1', full_name: 'Ayu', outlet: 'A', department: 'FOH', method: 'scan', station: 'Meja 1', actor: 'checkin' },
    ]);
    expect(parse(g).data[0].Time).toBe('2026-12-10 09:30:00');
    expect(parse(g).data[0]['Door Prize no.']).toBe('7');
  });
  it('neutralises spreadsheet formulas in every text cell', () => {
    const csv = buildReportCsv('guests', [
      { employee_id: '=1+1', full_name: '@SUM(A1)', outlet: '-cmd', department: '+x', position: '\tTab', category: null, opened: true, checked_in_at: null, prize_number: null, merchandise: '', walk_in: false, active: true },
    ]);
    const row = parse(csv).data[0];
    expect(row['Employee ID']).toBe("'=1+1");
    expect(row.Name).toBe("'@SUM(A1)");
    expect(row.Outlet).toBe("'-cmd");
    expect(row.Department).toBe("'+x");
    expect(row.Position).toBe("'\tTab");
  });
  it('writes the audit details as text', () => {
    const csv = buildReportCsv('audit', [
      { at: '2026-12-10T01:00:00Z', actor_type: 'admin', actor: 'hr@example.com', action: 'draw_void_admin', entity: 'draw', entity_id: 'x', details: '{"reason":"wrong person"}' },
    ]);
    expect(parse(csv).data[0].Details).toBe('{"reason":"wrong person"}');
  });
});

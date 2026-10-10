import { describe, expect, it } from 'vitest';
import { MAX_ROWS, prepareImport } from '@/lib/import';

describe('prepareImport', () => {
  it('accepts a good file and keeps row numbers', () => {
    const p = prepareImport('Employee ID,Nama,Outlet,No HP\nE1,Ayu,Outlet A,0812-3456-7001\nE2,Bagus,Outlet B,\n');
    expect(p.status).toBe('OK');
    if (p.status !== 'OK') return;
    expect(p.rows.map((r) => [r.row_no, r.employee_id, r.phone ?? null])).toEqual([[2, 'E1', '+6281234567001'], [3, 'E2', null]]);
    expect(p.parseErrors).toEqual([]);
  });
  it('reports missing required columns', () => {
    expect(prepareImport('a,b\n1,2\n')).toMatchObject({ status: 'BAD_COLUMNS', missingColumns: ['employee_id', 'full_name', 'outlet'] });
  });
  it('treats a header-only file as empty', () => {
    expect(prepareImport('employee_id,full_name,outlet\n').status).toBe('EMPTY');
  });
  it('rejects oversized files', () => {
    const body = Array.from({ length: MAX_ROWS + 1 }, (_, i) => `E${i},N${i},O`).join('\n');
    expect(prepareImport(`employee_id,full_name,outlet\n${body}\n`).status).toBe('TOO_MANY');
  });
  it('keeps invalid phones as row errors instead of failing the file', () => {
    const p = prepareImport('employee_id,full_name,outlet,phone\nE1,Ayu,O,123\n');
    expect(p.status).toBe('OK');
    if (p.status === 'OK') expect(p.parseErrors).toEqual([{ row: 2, field: 'phone', code: 'INVALID_PHONE' }]);
  });
});

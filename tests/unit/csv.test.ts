import { describe, it, expect } from 'vitest';
import { parseGuestCsv, csvSafe } from '@/lib/csv';

describe('parseGuestCsv', () => {
  it('maps aliased headers, trims, strips a BOM and numbers rows from the file line', () => {
    const text = '﻿NIK,Nama,Outlet,Jabatan,No HP\n 00123 , Kadek Ayu ,Outlet A,Server,0812-3456-7890\nE2,Made,Outlet B,,\n';
    const r = parseGuestCsv(text);
    expect(r.missingColumns).toEqual([]);
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { row_no: 2, employee_id: '00123', full_name: 'Kadek Ayu', outlet: 'Outlet A', position: 'Server', phone: '+6281234567890' },
      { row_no: 3, employee_id: 'E2', full_name: 'Made', outlet: 'Outlet B' },
    ]);
  });
  it('keeps leading zeros in employee ids', () => {
    expect(parseGuestCsv('employee_id,full_name,outlet\n007,A,B').rows[0].employee_id).toBe('007');
  });
  it('reports missing required columns', () => {
    expect(parseGuestCsv('employee_id,full_name\nE1,A').missingColumns).toEqual(['outlet']);
  });
  it('reports an invalid phone but keeps the row', () => {
    const r = parseGuestCsv('employee_id,full_name,outlet,phone\nE1,A,B,abc');
    expect(r.errors).toEqual([{ row: 2, field: 'phone', code: 'INVALID_PHONE' }]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].phone).toBeUndefined();
  });
  it('skips blank lines', () => {
    expect(parseGuestCsv('employee_id,full_name,outlet\n\nE1,A,B\n\n').rows).toHaveLength(1);
  });
  it('returns no rows for an empty file', () => {
    expect(parseGuestCsv('').rows).toEqual([]);
  });
});

describe('csvSafe', () => {
  it.each([['=SUM(A1)', "'=SUM(A1)"], ['+1', "'+1"], ['-1', "'-1"], ['@cmd', "'@cmd"], ['plain', 'plain'], ['', '']])(
    'neutralises formula starts: %j',
    (cell, expected) => expect(csvSafe(cell)).toBe(expected),
  );
});

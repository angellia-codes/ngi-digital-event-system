import { describe, expect, it } from 'vitest';
import { describeImportError, randomPin, ROLE_NAME } from '@/lib/admin-text';

describe('describeImportError', () => {
  it('names the row, the column and the problem', () => {
    expect(describeImportError({ row: 5, field: 'employee_id', code: 'DUPLICATE_IN_FILE' })).toBe('Row 5, employee_id: appears more than once in the file');
    expect(describeImportError({ row: 2, field: 'phone', code: 'INVALID_PHONE' })).toBe('Row 2, phone: is not a valid Indonesian phone number');
  });
  it('omits the column when the error is about the whole row', () => {
    expect(describeImportError({ row: 7, field: '', code: 'MALFORMED_ROW' })).toBe('Row 7: could not be read');
  });
  it('falls back to the raw code for an unknown error', () => {
    expect(describeImportError({ row: 3, field: 'outlet', code: 'SOMETHING_NEW' })).toBe('Row 3, outlet: SOMETHING_NEW');
  });
});

describe('randomPin', () => {
  it('is always six digits, leading zeros included', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const p = randomPin();
      expect(p).toMatch(/^\d{6}$/);
      seen.add(p);
    }
    expect(seen.size).toBeGreaterThan(250);
  });
});

describe('ROLE_NAME', () => {
  it('names every role', () => {
    expect(Object.keys(ROLE_NAME).sort()).toEqual(['admin', 'checkin', 'draw', 'merchandise', 'prizes']);
  });
});

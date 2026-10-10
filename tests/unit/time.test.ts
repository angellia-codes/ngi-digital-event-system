import { describe, it, expect } from 'vitest';
import { formatTimeWita, formatDateLong } from '@/lib/time';

describe('time', () => {
  it('shows WITA (UTC+8) in 24-hour format', () => {
    expect(formatTimeWita('2026-12-10T09:42:00Z')).toBe('17:42');
    expect(formatTimeWita('2026-12-10T16:05:00Z')).toBe('00:05');
  });
  it('formats the event date in both languages', () => {
    expect(formatDateLong('2026-12-10', 'id')).toMatch(/Kamis,? 10 Desember 2026/);
    expect(formatDateLong('2026-12-10', 'en')).toMatch(/Thursday,? 10 December 2026/);
  });
});

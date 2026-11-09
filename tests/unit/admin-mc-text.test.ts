import { describe, expect, it } from 'vitest';
import { describeRundown, parseTime } from '@/lib/admin-mc-text';

describe('describeRundown', () => {
  it('explains each status', () => {
    expect(describeRundown('LOCKED')).toMatch(/finished/);
    expect(describeRundown('HAS_RUNS')).toMatch(/cannot be deleted/);
    expect(describeRundown('REASON_REQUIRED')).toMatch(/5 characters/);
    expect(describeRundown('SOMETHING_ELSE')).toBe('Could not save. Try again.');
  });
  it('names the taken prize', () => {
    expect(describeRundown('PRIZE_TAKEN', 'TV')).toBe('“TV” already belongs to another segment.');
    expect(describeRundown('PRIZE_TAKEN')).toMatch(/another segment/);
  });
});

describe('parseTime', () => {
  it('accepts HH:MM and pads the hour', () => {
    expect(parseTime('17:05')).toBe('17:05');
    expect(parseTime(' 9:30 ')).toBe('09:30');
  });
  it('refuses anything else', () => {
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('17:60')).toBeNull();
    expect(parseTime('1705')).toBeNull();
    expect(parseTime('')).toBeNull();
  });
});

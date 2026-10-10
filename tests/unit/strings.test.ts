import { describe, it, expect } from 'vitest';
import { STRINGS, translate, type StringKey } from '@/lib/i18n/strings';

const keys = Object.keys(STRINGS.id) as StringKey[];
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('strings', () => {
  it('has the same keys in both languages', () => {
    expect(Object.keys(STRINGS.en).sort()).toEqual([...keys].sort());
  });
  it('has no empty strings', () => {
    for (const k of keys) {
      expect(STRINGS.id[k].trim(), `id ${k}`).not.toBe('');
      expect(STRINGS.en[k].trim(), `en ${k}`).not.toBe('');
    }
  });
  it('uses the same placeholders in both languages', () => {
    for (const k of keys) expect(placeholders(STRINGS.en[k]), k).toEqual(placeholders(STRINGS.id[k]));
  });
  it('fills placeholders', () => {
    expect(translate('id', 'pass.checked_in_at', { time: '17:42' })).toBe('CHECK-IN 17:42');
    expect(translate('en', 'pass.checked_in_at', { time: '17:42' })).toBe('CHECKED IN 17:42');
  });
});

import { describe, it, expect } from 'vitest';
import { normalisePhone } from '@/lib/phone';

describe('normalisePhone', () => {
  it.each([
    ['0812-3456-7890', '+6281234567890'],
    ['+62 812 3456 7890', '+6281234567890'],
    ['6281234567890', '+6281234567890'],
    ['81234567890', '+6281234567890'],
    ['(0361) 123456', '+62361123456'],
    ['  0812 3456 789  ', '+628123456789'],
  ])('normalises %j', (raw, expected) => {
    expect(normalisePhone(raw)).toEqual({ ok: true, value: expected });
  });
  it.each([[''], ['   '], [null], [undefined]])('treats %j as no phone', (raw) => {
    expect(normalisePhone(raw)).toEqual({ ok: true, value: null });
  });
  it.each([['abc'], ['+1 415 555 2671'], ['08'], ['+8123456789'], ['0812345678901234567']])('rejects %j', (raw) => {
    expect(normalisePhone(raw)).toEqual({ ok: false });
  });
});

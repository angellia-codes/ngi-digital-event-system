import { describe, it, expect } from 'vitest';
import { parseCode, payloadFor, isToken, PREFIX } from '@/lib/qr';
import { qrPath } from '@/lib/qr-svg';

const TOKEN = 'AbCdEfGhIjKlMnOpQrSt_-';

describe('parseCode', () => {
  it('reads a check-in code', () => {
    expect(parseCode(PREFIX.checkin + TOKEN)).toEqual({ kind: 'checkin', token: TOKEN });
  });
  it('reads a merchandise code and tolerates surrounding whitespace', () => {
    expect(parseCode(`  ${PREFIX.merch}${TOKEN}\n`)).toEqual({ kind: 'merch', token: TOKEN });
  });
  it.each(['', 'hello', TOKEN, 'NF:CI:short', 'NF:XX:' + TOKEN, 'NF:CI:' + TOKEN + 'x', 'NF:CI:' + TOKEN.replace('_', '!')])(
    'rejects %j',
    (raw) => expect(parseCode(raw)).toEqual({ kind: 'unknown' }),
  );
  it('round-trips payloadFor', () => {
    expect(parseCode(payloadFor('merch', TOKEN))).toEqual({ kind: 'merch', token: TOKEN });
  });
  it('isToken checks length and alphabet', () => {
    expect(isToken(TOKEN)).toBe(true);
    expect(isToken(TOKEN.slice(1))).toBe(false);
  });
});

describe('qrPath', () => {
  const { size, modules, d } = qrPath(payloadFor('checkin', TOKEN));
  it('uses a version 3 symbol for a 28-character payload at level M', () => {
    expect(modules).toBe(29);
  });
  it('adds a quiet zone of 4 modules on every side', () => {
    expect(size).toBe(modules + 8);
    expect(qrPath(payloadFor('checkin', TOKEN), 6).size).toBe(modules + 12);
  });
  it('draws dark modules only inside the symbol', () => {
    const coords = [...d.matchAll(/M(\d+) (\d+)h(\d+)v1/g)].map((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
    expect(coords.length).toBeGreaterThan(50);
    for (const [x, y, run] of coords) {
      expect(x).toBeGreaterThanOrEqual(4);
      expect(y).toBeGreaterThanOrEqual(4);
      expect(x + run).toBeLessThanOrEqual(modules + 4);
      expect(y).toBeLessThan(modules + 4);
    }
  });
  it('is deterministic', () => {
    expect(qrPath(payloadFor('checkin', TOKEN)).d).toBe(d);
  });
});

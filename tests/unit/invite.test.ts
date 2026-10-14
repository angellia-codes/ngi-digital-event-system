import { describe, expect, it } from 'vitest';
import { buildIcs, googleCalendarUrl } from '@/lib/invite/calendar';
import { isMapsUrl } from '@/lib/invite/maps';
import { decideStart } from '@/lib/invite/play';
import { countdownParts, witaDate } from '@/lib/invite/time';

const base = { checkedIn: false, todayWita: '2026-12-01', eventDate: '2026-12-10', seen: false, storageOk: true };

describe('decideStart', () => {
  it('plays on first open', () => expect(decideStart(base)).toBe('invitation'));
  it('skips when checked in', () => expect(decideStart({ ...base, checkedIn: true })).toBe('pass'));
  it('skips on and after event day', () => {
    expect(decideStart({ ...base, todayWita: '2026-12-10' })).toBe('pass');
    expect(decideStart({ ...base, todayWita: '2026-12-11' })).toBe('pass');
  });
  it('skips when seen', () => expect(decideStart({ ...base, seen: true })).toBe('pass'));
  it('plays when storage blocked', () => expect(decideStart({ ...base, seen: true, storageOk: false })).toBe('invitation'));
});

describe('time', () => {
  it('witaDate rolls over at 16:00 UTC', () => {
    expect(witaDate(Date.parse('2026-12-09T15:59:00Z'))).toBe('2026-12-09');
    expect(witaDate(Date.parse('2026-12-09T16:00:00Z'))).toBe('2026-12-10');
  });
  it('countdownParts', () => {
    const t = Date.parse('2026-12-10T09:00:00Z');
    expect(countdownParts(t, t - (2 * 86400 + 3 * 3600 + 4 * 60 + 30) * 1000)).toEqual({ days: 2, hours: 3, mins: 4, done: false });
    expect(countdownParts(t, t).done).toBe(true);
    expect(countdownParts(t, t + 1).done).toBe(true);
  });
});

const cal = {
  title: 'NourishFest 2026', startMs: Date.parse('2026-12-10T09:00:00Z'), endMs: Date.parse('2026-12-10T15:00:00Z'),
  location: 'Hall A, Denpasar', details: 'Gates 17:00; link https://x.test/pass/abc', uid: 'abc@nourishfest',
};
describe('calendar', () => {
  it('google url uses UTC and encodes', () => {
    const u = googleCalendarUrl(cal);
    expect(u).toContain('dates=20261210T090000Z%2F20261210T150000Z');
    expect(u).toContain('location=Hall+A%2C+Denpasar');
  });
  it('ics has CRLF, UTC, uid and escapes , ;', () => {
    const s = buildIcs(cal);
    expect(s).toContain('\r\nDTSTART:20261210T090000Z\r\n');
    expect(s).toContain('UID:abc@nourishfest');
    expect(s).toContain('LOCATION:Hall A\\, Denpasar');
    expect(s).toContain('Gates 17:00\\; link');
    expect(s.replace(/\r\n/g, '').includes('\n')).toBe(false);
  });
});

describe('isMapsUrl', () => {
  it.each([
    'https://www.google.com/maps/place/x', 'https://google.com/maps?q=x', 'https://maps.google.com/?q=x',
    'https://maps.app.goo.gl/abc', 'https://goo.gl/maps/abc',
  ])('accepts %s', (u) => expect(isMapsUrl(u)).toBe(true));
  it.each([
    'http://www.google.com/maps', 'https://evil.com/maps', 'https://www.google.com/search?q=maps',
    'https://google.com.evil.com/maps', 'not a url', 'https://goo.gl/abc',
  ])('rejects %s', (u) => expect(isMapsUrl(u)).toBe(false));
});

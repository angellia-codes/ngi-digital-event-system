import { describe, it, expect } from 'vitest';
import { sameOrigin, parseCookies, ipFromHeader, ok, fail, guard } from '@/lib/api';
import { RetryableError } from '@/lib/db';

const req = (headers: Record<string, string>, url = 'https://nourishfest.example/api/x') => new Request(url, { method: 'POST', headers });

describe('sameOrigin', () => {
  it('accepts a matching Origin', () => expect(sameOrigin(req({ origin: 'https://nourishfest.example' }))).toBe(true));
  it('rejects a different Origin', () => expect(sameOrigin(req({ origin: 'https://evil.example' }))).toBe(false));
  it('rejects a missing Origin', () => expect(sameOrigin(req({}))).toBe(false));
});

describe('parseCookies', () => {
  it('parses and decodes', () => {
    expect(parseCookies('a=1; b=hello%20world; c=')).toEqual({ a: '1', b: 'hello world', c: '' });
  });
  it('handles null and malformed input', () => {
    expect(parseCookies(null)).toEqual({});
    expect(parseCookies('novalue; x=%E0%A4%A')).toEqual({ x: '%E0%A4%A' });
  });
});

describe('ipFromHeader', () => {
  it('takes the first address', () => expect(ipFromHeader('1.2.3.4, 10.0.0.1')).toBe('1.2.3.4'));
  it('falls back to unknown', () => expect(ipFromHeader(null)).toBe('unknown'));
});

describe('responses', () => {
  it('ok() is HTTP 200 with the contract shape and no-store', async () => {
    const res = ok('DONE', { a: 1 });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ ok: true, status: 'DONE', data: { a: 1 } });
  });
  it('fail() carries the HTTP code', async () => {
    const res = fail(403, 'WRONG_ROLE');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, status: 'WRONG_ROLE' });
  });
  it('guard() turns a RetryableError into a 500 RETRYABLE_ERROR', async () => {
    const res = await guard(async () => { throw new RetryableError('boom'); })(new Request('http://x'), undefined);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, status: 'RETRYABLE_ERROR' });
  });
});

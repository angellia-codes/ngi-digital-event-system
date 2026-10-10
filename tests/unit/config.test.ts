import { describe, it, expect } from 'vitest';
import config from '../../next.config';

type Rule = { source: string; headers: { key: string; value: string }[] };
const rules = async () => (await config.headers!()) as Rule[];
const headersFor = (rs: Rule[], source: string) =>
  Object.fromEntries(rs.find((r) => r.source === source)!.headers.map((h) => [h.key, h.value]));

describe('next.config headers', () => {
  it('sets no-referrer, noindex and nosniff on every route', async () => {
    const h = headersFor(await rules(), '/:path*');
    expect(h['Referrer-Policy']).toBe('no-referrer');
    expect(h['X-Robots-Tag']).toBe('noindex, nofollow');
    expect(h['X-Content-Type-Options']).toBe('nosniff');
  });

  it.each(['/api/:path*', '/pass/:path*', '/station/:path*', '/admin/:path*'])(
    'disables caching on %s',
    async (source) => {
      expect(headersFor(await rules(), source)['Cache-Control']).toBe('no-store');
    },
  );
});

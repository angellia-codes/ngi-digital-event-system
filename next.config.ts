import type { NextConfig } from 'next';

const common = [
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
];
const noStore = [{ key: 'Cache-Control', value: 'no-store' }];

const config: NextConfig = {
  async headers() {
    return [
      { source: '/:path*', headers: common },
      { source: '/api/:path*', headers: noStore },
      { source: '/pass/:path*', headers: noStore },
      { source: '/station/:path*', headers: noStore },
      { source: '/admin/:path*', headers: noStore },
    ];
  },
};

export default config;

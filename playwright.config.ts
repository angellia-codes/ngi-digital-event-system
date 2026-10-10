import { defineConfig } from '@playwright/test';

process.loadEnvFile('.env.test'); // Node 20.12 or newer

export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1, // one shared local database
  timeout: 60_000,
  expect: { timeout: 20_000 }, // the database is remote, so a single call can take several seconds
  use: {
    baseURL: 'http://localhost:3000',
    viewport: { width: 360, height: 780 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'id-ID',
    timezoneId: 'Asia/Makassar',
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: {
    command: process.env.E2E_NO_BUILD ? 'npm run start' : 'npm run build && npm run start', // production build: next dev compiles on demand, which made navigations flaky against the remote database
    url: 'http://localhost:3000',
    reuseExistingServer: false, // stop any running dev server first: the E2E flag is compiled in at start
    timeout: 900_000,
    env: { NEXT_PUBLIC_E2E: '1' },
  },
});

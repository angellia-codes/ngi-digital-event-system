import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Unit tests only: they never touch a database. The app has one Supabase project, the production one.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    env: { STATION_SESSION_SECRET: 'unit-test-secret-unit-test-secret-1234', EVENT_ID: '00000000-0000-4000-8000-000000000001', APP_URL: 'http://localhost:3000' },
    include: ['tests/unit/**/*.test.ts'],
  },
});

import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import path from 'node:path';

export default defineConfig(({ mode }) => ({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    env: loadEnv(mode === 'test' ? 'test' : mode, process.cwd(), ''),
    globalSetup: ['tests/api/global.ts'],
    fileParallelism: false, // API tests share one local database
    testTimeout: 120_000, // API tests hit the remote dev project, not a local database
    include: ['tests/unit/**/*.test.ts', 'tests/api/**/*.test.ts'],
  },
}));

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertTestEnv } from '../../scripts/guard-test-env.mjs';

const env = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `${k}=${v}`).join('\n');
const PROD = { SUPABASE_URL: 'https://prodprodprod.supabase.co', EVENT_ID: '11111111-1111-4111-8111-111111111111' };
const TEST = {
  SUPABASE_URL: 'https://testtesttest.supabase.co', SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 's', STATION_SESSION_SECRET: 'x',
  EVENT_ID: '00000000-0000-4000-8000-000000000001', APP_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://postgres.testtesttest:pw@pooler.example:5432/postgres',
};

let dir: string;
const cwd = process.cwd();
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nf-guard-')); process.chdir(dir); });
afterEach(() => { process.chdir(cwd); fs.rmSync(dir, { recursive: true, force: true }); });
const write = (test: Record<string, string>, prod: Record<string, string> = PROD) => {
  fs.writeFileSync('.env.test', env(test));
  fs.writeFileSync('.env.local', env(prod));
};

describe('assertTestEnv', () => {
  it('accepts a separate, fully filled test project', () => {
    write(TEST);
    expect(() => assertTestEnv()).not.toThrow();
  });
  it('refuses when a value is empty or missing', () => {
    write({ ...TEST, SUPABASE_SERVICE_ROLE_KEY: '' });
    expect(() => assertTestEnv()).toThrow(/missing: SUPABASE_SERVICE_ROLE_KEY/);
    fs.rmSync('.env.test');
    expect(() => assertTestEnv()).toThrow(/missing/);
  });
  it('refuses when SUPABASE_URL is the production project', () => {
    write({ ...TEST, SUPABASE_URL: PROD.SUPABASE_URL });
    expect(() => assertTestEnv()).toThrow(/production project/);
  });
  it('refuses when only DATABASE_URL points at production', () => {
    write({ ...TEST, DATABASE_URL: 'postgresql://postgres.prodprodprod:pw@pooler.example:5432/postgres' });
    expect(() => assertTestEnv()).toThrow(/production project/);
  });
  it('refuses the production event id', () => {
    write({ ...TEST, EVENT_ID: PROD.EVENT_ID });
    expect(() => assertTestEnv()).toThrow(/production EVENT_ID/);
  });
});

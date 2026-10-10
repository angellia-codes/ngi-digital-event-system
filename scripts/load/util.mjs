import { assertTestEnv } from '../guard-test-env.mjs';
assertTestEnv();
export const BASE = process.env.APP_URL ?? 'http://localhost:3000';

/** Runs fn over items with at most `size` in flight. */
export async function runPool(items, size, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

export const percentile = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] ?? 0;
};

export function finish(name, checks) {
  let failed = false;
  for (const [label, pass, detail] of checks) {
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}  ${detail ?? ''}`);
    failed ||= !pass;
  }
  console.log(failed ? `\n${name}: FAILED` : `\n${name}: all checks passed`);
  process.exit(failed ? 1 : 0);
}

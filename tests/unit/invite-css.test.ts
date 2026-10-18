import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BEAT_MS } from '@/lib/invite/motion';

const css = readFileSync(path.resolve(__dirname, '../../src/styles/invite.css'), 'utf8');
const keyframes = [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)].map((m) => ({ name: m[1], body: m[2] }));
const ALLOWED = new Set(['transform', 'opacity', 'animation-timing-function']);

describe('invite.css motion rules', () => {
  it('declares the same beat as motion.ts', () => {
    expect(css).toContain(`--beat: ${BEAT_MS}ms`);
  });
  it('has keyframes to check', () => expect(keyframes.length).toBeGreaterThan(20));
  it('prefixes every keyframe with inv-', () => {
    for (const k of keyframes) expect(k.name, k.name).toMatch(/^inv-/);
  });
  it('animates transform and opacity only', () => {
    for (const k of keyframes) {
      const props = [...k.body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
      for (const p of props) expect(ALLOWED.has(p), `${k.name} animates ${p}`).toBe(true);
    }
  });
  it('drops the removed loops', () => {
    for (const name of ['sway', 'wobble', 'hue', 'bob', 'lcd-glow']) {
      expect(css).not.toMatch(new RegExp(`@keyframes\\s+(inv-)?${name}\\b`));
    }
  });
  it('no longer pins scenes to a screen height', () => expect(css).not.toContain('88dvh'));
  it('hides before-states only for phones that allow motion', () => {
    const at = css.indexOf('.scene:not(.is-in) .m');
    expect(at).toBeGreaterThan(-1);
    expect(css.lastIndexOf('@media (prefers-reduced-motion: no-preference)', at)).toBeGreaterThan(-1);
    expect(css).not.toContain('transform: none !important');
  });
  it('defines the exit and stage-end keyframes the components listen for', () => {
    const names = keyframes.map((k) => k.name);
    expect(names).toContain('inv-leave');
    expect(names).toContain('inv-stage-out');
  });
});

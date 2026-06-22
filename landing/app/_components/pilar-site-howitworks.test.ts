import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// pilar/site R2 — the homepage "How it works" section now explains the actual
// mechanism (classify → route → learn) instead of repeating the hero pitch
// verbatim. These assertions lock the dedupe so the duplication can't creep back.
const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
const count = (s: string, sub: string) => s.split(sub).length - 1;

describe('pilar/site R2 — landing How it works', () => {
  const src = read('app/page.tsx');

  it('lists the 3-step mechanism (classify → route → learn)', () => {
    expect(src).toContain('1 · Classify');
    expect(src).toContain('2 · Route');
    expect(src).toContain('3 · Learn');
  });

  it('no longer repeats the hero pitch (each pitch line appears exactly once)', () => {
    // Both lines used to appear twice (hero + a verbatim "How it works" copy).
    expect(count(src, 'already paying for a powerful AI stack')).toBe(1);
    expect(count(src, 'vibe coder on a Max plan')).toBe(1);
  });

  it('keeps the honest hero metric and benchmark link intact', () => {
    expect(src).toContain('47% saved vs all-Opus');
    expect(src).toContain('href="/methodology"');
  });
});

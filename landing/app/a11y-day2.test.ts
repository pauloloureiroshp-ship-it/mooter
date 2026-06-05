// Wave 16-18 Day 2, Tier A — accessibility fixes (focus visibility + muted
// contrast + privacy link). Source-level guards + a real WCAG contrast check.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');
const GLOBALS = read('globals.css');
const PRIVACY = read('(marketing)/privacy/page.tsx');

// WCAG relative-luminance + contrast (sRGB linearized) — the correct formula.
function luminance(hex: string): number {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

describe('A1 — focus visibility (WCAG 2.4.7)', () => {
  it('globals.css defines a :focus-visible outline', () => {
    expect(GLOBALS).toContain(':focus-visible');
    expect(GLOBALS).toMatch(/:focus-visible\s*\{[\s\S]*?outline:/);
  });
});

describe('A2 — muted text contrast meets WCAG AA for normal text', () => {
  it('--color-muted (landing) is the lightened value', () => {
    expect(GLOBALS).toContain('--color-muted:       #8A8076');
    expect(GLOBALS).not.toContain('--color-muted:       #7A7168');
  });
  it('dark-scope --muted (signed-in pages) is lightened too', () => {
    expect(GLOBALS).not.toMatch(/--muted:\s*#7A7168/); // old value gone from dark scope
  });
  it('#8A8076 on #0B0A09 is ≥ 4.5:1 (AA normal text)', () => {
    expect(contrast('#8A8076', '#0B0A09')).toBeGreaterThanOrEqual(4.5);
  });
  it('regression guard: the old #7A7168 really did fail AA normal', () => {
    expect(contrast('#7A7168', '#0B0A09')).toBeLessThan(4.5);
  });
});

describe('A3 — broken /privacy security link removed', () => {
  it('the "security policy" link is gone', () => {
    expect(PRIVACY).not.toContain('Read the security policy');
  });
});

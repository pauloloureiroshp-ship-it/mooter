import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Wave 10 Phase B.2a — quick wins (#7, #11, #15).
// Source-level assertions (no React testing library in this suite by design,
// see vitest.config.ts) confirming copy/disclaimer fixes are present.
const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('B.2a quick wins', () => {
  it('#7 hero statusline mock carries an illustrative disclaimer', () => {
    const src = read('app/_components/HeroTerminal.tsx');
    expect(src).toContain('*illustrative — your numbers vary');
    // disclaimer sits next to the StatuslineCard mock
    const idxCard = src.indexOf('StatuslineCard');
    const idxNote = src.indexOf('*illustrative');
    expect(idxNote).toBeGreaterThan(idxCard);
  });

  it('#11 footer Product link reads "Packs" (not "Pack browser")', () => {
    const src = read('components/Footer.tsx');
    expect(src).not.toContain('Pack browser');
    expect(src).toContain("label: 'Packs'");
  });

  it('#15 footer signing is honest single-founder attribution, not bare "contributors"', () => {
    // Wave 33.7 — single-founder MIT framing supersedes the earlier "& the
    // mooter community" line (there is one founder, Paulo). Still never the
    // bare "& contributors" form.
    const src = read('components/Footer.tsx');
    expect(src).toContain('Crafted by Paulo Loureiro');
    expect(src).not.toMatch(/by Paulo Loureiro &amp; contributors/);
  });
});

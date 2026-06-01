import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Wave 10 Phase B.2c — install honest-fix (#5), setup mapping/Gemini (#6),
// mobile hero (#9). Source-level assertions (no React testing library; see
// vitest.config.ts), matching the B.2a pattern.
const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('B.2c install + setup + mobile', () => {
  it('#5 /install drops the misleading "phone home" loop for an illustrative line', () => {
    const src = read('app/(marketing)/install/page.tsx');
    expect(src).not.toContain('Waiting for mooter to phone home');
    expect(src).toContain('*illustrative');
  });

  it('#6 dashboard surfaces a Google Gemini tile in the AI stack', () => {
    const src = read('app/(app)/dashboard/page.tsx');
    expect(src).toContain('const hasGemini');
    expect(src).toContain('<GeminiLogo />');
    expect(src).toContain('Google Gemini');
  });

  it('#9 hero H1 has a ≤480px responsive rule', () => {
    const src = read('app/page.tsx');
    expect(src).toContain('max-width: 480px');
    expect(src).toMatch(/\.hero-h1\{[^}]*font-size/);
  });
});

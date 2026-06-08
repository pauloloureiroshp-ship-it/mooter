import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Wave 11 PR-A — honest hero copy (D1-1) + OAuth-error banner (D2-4).
const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('Wave 11 PR-A landing', () => {
  it('D1-1 hero drops banned "Same results", uses honest real numbers, cites the benchmark', () => {
    // Wave 33.7 — the old "up to 90% less cost on T0-heavy sessions" claim was
    // replaced with the author's real measured number (47% across 658 calls),
    // transparently caveated as one machine, not a community average. The
    // "Same results" over-claim stays banned.
    const src = read('app/page.tsx');
    expect(src).not.toContain('Same results');
    expect(src).not.toContain('up to 90% less cost');
    expect(src).toContain('47% saved vs all-Opus');
    expect(src).toContain('not a community average');
    expect(src).toContain('href="/methodology"');
  });

  it('D2-4 homepage surfaces an auth-error banner', () => {
    const page = read('app/page.tsx');
    expect(page).toContain('<AuthErrorBanner />');
    const banner = read('app/_components/AuthErrorBanner.tsx');
    expect(banner).toContain("get('auth') === 'error'");
    expect(banner).toContain('No account was created');
  });
});

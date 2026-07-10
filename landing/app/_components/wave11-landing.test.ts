import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { M } from '../lib/canonical-metrics';

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
    // Wave 2.1 — the number now derives from the single canonical source (lib/canonical-metrics.ts)
    // instead of a hardcoded literal. Assert the wiring + that the canonical value is still the honest 47%.
    expect(M.savedPct).toBe('47%');
    expect(M.routedCalls).toBe('658');
    expect(src).toContain('canonical-metrics');
    expect(src).toContain('saved vs all-Opus');
    expect(src).toContain('not a community average');
    expect(src).toContain('href="/methodology"');
  });

  it('banned "Same results" claim is absent from the OG image + PWA manifest', () => {
    // Wave 60 — the honesty guard previously only covered the hero; the banned
    // over-claim was still live in the social card + install metadata. Keep both
    // honest ("comparable quality on routine tasks") so it can't regress.
    expect(read('app/api/og/route.tsx')).not.toContain('Same results');
    expect(read('app/manifest.ts')).not.toContain('Same results');
  });

  it('D2-4 homepage surfaces an auth-error banner', () => {
    const page = read('app/page.tsx');
    expect(page).toContain('<AuthErrorBanner />');
    const banner = read('app/_components/AuthErrorBanner.tsx');
    expect(banner).toContain("get('auth') === 'error'");
    expect(banner).toContain('No account was created');
  });
});

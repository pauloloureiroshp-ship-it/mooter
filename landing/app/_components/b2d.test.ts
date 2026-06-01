import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Wave 10 Phase B.2d — page audits: methodology reproducibility (#12),
// compare new-feature rows (#13). #14 /packs needed no change (7 packs,
// functional filters). Source-level assertions, B.2a pattern.
const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('B.2d page audits', () => {
  it('#12 methodology has a reproducibility section pointing at the real repo benchmark', () => {
    const src = read('app/(marketing)/methodology/page.tsx');
    expect(src).toContain('Reproduce it yourself');
    expect(src).toContain('wave1-benchmark');
    // honest small-sample caveat, no fabricated --reproduce flag
    expect(src).toContain('N=34');
    expect(src).not.toContain('--reproduce');
  });

  it('#13 compare surfaces the Wave 10 Phase A features as mooter-only rows', () => {
    const src = read('app/(marketing)/compare/page.tsx');
    expect(src).toContain('Per-bash tool badge');
    expect(src).toContain('Sparkline (last-10 tier mix)');
    expect(src).toContain('End-of-session digest');
  });
});

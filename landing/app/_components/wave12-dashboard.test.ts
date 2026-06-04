import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Wave 12 PR-H (D7) — dashboard "Savings depth": D7-2 all-Opus comparison is
// real; D7-1 (per-task-type) + D7-3 (misroute) are honest placeholders (no
// fabricated per-category data until the telemetry pipeline ships).
const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
const DASH = 'app/(app)/dashboard/page.tsx';

describe('Wave 12 PR-H — dashboard savings depth (D7)', () => {
  it('has a Savings depth section with the all-Opus comparison (real, in-scope vars)', () => {
    const s = read(DASH);
    expect(s).toContain('Savings depth');
    expect(s).toContain('all-Opus would cost');
    expect(s).toContain('you actually paid (est.)');
  });
  it('per-task-type + misroute are honest placeholders (no fabricated numbers)', () => {
    const s = read(DASH);
    expect(s).toContain('Per-task-type savings');
    expect(s).toContain('Misroute report');
    // Wave 14 Day 1 reworded the honesty note to an actionable `mooter trail` CTA.
    expect(s).toMatch(/no fabricated numbers/);
  });
});

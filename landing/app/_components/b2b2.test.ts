import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Wave 10 Phase B.2b.2 — signed-in polish (F-7, F-9, F-10, F-11, F-12).
// Source-level assertions, matching the B.2a/b/c/d pattern.
const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('B.2b.2 signed-in polish', () => {
  it('F-7 dashboard nudges users to re-sync when telemetry is stale (Wave 14 F-2)', () => {
    const src = read('app/(app)/dashboard/page.tsx');
    expect(src).toContain('syncStale');
    expect(src).toContain('Last sync was');
    expect(src).toContain('mooter sync');
    // The stale "newer major is out" nag was removed in Wave 14 Day 1.
    expect(src).not.toContain('a newer major is out');
  });

  it('F-9 recommendations confirm an optimised setup instead of vanishing silently', () => {
    const src = read('app/(app)/dashboard/page.tsx');
    expect(src).toContain('Your setup is optimised');
    expect(src).toContain('ollama ls');
  });

  it('F-10 settings carries the CLI-managed disclaimer (no stale Wave-4 promise)', () => {
    const src = read('app/(app)/settings/page.tsx');
    expect(src).toContain('mooter quiet --help');
    // Wave 14 Day 1 stripped the unshipped "Wave 4 Phase D" cloud-edit promise.
    expect(src).not.toContain('Wave 4 Phase D');
  });

  it('F-11 admin Recent Activity rows expose an absolute-time tooltip', () => {
    const src = read('app/(app)/admin/page.tsx');
    expect(src).toMatch(/title=\{a\.timestamp/);
  });

  it('F-12 app sidebar humanizes os_type (win32 → Windows)', () => {
    const src = read('app/(app)/layout.tsx');
    expect(src).toContain("if (os === 'win32') return 'Windows'");
    expect(src).toContain('osLabel(user.os_type)');
  });
});

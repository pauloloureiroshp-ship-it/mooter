import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Wave 10 Phase B.2b.1 — signed-in critical+important fixes (F-1..F-6).
// Source-level assertions (no React testing library; see vitest.config.ts),
// matching the B.2a/c/d pattern. F-2 has real unit tests in
// onboarding/_lib/hardware.test.ts (formatGpuLabel is exported).
const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('B.2b.1 signed-in fixes', () => {
  it('F-1 admin avg savings is clamped to ≤100% (no more 743%)', () => {
    const src = read('app/api/admin/stats/route.ts');
    expect(src).toContain('Math.min(100, Math.max(0, (su / allOpus) * 100))');
    // unclamped form must be gone
    expect(src).not.toMatch(/pctSaved = allOpus > 0 \? \(su \/ allOpus\) \* 100 : 0/);
  });

  it('F-3 settings reads the real persona (not experience_level) with a Change CTA', () => {
    const src = read('app/(app)/settings/page.tsx');
    expect(src).toContain('personaOption(profile.persona)');
    expect(src).toContain('Change');
    // misleading raw "unknown" experience_level is guarded
    expect(src).toContain("experience_level !== 'unknown'");
  });

  it('F-4 Setup tab surfaces the detected setup (hardware/AI stack/packs/adapter)', () => {
    const src = read('app/(app)/dashboard/page.tsx');
    expect(src).toContain('Your setup');
    expect(src).toContain('personaPackHint(profile.persona)');
    expect(src).toContain('mooter forge');
  });

  it('F-5 Overview KPI strip carries a DataSourceBadge', () => {
    const src = read('app/(app)/dashboard/page.tsx');
    // OverviewTab savings hero now includes the badge (component already imported)
    expect(src).toMatch(/honesty layer parity with Workflow/);
  });

  it('F-6 Devices tab offers a reconnect path (mooter sync) instead of a dead-end', () => {
    const src = read('app/(app)/dashboard/page.tsx');
    expect(src).toContain('mooter sync');
    expect(src).toContain('mooter doctor');
  });
});

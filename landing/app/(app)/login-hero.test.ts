// Wave 15 Day 1 (Friends-Launch) — LoginHero dark + stats reality + onboarding
// escape nav. Source-level assertions (the (app) shell + onboarding are big
// client components; landing vitest is node-env, no RTL — same pattern as
// dark-parity/brand-parity).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');
const LAYOUT = read('layout.tsx');
const ONBOARDING = read('../onboarding/page.tsx');

describe('F-A1 — LoginHero adopts the landing dark theme + reuses NavBar', () => {
  it('wrapper carries the dark scope and renders the shared NavBar', () => {
    // app-shell-root keeps the .login-hero grid CSS; app-shell-dark flips tokens dark.
    expect(LAYOUT).toContain('className="app-shell-root app-shell-dark"');
    expect(LAYOUT).toContain("import NavBar from '@/components/NavBar'");
    expect(LAYOUT).toMatch(/className="app-shell-root app-shell-dark"[\s\S]{0,200}<NavBar \/>/);
  });
});

describe('F-A2 — fabricated login stats are gone (Option A: removed)', () => {
  it('no seeded community stats / hook / InlineStat remain in the shell', () => {
    expect(LAYOUT).not.toContain('useLoginStats');
    expect(LAYOUT).not.toContain('InlineStat');
    expect(LAYOUT).not.toContain('1437');     // seeded prompt_count
    expect(LAYOUT).not.toContain('89.9');     // seeded savings_pct
    expect(LAYOUT).not.toContain('prompt_count');
  });
});

describe('F-A3 — onboarding has an escape nav (logo + skip link)', () => {
  it('header offers a Next <Link> back to the landing', () => {
    expect(ONBOARDING).toContain("import Link from 'next/link'");
    expect(ONBOARDING).toContain('← Skip for now');
    expect(ONBOARDING).toMatch(/<Link\s+href="\/"/);
    // not a raw <a> to a page (eslint no-html-link-for-pages)
    expect(ONBOARDING).not.toMatch(/<a href="\/"[^>]*>\s*<OnboardingMooterLogo/);
  });
});

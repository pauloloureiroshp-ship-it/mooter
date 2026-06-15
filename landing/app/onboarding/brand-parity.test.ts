// Wave 14 Day 3 (14B-A) — onboarding brand parity with the landing.
// The redesign is purely cosmetic (dark palette + hero impact card); these
// tests lock the visual contract AND guard that functionality did NOT change.
// Pure logic is imported; page/CSS wiring is asserted at the source level
// (same pattern as parity/b2b2 tests — landing vitest is node-env, no RTL).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { estimateMonthlySavings } from './_lib/estimate';

const read = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');
const PAGE = read('page.tsx');
const GLOBALS = read('../globals.css');

describe('Day 3 — onboarding adopts the landing dark palette (F-1 brand parity)', () => {
  it('root wrapper uses the dark onboarding-shell scope, not the light app-shell-root', () => {
    expect(PAGE).toContain('className="onboarding-shell"');
    expect(PAGE).not.toContain('className="app-shell-root"');
  });
  it('globals.css defines .onboarding-shell with the landing dark tokens', () => {
    expect(GLOBALS).toContain('.onboarding-shell');
    // dark bg + landing pink accent re-pointed onto the short tokens. The dark
    // scope block is shared with .app-shell-dark (Day 4), so match up to the
    // opening brace tolerantly rather than requiring `.onboarding-shell {`.
    expect(GLOBALS).toMatch(/\.onboarding-shell[\s\S]*?\{[\s\S]*?--bg:\s*#0B0A09/);
    expect(GLOBALS).toMatch(/\.onboarding-shell[\s\S]*?\{[\s\S]*?--accent:\s*#E8888A/);
  });
});

describe('Day 3 — estimated-impact card is a hero "reward" treatment', () => {
  it('the impact card uses a gradient + glow (not the flat color-mix card)', () => {
    expect(PAGE).toContain('Estimated impact');
    expect(PAGE).toContain('linear-gradient(135deg, rgba(232,136,138,0.12)');
    expect(PAGE).toContain('0 8px 40px -12px rgba(232,136,138,0.35)');
  });
});

describe('Day 3 — impact calc unchanged (functionality preserved, est. is directional)', () => {
  it('local hardware yields higher savings than cloud-only routing', () => {
    const local = estimateMonthlySavings({ hw: 'windows_nvidia', subs: [], budget: 30 });
    const cloud = estimateMonthlySavings({ hw: 'cloud', subs: [], budget: 30 });
    expect(local).toMatch(/Save ~\$\d+\/mo/);
    expect(local).toMatch(/90% less than Opus-only/);
    expect(cloud).toMatch(/cloud-only routing/);
    expect(cloud).toMatch(/75% less than Opus-only/);
  });

  it('5-step wizard flow + captured state shape are intact (Wave 60 — same facts, more steps)', () => {
    // Wave 60 — the wizard adopts the design mock's 5 phases (probe · providers ·
    // local stack · install · confirm). The step machine still starts at 1 and
    // walks forward; the SAME fields are still captured and the SAME profile is
    // still saved. The step count changed; the functional contract did not.
    expect(PAGE).toContain('useState(1)');
    expect(PAGE).toContain('const TOTAL_STEPS = 5');
    for (const s of ['setStep(2)', 'setStep(3)', 'setStep(4)', 'setStep(5)']) {
      expect(PAGE).toContain(s);
    }
    // profile save still gated behind the install step and still walks to confirm
    expect(PAGE).toContain('saveProfile(); setStep(5)');
    // the same fields are still captured (no field dropped by the re-phasing)
    for (const field of ['monthly_budget_usd: budget', 'PERSONAS', 'suggestHardware', 'SUB_OPTIONS']) {
      expect(PAGE).toContain(field);
    }
  });
});

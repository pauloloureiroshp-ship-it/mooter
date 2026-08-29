// Wave 14 Day 4 (14B-B) — dashboard + settings adopt the landing dark palette.
// Cosmetic only; the app shell opts into the shared dark token scope on every
// non-/admin route. Source-level assertions (same pattern as parity/b2b2 — the
// shell is a big client component; landing vitest is node-env, no RTL).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveToken } from '../../test-utils/moo-token';

const read = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');
const LAYOUT = read('layout.tsx');
const GLOBALS = read('../globals.css');
const DASH = read('dashboard/page.tsx');

describe('Day 4 — app shell goes dark on dashboard/settings, /admin stays light', () => {
  it('layout picks .app-shell-dark off-/admin and plain .app-shell-root on /admin', () => {
    expect(LAYOUT).toContain(
      "pathname.startsWith('/admin') ? 'app-shell-root' : 'app-shell-root app-shell-dark'",
    );
    // the authenticated shell wrappers (loading + main) use the computed class;
    // the signed-out login gate is a separate component, intentionally left light.
    expect((LAYOUT.match(/className=\{shellClass\}/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('sidebar GPU label is formatted (not the raw ANGLE string) — caught in the visual pass', () => {
    expect(LAYOUT).toContain('formatGpuLabel(user.gpu_name)');
    expect(LAYOUT).not.toContain('>{user.gpu_name}<');
  });

  it('globals.css maps .app-shell-dark to the landing dark tokens', () => {
    expect(GLOBALS).toContain('.app-shell-dark');
    // shares the onboarding dark block (same dark bg + landing pink accent)
    // Resolvido pela cadeia ate design/tokens/moo-ui.css, e nao pelo literal:
    // desde 2026-08-27 o globals.css LE o valor do ficheiro gerado em vez de o
    // repetir. Continua a exigir a mesma cor no ecra, e passa a apanhar tambem
    // um ponteiro para um token que nao existe (resolve a null).
    expect(resolveToken(GLOBALS, '.app-shell-dark', 'bg')).toBe('#0B0A09');
    expect(resolveToken(GLOBALS, '.app-shell-dark', 'accent')).toBe('#E8888A');
  });
});

describe('Day 4 — no light-on-dark regressions from the theme flip', () => {
  it('terminal-mock default text is an explicit light colour, not --cream', () => {
    // --cream maps to dark ink (CTA-on-pink) under the dark scope, which would be
    // invisible on the hardcoded dark terminal background (#0D0B08).
    expect(DASH).toContain("background: '#0D0B08'");
    expect(DASH).not.toMatch(/startsWith\('❯'\)[\s\S]{0,40}var\(--cream\)/);
    expect(DASH).toContain(": '#F2ECDF',");
  });
});

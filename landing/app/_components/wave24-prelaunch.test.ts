import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Wave 24 — pre-launch fixes. These guards are content/regression assertions
// against the source (landing vitest is node-env, no RTL), mirroring the other
// wave*-*.test.ts files. They lock in the honesty + UX fixes so they can't
// silently regress before the friends-launch.
const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
const DASH = 'app/(app)/dashboard/page.tsx';
const PRIVACY = 'app/(marketing)/privacy/page.tsx';
const CSS = 'app/globals.css';

describe('Wave 24 24.A — tooltip overlap fix', () => {
  it('flow-tooltip is hidden by default and revealed on hover/focus', () => {
    const css = read(CSS);
    // Default-hidden state.
    expect(css).toMatch(/\.flow-tooltip\s*\{[^}]*opacity:\s*0/);
    expect(css).toMatch(/\.flow-tooltip\s*\{[^}]*visibility:\s*hidden/);
    // Reveal rule on hover + keyboard focus. Child combinator (`>`) is required
    // so a hovered model-card row doesn't reveal all its sibling tooltips.
    expect(css).toContain('.flow-node:hover > .flow-tooltip');
    expect(css).toContain('.flow-node:focus-within > .flow-tooltip');
  });

  it('flow nodes are keyboard-focusable for tooltip access', () => {
    const s = read(DASH);
    expect(s).toContain('tabIndex={0}');
  });
});

describe('Wave 24 24.C — copy honesty (Wave 23 divergence alignment)', () => {
  it('dashboard makes no unqualified "No data sent anywhere" claim', () => {
    const s = read(DASH);
    expect(s).not.toContain('No data sent anywhere');
    expect(s).not.toContain('No API calls. No data sent anywhere');
  });

  it('dashboard discloses the local→cloud execution divergence', () => {
    const s = read(DASH);
    expect(s).toMatch(/divergence chip/);
  });

  it('/privacy has a "Routing vs execution" section with the T0→cloud caveat', () => {
    const s = read(PRIVACY);
    expect(s).toMatch(/Routing vs execution/i);
    expect(s).toMatch(/divergence chip/);
    expect(s).toMatch(/cloud Haiku/);
  });
});

describe('Wave 24 24.B — stale-data UX honesty', () => {
  it('overview shows a prominent stale banner + first-run empty state', () => {
    const s = read(DASH);
    expect(s).toMatch(/shows data from .* days ago/);
    expect(s).toMatch(/Run your first sync/);
    // Stale numbers are dimmed.
    expect(s).toMatch(/syncStale \? \{ opacity: 0\.5 \}/);
  });
});

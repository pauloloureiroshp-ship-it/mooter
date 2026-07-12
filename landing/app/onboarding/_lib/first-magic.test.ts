// Wave W3 (First-Magic) — unit tests for the demo data + helpers. node-env vitest,
// no framework. Guards the honest-copy invariants: local ⇒ $0, cloud ⇒ never "$0".
import { describe, it, expect } from 'vitest';
import {
  FIRST_MAGIC_EXAMPLES, tierMeta, whyRouted, isLocal, type Tier,
} from './first-magic';

describe('first-magic demo data', () => {
  it('has at least three local ($0) examples so the magic moment is real', () => {
    const local = FIRST_MAGIC_EXAMPLES.filter(isLocal);
    expect(local.length).toBeGreaterThanOrEqual(3);
  });

  it('every example has a valid tier, category, and confidence', () => {
    for (const ex of FIRST_MAGIC_EXAMPLES) {
      expect([0, 1, 2, 3]).toContain(ex.tier);
      expect(ex.category.length).toBeGreaterThan(0);
      expect(ex.confidence).toBeGreaterThan(0);
      expect(ex.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('covers the full tier ladder (T0..T3) so it does not oversell local', () => {
    const tiers = new Set(FIRST_MAGIC_EXAMPLES.map((e) => e.tier));
    for (const t of [0, 1, 2, 3] as Tier[]) expect(tiers.has(t)).toBe(true);
  });
});

describe('tierMeta honesty', () => {
  it('claims "$0" only for the local tier, never for cloud tiers', () => {
    expect(tierMeta(0)).toMatchObject({ local: true, cost: '$0' });
    for (const t of [1, 2, 3] as Tier[]) {
      const m = tierMeta(t);
      expect(m.local).toBe(false);
      expect(m.cost).not.toBe('$0');
      expect(m.cost.toLowerCase()).toContain('cloud');
    }
  });

  it('maps every ladder tier to a non-empty model label', () => {
    for (const t of [0, 1, 2, 3] as Tier[]) {
      expect(tierMeta(t).model.length).toBeGreaterThan(0);
    }
  });
});

describe('whyRouted', () => {
  it('returns a concrete reason for every example (no empty fallback)', () => {
    for (const ex of FIRST_MAGIC_EXAMPLES) {
      const why = whyRouted(ex);
      expect(why.length).toBeGreaterThan(0);
      expect(why).not.toMatch(/undefined/);
    }
  });
});

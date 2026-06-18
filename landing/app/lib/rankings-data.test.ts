// R1 — direct tests for the shared rankings payload builder (decoupled from the
// HTTP route) + integrity of the committed bench snapshot the page imports.
import { describe, it, expect } from 'vitest';
import { buildRankingsPayload } from './rankings-data';
import bench from '../(marketing)/rankings/_rankings/bench-snapshot.json';

const FROZEN_CLASSIFIER_SHA = '427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f';

describe('buildRankingsPayload', () => {
  const p = buildRankingsPayload();

  it('produces the §B contract (17 models, 24 categories, 408 cells)', () => {
    expect(p.models).toHaveLength(17);
    expect(p.categories).toHaveLength(24);
    expect(p.cells).toHaveLength(408);
    expect(Object.keys(p.pricing)).toHaveLength(17);
  });

  it('never fabricates: unmeasured cells are null score/tes', () => {
    for (const c of p.cells) {
      if (c.status === 'unmeasured') {
        expect(c.score).toBeNull();
        expect(c.tes).toBeNull();
        expect(c.source).toBeNull();
      }
      if (c.status === 'pending') expect(c.tes).toBeNull();
    }
  });

  it('routes only local + Claude auto-tiers; Fable and externals are not routed', () => {
    const routed = Object.fromEntries(p.models.map((m) => [m.id, m.routed]));
    expect(routed['claude-opus-4-7']).toBe(true);
    expect(routed['qwen3.6']).toBe(true);
    expect(routed['claude-fable-5']).toBe(false);
    expect(routed['gpt-5']).toBe(false);
  });

  it('mooter_point is advisory with a finite TES', () => {
    expect(p.mooter_point.advisory).toBe(true);
    expect(Number.isFinite(p.mooter_point.tes)).toBe(true);
  });
});

describe('committed bench snapshot', () => {
  it('is pinned to the frozen classifier sha (proves the run, catches drift)', () => {
    expect(bench.classifier_sha256).toBe(FROZEN_CLASSIFIER_SHA);
  });

  it('carries honest caveats and a sanitized (relative) dataset path', () => {
    expect(Array.isArray(bench.honest_caveats)).toBe(true);
    expect(bench.honest_caveats.length).toBeGreaterThan(0);
    expect(bench.dataset.startsWith('/')).toBe(false); // no absolute local path leaked
    expect(bench.accuracy).toBeGreaterThan(0);
    expect(bench.est_savings_pct).toBeGreaterThan(0);
  });
});

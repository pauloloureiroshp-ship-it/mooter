// R0 #5 — public /api/rankings route. No auth, no user data: reads only the frozen
// matrix + pricing snapshot. Asserts the §B shape and the anti-fabrication contract.
import { describe, it, expect, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import { GET } from './route';

async function body() {
  const res = await GET();
  expect(res.status).toBe(200);
  return res.json();
}

describe('GET /api/rankings — shape', () => {
  it('returns the full 17×24 roster + 408 cells', async () => {
    const b = await body();
    expect(b.models).toHaveLength(17);
    expect(b.categories).toHaveLength(24);
    expect(b.cells).toHaveLength(17 * 24);
    expect(b.version).toBeTypeOf('string');
    expect(typeof b.generated_at).toBe('string');
    expect(b.source_note).toMatch(/not a community average/);
  });

  it('every model carries id, name, vendor, tier (string|null) and a routed bool', async () => {
    const b = await body();
    for (const m of b.models) {
      expect(typeof m.id).toBe('string');
      expect(typeof m.name).toBe('string');
      expect(typeof m.vendor).toBe('string');
      expect(m.tier === null || /^T[0-9]$/.test(m.tier)).toBe(true);
      expect(typeof m.routed).toBe('boolean');
    }
  });

  it('public cache header, never private/no-store (this is public data)', async () => {
    const res = await GET();
    expect(res.headers.get('Cache-Control')).toMatch(/public/);
  });
});

describe('GET /api/rankings — anti-fabrication', () => {
  it('unmeasured cells are null score, status unmeasured, null source/tes', async () => {
    const b = await body();
    const empty = b.cells.filter((c: { status: string }) => c.status === 'unmeasured');
    expect(empty.length).toBeGreaterThan(0);
    for (const c of empty) {
      expect(c.score).toBeNull();
      expect(c.tes).toBeNull();
      expect(c.source).toBeNull();
    }
  });

  it('a pending cell never has a fabricated TES', async () => {
    const b = await body();
    for (const c of b.cells) {
      if (c.status === 'pending') expect(c.tes).toBeNull();
      if (c.status === 'measured') expect(Number.isFinite(c.tes)).toBe(true);
    }
  });

  it('cell status is always one of the four honest states', async () => {
    const b = await body();
    const ok = new Set(['measured', 'free', 'pending', 'unmeasured']);
    for (const c of b.cells) expect(ok.has(c.status)).toBe(true);
  });
});

describe('GET /api/rankings — pricing', () => {
  it('has a pricing entry per model with an honest status', async () => {
    const b = await body();
    expect(Object.keys(b.pricing)).toHaveLength(17);
    for (const p of Object.values(b.pricing) as Array<{ status: string; blended_3to1: number | null }>) {
      expect(['priced', 'pending', 'free']).toContain(p.status);
      if (p.status !== 'priced') {
        // pending/free models must NOT carry a fabricated blended price
        if (p.status === 'pending') expect(p.blended_3to1).toBeNull();
      }
    }
  });

  it('the three priced Anthropic models carry a real blended_3to1', async () => {
    const b = await body();
    for (const id of ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5']) {
      expect(b.pricing[id].status).toBe('priced');
      expect(typeof b.pricing[id].blended_3to1).toBe('number');
    }
    // opus-4-7 $5/$25 → (3·5 + 25)/4 = 10
    expect(b.pricing['claude-opus-4-7'].blended_3to1).toBeCloseTo(10, 4);
  });
});

describe('GET /api/rankings — routing + mooter_point', () => {
  it('routes to Claude auto-tiers + local, not to externals or Fable', async () => {
    const b = await body();
    const routed = Object.fromEntries(b.models.map((m: { id: string; routed: boolean }) => [m.id, m.routed]));
    expect(routed['claude-opus-4-7']).toBe(true);
    expect(routed['claude-sonnet-4-6']).toBe(true);
    expect(routed['claude-haiku-4-5']).toBe(true);
    expect(routed['qwen3.6']).toBe(true); // free local
    expect(routed['claude-fable-5']).toBe(false); // T5 opt-in only
    expect(routed['gpt-5']).toBe(false); // capability record, not auto-routed
    expect(routed['gemini-3.1-pro']).toBe(false);
  });

  it('mooter_point is an honest advisory snapshot', async () => {
    const b = await body();
    expect(b.mooter_point.advisory).toBe(true);
    expect(typeof b.mooter_point.tes).toBe('number');
    expect(typeof b.mooter_point.blended_3to1).toBe('number');
    expect(b.mooter_point.basis).toMatch(/advisory/);
  });

  it('coverage is internally consistent', async () => {
    const b = await body();
    expect(b.coverage.total_cells).toBe(408);
    expect(b.coverage.measured_cells).toBe(14);
    expect(b.coverage.coverage_pct).toBe(Math.round((14 / 408) * 100));
  });
});

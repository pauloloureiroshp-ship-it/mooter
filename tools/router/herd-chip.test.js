// Wave 13 "Show the Herd" — statusline `🐄×N` chip render.
// node:test + assert, matching the repo's existing statusline tests.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { herdChip, appendHerd, renderFromContext, renderTwoLine } = require('./statusline-multi.js');

test('herdChip: plain count when the herd is active', () => {
  assert.equal(herdChip(3, { color: false }), '🐄×3');
  assert.equal(herdChip(1, { color: false }), '🐄×1');
  assert.equal(herdChip(12, { color: false }), '🐄×12');
});

test('herdChip: empty herd shown by default, dimmed (A.1)', () => {
  // Plain (color off) still shows ×0 — "show by default", never hidden.
  assert.equal(herdChip(0, { color: false }), '🐄×0');
  // With color, an empty herd fades to dim ANSI so it reads as baseline.
  const dim = herdChip(0);
  assert.ok(dim.includes('🐄×0'), 'still shows the count');
  assert.ok(dim.includes('\x1b[2m') && dim.includes('\x1b[0m'), 'wrapped in dim ANSI');
});

test('herdChip: null/garbage input degrades to 0', () => {
  assert.equal(herdChip(null, { color: false }), '🐄×0');
  assert.equal(herdChip(undefined, { color: false }), '🐄×0');
  assert.equal(herdChip(NaN, { color: false }), '🐄×0');
  assert.equal(herdChip(-5, { color: false }), '🐄×0', 'negative clamped to 0');
  assert.equal(herdChip(2.9, { color: false }), '🐄×2', 'truncated, not rounded');
});

test('appendHerd: appends chip when ctx carries a herd, no-op otherwise', () => {
  assert.equal(appendHerd('LINE', { herd: { active: 3 } }), 'LINE · 🐄×3');
  assert.equal(appendHerd('LINE', {}), 'LINE', 'no herd → unchanged');
  assert.equal(appendHerd('LINE', null), 'LINE', 'null ctx → unchanged');
  assert.equal(appendHerd('LINE', { herd: {} }), 'LINE', 'herd without active count → unchanged');
});

test('renderFromContext: chip rides the compact 1-line render', () => {
  const ctx = {
    counts: { T0: 5, T1: 0, T2: 1, T3: 0 }, total: 6,
    last: { tier: 'T2', confidence: 0.8, suggested_providers: ['sonnet'] },
    recent: [], savedUsd: 0.2, savedPct: 60, dataMissing: false,
    herd: { active: 2 },
  };
  const out = renderFromContext(ctx);
  assert.ok(out.includes('🐄×2'), `expected chip in: ${out}`);
});

test('renderTwoLine: herd renders once, on Line 2 (Wave 21 C4 / DoD #3)', () => {
  // Wave 21 (C4) — the herd used to render TWICE in the two-line layout: `🐄×N` on
  // line 1 (appendHerd) AND `🐄 N/M/peakK` on line 2 (buildHerdsChip). The line-1
  // duplicate was dropped; the richer line-2 chip is the single herd surface.
  const prevCols = process.env.COLUMNS;
  process.env.COLUMNS = '160';
  try {
    const ctx = {
      counts: { T0: 18, T1: 2, T2: 4, T3: 2 }, total: 26,
      last: { tier: 'T2', confidence: 0.84, suggested_providers: ['sonnet'] },
      recent: Array(10).fill({ tier: 'T0', confidence: 0.8 }),
      anthRem: 42, savedUsd: 0.27, savedPct: 89, todayCost: 0.04,
      ctxPercent: 30, dataMissing: false,
      herd: { active: 3, local: 2, cloud: 1, peak: 3 },
    };
    const out = renderTwoLine(ctx);
    const [line1, line2] = out.split('\n');
    assert.ok(!line1.includes('🐄'), `Line 1 must NOT carry the herd anymore: ${line1}`);
    assert.match(line2, /🐄 3\//, `herd renders once, on Line 2: ${line2}`);
  } finally {
    if (prevCols === undefined) delete process.env.COLUMNS;
    else process.env.COLUMNS = prevCols;
  }
});

test('regression: contexts WITHOUT a herd render exactly as before', () => {
  const ctx = {
    counts: { T0: 5, T1: 0, T2: 1, T3: 0 }, total: 6,
    last: { tier: 'T2', confidence: 0.8, suggested_providers: ['sonnet'] },
    recent: [], savedUsd: 0.2, savedPct: 60, dataMissing: false,
  };
  const out = renderFromContext(ctx);
  assert.ok(!out.includes('🐄'), 'no herd field → no chip, byte-for-byte legacy output');
});

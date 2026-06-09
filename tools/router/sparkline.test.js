// Wave 10 · A.1 — Cinematic statusline helpers (sparkline + local share).
// node:test + assert, matching the repo's existing statusline tests.

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const { tierSparkline, localCloudSplit, localBar } = require('./sparkline.js');
const { render } = require('./statusline-multi.js');

test('tierSparkline: one cell per decision, last 10, plain glyphs', () => {
  const events = [
    { tier: 'T0' }, { tier: 'T0' }, { tier: 'T1' }, { tier: 'T0' }, { tier: 'T3' },
    { tier: 'T2' }, { tier: 'T0' }, { tier: 'T0' }, { tier: 'T1' }, { tier: 'T3' },
  ];
  const out = tierSparkline(events, { color: false });
  assert.equal(out, '▁▁▃▁█▅▁▁▃█', 'tier glyph per decision in order');
  assert.equal(out.length, 10, 'exactly one cell per decision');
});

test('tierSparkline: windows to the last 10 and is null-safe', () => {
  const many = Array.from({ length: 14 }, (_, i) => ({ tier: i < 4 ? 'T3' : 'T0' }));
  assert.equal(tierSparkline(many, { color: false }), '▁'.repeat(10), 'only the last 10 (all T0) shown');
  assert.equal(tierSparkline([], { color: false }), '', 'empty history → empty string');
  assert.equal(tierSparkline(null, { color: false }), '', 'null-safe');
  assert.equal(tierSparkline([{}, { tier: 'x' }], { color: false }), '··', 'unknown tiers render as a faint dot');
});

test('tierSparkline: colored output wraps each cell in ANSI + reset', () => {
  const out = tierSparkline([{ tier: 'T3' }]);
  assert.match(out, /\x1b\[38;5;211m█\x1b\[0m/, 'T3 cell is pink');
});

test('localCloudSplit: T0 is local, T1..T3 cloud, pct is % local', () => {
  const events = [{ tier: 'T0' }, { tier: 'T0' }, { tier: 'T2' }, { tier: 'T3' }, { tier: 'codex' }];
  const s = localCloudSplit(events);
  assert.equal(s.local, 2);
  assert.equal(s.cloud, 2, 'unknown/codex tiers are ignored, not counted as cloud');
  assert.equal(s.pct, 50);
  assert.deepEqual(localCloudSplit([]), { local: 0, cloud: 0, pct: 0 }, 'empty → 0% with no divide-by-zero');
});

test('localBar: 10-cell fill proportional to pct', () => {
  assert.equal(localBar(70), '███████░░░ 70% local');
  assert.equal(localBar(0), '░░░░░░░░░░ 0% local');
  assert.equal(localBar(100), '██████████ 100% local');
  assert.equal(localBar(150), '██████████ 100% local', 'clamps over 100');
});

test('render (wide): line 1 carries the sparkline, line 2 the per-session chips', () => {
  const ctx = {
    counts: { T0: 6, T1: 2, T2: 2, T3: 0 }, total: 10,
    last: { tier: 'T2', confidence: 0.84, suggested_providers: ['sonnet'] },
    recent: [
      { tier: 'T0' }, { tier: 'T0' }, { tier: 'T1' }, { tier: 'T0' }, { tier: 'T3' },
      { tier: 'T2' }, { tier: 'T0' }, { tier: 'T0' }, { tier: 'T1' }, { tier: 'T0' },
    ],
    anthRem: 100, savedUsd: 0.27, savedPct: 89, todayCost: 0.04,
    ctxPercent: 23, lastTurnCost: 0.012, alltimeCost: 4.21, dataMissing: false,
  };
  const prev = process.env.COLUMNS;
  process.env.COLUMNS = '160';
  try {
    const lines = render(ctx).split('\n');
    assert.equal(lines.length, 2);
    assert.match(lines[0], /last 10/, 'line 1 trails the sparkline label');
    // Wave 21 dropped the ASCII "% local" bar from line 2; Wave 33 renamed the
    // cost chips. Assert the per-session economics line 2 actually carries now.
    assert.match(lines[1], /ctx.*23%/, 'line 2 shows the ctx bar');
    assert.match(lines[1], /📝 \$0\.01 this turn · \$4\.21 all-time/, 'W48 1.6: cost chip grouped + "session"→"all-time" mislabel fixed');
  } finally {
    if (prev === undefined) delete process.env.COLUMNS; else process.env.COLUMNS = prev;
  }
});

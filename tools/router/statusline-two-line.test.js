// Wave 2.6 Day 2 — 2-line rich statusline + truncate-safe 1-line fallback.
//
// node:test + assert (matches statusline-multi.test.js). The repo has no jest
// snapshot harness, so these are structural assertions on the rendered frame
// rather than serialized snapshots.

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const { render, renderTwoLine, truncateChip } = require('./statusline-multi.js');

// A healthy, fully-populated context so line 2 carries every operational chip.
const healthyState = {
  counts: { T0: 6, T1: 2, T2: 2, T3: 0, codex: 0 }, total: 10,
  last:    { tier: 'T2', confidence: 0.84, suggested_providers: ['sonnet'] },
  recent:  Array(10).fill({ tier: 'T2', confidence: 0.82 }),
  anthRem: 100, codexRem: 90, codexLeft: 140,
  savedUsd: 0.27, savedPct: 89, todayCost: 0.04,
  ctxPercent: 23, lastTurnCost: 0.012, alltimeCost: 4.21,
  lastPack: { pack_id: 'diagram-systems' },
  adapter: { status: 'idle' },
  dataMissing: false,
};

function withColumns(cols, fn) {
  const prev = process.env.COLUMNS;
  process.env.COLUMNS = String(cols);
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.COLUMNS; else process.env.COLUMNS = prev;
  }
}

test('render: 2-line layout when COLUMNS >= 120', () => {
  const out = withColumns(140, () => render(healthyState));
  const lines = out.split('\n');
  assert.equal(lines.length, 2, 'wide terminal renders exactly two lines');
  assert.match(lines[0], /🐮/, 'line 1 carries the mood glyph');
  assert.match(lines[0], /saved \$0\.27/, 'line 1 carries the saved headline');
  // line 2 operational chips
  assert.match(lines[1], /🏠 local ×6/, 'line 2 shows local Moo count');
  assert.match(lines[1], /ctx 23%/, 'line 2 shows ctx');
  assert.match(lines[1], /100% 5h/, 'line 2 shows quota');
  assert.match(lines[1], /pack: diagram-systems/, 'line 2 shows pack');
});

test('render: falls back to single line when COLUMNS < 120', () => {
  const out = withColumns(100, () => render(healthyState));
  assert.ok(!out.includes('\n'), 'narrow terminal renders a single line');
  assert.match(out, /🐮/);
  assert.match(out, /│/, 'single line keeps the headline │ proof separator');
});

test('render: missing COLUMNS assumes narrow (1-line)', () => {
  const prev = process.env.COLUMNS;
  delete process.env.COLUMNS;
  try {
    const out = render(healthyState);
    assert.ok(!out.includes('\n'), 'no COLUMNS → conservative single line');
  } finally {
    if (prev !== undefined) process.env.COLUMNS = prev;
  }
});

test('renderTwoLine: oversized chip is truncated, structure preserved', () => {
  const longPack = { ...healthyState, lastPack: { pack_id: 'very-long-pack-name-that-exceeds-thirty-characters' } };
  const out = renderTwoLine(longPack);
  const lines = out.split('\n');
  assert.equal(lines.length, 2);
  assert.ok(!lines[1].includes('very-long-pack-name-that-exceeds-thirty'), 'full oversized pack id is cut');
  assert.match(lines[1], /pack: very-long-pack-name-tha…/, 'truncated chip keeps a recognizable prefix + ellipsis');
});

test('renderTwoLine: drops absent chips instead of printing empty fields', () => {
  const sparse = {
    counts: { T0: 0, T1: 0, T2: 0, T3: 0 }, total: 3,
    last: { tier: 'T2', confidence: 0.7, suggested_providers: ['sonnet'] },
    recent: [{ tier: 'T2', confidence: 0.7 }],
    anthRem: 80, savedUsd: 0.1, savedPct: 50, todayCost: 0.02, dataMissing: false,
  };
  const out = renderTwoLine(sparse);
  const lines = out.split('\n');
  assert.equal(lines.length, 2);
  assert.ok(!lines[1].includes('🏠 local ×0'), 'zero local count chip is omitted');
  assert.ok(!lines[1].includes('ctx'), 'absent ctx chip is omitted');
  assert.ok(!lines[1].includes('pack:'), 'absent pack chip is omitted');
  assert.ok(!/· *·/.test(lines[1]), 'no empty chip slots (double separators)');
});

test('renderTwoLine: setup state degrades to the single line', () => {
  const setup = { counts: { T0: 0, T1: 0, T2: 0, T3: 0 }, total: 0, last: null, recent: [], dataMissing: true };
  const out = renderTwoLine(setup);
  assert.ok(!out.includes('\n'), 'fresh install never prints a half-empty second line');
  assert.match(out, /🛠/, 'setup glyph');
});

test('truncateChip: leaves short strings untouched, cuts long ones to max', () => {
  assert.equal(truncateChip('short', 30), 'short');
  const cut = truncateChip('x'.repeat(40), 30);
  assert.equal(cut.length, 30);
  assert.ok(cut.endsWith('…'));
});

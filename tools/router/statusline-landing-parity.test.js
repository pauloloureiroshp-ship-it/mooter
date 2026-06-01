// Wave 2.8 — landing parity: GPU chip, ctx bar, quant chip, honest adapter chip.
// node:test + assert.

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const { render, renderTwoLine, ctxBar, formatGpuChip } = require('./statusline-multi.js');

function withColumns(cols, fn) {
  const prev = process.env.COLUMNS;
  process.env.COLUMNS = String(cols);
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.COLUMNS; else process.env.COLUMNS = prev;
  }
}

// Local-Moo state so the quant chip applies (T0 → ollama).
const localState = {
  counts: { T0: 6, T1: 1, T2: 1, T3: 0 }, total: 8,
  last: { tier: 'T0', confidence: 0.9, suggested_providers: ['ollama'] },
  recent: Array(8).fill({ tier: 'T0', confidence: 0.9 }),
  anthRem: 100, savedUsd: 0.27, savedPct: 89, todayCost: 0.04,
  ctxPercent: 23, lastTurnCost: 0.012, alltimeCost: 4.21,
  dataMissing: false,
};

// ── Ponto #1 — GPU chip ──────────────────────────────────────────────────
test('formatGpuChip: strips vendor prefixes, prepends 🎮', () => {
  assert.equal(formatGpuChip('NVIDIA GeForce RTX 4090'), '🎮 RTX 4090');
  assert.equal(formatGpuChip('Apple M3 Pro'), '🎮 M3 Pro');
  assert.equal(formatGpuChip('RTX 3090'), '🎮 RTX 3090');
});

test('formatGpuChip: null when no GPU', () => {
  assert.equal(formatGpuChip(null), null);
  assert.equal(formatGpuChip(''), null);
});

// ── Ponto #2 — ctx bar ───────────────────────────────────────────────────
test('ctxBar: empty at 0%, full at 100%, half at 50%', () => {
  assert.match(ctxBar(0), /\[.*░░░░░░░░░░.*\] 0%/);
  assert.match(ctxBar(100), /\[.*██████████.*\] 100%/);
  assert.match(ctxBar(50), /█████░░░░░/);
});

test('ctxBar: colour green <50, yellow <80, red >=80', () => {
  assert.ok(ctxBar(25).includes('\x1b[32m'), 'green');
  assert.ok(ctxBar(65).includes('\x1b[33m'), 'yellow');
  assert.ok(ctxBar(90).includes('\x1b[31m'), 'red');
  assert.ok(ctxBar(25).includes('\x1b[0m'), 'resets colour');
});

test('ctxBar: clamps out-of-range', () => {
  assert.match(ctxBar(150), /██████████/);
  assert.match(ctxBar(-5), /░░░░░░░░░░/);
});

// ── Ponto #7 — quant chip ────────────────────────────────────────────────
test('renderTwoLine: quant chip present for a local Moo', () => {
  const out = withColumns(140, () => renderTwoLine(localState));
  assert.match(out, /quant Q4_K_M/);
});

test('renderTwoLine: quant chip omitted for a cloud Moo', () => {
  const cloud = { ...localState, last: { tier: 'T2', confidence: 0.84, suggested_providers: ['sonnet'] } };
  const out = withColumns(140, () => renderTwoLine(cloud));
  assert.ok(!/quant/.test(out), 'cloud model is not locally quantized');
});

// ── Ponto #8 — honest adapter chip ───────────────────────────────────────
test('renderTwoLine: adapter chip is honest baseline (LoRA Wave 5)', () => {
  const out = withColumns(140, () => renderTwoLine(localState));
  assert.match(out, /adapter ◌ baseline · install via mooter forge install <gguf>/);
});

// ── ctx bar in 2-line, plain text in 1-line fallback ─────────────────────
test('render: ctx bar in 2-line (wide), bare text in 1-line (narrow)', () => {
  const wide = withColumns(140, () => render(localState));
  assert.match(wide, /ctx \[/, '2-line uses the bar');
  const narrow = withColumns(100, () => render(localState));
  assert.ok(!/ctx \[/.test(narrow), '1-line fallback keeps plain ctx text');
});

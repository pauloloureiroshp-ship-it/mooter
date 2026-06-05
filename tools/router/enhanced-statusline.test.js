// Enhanced statusline — Wave 19 Day 2 (19.B-1..6). One test per sub-feature.
// Pure helpers are tested directly; the LoRA chip is asserted via renderTwoLine.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const sl = require('./statusline-multi.js');
const hw = require('./hardware_live.js');

// ── 19.B-1 — tokens-per-tier ANSI colors ─────────────────────────────────
test('19.B-1: token chip colors each tier T0🟢 T1🔵 T2🟡 T3🔴, plain on color:false', () => {
  const snap = {
    T0: { tokens_in: 1000, tokens_out: 0 },
    T1: { tokens_in: 500, tokens_out: 0 },
    T2: { tokens_in: 2000, tokens_out: 0 },
    T3: { tokens_in: 1000000, tokens_out: 0 },
  };
  const colored = sl.buildTokenChip(snap, { color: true });
  assert.ok(colored.includes('\x1b[32m'), 'T0 green');
  assert.ok(colored.includes('\x1b[34m'), 'T1 blue');
  assert.ok(colored.includes('\x1b[33m'), 'T2 yellow');
  assert.ok(colored.includes('\x1b[31m'), 'T3 red');
  assert.ok(colored.includes('\x1b[0m'), 'resets');
  // Fallback: plain text, no escapes.
  const plain = sl.buildTokenChip(snap, { color: false });
  assert.ok(!plain.includes('\x1b['), 'no ANSI when color disabled');
  // Wave 20 (20.C) — a single "tkns" unit label rides the first tier.
  assert.equal(plain, '🪙 T0:1.0k tkns · T1:500 · T2:2.0k · T3:1.0M');
  // The line-1 idle herd badge honors the same gate (no leaked dim escape).
  assert.equal(sl.herdChip(0, { color: false }), '🐄×0');
  assert.ok(sl.herdChip(0, { color: true }).includes('\x1b[2m'), 'dim when color on');
});

// ── 19.B-2 — VRAM live, file-cached, never invented ──────────────────────
test('19.B-2: vramSnapshot returns pct + GB from nvidia-smi, caches 5s, null when no live', () => {
  hw._resetCache();
  const detector = () => ({ used_mb: 18300, total_mb: 24576 });
  const live = hw.vramSnapshot({ now: 1000, force: true, getVram: detector });
  assert.equal(live.usedMb, 18300);
  assert.equal(live.totalMb, 24576);
  assert.equal(live.pct, 74); // 18300/24576 ≈ 74%

  // Within 5s the cache is served — a throwing detector must NOT be called.
  const boom = () => { throw new Error('should not spawn within 5s'); };
  const cached = hw.vramSnapshot({ now: 3000, getVram: boom });
  assert.deepEqual(cached, live);

  // No live reading (mac shared / no nvidia-smi) → null, never invented.
  hw._resetCache();
  assert.equal(hw.vramSnapshot({ now: 9000, force: true, getVram: () => null }), null);
  assert.equal(hw.vramSnapshot({ now: 9000, force: true, getVram: () => ({ used_mb: -1, total_mb: 65536 }) }), null);
  hw._resetCache();
});

// ── 19.B-3 — context window evolution bar (▰▱) ───────────────────────────
test('19.B-3: ctxBar is a ▰▱ evolution bar, proportional + color-coded', () => {
  assert.match(sl.ctxBar(30), /▰▰▰▱▱▱▱▱▱▱.*30%/);
  assert.match(sl.ctxBar(0), /▱▱▱▱▱▱▱▱▱▱.*0%/);
  assert.ok(sl.ctxBar(30).includes('\x1b[32m'), 'green < 50%');
  assert.ok(sl.ctxBar(90).includes('\x1b[31m'), 'red >= 80%');
});

// ── 19.B-4 — LoRA/Pastor evolution chip (🧬) ─────────────────────────────
test('19.B-4: renderTwoLine surfaces the 🧬 LoRA/Pastor chip (baseline stable)', () => {
  const prev = process.env.COLUMNS;
  process.env.COLUMNS = '140';
  try {
    const ctx = {
      counts: { T0: 4, T1: 0, T2: 1, T3: 0 }, total: 5,
      last: { tier: 'T0', confidence: 0.8, suggested_providers: ['qwen'] },
      recent: [{ tier: 'T0', confidence: 0.8 }],
      savedUsd: 0.1, savedPct: 80, ctxPercent: 20,
    };
    const out = sl.renderTwoLine(ctx);
    assert.match(out, /🧬/, 'LoRA evolution chip present');
    assert.doesNotMatch(out, /\+\d+ pp/, 'never invents a benchmark boost');
  } finally {
    if (prev === undefined) delete process.env.COLUMNS; else process.env.COLUMNS = prev;
  }
});

// ── 19.B-5/6 — RESTORED by Wave 22 (22.A) ──────────────────────────────────
// The always-on herd chip is UNHIDDEN: the native SubagentStop hook now writes the
// herd file with a reliable per-spawn agent_id signal (Day 0 proved it catches even
// Read-only subagents the Wave 21 PostToolUse fallback misses). buildHerdsChip renders
// the real active/total/peak again, dim when idle, ⚡ at ≥3 concurrent.
test('19.B-5: herds chip renders active/total/peak (Wave 22 unhidden, dim when idle)', () => {
  assert.ok(sl.buildHerdsChip({ active: 0, total: 17, peak: 9 }, { color: true }).includes('🐄 0/17/peak9'));
  assert.ok(sl.buildHerdsChip({ active: 2, total: 17, peak: 9 }, { color: true }).includes('🐄 2/17/peak9'));
  assert.equal(sl.buildHerdsChip(null), null, 'no herd data → no chip');
});

test('19.B-6: ⚡ workflow mode lights at ≥ 3 concurrent (Wave 22 unhidden)', () => {
  assert.ok(!sl.buildHerdsChip({ active: 2, total: 5, peak: 2 }, { color: false }).includes('⚡'), 'no ⚡ below 3');
  assert.ok(sl.buildHerdsChip({ active: 3, total: 9, peak: 3 }, { color: false }).includes('⚡ workflow'), '⚡ at 3');
});

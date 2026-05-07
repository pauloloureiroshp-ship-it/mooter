#!/usr/bin/env node
// @ts-check
'use strict';
/**
 * gsd-statusline-latency.test.js — guard rail for the wired statusline.
 *
 * Wave-3 audit S2#2 closure (master prompt §F1). The savings hero
 * runs on every Claude Code statusline refresh (~every 5s on idle,
 * faster when prompts arrive). A regression that adds a sync I/O
 * call or an unbounded log scan would silently make the terminal
 * feel laggy. This test catches the worst regressions without
 * requiring per-render benchmarking.
 *
 * Budget rationale:
 *   - Empirical baseline on Windows + Node 22 + warm cache: ~170-230ms
 *     per cold spawn (the file is 2 094 LOC, requires fs/path/os/http).
 *   - CI cold runners are typically 1.5-2× slower than dev hardware.
 *   - We assert MEDIAN < 600 ms (5 spawns) so transient blips don't
 *     fail the suite. A regression that pushes median > 600 ms is
 *     visible to the user as terminal lag.
 *   - We also assert NO INDIVIDUAL spawn > 1500 ms so pathological
 *     freeze-then-recover cases are caught.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const STATUSLINE_PATH = path.join(__dirname, 'gsd-statusline.js');
const SAMPLE_STDIN = JSON.stringify({
  model: { display_name: 'opus', id: 'claude-opus-4-7' },
  context: { percent_used: 23 },
  session: { cost_usd: 0.04 },
});

const MEDIAN_BUDGET_MS = 600;
const MAX_BUDGET_MS = 1500;
const SAMPLE_SIZE = 5;

function median(arr) {
  const sorted = arr.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

test(`gsd-statusline: median render < ${MEDIAN_BUDGET_MS}ms across ${SAMPLE_SIZE} cold spawns`, () => {
  const durations = [];
  for (let i = 0; i < SAMPLE_SIZE; i++) {
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [STATUSLINE_PATH], {
      input: SAMPLE_STDIN,
      encoding: 'utf8',
      timeout: MAX_BUDGET_MS * 2,
    });
    const dt = Date.now() - t0;
    durations.push(dt);
    // Status code 0 means render succeeded (statusline always exits 0
    // on render — even on error it prints a degraded line).
    assert.equal(r.status, 0,
      `spawn ${i} exited with ${r.status}: stderr=${r.stderr}`);
    // Stdout must be non-empty — empty render is a regression too.
    assert.ok(r.stdout && r.stdout.trim().length > 0,
      `spawn ${i} produced empty stdout (durations so far: ${durations.join(',')})`);
  }
  const med = median(durations);
  assert.ok(med < MEDIAN_BUDGET_MS,
    `median ${med}ms exceeds ${MEDIAN_BUDGET_MS}ms budget; durations=${durations.join(',')}`);
});

test(`gsd-statusline: no individual spawn > ${MAX_BUDGET_MS}ms`, () => {
  const durations = [];
  for (let i = 0; i < SAMPLE_SIZE; i++) {
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [STATUSLINE_PATH], {
      input: SAMPLE_STDIN,
      encoding: 'utf8',
      timeout: MAX_BUDGET_MS * 2,
    });
    const dt = Date.now() - t0;
    durations.push(dt);
    assert.equal(r.status, 0);
  }
  const max = Math.max(...durations);
  assert.ok(max < MAX_BUDGET_MS,
    `max ${max}ms exceeds ${MAX_BUDGET_MS}ms freeze budget; durations=${durations.join(',')}`);
});

test('gsd-statusline: sample stdin produces a recognisable savings line', () => {
  const r = spawnSync(process.execPath, [STATUSLINE_PATH], {
    input: SAMPLE_STDIN,
    encoding: 'utf8',
    timeout: MAX_BUDGET_MS * 2,
  });
  assert.equal(r.status, 0);
  // Must contain the brand glyph 🐮 SOMEWHERE in the output (the
  // savings hero line is one of the rendered rows). If the glyph is
  // missing the renderer is broken — a real regression caught early.
  assert.ok(r.stdout.includes('🐮'),
    `expected 🐮 in render output; got: ${r.stdout.slice(0, 200)}`);
});

'use strict';

// moo-loop near-objective escalation (FASE 3) — regression suite + reproducible
// demo. Proves: the critic's SIGNAL (not a size heuristic) drives a local→cloud
// escalation only near the objective; the maestro gets a DISTILLED handoff; and
// savings vs all-frontier are reported honestly (estimate, reusing run-savings).

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const CLI = path.join(__dirname, 'moo-loop.js');
const { proximitySignal, estimateSavings } = require('./moo-loop');

// A repo whose test runner prints a real, decreasing failing COUNT on its last
// line ("Tests: N failed") — exactly what moo-verify keeps as the signal. The stub
// coder fixes one failing test per tick, so the count walks 3→2→1→0.
function gradientRepo(n) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooloopnear-'));
  fs.writeFileSync(path.join(dir, 'package.json'),
    JSON.stringify({ name: 'grad', version: '1.0.0', scripts: { test: 'node runner.js' } }));
  fs.writeFileSync(path.join(dir, 'failcount'), String(n));
  fs.writeFileSync(path.join(dir, 'runner.js'),
    "const fs=require('fs');const n=parseInt(fs.readFileSync('failcount','utf8'),10)||0;\n" +
    "console.log('suite run');console.log(`Tests: ${n} failed`);process.exit(n>0?1:0);\n");
  return dir;
}
const FIX_ONE = `node -e 'const fs=require("fs");const n=parseInt(fs.readFileSync("failcount","utf8"),10)||0;fs.writeFileSync("failcount",String(Math.max(0,n-1)))'`;

function loop(dir, args) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'moohome-'));
  const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'moorun-'));
  const res = spawnSync(process.execPath, [CLI, 'until', 'default', ...args, '--cwd', dir, '--json'], {
    encoding: 'utf8',
    env: { ...process.env, MOOTER_HOME: home, MOOTER_RUN_ROOT: runRoot },
  });
  let verdict = null;
  try { verdict = JSON.parse(res.stdout); } catch { /* leave null */ }
  return { verdict, status: res.status, runRoot };
}

test('proximitySignal: reads a FINE count from runner output, else coarse checks', () => {
  assert.deepStrictEqual(proximitySignal({ blocking: [{ name: 'test', signal: 'Tests: 3 failed' }] }), { count: 3, kind: 'parsed' });
  assert.deepStrictEqual(proximitySignal({ blocking: [{ name: 'test', signal: '3 failing' }] }), { count: 3, kind: 'parsed' });
  assert.deepStrictEqual(proximitySignal({ checks: [{ pass: false, signal: '# fail 2' }], blocking: [{ name: 't', signal: '# fail 2' }] }), { count: 2, kind: 'parsed' });
  // no parseable count → coarse failing-check count, honestly labelled
  assert.deepStrictEqual(proximitySignal({ blocking: [{ name: 'test', signal: '}' }], checks: [{ pass: false, signal: '}' }] }), { count: 1, kind: 'checks' });
  assert.deepStrictEqual(proximitySignal({ pass: true, checks: [], blocking: [] }), { count: 0, kind: 'checks' });
});

test('near-objective OFF (default): stays local-first — FASE 1 behaviour preserved', () => {
  const dir = gradientRepo(3);
  const { verdict } = loop(dir, ['--max-cost', '$0.50', '--max-iters', '12', '--attempt-cmd', FIX_ONE]);
  assert.strictEqual(verdict.stop_reason, 'verified');
  assert.strictEqual(verdict.spent_usd, 0, 'no escalation without --escalate-near → all local, $0');
  assert.ok(verdict.history.every((h) => h.target === 'local'), 'every tick local');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('near-objective ON: FAR ticks local ($0), NEAR ticks escalate to cloud', () => {
  const dir = gradientRepo(3);
  const { verdict } = loop(dir, ['--max-cost', '$0.50', '--max-iters', '12', '--escalate-near', '--near-threshold', '2', '--goal', 'all tests pass', '--attempt-cmd', FIX_ONE]);
  assert.strictEqual(verdict.stop_reason, 'verified');
  const far = verdict.history.filter((h) => h.proximity === 'far');
  const near = verdict.history.filter((h) => h.proximity === 'near');
  assert.ok(far.length >= 1 && far.every((h) => h.target === 'local'), 'far while signal>threshold → local');
  assert.ok(near.length >= 1 && near.every((h) => h.target === 'cloud'), 'near (≤threshold) → cloud escalation');
  // the gradient was read finely (parsed), not binary
  assert.ok(verdict.history.some((h) => h.signal >= 3), 'started far with a fine signal');
  assert.ok(verdict.spent_usd > 0, 'cloud escalations are priced');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('escalation hands the maestro a DISTILLED state.md (not a transcript dump)', () => {
  const dir = gradientRepo(3);
  const { verdict, runRoot } = loop(dir, ['--max-cost', '$0.50', '--max-iters', '12', '--escalate-near', '--near-threshold', '2', '--goal', 'all green', '--attempt-cmd', FIX_ONE]);
  const state = path.join(runRoot, verdict.id, 'state.md');
  assert.ok(fs.existsSync(state), 'handoff state.md written on escalation');
  const md = fs.readFileSync(state, 'utf8');
  assert.match(md, /## Goal/);
  assert.match(md, /near objective/);
  assert.ok(Buffer.byteLength(md) <= 4096, 'distilled, capped at 4KB');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('savings vs all-frontier are reported and honestly flagged as an estimate', () => {
  const dir = gradientRepo(3);
  const { verdict } = loop(dir, ['--max-cost', '$0.50', '--max-iters', '12', '--escalate-near', '--near-threshold', '2', '--attempt-cmd', FIX_ONE]);
  const s = verdict.savings;
  assert.ok(s, 'savings present');
  assert.strictEqual(s.estimated, true, 'flagged as estimate (coder delegated, tokens not measured)');
  assert.ok(s.saved_usd > 0, 'local-first + late escalation saved vs all-Opus');
  assert.ok(s.local_lanes >= 1 && s.cloud_lanes >= 1, 'counts both local and cloud lanes');
  assert.match(s.basis, /ESTIMATE/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('estimateSavings([]) is null — never fabricates a number with no data', () => {
  assert.strictEqual(estimateSavings([]), null);
  const s = estimateSavings([
    { iter: 0, target: 'local', model: 'qwen2.5:3b', proximity: 'far' },
    { iter: 1, target: 'cloud', model: 'claude-sonnet-4-6', proximity: 'near' },
  ]);
  assert.strictEqual(s.local_lanes, 1);
  assert.strictEqual(s.cloud_lanes, 1);
  assert.ok(s.saved_usd > 0);
});

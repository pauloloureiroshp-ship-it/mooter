'use strict';

// moo-loop — FASE 1 regression suite. Doubles as the reproducible demo: each test
// builds a real temp repo and drives the CLI, proving the loop stops BY PROOF, caps
// HARD, never wrecks, and keeps the stop/risk/budget path at $0 (zero paid LLM).

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const CLI = path.join(__dirname, 'moo-loop.js');

// A deterministic "coder" stand-in: rewrites sum.js so 2+3=5. In production this is
// a local Ollama coder routed by the cost plane; here it is fixed so the ENGINE is
// what gets tested, deterministically and for free.
const FIX_SUM = `node -e 'require("fs").writeFileSync("sum.js","module.exports=(a,b)=>a+b;")'`;
const NOOP = 'true'; // an attempt that changes nothing → exercises stall/cap paths

/** A repo whose single test is RED until sum.js is fixed to add. */
function redRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooloop-'));
  fs.writeFileSync(path.join(dir, 'package.json'),
    JSON.stringify({ name: 'mooloop-fixture', version: '1.0.0', scripts: { test: 'node --test sum.test.js' } }));
  fs.writeFileSync(path.join(dir, 'sum.js'), 'module.exports = (a, b) => a - b;\n'); // BUG
  fs.writeFileSync(path.join(dir, 'sum.test.js'),
    "const { test } = require('node:test');\n" +
    "const assert = require('node:assert');\n" +
    "const sum = require('./sum');\n" +
    "test('adds', () => assert.strictEqual(sum(2, 3), 5));\n");
  return dir;
}

/** Drive the CLI in --json mode and return {verdict, status, stderr}. */
function loop(dir, args) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'moohome-'));
  const res = spawnSync(process.execPath, [CLI, 'until', 'default', ...args, '--cwd', dir, '--json'], {
    encoding: 'utf8',
    env: { ...process.env, MOOTER_HOME: home },
  });
  let verdict = null;
  try { verdict = JSON.parse(res.stdout); } catch { /* leave null */ }
  return { verdict, status: res.status, stderr: res.stderr, home };
}

test('until: stops BY PROOF the instant tests pass (verified, $0, local)', () => {
  const dir = redRepo();
  const { verdict, status } = loop(dir, ['--max-cost', '$0.50', '--max-iters', '12', '--attempt-cmd', FIX_SUM]);
  assert.ok(verdict, 'expected JSON verdict');
  assert.strictEqual(verdict.stop_reason, 'verified');
  assert.strictEqual(verdict.pass, true);
  assert.strictEqual(verdict.spent_usd, 0, 'stop/route path must be $0 (all local)');
  assert.ok(verdict.iters <= 2, `should converge fast, got ${verdict.iters} iters`);
  assert.strictEqual(status, 0, 'verified → exit 0');
  // proves the attempt actually ran against the real repo
  assert.match(fs.readFileSync(path.join(dir, 'sum.js'), 'utf8'), /a\s*\+\s*b/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('until: writes the MOO_LOOP.md scratchpad with goal re-injected + signal history', () => {
  const dir = redRepo();
  loop(dir, ['--max-cost', '$0.50', '--max-iters', '12', '--goal', 'sum returns a+b', '--attempt-cmd', FIX_SUM]);
  const md = fs.readFileSync(path.join(dir, 'MOO_LOOP.md'), 'utf8');
  assert.match(md, /## Goal \(re-injected every tick\)/);
  assert.match(md, /sum returns a\+b/);
  assert.match(md, /signal \(failing required checks\): 0/);
  assert.match(md, /GREEN/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('risk gate: a destructive attempt is VETOED before it runs (risk-blocked, $0)', () => {
  const dir = redRepo();
  const before = fs.readFileSync(path.join(dir, 'sum.js'), 'utf8');
  const { verdict, status } = loop(dir, ['--max-cost', '$0.50', '--max-iters', '12', '--attempt-cmd', 'rm -rf /']);
  assert.strictEqual(verdict.stop_reason, 'risk-blocked');
  assert.strictEqual(verdict.iters, 0, 'blocked on the first action');
  assert.strictEqual(verdict.spent_usd, 0);
  assert.ok(verdict.risk && /rm_rf/.test(verdict.risk.reason), 'verdict carries the risk reason');
  assert.strictEqual(status, 2, 'risk veto → exit 2 (mirrors moo-risk)');
  assert.strictEqual(fs.readFileSync(path.join(dir, 'sum.js'), 'utf8'), before, 'repo untouched');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('no-progress: stalls abort the loop before it keeps trying the same thing', () => {
  const dir = redRepo();
  const { verdict } = loop(dir, ['--max-cost', '$0.50', '--max-iters', '50', '--no-progress', '3', '--attempt-cmd', NOOP]);
  assert.strictEqual(verdict.stop_reason, 'no-progress');
  assert.ok(verdict.iters < 50, 'aborts well before the iter backstop');
  assert.strictEqual(verdict.spent_usd, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('max-iters: the backstop stops a non-converging loop (no-progress disabled)', () => {
  const dir = redRepo();
  const { verdict } = loop(dir, ['--max-cost', '$0.50', '--max-iters', '3', '--no-progress', '0', '--attempt-cmd', NOOP]);
  assert.strictEqual(verdict.stop_reason, 'max-iters');
  assert.strictEqual(verdict.iters, 3);
  assert.strictEqual(verdict.spent_usd, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('max-cost: a priced (cloud) tick is cut by the budget BEFORE spending', () => {
  const dir = redRepo();
  // A high-risk goal forces the cost plane to escalate the tick to cloud Opus
  // (~$0.06/tick). With a $0.05 cap, the budget gate stops the loop before paying.
  const { verdict } = loop(dir, [
    '--max-cost', '$0.05', '--max-iters', '12', '--no-progress', '0',
    '--goal', 'drop the legacy_users table from production',
    '--attempt-cmd', NOOP,
  ]);
  assert.strictEqual(verdict.stop_reason, 'max-cost');
  assert.strictEqual(verdict.spent_usd, 0, 'cut BEFORE the expensive attempt — nothing spent');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('opt-in by design: refuses to run without BOTH --max-cost and --max-iters', () => {
  const dir = redRepo();
  const noCost = spawnSync(process.execPath, [CLI, 'until', 'default', '--max-iters', '5', '--cwd', dir], { encoding: 'utf8' });
  assert.strictEqual(noCost.status, 64, 'missing --max-cost → usage exit 64');
  const noIters = spawnSync(process.execPath, [CLI, 'until', 'default', '--max-cost', '$1', '--cwd', dir], { encoding: 'utf8' });
  assert.strictEqual(noIters.status, 64, 'missing --max-iters → usage exit 64');
  const badSub = spawnSync(process.execPath, [CLI, 'poll', '5m'], { encoding: 'utf8' });
  assert.strictEqual(badSub.status, 64, 'only "until" exists in FASE 1');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('exports: the engine surface is importable for FASE 3 escalation', () => {
  const m = require('./moo-loop');
  assert.strictEqual(typeof m.runLoop, 'function');
  assert.strictEqual(typeof m.progressOf, 'function');
  assert.strictEqual(typeof m.routeTick, 'function');
  assert.strictEqual(m.STOP.VERIFIED, 'verified');
  // progressOf is the near-objective signal FASE 3 will threshold on
  assert.strictEqual(m.progressOf({ pass: true, checks: [], blocking: [] }), 0);
  assert.strictEqual(m.progressOf({ pass: false, checks: [{ pass: false }, { pass: false }], blocking: [{}] }), 2);
});

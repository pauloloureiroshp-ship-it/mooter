'use strict';

// moo-loop FASE 5 integrations — regression suite + reproducible demo.
//   goal-check: feeds /goal's evaluator a deterministic verdict LINE (the evaluator
//               can't run commands — FASE 0 — so we hand it ground truth, not prose).
//   gate:       the per-subagent risk+budget gate a Dynamic-Workflows fan-out lacks.

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const CLI = path.join(__dirname, 'moo-loop.js');
const { goalCheck, gateSubagent } = require('./moo-loop');

function repo(testScript) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlgate-'));
  fs.writeFileSync(path.join(dir, 'package.json'),
    JSON.stringify({ name: 'g', version: '1.0.0', scripts: { test: 'node runner.js' } }));
  fs.writeFileSync(path.join(dir, 'runner.js'), testScript);
  return dir;
}
const RED = "console.log('Tests: 2 failed');process.exit(1);\n";
const GREEN = "console.log('ok');process.exit(0);\n";

function withHome(fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'moohome-'));
  const prev = process.env.MOOTER_HOME;
  process.env.MOOTER_HOME = home;
  try { return fn(home); } finally {
    if (prev == null) delete process.env.MOOTER_HOME; else process.env.MOOTER_HOME = prev;
    fs.rmSync(home, { recursive: true, force: true });
  }
}

// ── goal-check ───────────────────────────────────────────────────────────────

test('goal-check: emits a deterministic MOO-VERIFY line a /goal predicate can match', () => {
  const green = repo(GREEN);
  const g = goalCheck(green);
  assert.strictEqual(g.pass, true);
  assert.match(g.line, /^MOO-VERIFY: pass=true/);
  fs.rmSync(green, { recursive: true, force: true });

  const red = repo(RED);
  const r = goalCheck(red);
  assert.strictEqual(r.pass, false);
  assert.strictEqual(r.signal, 2, 'fine failing count surfaced for the evaluator');
  assert.match(r.line, /^MOO-VERIFY: pass=false/);
  fs.rmSync(red, { recursive: true, force: true });
});

test('goal-check CLI: exit 0 when green, 2 when red (drives the /goal loop)', () => {
  const green = repo(GREEN);
  const ok = spawnSync(process.execPath, [CLI, 'goal-check', '--cwd', green], { encoding: 'utf8' });
  assert.strictEqual(ok.status, 0);
  assert.match(ok.stdout, /MOO-VERIFY: pass=true/);
  fs.rmSync(green, { recursive: true, force: true });

  const red = repo(RED);
  const bad = spawnSync(process.execPath, [CLI, 'goal-check', '--cwd', red], { encoding: 'utf8' });
  assert.strictEqual(bad.status, 2);
  fs.rmSync(red, { recursive: true, force: true });
});

// ── gate (per-subagent risk + budget for fan-out) ────────────────────────────

test('gate: a benign subagent task is ALLOWED and priced via pricing.js', () => {
  withHome(() => {
    const v = gateSubagent({ task: 'summarize the auth module', window: 'w', tier: 'T2', maxCost: 0.5 });
    assert.strictEqual(v.verdict, 'allow');
    assert.strictEqual(v.granted, true);
    assert.ok(v.cost > 0);
  });
});

test('gate: a destructive subagent task is RISK-BLOCKED before it spawns', () => {
  withHome(() => {
    const v = gateSubagent({ task: 'drop the production users table', window: 'w', maxCost: 0.5 });
    assert.strictEqual(v.verdict, 'risk-blocked');
    assert.strictEqual(v.granted, false);
    assert.strictEqual(v.cost, 0);
    assert.match(v.reason, /drop_table/);
  });
});

test('gate: a per-window budget caps cumulative fan-out spend', () => {
  withHome(() => {
    // each T2 grant ~ $0.036; a $0.05 window admits exactly one
    const a = gateSubagent({ task: 'review file A', window: 'fan', tier: 'T2', maxCost: 0.05 });
    assert.strictEqual(a.verdict, 'allow');
    const b = gateSubagent({ task: 'review file B', window: 'fan', tier: 'T2', maxCost: 0.05 });
    assert.strictEqual(b.verdict, 'budget-exhausted');
    assert.strictEqual(b.granted, false);
    assert.ok(b.window_spent > 0, 'window tracks granted spend across subagents');
  });
});

test('gate CLI: exit codes signal the verdict (allow 0 / risk 3 / budget 4)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'moohome-'));
  const env = { ...process.env, MOOTER_HOME: home };
  const allow = spawnSync(process.execPath, [CLI, 'gate', '--task', 'grep the logs', '--window', 'c', '--max-cost', '$0.05', '--tier', 'T2'], { encoding: 'utf8', env });
  assert.strictEqual(allow.status, 0);
  const risk = spawnSync(process.execPath, [CLI, 'gate', '--task', 'rm -rf /etc', '--window', 'c', '--max-cost', '$0.05'], { encoding: 'utf8', env });
  assert.strictEqual(risk.status, 3);
  const budget = spawnSync(process.execPath, [CLI, 'gate', '--task', 'review again', '--window', 'c', '--max-cost', '$0.05', '--tier', 'T2'], { encoding: 'utf8', env });
  assert.strictEqual(budget.status, 4, 'window already spent by the first allow → budget-exhausted');
  const noTask = spawnSync(process.execPath, [CLI, 'gate', '--window', 'c'], { encoding: 'utf8', env });
  assert.strictEqual(noTask.status, 64, 'missing --task → usage');
  fs.rmSync(home, { recursive: true, force: true });
});

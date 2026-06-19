'use strict';

// moo-loop poll (FASE 2) — regression suite + reproducible demo. Proves the tick
// runs LOCAL ($0), only signals ACTIONABLE on a real local signal, enforces a
// per-window budget, refuses destructive checks, and wraps (not reinvents) /loop.

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const CLI = path.join(__dirname, 'moo-loop.js');
const { pollTick, pollSetup, isActionable, parseInterval, fmtInterval } = require('./moo-loop');

/** Run each test under an isolated MOOTER_HOME so window logs never collide. */
function withHome(fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'moohome-'));
  const prev = process.env.MOOTER_HOME;
  process.env.MOOTER_HOME = home;
  try { return fn(home); } finally {
    if (prev == null) delete process.env.MOOTER_HOME; else process.env.MOOTER_HOME = prev;
    fs.rmSync(home, { recursive: true, force: true });
  }
}

test('parseInterval: units + sub-minute clamps UP to 60s (cron granularity)', () => {
  assert.strictEqual(parseInterval('5m'), 300);
  assert.strictEqual(parseInterval('2h'), 7200);
  assert.strictEqual(parseInterval('1d'), 86400);
  assert.strictEqual(parseInterval('30s'), 60, 'seconds round up to the 1-minute floor');
  assert.strictEqual(parseInterval('garbage'), null);
  assert.strictEqual(fmtInterval(300), '5m');
  assert.strictEqual(fmtInterval(7200), '2h');
});

test('isActionable: rule set is deterministic', () => {
  assert.strictEqual(isActionable({ stdout: 'x', code: 0 }, 'nonempty'), true);
  assert.strictEqual(isActionable({ stdout: '  \n', code: 0 }, 'nonempty'), false);
  assert.strictEqual(isActionable({ stdout: '', code: 1 }, 'nonzero'), true);
  assert.strictEqual(isActionable({ stdout: 'ok', code: 0 }, 'zero'), true);
  assert.strictEqual(isActionable({ stdout: 'CI failed', code: 0 }, 'match:fail'), true);
  assert.strictEqual(isActionable({ stdout: 'all green', code: 0 }, 'match:fail'), false);
});

test('poll-tick QUIET: a check that finds nothing costs $0 and never escalates', () => {
  withHome(() => {
    const v = pollTick({ id: 't-quiet', check: 'true', maxCost: 0.5 });
    assert.strictEqual(v.verdict, 'quiet');
    assert.strictEqual(v.escalated, false);
    assert.strictEqual(v.cost, 0);
  });
});

test('poll-tick ACTIONABLE: a real local signal escalates, priced via pricing.js SSOT', () => {
  withHome(() => {
    const v = pollTick({ id: 't-act', check: 'echo deployment-failed', maxCost: 0.5, escalate: 'investigate' });
    assert.strictEqual(v.verdict, 'actionable');
    assert.strictEqual(v.escalated, true);
    assert.ok(v.cost > 0, 'escalation is priced (not $0)');
    assert.match(v.signal, /deployment-failed/);
    assert.strictEqual(v.escalate, 'investigate');
  });
});

test('budget per window: cumulative escalation cost is enforced across ticks', () => {
  withHome(() => {
    // each actionable Sonnet escalation ~ $0.036; cap $0.05 admits exactly one
    const a = pollTick({ id: 'win', check: 'echo signal', maxCost: 0.05 });
    assert.strictEqual(a.verdict, 'actionable', 'first actionable tick fits the budget');
    const b = pollTick({ id: 'win', check: 'echo signal', maxCost: 0.05 });
    assert.strictEqual(b.verdict, 'budget-exhausted', 'second is suppressed by the window cap');
    assert.strictEqual(b.cost, 0, 'suppressed tick spends nothing');
    assert.ok(b.window_spent > 0, 'window tracks what was already committed');
  });
});

test('risk gate: a destructive check is REFUSED — the command never runs', () => {
  withHome(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pollcwd-'));
    const sentinel = path.join(dir, 'RAN');
    // the rm_rf token must veto the whole string BEFORE the && touch executes
    const v = pollTick({ id: 't-risk', check: `rm -rf /tmp/none && touch ${sentinel}`, cwd: dir, maxCost: 0.5 });
    assert.strictEqual(v.verdict, 'risk-blocked');
    assert.strictEqual(v.cost, 0);
    assert.ok(!fs.existsSync(sentinel), 'destructive check was not executed');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

test('poll setup: wraps the native /loop (does not reinvent cron)', () => {
  withHome(() => {
    const r = pollSetup({ interval: '5m', check: 'git status --short', maxCost: 0.5, escalate: 'fix' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.interval, '5m');
    assert.strictEqual(r.expiryDays, 7, 'surfaces the real 7-day /loop expiry');
    assert.match(r.loopLine, /^\/loop 5m /, 'emits a native /loop line');
    assert.match(r.loopLine, /poll-tick/);
    assert.match(r.loopLine, /--max-cost \$0\.5/);
    const bad = pollSetup({ interval: 'nope', check: 'x' });
    assert.strictEqual(bad.ok, false);
  });
});

test('CLI: poll-tick exit codes signal escalation; poll validates usage', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'moohome-'));
  const env = { ...process.env, MOOTER_HOME: home };
  const act = spawnSync(process.execPath, [CLI, 'poll-tick', '--id', 'c1', '--check', 'echo hit', '--max-cost', '$0.5', '--json'], { encoding: 'utf8', env });
  assert.strictEqual(act.status, 10, 'actionable → exit 10 (distinct signal for the wrapper)');
  const quiet = spawnSync(process.execPath, [CLI, 'poll-tick', '--id', 'c2', '--check', 'true', '--json'], { encoding: 'utf8', env });
  assert.strictEqual(quiet.status, 0, 'quiet → exit 0');
  const badInterval = spawnSync(process.execPath, [CLI, 'poll', 'nope', 'echo x'], { encoding: 'utf8', env });
  assert.strictEqual(badInterval.status, 64, 'bad interval → usage exit 64');
  const noCheck = spawnSync(process.execPath, [CLI, 'poll', '5m'], { encoding: 'utf8', env });
  assert.strictEqual(noCheck.status, 64, 'missing check → usage exit 64');
  fs.rmSync(home, { recursive: true, force: true });
});

test('every tick is logged (cost, verdict) for the budget window', () => {
  withHome((home) => {
    pollTick({ id: 'logwin', check: 'echo x', maxCost: 0.5 });
    pollTick({ id: 'logwin', check: 'true', maxCost: 0.5 });
    const lines = fs.readFileSync(path.join(home, 'poll-logwin.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    assert.strictEqual(lines.length, 2);
    assert.strictEqual(lines[0].verdict, 'actionable');
    assert.strictEqual(lines[1].verdict, 'quiet');
    assert.ok('cost' in lines[0] && 'cost' in lines[1]);
  });
});

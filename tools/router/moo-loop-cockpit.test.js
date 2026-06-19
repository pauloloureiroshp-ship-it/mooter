'use strict';

// moo-loop cockpit observability (FASE 4). Proves `--cockpit` FEEDS the existing
// First-Magic cockpit (cockpit-feed.buildFeed) — lights up active-run.json and
// surfaces a live loop panel (iter, stop_reason, cost/model per tick, budget
// remaining, signal, risk) — without duplicating the cockpit and without
// fabricating: no --cockpit → no pointer, loop renders null ("—").

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const CLI = path.join(__dirname, 'moo-loop.js');
const cockpit = require('./cockpit-feed');

function gradientRepo(n) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlcockpit-'));
  fs.writeFileSync(path.join(dir, 'package.json'),
    JSON.stringify({ name: 'cg', version: '1.0.0', scripts: { test: 'node runner.js' } }));
  fs.writeFileSync(path.join(dir, 'failcount'), String(n));
  fs.writeFileSync(path.join(dir, 'runner.js'),
    "const fs=require('fs');const n=parseInt(fs.readFileSync('failcount','utf8'),10)||0;console.log(`Tests: ${n} failed`);process.exit(n>0?1:0);\n");
  return dir;
}
const FIX_ONE = `node -e 'const fs=require("fs");const n=parseInt(fs.readFileSync("failcount","utf8"),10)||0;fs.writeFileSync("failcount",String(Math.max(0,n-1)))'`;

function run(dir, args) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'moohome-'));
  const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'moorun-'));
  const res = spawnSync(process.execPath, [CLI, 'until', 'default', ...args, '--cwd', dir, '--json'], {
    encoding: 'utf8', env: { ...process.env, MOOTER_HOME: home, MOOTER_RUN_ROOT: runRoot },
  });
  let verdict = null; try { verdict = JSON.parse(res.stdout); } catch { /* */ }
  return { verdict, home };
}

/** buildFeed reads process.env.MOOTER_HOME — set it just for this read. */
function feedFor(home, opts) {
  const prev = process.env.MOOTER_HOME;
  process.env.MOOTER_HOME = home;
  try { return cockpit.buildFeed({ nowMs: Date.now(), ...opts }); } finally {
    if (prev == null) delete process.env.MOOTER_HOME; else process.env.MOOTER_HOME = prev;
  }
}

test('--cockpit lights up active-run.json and feeds a live loop panel', () => {
  const dir = gradientRepo(2);
  const { verdict, home } = run(dir, ['--max-cost', '$0.50', '--max-iters', '12', '--escalate-near', '--cockpit', '--attempt-cmd', FIX_ONE]);
  assert.ok(fs.existsSync(path.join(home, 'workflows', 'active-run.json')), 'the cockpit pointer is written');
  const feed = feedFor(home);
  assert.strictEqual(feed.active, true);
  assert.strictEqual(feed.run_id, verdict.id);
  assert.ok(feed.loop, 'loop panel present');
  assert.strictEqual(feed.loop.stop_reason, 'verified');
  assert.strictEqual(feed.loop.iter, verdict.iters);
  assert.strictEqual(feed.loop.signal, 0);
  assert.strictEqual(feed.loop.budget_remaining, Number((verdict.max_cost - verdict.spent_usd).toFixed(6)));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('no --cockpit → cockpit is NOT fed (no pointer, loop renders null)', () => {
  const dir = gradientRepo(2);
  const { home } = run(dir, ['--max-cost', '$0.50', '--max-iters', '12', '--attempt-cmd', FIX_ONE]);
  assert.ok(!fs.existsSync(path.join(home, 'workflows', 'active-run.json')), 'default run does not hijack the pointer');
  assert.strictEqual(feedFor(home).loop, null, 'no loop → null, never fabricated');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('live: a running loop panel exists mid-run (captured by the coder on iter 0)', () => {
  const dir = gradientRepo(2);
  // on iter 0 the coder snapshots whatever loop-*.state.json the cockpit currently sees
  const capture = `${FIX_ONE} && { [ "$MOO_LOOP_ITER" = "0" ] && cp "$MOOTER_HOME"/loop-*.state.json "${dir}/captured.json" || true; }`;
  run(dir, ['--max-cost', '$0.50', '--max-iters', '12', '--cockpit', '--attempt-cmd', capture]);
  const snap = JSON.parse(fs.readFileSync(path.join(dir, 'captured.json'), 'utf8'));
  assert.strictEqual(snap.status, 'running', 'the cockpit saw a live RUNNING loop mid-flight');
  assert.strictEqual(snap.stop_reason, null, 'no stop_reason while running');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a risk-blocked run surfaces honestly in the loop panel', () => {
  const dir = gradientRepo(2);
  const { home } = run(dir, ['--max-cost', '$0.50', '--max-iters', '12', '--cockpit', '--attempt-cmd', 'rm -rf /']);
  const feed = feedFor(home);
  assert.strictEqual(feed.loop.stop_reason, 'risk-blocked');
  assert.strictEqual(feed.loop.risk_blocked, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('readLoop: null with no active run; honours injected loop', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'emptyhome-'));
  const prev = process.env.MOOTER_HOME; process.env.MOOTER_HOME = empty;
  try {
    assert.strictEqual(cockpit.readLoop({}), null);
    assert.deepStrictEqual(cockpit.readLoop({ loop: { iter: 5 } }), { iter: 5 });
  } finally {
    if (prev == null) delete process.env.MOOTER_HOME; else process.env.MOOTER_HOME = prev;
    fs.rmSync(empty, { recursive: true, force: true });
  }
});

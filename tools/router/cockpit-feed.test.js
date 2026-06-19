'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const { buildFeed, writeActiveRun, clearActiveRun } = require('./cockpit-feed');
const { render6Seg } = require('./statusline-firstmagic');
const { renderCockpit } = require('./cockpit-live');

const NOW = 1781000000000; // fixed clock — no Date.now() flake
const iso = (ms) => new Date(ms).toISOString();
const CAP = { option_a_model: 'qwen2.5:3b' };
// inject totalMemMB so the HW cap is deterministic across machines (8GB → 2 Moos),
// not bound to the test host's RAM.
const base = (extra) => ({ nowMs: NOW, capability: CAP, totalMemMB: 8192, decisionsLog: '/nonexistent', verify: null, ...extra });

// ── feed ────────────────────────────────────────────────────────────────────
test('idle when there is no active run', () => {
  const f = buildFeed(base({ activeRun: null, spawns: [], savings: null }));
  assert.strictEqual(f.active, false);
  assert.match(render6Seg(f), /idle/);
});

test('lights up on a fresh active-run pointer', () => {
  const f = buildFeed(base({ activeRun: { run_id: 'r1', ts: iso(NOW - 10000), maestro_model: 'claude-sonnet-4-6' }, spawns: [], savings: null }));
  assert.strictEqual(f.active, true);
  assert.strictEqual(f.run_secs, 10);
  assert.strictEqual(f.maestro.model, 'claude-sonnet-4-6');
});

test('a stale run pointer is treated as inactive', () => {
  const f = buildFeed(base({ activeRun: { run_id: 'r1', ts: iso(NOW - 10 * 60 * 1000) }, spawns: [], savings: null }));
  assert.strictEqual(f.active, false);
});

test('Moo count is HW-aware (cap from local-fleet), live = running local spawns', () => {
  const f = buildFeed(base({
    activeRun: { run_id: 'r', ts: iso(NOW) },
    spawns: [
      { id: 'a', mode: 'local', status: 'running' },
      { id: 'b', mode: 'local', status: 'done', exitCode: 0 },
      { id: 'c', mode: 'cloud', status: 'running' },
    ],
    savings: null,
  }));
  assert.strictEqual(f.moos_live, 1);          // only the running local one
  assert.strictEqual(f.moos_cap, 2);            // 8GB-M3 fleet via local-fleet (qwen2.5:3b lane)
  assert.strictEqual(f.lanes.length, 3);
  assert.strictEqual(f.lanes[0].badge, '🦙');   // local
  assert.strictEqual(f.lanes[2].badge, '✨');   // cloud
});

test('risk chip reflects real risk_blocked count from decisions.log', () => {
  const tmp = path.join(os.tmpdir(), `dec-${process.pid}.log`);
  fs.writeFileSync(tmp, '{"event":"classified"}\n{"event":"risk_blocked"}\n{"event":"risk_blocked"}\n');
  const f = buildFeed(base({ activeRun: { run_id: 'r', ts: iso(NOW) }, spawns: [], savings: null, decisionsLog: tmp }));
  assert.strictEqual(f.risk.blocked, 2);
  assert.match(render6Seg(f), /⚠️risk:2/);
  fs.unlinkSync(tmp);
});

test('Moo cap is deterministic via injected totalMemMB (regression: not host-RAM bound)', () => {
  const at = (mb) => buildFeed(base({ totalMemMB: mb, activeRun: { run_id: 'r', ts: iso(NOW) }, spawns: [], savings: null })).moos_cap;
  assert.strictEqual(at(8192), 2);   // 8GB M3
  assert.strictEqual(at(65536), 8);  // 64GB → capped at 8
  assert.ok(at(65536) > at(8192));
});

test('honesty (regression): a savings object without a dollar basis renders "—"', () => {
  // pct present but no actual_usd / zero counterfactual → must NOT show a fabricated $0.00
  const f = buildFeed(base({ activeRun: { run_id: 'r', ts: iso(NOW) }, spawns: [], savings: { saved_pct: 99 } }));
  assert.strictEqual(f.savings, null);
  assert.match(render6Seg(f), /\$— vs Opus/);
  const f2 = buildFeed(base({ activeRun: { run_id: 'r', ts: iso(NOW) }, spawns: [], savings: { saved_pct: 0, actual_usd: 0, counterfactual_usd: 0 } }));
  assert.strictEqual(f2.savings, null);
});

test('honesty: no savings data → savings null → "$— vs Opus"', () => {
  const f = buildFeed(base({ activeRun: { run_id: 'r', ts: iso(NOW) }, spawns: [], savings: null }));
  assert.strictEqual(f.savings, null);
  assert.match(render6Seg(f), /\$— vs Opus/);
});

test('real mixed savings render the percentage, not a fabricated number', () => {
  const f = buildFeed(base({ activeRun: { run_id: 'r', ts: iso(NOW) }, spawns: [], savings: { actual_usd: 2.81, counterfactual_usd: 7.2, saved_pct: 61.0 } }));
  assert.match(render6Seg(f), /\(−61% vs Opus\)/);
});

test('lanes with no token data render "—" (never fabricated)', () => {
  const f = buildFeed(base({ activeRun: { run_id: 'r', ts: iso(NOW) }, spawns: [{ id: 'a', mode: 'local', status: 'running', task: 'grep logs' }], savings: null }));
  assert.strictEqual(f.lanes[0].tokens, null);
  assert.match(renderCockpit(f), /—/);
});

test('6-seg statusline has exactly the 6 segments', () => {
  const f = buildFeed(base({ activeRun: { run_id: 'r', ts: iso(NOW - 42000), maestro_model: 'claude-sonnet-4-6' }, spawns: [], savings: { actual_usd: 0.06, counterfactual_usd: 0.2, saved_pct: 70 } }));
  const segs = render6Seg(f).split(' · ');
  assert.strictEqual(segs.length, 6);
  assert.match(segs[0], /maestro:/);
  assert.match(segs[5], /run:42s/);
});

// ── active-run writer round-trip ────────────────────────────────────────────
test('writeActiveRun/clearActiveRun round-trips and lights up the cockpit', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-home-'));
  process.env.MOOTER_HOME = home;
  try {
    writeActiveRun({ run_id: 'demo', maestro_model: 'claude-sonnet-4-6', ts: iso(NOW) });
    const f = buildFeed({ nowMs: NOW, capability: CAP, totalMemMB: 8192, decisionsLog: '/nonexistent', savings: null });
    assert.strictEqual(f.active, true);
    assert.strictEqual(f.run_id, 'demo');
    clearActiveRun();
    const f2 = buildFeed({ nowMs: NOW, capability: CAP, totalMemMB: 8192, decisionsLog: '/nonexistent', savings: null });
    assert.strictEqual(f2.active, false);
  } finally {
    delete process.env.MOOTER_HOME;
    fs.rmSync(home, { recursive: true, force: true });
  }
});

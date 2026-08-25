// Wave 55 (Phase J) — 🔥 burn-rate chip. Hermetic: every test injects a fixed
// `now` and a temp decisions.log, and costs are asserted against pricing.js
// (the SSOT) rather than magic numbers, so a pricing change can't silently rot
// these tests into lies.

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const burn = require('./burn-rate-status.js');
const { estimateTurnCost } = require('./pricing.js');

const NOW = 1_700_000_000_000; // fixed clock
const MIN = 60 * 1000;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-burn-'));
after(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ } });

let seq = 0;
/** Write a decisions.log with the given records, return its path. */
function writeLog(records) {
  const p = path.join(tmp, `decisions-${seq++}.log`);
  // A leading partial line is dropped by the tail reader — prepend a junk line
  // to exercise that path the way the real (mid-file tail) reader sees it.
  const body = ['{"partial":', ...records.map((r) => JSON.stringify(r))].join('\n') + '\n';
  fs.writeFileSync(p, body);
  return p;
}
const classified = (tier, promptLen, agoMin, extra = {}) => ({
  event: 'classified', tier, prompt_len: promptLen, ts_ms: NOW - agoMin * MIN, ...extra,
});

test('empty log → $0.00/h, green, no warn', () => {
  const decisions = burn.readRecentDecisions(NOW, burn.WINDOW_MS, path.join(tmp, 'does-not-exist.log'));
  assert.deepEqual(decisions, []);
  const b = burn.buildBurnChip(decisions);
  assert.equal(b.chip, '🔥 $0.00/h burn');
  assert.equal(b.usd, 0);
  assert.equal(b.color, 'green');
  assert.equal(b.warn, false);
});

test('unreadable log → n/d, never green zero', () => {
  const decisions = burn.readRecentDecisions(NOW, burn.WINDOW_MS, tmp);
  assert.equal(decisions, null);
  const b = burn.buildBurnChip(decisions);
  assert.equal(b.chip, '🔥 n/d burn');
  assert.equal(b.usd, null);
  assert.equal(b.color, null);
  assert.equal(b.warn, false);
});

test('recent T0 (local) calls → $0.00/h burn', () => {
  const p = writeLog([classified('T0', 4000, 5), classified('T0', 9000, 30)]);
  const b = burn.buildBurnChip(burn.readRecentDecisions(NOW, burn.WINDOW_MS, p));
  assert.equal(b.usd, 0, 'local tier is free');
  assert.equal(b.chip, '🔥 $0.00/h burn');
});

test('cloud traffic accrues real cost from pricing.js (no magic numbers)', () => {
  const p = writeLog([classified('T3', 5000, 2), classified('T2', 5000, 4), classified('T0', 5000, 6)]);
  const decisions = burn.readRecentDecisions(NOW, burn.WINDOW_MS, p);
  const expected = estimateTurnCost('T3', 5000) + estimateTurnCost('T2', 5000) + estimateTurnCost('T0', 5000);
  assert.equal(burn.burnRateUsd(decisions), expected);
  assert.equal(burn.buildBurnChip(decisions).chip, `🔥 $${expected.toFixed(2)}/h burn`);
});

test('60-min window boundary — 61min-old excluded, 59min-old included, tester excluded', () => {
  const p = writeLog([
    classified('T3', 8000, 59),                               // in-window
    classified('T3', 8000, 61),                               // out-of-window
    classified('T3', 8000, 5, { source: 'mooter-tester' }),   // synthetic → excluded
    { event: 'turn_end', ts_ms: NOW - 1 * MIN },              // non-classified → excluded
  ]);
  const decisions = burn.readRecentDecisions(NOW, burn.WINDOW_MS, p);
  assert.equal(decisions.length, 1, 'only the 59-min real classified decision counts');
  assert.equal(burn.burnRateUsd(decisions), estimateTurnCost('T3', 8000));
});

test('alert when burn > $5/h → red + warn; colorFor thresholds', () => {
  // enough T3 traffic to clear $5/h, deterministically (pricing.js)
  const each = estimateTurnCost('T3', 50000);
  const n = Math.ceil(5 / each) + 1;
  const recs = Array.from({ length: n }, (_, i) => classified('T3', 50000, (i % 50) * 1)); // all < 60min
  const b = burn.buildBurnChip(burn.readRecentDecisions(NOW, burn.WINDOW_MS, writeLog(recs)));
  assert.ok(b.usd > 5, `expected > $5/h, got $${b.usd.toFixed(2)}`);
  assert.equal(b.color, 'red');
  assert.equal(b.warn, true);
  // boundary checks on the pure classifier
  assert.equal(burn.colorFor(0.99), 'green');
  assert.equal(burn.colorFor(1), 'yellow');
  assert.equal(burn.colorFor(4.99), 'yellow');
  assert.equal(burn.colorFor(5), 'red');
});

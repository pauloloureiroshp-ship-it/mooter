// Wave 58 (A.9) — cost-perf-tracker. Hermetic: temp home for append/read, injected
// `now` for windowing, and pure normalize/report assertions. No real ~/.mooter touched.

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const cpt = require('./cost-perf-tracker.js');
const pricing = require('./pricing.js');

const NOW = Date.parse('2026-06-12T12:00:00Z');
const iso = (ms) => new Date(ms).toISOString();

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-cpt-'));
after(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ } });

let homeSeq = 0;
function freshHome() {
  const h = path.join(tmp, `home-${homeSeq++}`);
  fs.mkdirSync(h, { recursive: true });
  return h;
}

test('normalize: unknown numerics → null, not a fabricated default', () => {
  const row = cpt.normalize({ task_category: 'bug', model_chosen: 'claude-sonnet-4-6' }, NOW);
  assert.equal(row.task_category, 'bug');
  assert.equal(row.model_chosen, 'claude-sonnet-4-6');
  assert.equal(row.expected_score, null);
  assert.equal(row.actual_score, null);
  assert.equal(row.expected_duration_ms, null);
  assert.equal(row.actual_duration_ms, null);
  // no tokens + no explicit cost → cost stays null (honest)
  assert.equal(row.expected_cost, null);
  assert.equal(row.actual_cost, null);
  assert.equal(row.ts, iso(NOW));
});

test('normalize: cost derived from tokens via priceTurn (no duplicated pricing)', () => {
  const row = cpt.normalize({
    task_category: 'refactor',
    model_chosen: 'claude-sonnet-4-6',
    actual_tokens_in: 1000,
    actual_tokens_out: 2000,
  }, NOW);
  const expected = pricing.priceTurn('claude-sonnet-4-6', 1000, 2000);
  assert.equal(row.actual_cost, expected);
  assert.ok(expected > 0);
});

test('normalize: explicit cost is trusted over token derivation', () => {
  const row = cpt.normalize({ task_category: 'x', model_chosen: 'ollama', actual_cost: 0.42 }, NOW);
  assert.equal(row.actual_cost, 0.42);
});

test('appendCostPerf writes one JSONL line per call; readRows parses them', () => {
  const home = freshHome();
  assert.equal(cpt.appendCostPerf({ task_category: 'a', model_chosen: 'ollama' }, { home, now: NOW }), true);
  assert.equal(cpt.appendCostPerf({ task_category: 'b', model_chosen: 'claude-haiku-4-5' }, { home, now: NOW }), true);
  const raw = fs.readFileSync(cpt.logPath(home), 'utf8').trim().split('\n');
  assert.equal(raw.length, 2);
  const rows = cpt.readRows({ home, now: NOW, last_days: 30 });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].task_category, 'a');
});

test('appendCostPerf never throws on a bad home → returns false', () => {
  // a path whose parent is a file cannot become a dir → write fails, but no throw
  const home = freshHome();
  const filePath = path.join(home, 'not-a-dir');
  fs.writeFileSync(filePath, 'x');
  const res = cpt.appendCostPerf({ task_category: 'z' }, { home: path.join(filePath, 'sub') });
  assert.equal(res, false);
});

test('readRows filters rows outside the last_days window', () => {
  const home = freshHome();
  cpt.appendCostPerf({ task_category: 'old', ts: iso(NOW - 40 * 86400000) }, { home, now: NOW });
  cpt.appendCostPerf({ task_category: 'new', ts: iso(NOW - 2 * 86400000) }, { home, now: NOW });
  const rows = cpt.readRows({ home, now: NOW, last_days: 7 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].task_category, 'new');
});

test('reportCostPerf: per-category breakdown + drift + Pareto', () => {
  const home = freshHome();
  // bug: expected cheaper than actual → positive cost drift
  cpt.appendCostPerf({
    task_category: 'bug', model_chosen: 'claude-sonnet-4-6',
    expected_cost: 0.01, actual_cost: 0.05,
    expected_score: 0.8, actual_score: 0.9,
    expected_duration_ms: 1000, actual_duration_ms: 1500,
  }, { home, now: NOW });
  cpt.appendCostPerf({
    task_category: 'bug', model_chosen: 'claude-sonnet-4-6',
    expected_cost: 0.03, actual_cost: 0.05,
  }, { home, now: NOW });
  // chat: small spend
  cpt.appendCostPerf({
    task_category: 'chat', model_chosen: 'claude-haiku-4-5',
    expected_cost: 0.001, actual_cost: 0.002,
  }, { home, now: NOW });

  const rep = cpt.reportCostPerf({ home, now: NOW, last_days: 30 });
  assert.equal(rep.total, 3);
  assert.equal(rep.window_days, 30);

  const bug = rep.categories.find((c) => c.category === 'bug');
  assert.equal(bug.count, 2);
  assert.equal(bug.model_chosen, 'claude-sonnet-4-6');
  // mean expected = (0.01+0.03)/2 = 0.02 ; mean actual = 0.05
  assert.ok(Math.abs(bug.expected_cost - 0.02) < 1e-9);
  assert.ok(Math.abs(bug.actual_cost - 0.05) < 1e-9);
  assert.ok(Math.abs(bug.cost_drift - 0.03) < 1e-9);
  // score/duration means only over rows that carried them (the first row)
  assert.ok(Math.abs(bug.score_drift - 0.1) < 1e-9);
  assert.ok(Math.abs(bug.duration_drift - 500) < 1e-9);

  // Pareto: bug realized spend = 0.10, chat = 0.002 → bug dominates
  assert.equal(rep.pareto.top_cost_category, 'bug');
  assert.ok(rep.pareto.top_cost_share > 0.9);
  assert.match(rep.pareto.insight, /bug drives/);

  // totals
  assert.ok(Math.abs(rep.totals.actual_cost - 0.102) < 1e-9);
  assert.ok(Math.abs(rep.totals.expected_cost - 0.041) < 1e-9);
});

test('reportCostPerf: missing metrics → null drift (honest, not 0)', () => {
  const home = freshHome();
  cpt.appendCostPerf({ task_category: 'k', model_chosen: 'ollama' }, { home, now: NOW });
  const rep = cpt.reportCostPerf({ home, now: NOW, last_days: 30 });
  const k = rep.categories.find((c) => c.category === 'k');
  assert.equal(k.expected_score, null);
  assert.equal(k.actual_score, null);
  assert.equal(k.score_drift, null);
  assert.equal(k.duration_drift, null);
});

test('reportCostPerf: empty journal → zeros + null pareto, no throw', () => {
  const home = freshHome();
  const rep = cpt.reportCostPerf({ home, now: NOW, last_days: 30 });
  assert.equal(rep.total, 0);
  assert.equal(rep.totals.actual_cost, 0);
  assert.equal(rep.totals.cost_drift, null);
  assert.equal(rep.pareto.top_cost_category, null);
  assert.deepEqual(rep.categories, []);
});

'use strict';

// perf-validate.test.js — WS2 (perf-validation). Verifies the validation runner
// is deterministic and honest: cost is computed from the frozen classifier +
// pricing.js, quality is read (not invented), and the Pareto points carry their
// provenance. No network — classify is local/deterministic; speed reads a fixture.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const pv = require('./perf-validate.js');

test('classifyCorpus is deterministic and covers the documented N', () => {
  const rows = pv.classifyCorpus();
  assert.strictEqual(rows.length, 12, 'documented N=12');
  // Re-running yields identical tiers (frozen classifier).
  const again = pv.classifyCorpus();
  assert.deepStrictEqual(rows.map((r) => r.got), again.map((r) => r.got));
  for (const r of rows) {
    assert.ok(r.got === null || pv.TIERS.includes(r.got));
    assert.ok(typeof r.promptLen === 'number' && r.promptLen > 0);
  }
});

test('costAnalysis: Mooter never costs more than all-Opus and saves a sane %', () => {
  const rows = pv.classifyCorpus();
  const c = pv.costAnalysis(rows);
  assert.ok(c.mooter_usd <= c.opus_usd, 'routed cost ≤ baseline');
  assert.ok(c.saved_pct >= 0 && c.saved_pct <= 100);
  assert.ok(c.accuracy_pct >= 0 && c.accuracy_pct <= 100);
  // T0 prompts are free (local) — a corpus with T0 routes must have $0 in T0.
  assert.strictEqual(c.perTier.T0.usd, 0);
  assert.strictEqual(c.n, 12);
});

test('strategyCosts: all-Opus is the most expensive, Oracle ≤ Mooter ≤ all-Opus', () => {
  const rows = pv.classifyCorpus();
  const s = pv.strategyCosts(rows);
  assert.ok(s.all_opus.usd >= s.mooter.usd);
  assert.ok(s.mooter.usd >= s.oracle.usd - 1e-9, 'Mooter ≥ Oracle (accuracy < 100%)');
  assert.ok(s.all_haiku.usd <= s.all_sonnet.usd, 'Haiku cheaper than Sonnet');
  assert.ok(s.all_sonnet.usd <= s.all_opus.usd);
});

test('qualityAnalysis aggregates a fixture matrix and flags provenance', () => {
  const matrix = {
    'qwen2.5:3b:simple': { wins: 3, ties: 2, losses: 0 },
    'qwen3:30b:hard': { wins: 1, ties: 4, losses: 5 },
  };
  const q = pv.qualityAnalysis(matrix);
  assert.strictEqual(q.available, true);
  assert.strictEqual(q.comparisons, 15);
  assert.strictEqual(q.wins, 4);
  assert.strictEqual(q.ties, 6);
  assert.strictEqual(q.losses, 5);
  assert.strictEqual(q.non_regression_pct, Math.round(((4 + 6) / 15) * 1000) / 10);
  assert.ok(/PRIOR/i.test(q.source) && /not re-run/i.test(q.source), 'labels prior, not fresh');
});

test('qualityAnalysis returns available:false on a missing matrix (no fabrication)', () => {
  const q = pv.qualityAnalysis(null);
  assert.strictEqual(q.available, false);
  assert.strictEqual(q.comparisons, undefined);
});

test('speedTable separates measured-local from estimated-cloud', () => {
  const tmp = path.join(os.tmpdir(), `perf-validate-speed-${process.pid}.jsonl`);
  fs.writeFileSync(
    tmp,
    JSON.stringify({ model: 'qwen2.5:3b', warm: { tps: 240, ttft_ms: 130 }, cold: { ttft_ms: 1900, load_ms: 1850, tps: 235 } }) + '\n'
  );
  const t = pv.speedTable({ speedLog: tmp });
  assert.strictEqual(t.has_local_measurement, true);
  assert.strictEqual(t.local[0].estimated, false);
  assert.strictEqual(t.local[0].source, 'measured');
  assert.ok(t.cloud.length >= 1);
  for (const c of t.cloud) {
    assert.strictEqual(c.estimated, true, 'cloud is always flagged estimated here');
    assert.ok(c.basis && /NOT measured/i.test(c.basis));
  }
  fs.rmSync(tmp, { force: true });
});

test('speedTable mantém medição local n/d quando o log é ilegível', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-validate-speed-unreadable-'));
  try {
    const t = pv.speedTable({ speedLog: dir });
    assert.strictEqual(t.has_local_measurement, null);
    assert.strictEqual(t.local, null);
    assert.ok(t.cloud.length >= 1, 'estimativas cloud continuam independentes');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('paretoPoints: baseline is 100/100, Mooter quality = A/B non-regression', () => {
  const rows = pv.classifyCorpus();
  const s = pv.strategyCosts(rows);
  const q = pv.qualityAnalysis({ 'm:c': { wins: 8, ties: 2, losses: 0 } });
  const pts = pv.paretoPoints(s, q);
  const baseline = pts.find((p) => /all-Opus/.test(p.strategy));
  assert.strictEqual(baseline.cost_pct_of_opus, 100);
  assert.strictEqual(baseline.quality_pct, 100);
  const mooter = pts.find((p) => /Mooter/.test(p.strategy));
  assert.strictEqual(mooter.quality_pct, q.non_regression_pct);
  const single = pts.find((p) => /BestSingle/.test(p.strategy));
  assert.strictEqual(single.quality_pct, null, 'single-model baselines are cost-only');
});

test('run() assembles a complete, self-describing result object', () => {
  const res = pv.run({ now: 0, speedLog: path.join(os.tmpdir(), 'definitely-missing.jsonl') });
  assert.ok(res.methodology && /RouterBench/i.test(res.methodology));
  assert.strictEqual(res.sample.n, 12);
  assert.ok(res.cost && res.strategies && res.quality && res.speed && res.pareto);
  assert.strictEqual(res.speed.has_local_measurement, false, 'missing speed log → no fabricated local data');
  assert.ok(Array.isArray(res.pareto) && res.pareto.length === 6);
});

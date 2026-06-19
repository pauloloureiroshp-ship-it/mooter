'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { generate } = require('./generator');
const { run, score } = require('./run-bench');

test('generator is deterministic: same seed → byte-identical set', () => {
  const a = generate({ seed: 20260619 });
  const b = generate({ seed: 20260619 });
  assert.deepStrictEqual(a, b);
});

test('a different seed → a different set (real variation)', () => {
  const a = generate({ seed: 1 });
  const b = generate({ seed: 2 });
  assert.notDeepStrictEqual(a.map((r) => r.prompt), b.map((r) => r.prompt));
});

test('label distribution: 60 risk / 90 no-risk (2 risk buckets, 3 safe), Youden-safe', () => {
  const rows = generate();
  const risk = rows.filter((r) => r.is_risk).length;
  assert.strictEqual(risk, 60);
  assert.strictEqual(rows.length - risk, 90);
});

test('all five buckets present, labels match the rule', () => {
  const rows = generate();
  const byBucket = {};
  for (const r of rows) (byBucket[r.bucket] = byBucket[r.bucket] || new Set()).add(r.is_risk);
  assert.deepStrictEqual([...byBucket['disguised-known']], [true]);
  assert.deepStrictEqual([...byBucket['disguised-unknown']], [true]);
  assert.deepStrictEqual([...byBucket['asking']], [false]);
  assert.deepStrictEqual([...byBucket['dev']], [false]);
  assert.deepStrictEqual([...byBucket['scary-benign']], [false]);
});

test('held-out set is DISJOINT from the design set (exact_overlap == 0)', () => {
  const res = run({ classify: false });
  assert.strictEqual(res.disjointness.exact_overlap, 0);
});

test('RISK buckets do not leak: nearest-neighbour token-Jaccard stays low (no recall inflation)', () => {
  const res = run({ classify: false });
  // recall is driven by the risk buckets; if these paraphrased design risk prompts, the
  // 0.467 would be inflated. Guard that the risk-bucket max Jaccard is well below a paraphrase.
  assert.ok(res.disjointness.max_jaccard_risk_buckets <= 0.45, `risk-bucket max Jaccard ${res.disjointness.max_jaccard_risk_buckets} must stay low`);
});

test('scorer math is correct on a tiny hand-checked set', () => {
  const rows = [
    { bucket: 'x', is_risk: true, prompt: 'a' },
    { bucket: 'x', is_risk: true, prompt: 'b' },
    { bucket: 'x', is_risk: false, prompt: 'c' },
    { bucket: 'x', is_risk: false, prompt: 'd' },
  ];
  // predict risk for 'a' (tp) and 'c' (fp); miss 'b' (fn); 'd' correct (tn)
  const m = score(rows, (p) => p === 'a' || p === 'c');
  assert.strictEqual(m.tp, 1); assert.strictEqual(m.fp, 1); assert.strictEqual(m.fn, 1); assert.strictEqual(m.tn, 1);
  assert.strictEqual(m.tpr, 0.5); assert.strictEqual(m.fpr, 0.5); assert.strictEqual(m.youden, 0);
});

test('moo-risk beats the trivial baselines on the held-out set (real signal)', () => {
  const res = run({ classify: false });
  assert.ok(res.metrics.moo_risk.youden > res.metrics.always_T3.youden);
  assert.ok(res.metrics.moo_risk.youden > res.metrics.tenline_keyword.youden);
  assert.ok(res.metrics.moo_risk.youden > 0.3, `out-of-design Youden ${res.metrics.moo_risk.youden} should be a real (>0.3) signal`);
});

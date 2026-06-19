'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { computeRunSavings } = require('./run-savings');
const { priceTurn } = require('./pricing');

test('counterfactual is REAL: all lanes priced at the maestro via pricing.js SSOT', () => {
  const lanes = [
    { target: 'local', model: 'qwen2.5:3b', input_tokens: 1000, output_tokens: 1000 },
    { target: 'cloud', model: 'claude-sonnet-4-6', input_tokens: 1000, output_tokens: 1000 },
  ];
  const r = computeRunSavings({ lanes, maestro: 'claude-opus-4-6[1m]' });
  const expectedCf = priceTurn('claude-opus-4-6[1m]', 2000, 2000); // both lanes at Opus
  const expectedActual = 0 + priceTurn('claude-sonnet-4-6', 1000, 1000); // local $0 + cloud real
  assert.ok(Math.abs(r.counterfactual_usd - expectedCf) < 1e-9);
  assert.ok(Math.abs(r.actual_usd - expectedActual) < 1e-9);
  assert.ok(Math.abs(r.saved_usd - (expectedCf - expectedActual)) < 1e-9);
});

test('local lanes cost $0 (actual) but count toward the counterfactual', () => {
  const r = computeRunSavings({ lanes: [{ target: 'local', model: 'qwen2.5:3b', input_tokens: 5000, output_tokens: 5000 }] });
  assert.strictEqual(r.actual_usd, 0);
  assert.ok(r.counterfactual_usd > 0);
  assert.strictEqual(r.saved_pct, 100); // everything local → 100% saved vs all-Opus
});

test('honesty: no measured tokens → saved is null (—), never fabricated', () => {
  const r = computeRunSavings({ lanes: [{ target: 'local', model: 'qwen2.5:3b' }, { target: 'cloud', model: 'claude-sonnet-4-6' }] });
  assert.strictEqual(r.saved_usd, null);
  assert.strictEqual(r.counterfactual_usd, null);
  assert.match(r.basis, /not fabricated/);
});

test('empty run → null savings, no crash', () => {
  const r = computeRunSavings({});
  assert.strictEqual(r.saved_usd, null);
  assert.strictEqual(r.local_lanes, 0);
});

test('per-lane breakdown flags which lanes were measured', () => {
  const r = computeRunSavings({ lanes: [
    { target: 'local', model: 'qwen2.5:3b', input_tokens: 100, output_tokens: 100, label: 'grep' },
    { target: 'cloud', model: 'claude-sonnet-4-6' },
  ] });
  const grep = r.per_lane.find((l) => l.label === 'grep');
  assert.strictEqual(grep.measured, true);
  assert.strictEqual(r.per_lane.find((l) => l.target === 'cloud').measured, false);
  assert.strictEqual(r.measured_lanes, 1);
});

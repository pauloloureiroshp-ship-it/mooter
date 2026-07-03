// calibration.test.js — DC-16: coverage, auto-widen, reliability. Pure reducers.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const cal = require('./calibration.js');

test('buildClosed marks in_p50 / in_p90 against the PUBLISHED bands', () => {
  const fc = { forecast_id: 'f1', wave_id: 'W1', class: 'feature_impl', p50_wall: 100, p90_wall: 200, p50_work: 50, p90_work: 120 };
  const under = cal.buildClosed(fc, { actual_wall_ms: 150, actual_work_ms: 40 });
  assert.equal(under.in_p50_wall, false, '150 > p50 100');
  assert.equal(under.in_p90_wall, true, '150 ≤ p90 200');
  assert.equal(under.in_p50_work, true, '40 ≤ p50 50');
  const over = cal.buildClosed(fc, { actual_wall_ms: 250 });
  assert.equal(over.in_p90_wall, false, '250 > p90 200 — the P90 missed');
});

function closed(cls, actual, predP90) {
  return { kind: 'closed', class: cls, actual_wall_ms: actual, pred_p90_wall: predP90,
    in_p90_wall: actual <= predP90, in_p50_wall: actual <= predP90 / 2 };
}

test('auto-widen (DC-16): reals overshooting the P90 → factor > 1', () => {
  // Published p90_wall = 100 every time; reals overshoot repeatedly.
  const entries = [80, 90, 150, 200, 300].map((a) => closed('feature_impl', a, 100));
  const widen = cal.autoWidenFactor(entries, 'feature_impl');
  assert.ok(widen > 1, 'coverage below nominal → widen ' + widen);
});

test('auto-widen: a well-calibrated P90 does NOT narrow (factor stays 1)', () => {
  const entries = [40, 55, 60, 70, 90].map((a) => closed('feature_impl', a, 100)); // all under
  const widen = cal.autoWidenFactor(entries, 'feature_impl');
  assert.equal(widen, 1, 'never narrows below 1');
});

test('auto-widen needs evidence: <5 closed → factor 1', () => {
  const entries = [300, 300].map((a) => closed('feature_impl', a, 100));
  assert.equal(cal.autoWidenFactor(entries, 'feature_impl'), 1);
});

test('coverage + reliability read the closed record', () => {
  const entries = [40, 50, 60, 300, 55, 45, 70, 65].map((a) => closed('feature_impl', a, 100));
  const cov = cal.coverage(entries, { class: 'feature_impl' });
  assert.equal(cov.n, 8);
  assert.equal(cov.p90_coverage, 7 / 8, '7 of 8 under the P90');
  const rel = cal.reliability(entries, 'feature_impl');
  assert.ok(rel.score > 0 && rel.score <= 1, 'score in (0,1]: ' + rel.score);
  assert.equal(rel.n_closed, 8);
});

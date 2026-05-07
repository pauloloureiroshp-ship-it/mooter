#!/usr/bin/env node
// @ts-check
/**
 * Tests for drift-detector.js — pure helpers only (no I/O).
 *
 * Run with:  node --test drift-detector.test.js
 */

'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const {
  tierDistribution,
  detectDrift,
  TIERS,
  DRIFT_THRESHOLD_PCT,
  DRIFT_SEVERE_PCT,
  BASELINE_MIN_EVENTS,
} = require('./drift-detector.js');

// ── tierDistribution ────────────────────────────────────────────────────

test('tierDistribution: null on empty / non-array input', () => {
  assert.equal(tierDistribution([]),       null);
  assert.equal(tierDistribution(null),     null);
  assert.equal(tierDistribution('nope'),   null);
});

test('tierDistribution: ignores rows without canonical tier', () => {
  const events = [
    { tier: 'T0' }, { tier: 'T0' }, { tier: 'T1' }, { tier: 'T7' }, {},
  ];
  const d = tierDistribution(events);
  assert.equal(d._total, 3);
  assert.ok(Math.abs(d.T0 - 2 / 3) < 1e-9);
  assert.ok(Math.abs(d.T1 - 1 / 3) < 1e-9);
  assert.equal(d.T2, 0);
  assert.equal(d.T3, 0);
});

test('tierDistribution: sums to 1 across the four canonical tiers', () => {
  const events = TIERS.map((t) => ({ tier: t }));
  const d = tierDistribution(events);
  const total = d.T0 + d.T1 + d.T2 + d.T3;
  assert.ok(Math.abs(total - 1) < 1e-9);
});

// ── detectDrift ─────────────────────────────────────────────────────────

test('detectDrift: drift=false when either side is missing', () => {
  assert.equal(detectDrift(null, { T0: 0.5, T1: 0.2, T2: 0.2, T3: 0.1 }).drift, false);
  assert.equal(detectDrift({ T0: 1, T1: 0, T2: 0, T3: 0 }, null).drift, false);
});

test('detectDrift: refuses verdict when baseline is below MIN_EVENTS', () => {
  const recent  = { T0: 0.9, T1: 0, T2: 0, T3: 0.1 };
  const baseline = { T0: 0.3, T1: 0.3, T2: 0.2, T3: 0.2, _total: BASELINE_MIN_EVENTS - 1 };
  const v = detectDrift(recent, baseline);
  assert.equal(v.drift, false);
  assert.equal(v.reason, 'baseline_too_small');
});

test('detectDrift: drift=false when distributions are within threshold', () => {
  const recent   = { T0: 0.50, T1: 0.20, T2: 0.20, T3: 0.10 };
  const baseline = { T0: 0.55, T1: 0.18, T2: 0.18, T3: 0.09, _total: 1000 };
  const v = detectDrift(recent, baseline);
  assert.equal(v.drift, false);
  // Largest delta is on T0 = 5 pp, well below the 10pp threshold.
  assert.ok((v.deltaPct ?? 0) < DRIFT_THRESHOLD_PCT);
});

test('detectDrift: drift severity=mild between threshold and severe', () => {
  const recent   = { T0: 0.40, T1: 0.20, T2: 0.20, T3: 0.20 };
  const baseline = { T0: 0.55, T1: 0.20, T2: 0.15, T3: 0.10, _total: 1000 };
  const v = detectDrift(recent, baseline);
  assert.equal(v.drift, true);
  assert.equal(v.severity, 'mild');
  assert.equal(v.tier, 'T0');
  assert.equal(v.actual, 40);
  assert.equal(v.expected, 55);
  assert.equal(v.deltaPct, 15);
});

test('detectDrift: severity=severe when delta ≥ DRIFT_SEVERE_PCT', () => {
  const recent   = { T0: 0.20, T1: 0.20, T2: 0.20, T3: 0.40 };
  const baseline = { T0: 0.60, T1: 0.20, T2: 0.10, T3: 0.10, _total: 1000 };
  const v = detectDrift(recent, baseline);
  assert.equal(v.drift, true);
  assert.equal(v.severity, 'severe');
  // Largest delta lives on T0 = 40 pp.
  assert.equal(v.tier, 'T0');
  assert.ok((v.deltaPct ?? 0) >= DRIFT_SEVERE_PCT);
});

test('detectDrift: picks the worst-offending tier, not the first', () => {
  // T2 drifts 25pp, T3 drifts 5pp, T0 drifts 10pp — verdict must name T2.
  const recent   = { T0: 0.40, T1: 0.20, T2: 0.30, T3: 0.10 };
  const baseline = { T0: 0.50, T1: 0.20, T2: 0.05, T3: 0.05, _total: 1000 };
  // Wait — T2 delta = |0.30 - 0.05| = 0.25 (largest). T3 delta = 0.05. T0 = 0.10.
  const v = detectDrift(recent, baseline);
  assert.equal(v.drift, true);
  assert.equal(v.tier, 'T2');
  assert.equal(v.deltaPct, 25);
});

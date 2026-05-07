#!/usr/bin/env node
// @ts-check
/**
 * Tests for confidence-calibrator.js — pure helpers only (no I/O).
 *
 * Run with:  node --test confidence-calibrator.test.js
 */

'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const {
  bucketIndex,
  bucketLabel,
  calibrationCurve,
  bucketCalibrationError,
  formatCalibration,
  BUCKET_COUNT,
} = require('./confidence-calibrator.js');

// ── bucketIndex ─────────────────────────────────────────────────────────

test('bucketIndex: clamps to [0, BUCKET_COUNT-1]', () => {
  assert.equal(bucketIndex(0),    0);
  assert.equal(bucketIndex(0.05), 0);
  assert.equal(bucketIndex(0.5),  5);
  assert.equal(bucketIndex(0.95), 9);
  assert.equal(bucketIndex(1),    BUCKET_COUNT - 1);
  assert.equal(bucketIndex(1.5),  BUCKET_COUNT - 1);
  assert.equal(bucketIndex(-1),   0);
  assert.equal(bucketIndex(NaN),  0);
});

test('bucketLabel: shows the half-open range to one decimal', () => {
  assert.equal(bucketLabel(0), '0.0–0.1');
  assert.equal(bucketLabel(7), '0.7–0.8');
  assert.equal(bucketLabel(9), '0.9–1.0');
});

// ── calibrationCurve ────────────────────────────────────────────────────

test('calibrationCurve: empty input → all buckets null', () => {
  const c = calibrationCurve([]);
  assert.equal(c.sampled, 0);
  assert.equal(c.brier_score, null);
  for (const b of c.buckets) {
    assert.equal(b.count, 0);
    assert.equal(b.pass_rate, null);
  }
});

test('calibrationCurve: skips events without an oracle-eligible category', () => {
  const events = [
    { event: 'classified', task_category: 'arch_decision', confidence: 0.9 },
    { event: 'classified', task_category: 'bug_investigation', confidence: 0.7 },
  ];
  const c = calibrationCurve(events);
  assert.equal(c.sampled, 0);
  assert.equal(c.skipped_no_oracle, 2);
});

test('calibrationCurve: counts oracle-passing event in correct bucket', () => {
  // format_transform → json_parse oracle. A valid JSON-bearing prompt passes.
  const events = [{
    event: 'classified',
    task_category: 'format_transform',
    confidence: 0.85,
    prompt_preview: 'parse this {"a": 1, "b": [2, 3]} as objects',
  }];
  const c = calibrationCurve(events);
  assert.equal(c.sampled, 1);
  // 0.85 → bucket index 8 (0.8-0.9)
  assert.equal(c.buckets[8].count, 1);
  assert.equal(c.buckets[8].passed, 1);
  assert.equal(c.buckets[8].pass_rate, 1);
});

test('calibrationCurve: counts oracle-failing event as not-passed', () => {
  const events = [{
    event: 'classified',
    task_category: 'format_transform',
    confidence: 0.5,
    prompt_preview: 'parse this {bad json: missing quotes} please',
  }];
  const c = calibrationCurve(events);
  assert.equal(c.sampled, 1);
  // 0.5 → bucket index 5 (0.5-0.6)
  assert.equal(c.buckets[5].count, 1);
  assert.equal(c.buckets[5].passed, 0);
  assert.equal(c.buckets[5].pass_rate, 0);
});

test('calibrationCurve: tester events are skipped', () => {
  const events = [{
    event: 'classified',
    source: 'mooter-tester',
    task_category: 'format_transform',
    confidence: 0.85,
    prompt_preview: 'parse this {"a":1}',
  }];
  const c = calibrationCurve(events);
  assert.equal(c.sampled, 0);
});

test('calibrationCurve: skips when oracle returns inapplicable', () => {
  // format_transform with no JSON in the prompt → oracle inapplicable.
  const events = [{
    event: 'classified',
    task_category: 'format_transform',
    confidence: 0.9,
    prompt_preview: 'no json here, just words',
  }];
  const c = calibrationCurve(events);
  assert.equal(c.sampled, 0);
  assert.equal(c.skipped_oracle_inapplicable, 1);
});

test('calibrationCurve: brier score = 0 when calibration is perfect', () => {
  // Three events that all pass at confidence=1.0 → perfectly calibrated.
  const events = Array(3).fill(null).map(() => ({
    event: 'classified',
    task_category: 'format_transform',
    confidence: 1.0,
    prompt_preview: '{"valid":true}',
  }));
  const c = calibrationCurve(events);
  assert.equal(c.sampled, 3);
  assert.equal(c.brier_score, 0);
});

test('calibrationCurve: brier score = 1 when classifier is maximally wrong', () => {
  // Confidence=1.0 but oracle fails → maximum miscalibration.
  const events = [{
    event: 'classified',
    task_category: 'format_transform',
    confidence: 1.0,
    prompt_preview: '{not valid json}',
  }];
  const c = calibrationCurve(events);
  assert.equal(c.sampled, 1);
  assert.equal(c.brier_score, 1);
});

// ── bucketCalibrationError ──────────────────────────────────────────────

test('bucketCalibrationError: 0 when pass_rate matches midpoint exactly', () => {
  const b = { index: 7, label: '0.7-0.8', count: 100, passed: 75, pass_rate: 0.75 };
  // midpoint of bucket 7 is 0.75; pass_rate is also 0.75 → error = 0.
  assert.equal(bucketCalibrationError(b), 0);
});

test('bucketCalibrationError: |midpoint - pass_rate| otherwise', () => {
  const b = { index: 8, label: '0.8-0.9', count: 100, passed: 50, pass_rate: 0.5 };
  // midpoint = 0.85; pass_rate = 0.5; error = 0.35
  assert.ok(Math.abs(bucketCalibrationError(b) - 0.35) < 1e-9);
});

test('bucketCalibrationError: null when bucket is empty', () => {
  const b = { index: 4, label: '0.4-0.5', count: 0, passed: 0, pass_rate: null };
  assert.equal(bucketCalibrationError(b), null);
});

// ── formatCalibration ───────────────────────────────────────────────────

test('formatCalibration: includes brier verdict tag', () => {
  const tight   = formatCalibration({ buckets: [], sampled: 1, skipped_no_oracle: 0, skipped_oracle_inapplicable: 0, brier_score: 0.05 });
  const loose   = formatCalibration({ buckets: [], sampled: 1, skipped_no_oracle: 0, skipped_oracle_inapplicable: 0, brier_score: 0.18 });
  const uncal   = formatCalibration({ buckets: [], sampled: 1, skipped_no_oracle: 0, skipped_oracle_inapplicable: 0, brier_score: 0.40 });
  assert.match(tight, /✓ tight/);
  assert.match(loose, /⚠ loose/);
  assert.match(uncal, /✗ uncalibrated/);
});

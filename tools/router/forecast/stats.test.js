// stats.test.js — percentiles, cold-start gate (DC-04), regime-break (DC-02).
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const stats = require('./stats.js');
const { mulberry32 } = require('./rng.js');

test('percentile: linear interpolation, clamped, empty→null', () => {
  assert.equal(stats.percentile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(stats.percentile([1, 2, 3, 4], 0), 1);
  assert.equal(stats.percentile([1, 2, 3, 4], 1), 4);
  assert.equal(stats.percentile([], 0.5), null);
  assert.equal(stats.percentile([7], 0.9), 7);
});

test('cold-start gate (DC-04): n<k → calibrating, no cone drawn', () => {
  const s = stats.buildSample([10, 12, 11, 9, 10], { k: 8 });
  assert.equal(s.n, 5);
  assert.equal(s.calibrating, true, 'below k=8 → calibrating');
  // n<6 → cusum returns -1, so nothing is discarded from a thin sample.
  assert.equal(s.regimeBreakAt, -1);
});

test('regime-break (DC-02): a sustained shift DISCARDS the old regime', () => {
  // 6 constant lows, then 8 highs. The learns-forever tail is the new regime;
  // the pre-break lows must be thrown away, not averaged in.
  const lows = [10, 10, 10, 10, 10, 10];
  const highs = [100, 101, 99, 102, 100, 98, 101, 100];
  const s = stats.buildSample(lows.concat(highs), { k: 8, cusum: true });
  assert.ok(s.regimeBreakAt > 0, 'a break was detected');
  assert.equal(s.discardedPreBreak, 6, 'discarded the 6 pre-break lows');
  assert.equal(s.n, 8);
  assert.ok(s.values.every((v) => v >= 90), 'only the new regime survives: ' + s.values);
  assert.equal(s.calibrating, false, '8 post-break samples clears the k=8 floor');
});

test('no false regime break on a stable series', () => {
  const stable = [50, 52, 49, 51, 50, 48, 53, 50, 51, 49];
  const s = stats.buildSample(stable, { k: 8 });
  assert.equal(s.regimeBreakAt, -1);
  assert.equal(s.n, 10);
});

test('sliding window keeps only the last N (DC-02)', () => {
  const many = Array.from({ length: 60 }, (_, i) => i + 1);
  const s = stats.buildSample(many, { window: 40, cusum: false });
  assert.equal(s.n, 40);
  assert.equal(s.values[0], 21, 'dropped the oldest 20');
});

test('bootstrapBand is deterministic under a seeded rng', () => {
  const vals = [3, 5, 8, 2, 9, 4, 7, 6, 5, 8];
  const a = stats.bootstrapBand(vals, 0.9, { rng: mulberry32(42), iterations: 200 });
  const b = stats.bootstrapBand(vals, 0.9, { rng: mulberry32(42), iterations: 200 });
  assert.deepEqual(a, b, 'same seed → identical band');
  assert.ok(a.lo <= a.mid && a.mid <= a.hi, 'band brackets the point estimate');
});

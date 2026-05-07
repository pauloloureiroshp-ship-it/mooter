#!/usr/bin/env node
// @ts-check
/**
 * Tests for holdout-validator.js — pure helpers only.
 * Run: node --test holdout-validator.test.js
 */

'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const {
  splitChronological,
  validateAgainstHoldout,
  formatHoldoutReport,
} = require('./holdout-validator.js');

// Re-implement the trimming used by backtest.signature so the test stays
// hermetic but the matcher behaves the same way as the real system.
function signature(p) {
  return (p || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/).filter(Boolean).slice(0, 3).join(' ');
}

const baseEvent = (overrides) => ({
  event: 'classified', source: 'user', tier: 'T3',
  prompt_preview: 'fix this bug now', confidence: 0.9, ...overrides,
});

// ── splitChronological ──────────────────────────────────────────────────

test('splitChronological: empty / non-array → both sides empty', () => {
  assert.deepEqual(splitChronological([]),       { train: [], holdout: [] });
  assert.deepEqual(splitChronological(null),     { train: [], holdout: [] });
});

test('splitChronological: too few classified events → all to train', () => {
  const events = [1, 2, 3, 4].map((i) => baseEvent({ ts_ms: i * 1000 }));
  const r = splitChronological(events);
  assert.equal(r.train.length, 4);
  assert.equal(r.holdout.length, 0);
});

test('splitChronological: 80/20 chronological split on the classified subset', () => {
  // 10 classified events spread across timestamps 1..10. Default pct=0.2.
  // Floor(10 * 0.8) = 8, so the holdout starts at the 9th classified event.
  const events = Array.from({ length: 10 }, (_, i) =>
    baseEvent({ ts_ms: (i + 1) * 1000, prompt_preview: `prompt ${i}` })
  );
  const r = splitChronological(events);
  assert.equal(r.train.length, 8, 'train should hold the first 8');
  assert.equal(r.holdout.length, 2, 'holdout should hold the last 2');
  // Train ts must all precede holdout ts.
  const lastTrainTs   = Math.max(...r.train.map((d) => d.ts_ms));
  const firstHoldTs   = Math.min(...r.holdout.map((d) => d.ts_ms));
  assert.ok(lastTrainTs < firstHoldTs);
});

test('splitChronological: invalid pct throws', () => {
  assert.throws(() => splitChronological([baseEvent({})], 0));
  assert.throws(() => splitChronological([baseEvent({})], 1));
  assert.throws(() => splitChronological([baseEvent({})], -0.1));
});

test('splitChronological: non-classified events ride along with their cohort', () => {
  const events = [];
  for (let i = 0; i < 10; i++) events.push(baseEvent({ ts_ms: (i + 1) * 1000, prompt_preview: `p ${i}` }));
  // Sprinkle in some turn_end events outside the classified count so they
  // don't influence the split point but do follow the chronological order.
  events.splice(3, 0, { event: 'turn_end', ts_ms: 3500 });
  events.splice(8, 0, { event: 'quality_feedback', ts_ms: 7500 });
  const r = splitChronological(events);
  // 10 classified events → split at 8th. The two extra events sit at
  // ts=3500 and ts=7500, both before the 8th classified at ts=8000, so
  // they ride along in train.
  const allTrainNonClassified = r.train.filter((e) => e.event !== 'classified').length;
  assert.equal(allTrainNonClassified, 2);
});

// ── validateAgainstHoldout ──────────────────────────────────────────────

test('validateAgainstHoldout: empty holdout → accuracy null, all zero', () => {
  const v = validateAgainstHoldout({}, [], signature);
  assert.equal(v.total_classified, 0);
  assert.equal(v.accuracy, null);
});

test('validateAgainstHoldout: no proposed flips → accuracy null', () => {
  const tuning = { demote_from_t3_patterns: [], promote_to_t0_patterns: [] };
  const holdout = [baseEvent({ tier: 'T3' })];
  const v = validateAgainstHoldout(tuning, holdout, signature);
  assert.equal(v.no_flip, 1);
  assert.equal(v.flips_proposed, 0);
  assert.equal(v.accuracy, null);
});

test('validateAgainstHoldout: agreed flip when user rated bad', () => {
  const sig = signature('please debug this');
  const tuning = { demote_from_t3_patterns: [sig], promote_to_t0_patterns: [] };
  const holdout = [
    baseEvent({ tier: 'T3', prompt_preview: 'please debug this', explicit_rating: 0 }),
  ];
  const v = validateAgainstHoldout(tuning, holdout, signature);
  assert.equal(v.flips_proposed, 1);
  assert.equal(v.agreed, 1);
  assert.equal(v.conflicted, 0);
  assert.equal(v.accuracy, 1);
});

test('validateAgainstHoldout: conflicted flip when user rated good', () => {
  const sig = signature('please debug this');
  const tuning = { demote_from_t3_patterns: [sig], promote_to_t0_patterns: [] };
  const holdout = [
    baseEvent({ tier: 'T3', prompt_preview: 'please debug this', explicit_rating: 1 }),
  ];
  const v = validateAgainstHoldout(tuning, holdout, signature);
  assert.equal(v.flips_proposed, 1);
  assert.equal(v.conflicted, 1);
  assert.equal(v.agreed, 0);
  assert.equal(v.accuracy, 0);
  assert.deepEqual(v.conflict_signatures, [sig]);
});

test('validateAgainstHoldout: ambiguous flip stays out of accuracy denominator', () => {
  const sig = signature('please debug this');
  const tuning = { demote_from_t3_patterns: [sig], promote_to_t0_patterns: [] };
  const holdout = [
    baseEvent({ tier: 'T3', prompt_preview: 'please debug this' }), // no rating
  ];
  const v = validateAgainstHoldout(tuning, holdout, signature);
  assert.equal(v.ambiguous, 1);
  assert.equal(v.accuracy, null);
});

test('validateAgainstHoldout: tester events are skipped', () => {
  const sig = signature('please debug this');
  const tuning = { demote_from_t3_patterns: [sig], promote_to_t0_patterns: [] };
  const holdout = [
    baseEvent({ tier: 'T3', prompt_preview: 'please debug this', source: 'mooter-tester', explicit_rating: 0 }),
  ];
  const v = validateAgainstHoldout(tuning, holdout, signature);
  assert.equal(v.total_classified, 0);
  assert.equal(v.flips_proposed, 0);
});

// ── formatHoldoutReport ─────────────────────────────────────────────────

test('formatHoldoutReport: includes verdict tag based on accuracy', () => {
  const ship    = formatHoldoutReport({ total_classified: 100, flips_proposed: 10, agreed: 8, conflicted: 2, ambiguous: 0, no_flip: 90, accuracy: 0.8, conflict_signatures: [] });
  const margin  = formatHoldoutReport({ total_classified: 100, flips_proposed: 10, agreed: 5, conflicted: 5, ambiguous: 0, no_flip: 90, accuracy: 0.5, conflict_signatures: [] });
  const regress = formatHoldoutReport({ total_classified: 100, flips_proposed: 10, agreed: 2, conflicted: 8, ambiguous: 0, no_flip: 90, accuracy: 0.2, conflict_signatures: [] });
  assert.match(ship,    /✓ ship/);
  assert.match(margin,  /⚠ marginal/);
  assert.match(regress, /✗ regress risk/);
});

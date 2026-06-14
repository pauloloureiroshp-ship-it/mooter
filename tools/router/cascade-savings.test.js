'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { computeMetrics } = require('./savings-tracker.js');

const L = (o) => JSON.stringify(o);
const classified = (tier) => L({ event: 'classified', tier, prompt_len: 20, ts: new Date().toISOString() });

test('cascade aggregation — counts local_kept and escalated separately', () => {
  const m = computeMetrics([
    L({ event: 'cascade_local_kept', score: 0.85, band: 'high' }),
    L({ event: 'cascade_local_kept', score: 0.72, band: 'medium' }),
    L({ event: 'cascade_escalated', score: 0.2, reasons: ['refusal_or_nonanswer'] }),
    classified('T0'),
  ]);
  assert.strictEqual(m.cascade_local_kept, 2);
  assert.strictEqual(m.cascade_escalated, 1);
  assert.strictEqual(m.cascade_decisions, 3);
  assert.strictEqual(m.cascade_escalation_rate, 33.3);
});

test('cascade — no events → all zero, no inflation', () => {
  const m = computeMetrics([classified('T0'), classified('T3')]);
  assert.strictEqual(m.cascade_local_kept, 0);
  assert.strictEqual(m.cascade_escalated, 0);
  assert.strictEqual(m.cascade_decisions, 0);
  assert.strictEqual(m.cascade_escalation_rate, 0);
});

test('cascade is ADVISORY ONLY — never added to guaranteed_saved', () => {
  // A heap of cascade events must not move guaranteed_saved, and the honesty
  // invariant guaranteed <= advisory must hold.
  const withCascade = computeMetrics([
    ...Array.from({ length: 20 }, () => L({ event: 'cascade_local_kept', score: 0.9, band: 'high' })),
    classified('T0'), classified('T0'),
  ]);
  const withoutCascade = computeMetrics([classified('T0'), classified('T0')]);
  assert.strictEqual(withCascade.guaranteed_saved, withoutCascade.guaranteed_saved);
  assert.ok(withCascade.guaranteed_saved <= withCascade.advisory_saved);
});

test('cascade — option_a_hit still counts independently of cascade events', () => {
  const m = computeMetrics([
    L({ event: 'option_a_hit', prompt_len: 20 }),
    L({ event: 'cascade_local_kept', score: 0.8, band: 'high' }),
    classified('T0'),
  ]);
  assert.strictEqual(m.option_a_hits, 1);
  assert.strictEqual(m.cascade_local_kept, 1);
});

test('cascade — malformed lines are ignored, never throw', () => {
  const m = computeMetrics([
    'not json', '', '{bad', L({ event: 'cascade_escalated', score: 0.1 }), classified('T0'),
  ]);
  assert.strictEqual(m.cascade_escalated, 1);
});

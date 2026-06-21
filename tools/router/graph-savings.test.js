'use strict';
// Wave 61 Block 5 — graph_saved aggregation in the savings tracker. The graph
// saving is a THIRD honesty category: advisory, in TOKENS, never folded into the
// guaranteed/advisory $ buckets, tester events filtered.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeMetrics } = require('./savings-tracker.js');

const L = (o) => JSON.stringify(o);

test('graph_resolved events aggregate into graph_saved_tokens_est (advisory, separate)', () => {
  const lines = [
    L({ event: 'classified', tier: 'T2', prompt_len: 100 }),
    L({ event: 'graph_resolved', nodes: 951, repo_size: 951, tokens_saved_est: 4000, session_id: 's' }),
    L({ event: 'graph_resolved', nodes: 200, repo_size: 200, tokens_saved_est: 2000, session_id: 's' }),
  ];
  const m = computeMetrics(lines);
  assert.equal(m.graph_resolved_count, 2);
  assert.equal(m.graph_saved_tokens_est, 6000);
  // Distinct from the $ buckets — graph saving never inflates guaranteed/advisory.
  assert.equal(typeof m.advisory_saved, 'number');
  assert.equal(typeof m.guaranteed_saved, 'number');
  assert.ok(m.guaranteed_saved <= m.advisory_saved, 'existing honesty invariant intact');
});

test('graph_resolved: tester events filtered; zero/garbage estimates ignored', () => {
  const lines = [
    L({ event: 'graph_resolved', tokens_saved_est: 4000, source: 'mooter-tester' }), // filtered
    L({ event: 'graph_resolved', tokens_saved_est: 0 }),     // counted, 0 tokens
    L({ event: 'graph_resolved', tokens_saved_est: 'x' }),   // counted, garbage ignored
    L({ event: 'graph_resolved', tokens_saved_est: 1500 }),
  ];
  const m = computeMetrics(lines);
  assert.equal(m.graph_resolved_count, 3, 'tester filtered → 3 real events');
  assert.equal(m.graph_saved_tokens_est, 1500, 'only the valid positive estimate summed');
});

test('no graph_resolved events → zeros, nothing inflated', () => {
  const m = computeMetrics([L({ event: 'classified', tier: 'T1', prompt_len: 50 })]);
  assert.equal(m.graph_resolved_count, 0);
  assert.equal(m.graph_saved_tokens_est, 0);
});

test('emptyMetrics carries the graph fields (always present in /metrics)', () => {
  const { emptyMetrics } = require('./savings-tracker.js');
  const m = emptyMetrics();
  assert.equal(m.graph_resolved_count, 0);
  assert.equal(m.graph_saved_tokens_est, 0);
});

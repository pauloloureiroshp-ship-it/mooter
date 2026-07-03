// dag.test.js — longest-path makespan + cycle detection (DC-06 foundation).
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { longestPath, hasCycle, toposort } = require('./dag.js');

const dur = (m) => (id) => m[id] || 0;

test('chain A→B: makespan is the SUM along the path', () => {
  const r = longestPath(['A', 'B'], (id) => (id === 'B' ? ['A'] : []), dur({ A: 3, B: 5 }));
  assert.equal(r.makespan, 8);
  assert.deepEqual(r.critical, ['A', 'B']);
});

test('parallel A,B → C: makespan is the LONGEST branch, not the sum', () => {
  const prereqs = (id) => (id === 'C' ? ['A', 'B'] : []);
  const r = longestPath(['A', 'B', 'C'], prereqs, dur({ A: 2, B: 7, C: 1 }));
  assert.equal(r.makespan, 8, '7 (B) + 1 (C), A runs in parallel');
  assert.deepEqual(r.critical, ['B', 'C']);
});

test('out-of-scope dependency contributes finish 0 (remaining-work forecast)', () => {
  // B depends on W2 which is NOT in the node set (already merged) → 0.
  const r = longestPath(['B'], (id) => (id === 'B' ? ['W2'] : []), dur({ B: 4 }));
  assert.equal(r.makespan, 4);
});

test('cycle is detected and thrown (a plan with a cycle is a bug)', () => {
  const prereqs = (id) => (id === 'A' ? ['B'] : id === 'B' ? ['A'] : []);
  assert.equal(hasCycle(['A', 'B'], prereqs), true);
  assert.throws(() => longestPath(['A', 'B'], prereqs, dur({ A: 1, B: 1 })), /cycle/);
});

test('toposort orders prereqs before dependents', () => {
  const { order, cycle } = toposort(['C', 'A', 'B'], (id) => (id === 'C' ? ['A', 'B'] : []));
  assert.equal(cycle, null);
  assert.ok(order.indexOf('A') < order.indexOf('C') && order.indexOf('B') < order.indexOf('C'));
});

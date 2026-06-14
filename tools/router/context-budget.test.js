'use strict';

// Wave 61 GAP 4 — context-budget per tier. node:test + assert/strict.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { contextBudget, shouldDistill, CONTEXT_BUDGETS } = require('./context-budget.js');

test('every known tier has a budget + mode', () => {
  for (const tier of ['T0', 'T1', 'T2', 'T3', 'T5']) {
    const b = contextBudget(tier);
    assert.equal(b.tier, tier);
    assert.ok(b.max_context_tokens > 0, `${tier} has a positive budget`);
    assert.ok(b.mode === 'raw' || b.mode === 'distilled', `${tier} mode is raw|distilled`);
    assert.equal(b.advisory, true, 'budgets are advisory, never guaranteed');
  }
});

test('brief policy: T0 raw (free/local), T3 distilled (expensive/rot-prone)', () => {
  assert.equal(contextBudget('T0').mode, 'raw');
  assert.equal(contextBudget('T3').mode, 'distilled');
  assert.equal(shouldDistill('T0'), false);
  assert.equal(shouldDistill('T3'), true);
});

test('budget is non-decreasing across the cost ladder T0..T3..T5', () => {
  const order = ['T0', 'T1', 'T2', 'T3', 'T5'];
  for (let i = 1; i < order.length; i++) {
    assert.ok(
      contextBudget(order[i]).max_context_tokens >= contextBudget(order[i - 1]).max_context_tokens,
      `${order[i]} budget >= ${order[i - 1]}`,
    );
  }
});

test('case-insensitive tier lookup', () => {
  assert.deepEqual(contextBudget('t3'), contextBudget('T3'));
});

test('unknown / empty tier → safe distilled mid default (never raw-dump)', () => {
  const u = contextBudget('TX');
  assert.equal(u.mode, 'distilled', 'unknown tier never raw-dumps');
  assert.ok(u.max_context_tokens > 0);
  assert.equal(contextBudget('').tier, 'unknown');
  assert.equal(contextBudget(null).mode, 'distilled');
  assert.equal(contextBudget(undefined).mode, 'distilled');
});

test('CONTEXT_BUDGETS table is internally consistent with contextBudget()', () => {
  for (const [tier, policy] of Object.entries(CONTEXT_BUDGETS)) {
    assert.equal(contextBudget(tier).max_context_tokens, policy.max_context_tokens);
    assert.equal(contextBudget(tier).mode, policy.mode);
  }
});

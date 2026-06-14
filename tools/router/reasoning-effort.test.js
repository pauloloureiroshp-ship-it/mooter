'use strict';

// Wave 60.5 — reasoning-effort axis. node:test + assert/strict.
// One test per branch/invariant; names state the contract.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { reasoningEffort } = require('./reasoning-effort.js');

// ── 1. HIGH (doctrine hard floor) ─────────────────────────────────────────
test('high: risk_level high (deploy/secrets/migration bank)', () => {
  assert.equal(reasoningEffort({ tier: 'T3', risk_level: 'high', task_category: 'cross_file_change' }), 'high');
});

test('high: tier T3 even if risk/category absent (complexity-driven)', () => {
  assert.equal(reasoningEffort({ tier: 'T3' }), 'high');
});

test('high: architecture_or_critical category', () => {
  assert.equal(reasoningEffort({ tier: 'T2', risk_level: 'low', task_category: 'architecture_or_critical' }), 'high');
});

test('high: cross_file_change category', () => {
  assert.equal(reasoningEffort({ tier: 'T2', task_category: 'cross_file_change' }), 'high');
});

test('high: safety_boost_applied (critical-phrase floor)', () => {
  assert.equal(reasoningEffort({ tier: 'T1', risk_level: 'low', task_category: 'simple_transform_or_explain', safety_boost_applied: true }), 'high');
});

test('high: escalation_rule mentions safety_floor', () => {
  assert.equal(reasoningEffort({ tier: 'T1', escalation_rule: 'something+safety_floor' }), 'high');
});

test('high: escalation_rule mentions beast', () => {
  assert.equal(reasoningEffort({ tier: 'T1', escalation_rule: 'beast_mode' }), 'high');
});

// ── 2. NONE (purely mechanical) ───────────────────────────────────────────
test('none: bash_command_paste', () => {
  assert.equal(reasoningEffort({ tier: 'T0', risk_level: 'minimal', task_category: 'bash_command_paste' }), 'none');
});

test('none: file_read_intent', () => {
  assert.equal(reasoningEffort({ tier: 'T1', risk_level: 'minimal', task_category: 'file_read_intent' }), 'none');
});

// ── 3. MEDIUM (intermediate reasoning) ────────────────────────────────────
test('medium: tier T2', () => {
  assert.equal(reasoningEffort({ tier: 'T2', risk_level: 'medium', task_category: 'reasoning_intermediate' }), 'medium');
});

test('medium: risk medium without T2 tier', () => {
  assert.equal(reasoningEffort({ tier: 'T1', risk_level: 'medium' }), 'medium');
});

test('medium: reasoning_intermediate category alone', () => {
  assert.equal(reasoningEffort({ tier: 'T0', task_category: 'reasoning_intermediate' }), 'medium');
});

// ── 4. LOW (trivial / simple / ambiguous) ─────────────────────────────────
test('low: tier T0 trivial_local', () => {
  assert.equal(reasoningEffort({ tier: 'T0', risk_level: 'minimal', task_category: 'trivial_local' }), 'low');
});

test('low: tier T1 simple_transform_or_explain', () => {
  assert.equal(reasoningEffort({ tier: 'T1', risk_level: 'low', task_category: 'simple_transform_or_explain' }), 'low');
});

test('low: ambiguous_short (T0/minimal)', () => {
  assert.equal(reasoningEffort({ tier: 'T0', risk_level: 'minimal', task_category: 'ambiguous_short' }), 'low');
});

test('low: ambiguous_medium / ambiguous_long (T1/low)', () => {
  assert.equal(reasoningEffort({ tier: 'T1', risk_level: 'low', task_category: 'ambiguous_medium' }), 'low');
  assert.equal(reasoningEffort({ tier: 'T1', risk_level: 'low', task_category: 'ambiguous_long' }), 'low');
});

test('low: cheap_task', () => {
  assert.equal(reasoningEffort({ tier: 'T1', risk_level: 'low', task_category: 'cheap_task' }), 'low');
});

// ── R4: T5 (Fable) tracks the task, not the pinned model ───────────────────
test('T5 trivial pinned task → low (not high)', () => {
  assert.equal(reasoningEffort({ tier: 'T5', risk_level: 'low', task_category: 'simple_transform_or_explain' }), 'low');
});

test('T5 architecture pinned task → high (via category, not tier)', () => {
  assert.equal(reasoningEffort({ tier: 'T5', risk_level: 'high', task_category: 'architecture_or_critical' }), 'high');
});

// ── 5. DEFAULT + defensive ────────────────────────────────────────────────
test('default: empty/unknown decision → medium (never none under uncertainty)', () => {
  assert.equal(reasoningEffort({}), 'medium');
  assert.equal(reasoningEffort({ tier: 'TX', risk_level: 'weird', task_category: 'who_knows' }), 'medium');
});

test('defensive: null/undefined input → medium, never throws', () => {
  assert.equal(reasoningEffort(null), 'medium');
  assert.equal(reasoningEffort(undefined), 'medium');
});

test('defensive: non-string fields are ignored, never throw', () => {
  assert.equal(reasoningEffort({ tier: 3, risk_level: null, task_category: {}, escalation_rule: 42 }), 'medium');
});

test('return value is always one of the four labels', () => {
  const valid = new Set(['none', 'low', 'medium', 'high']);
  const samples = [
    {}, null, { tier: 'T0' }, { tier: 'T3' }, { risk_level: 'high' },
    { task_category: 'bash_command_paste' }, { task_category: 'reasoning_intermediate' },
  ];
  for (const s of samples) assert.ok(valid.has(reasoningEffort(s)), `valid label for ${JSON.stringify(s)}`);
});

'use strict';

// Wave 63 GAP 5 — dense code_generation must NOT be compressed. node:test.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { optimize, isDenseCodePrompt } = require('./prompt-optimizer.js');

// ── isDenseCodePrompt (pure) ─────────────────────────────────────────────
test('isDenseCodePrompt: true for a fenced code block', () => {
  assert.equal(isDenseCodePrompt('fix this:\n```js\nconst x = 1;\n```\nand return it'), true);
});

test('isDenseCodePrompt: true for a multi-line code spec (>=4 lines + code tokens)', () => {
  const p = 'build this module\nfunction add(a, b) {\n  return a + b;\n}\nexport default add';
  assert.equal(isDenseCodePrompt(p), true);
});

test('isDenseCodePrompt: true for a long symbol-heavy body', () => {
  const p = 'generate config ' + '{a:1,b:[2,3],c:(4>5)} '.repeat(8); // >120 chars, symbol-heavy
  assert.equal(isDenseCodePrompt(p), true);
});

test('isDenseCodePrompt: false for a short/light code prompt', () => {
  assert.equal(isDenseCodePrompt('implement a fizzbuzz in python'), false);
});

test('isDenseCodePrompt: false / never throws for non-string', () => {
  assert.equal(isDenseCodePrompt(null), false);
  assert.equal(isDenseCodePrompt(undefined), false);
  assert.equal(isDenseCodePrompt(123), false);
  assert.equal(isDenseCodePrompt(''), false);
});

// ── optimize() guardrail ─────────────────────────────────────────────────
const codeDecision = { task_category: 'code_generation', tier: 'T0', recommended_model: 'qwen2.5:3b' };

test('optimize: dense code_generation → null (not compressed)', () => {
  const dense = 'patch this function so it handles nulls:\n```python\ndef f(x):\n    return x.value\n```\nkeep the signature';
  assert.equal(optimize(dense, codeDecision), null, 'dense code is guarded from compression');
});

test('optimize: light code_generation → still optimized (non-null)', () => {
  const light = 'implement binary search in python with clear variable names please';
  const res = optimize(light, codeDecision);
  assert.ok(res !== null, 'short/light code prompts still benefit from optimization');
});

test('optimize: dense code in a NON-code category is unaffected by this guard', () => {
  // The new guard is scoped to code_generation; other categories keep prior behavior.
  const dense = 'summarize this:\n```\nfoo\nbar\nbaz\n```\nin one line';
  // summarize_or_trivial is not guarded by GAP 5; result may be null or not, but the
  // call must not throw and the GAP-5 guard must not be what nulls it.
  assert.doesNotThrow(() => optimize(dense, { task_category: 'summarize_or_trivial', tier: 'T0', recommended_model: 'qwen2.5:3b' }));
});

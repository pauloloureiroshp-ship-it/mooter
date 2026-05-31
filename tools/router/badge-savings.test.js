// Wave 2.8 Ponto #5 — badge savings chip. node:test + assert.

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const { buildBadge, estimateBadgeSavings } = require('./badge.js');

test('estimateBadgeSavings: positive for T0/T1/T2 with a prompt length', () => {
  const s = estimateBadgeSavings({ tier: 'T0', prompt_len: 200 });
  assert.ok(s > 0, 'a local T0 turn saves vs the all-Opus baseline');
});

test('estimateBadgeSavings: zero for T3 (no saving vs the T3 default)', () => {
  assert.equal(estimateBadgeSavings({ tier: 'T3', prompt_len: 200 }), 0);
});

test('estimateBadgeSavings: zero when prompt_len missing/invalid', () => {
  assert.equal(estimateBadgeSavings({ tier: 'T0' }), 0);
  assert.equal(estimateBadgeSavings({ tier: 'T0', prompt_len: 'x' }), 0);
  assert.equal(estimateBadgeSavings(null), 0);
});

test('buildBadge: appends saved chip for non-T3 with prompt_len', () => {
  const b = buildBadge({ tier: 'T0', recommended_model: 'qwen3:30b', recommended_backend: 'ollama', confidence: 0.8, prompt_len: 300 });
  assert.match(b, /\[🐄 .* ollama 0\.80 · saved \$\d\.\d{3}\]/u);
});

test('buildBadge: no saved chip for T3', () => {
  const b = buildBadge({ tier: 'T3', recommended_model: 'claude-opus-4-8', recommended_backend: 'anthropic', confidence: 0.95, prompt_len: 300 });
  assert.ok(!/saved/.test(b), 'T3 badge carries no savings chip');
  assert.match(b, /\[🦬 ☁ opus 0\.95\]/u);
});

test('buildBadge: no saved chip when prompt_len absent (back-compat)', () => {
  const b = buildBadge({ tier: 'T2', recommended_model: 'claude-sonnet-4-6', recommended_backend: 'anthropic', confidence: 0.84 });
  assert.equal(b, '[🐂 ☁ sonnet 0.84]');
});

// Wave 3 Day 1 — safety boost unit tests. node:test + assert.

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const { applySafetyBoost, matchedCriticalPhrase } = require('./safety_boost.js');

test('MAJ-1 fix: "design a sharding strategy" → T3 with explicit reason', () => {
  const cls = { tier: 'T0', recommended_model: 'qwen2.5:3b', recommended_backend: 'ollama', confidence: 0.8 };
  const b = applySafetyBoost(cls, 'design a sharding strategy for the events table');
  assert.equal(b.tier, 'T3');
  assert.equal(b.recommended_model, 'claude-opus-4-6');
  assert.equal(b.recommended_backend, 'claude_subagent');
  assert.equal(b.safety_boost_applied, true);
  assert.match(b.safety_boost_reason, /critical_phrase_match/);
  assert.equal(b.safety_boost_from, 'T0');
});

test('MAJ-2 fix: architectural keyword + low confidence T1 → T2', () => {
  const b = applySafetyBoost({ tier: 'T1', recommended_model: 'haiku', confidence: 0.75 }, 'review this auth middleware');
  assert.equal(b.tier, 'T2');
  assert.equal(b.recommended_model, 'claude-sonnet-4-6');
  assert.match(b.safety_boost_reason, /architectural_keyword/);
  assert.equal(b.safety_boost_from, 'T1');
});

test('high-confidence trivial T0 → NOT boosted (summarize README)', () => {
  const b = applySafetyBoost({ tier: 'T0', recommended_model: 'qwen', confidence: 0.95 }, 'summarize the README');
  assert.equal(b.tier, 'T0');
  assert.equal(b.safety_boost_applied, false);
});

test('no false-positive on casual mention with high confidence', () => {
  const b = applySafetyBoost({ tier: 'T0', recommended_model: 'qwen', confidence: 0.95 }, 'check the colour I designed last week');
  assert.equal(b.tier, 'T0', 'high confidence + no critical phrase → left alone');
  assert.equal(b.safety_boost_applied, false);
});

test('critical phrase wins regardless of high confidence', () => {
  const b = applySafetyBoost({ tier: 'T2', recommended_model: 'sonnet', confidence: 0.99 }, 'redesign the architecture for multi-tenant');
  assert.equal(b.tier, 'T3');
  assert.equal(b.safety_boost_applied, true);
});

test('never downgrades: a real T3 stays T3', () => {
  const b = applySafetyBoost({ tier: 'T3', recommended_model: 'claude-opus-4-6', confidence: 0.95 }, 'design a sharding strategy');
  assert.equal(b.tier, 'T3', 'already T3 — critical branch skips (tierIdx < T3 is false)');
  assert.equal(b.safety_boost_applied, false);
});

test('does not mutate the input classification', () => {
  const cls = { tier: 'T0', recommended_model: 'qwen', confidence: 0.5 };
  applySafetyBoost(cls, 'design a sharding strategy');
  assert.equal(cls.tier, 'T0', 'input untouched');
});

test('matchedCriticalPhrase returns the matching source or null', () => {
  assert.ok(matchedCriticalPhrase('design a sharding strategy'));
  assert.equal(matchedCriticalPhrase('hello world'), null);
});

test('keyword without low confidence → not boosted (high conf T0)', () => {
  const b = applySafetyBoost({ tier: 'T0', recommended_model: 'qwen', confidence: 0.92 }, 'review the changelog');
  assert.equal(b.safety_boost_applied, false, 'conf >= 0.9 blocks the keyword uplift');
});

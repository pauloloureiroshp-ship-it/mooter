'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { discoverAnthropicModels, ANTHROPIC_CATALOG } = require('./discover-models');

test('discoverAnthropicModels: no detector → all unavailable (graceful)', () => {
  const models = discoverAnthropicModels({ detectAnthropic: undefined });
  assert.equal(models.length, 4);
  assert.ok(models.every((m) => m.available === false));
});

test('discoverAnthropicModels: detector throwing → all unavailable (graceful)', () => {
  const models = discoverAnthropicModels({
    detectAnthropic: () => { throw new Error('boom'); },
  });
  assert.ok(models.every((m) => m.available === false));
});

test('discoverAnthropicModels: subscription present → all available', () => {
  const models = discoverAnthropicModels({
    detectAnthropic: () => ({ available: true, plan: 'max' }),
  });
  assert.ok(models.every((m) => m.available === true));
});

test('discoverAnthropicModels: env-key-only detector → all available', () => {
  const models = discoverAnthropicModels({
    detectAnthropic: () => ({ available: true, plan: 'api-paid' }),
  });
  assert.ok(models.every((m) => m.available === true));
});

test('discoverAnthropicModels: detector reports unavailable → all false', () => {
  const models = discoverAnthropicModels({
    detectAnthropic: () => ({ available: false, plan: 'none' }),
  });
  assert.ok(models.every((m) => m.available === false));
});

test('ANTHROPIC_CATALOG: slugs, tiers and subagents are well-formed', () => {
  const bySlug = Object.fromEntries(ANTHROPIC_CATALOG.map((m) => [m.slug, m]));
  assert.equal(bySlug['opus-4-7'].tier, 'T3');
  assert.equal(bySlug['opus-4-7'].subagent, 'model-architect');
  assert.equal(bySlug['opus-4-6'].model, 'claude-opus-4-6');
  assert.equal(bySlug['sonnet-4-6'].tier, 'T2');
  assert.equal(bySlug['sonnet-4-6'].subagent, 'model-reasoner');
  assert.equal(bySlug['haiku-4-5'].tier, 'T1');
  assert.equal(bySlug['haiku-4-5'].subagent, 'cheap-triage');
  assert.ok(ANTHROPIC_CATALOG.every((m) => m.provider === 'anthropic'));
});

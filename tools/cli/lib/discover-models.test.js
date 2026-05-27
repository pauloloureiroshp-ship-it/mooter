'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  discoverAnthropicModels,
  discoverCodexModels,
  discoverOpenAiModels,
  discoverOllamaModels,
  discoverAllModels,
  ollamaSlug,
  ANTHROPIC_CATALOG,
} = require('./discover-models');

const OLLAMA_LIST_FIXTURE = [
  'NAME                       ID              SIZE      MODIFIED',
  'qwen3:30b                  ad815644918f    18 GB     2 months ago',
  'qwen2.5-coder:7b           dae161e27b0e    4.7 GB    5 weeks ago',
  'nomic-embed-text:latest    0a109f422b47    274 MB    5 weeks ago',
  '',
].join('\n');

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

// ── Sessão B — non-Anthropic providers ─────────────────────────────────

test('discoverCodexModels: no sub → unavailable', () => {
  const [codex] = discoverCodexModels({ detectCodex: () => ({ available: false }) });
  assert.equal(codex.available, false);
  assert.equal(codex.provider, 'codex-cli');
  assert.equal(codex.model, null);
});

test('discoverCodexModels: ChatGPT sub → available', () => {
  const [codex] = discoverCodexModels({ detectCodex: () => ({ available: true }) });
  assert.equal(codex.available, true);
});

test('discoverOpenAiModels: no key → unavailable', () => {
  const models = discoverOpenAiModels({ available: false });
  assert.ok(models.length >= 1);
  assert.ok(models.every((m) => m.available === false));
  assert.ok(models.every((m) => m.provider === 'openai-api'));
});

test('discoverOllamaModels: unavailable → empty array', () => {
  assert.deepEqual(discoverOllamaModels({ available: false }), []);
});

test('discoverOllamaModels: parses list, excludes embeddings, slugs ids', () => {
  const models = discoverOllamaModels({ available: true, listOutput: OLLAMA_LIST_FIXTURE, hwCapability: null });
  const slugs = models.map((m) => m.slug);
  assert.deepEqual(slugs, ['qwen3-30b', 'qwen2-5-coder-7b']); // header + nomic-embed dropped
  assert.equal(models[0].model, 'qwen3:30b');
  assert.ok(models.every((m) => m.provider === 'ollama' && m.available === true));
});

test('discoverOllamaModels: hw-capability can_run:false excludes a model', () => {
  const hw = { t0_models_available: [{ model: 'qwen3:30b', can_run: false }] };
  const models = discoverOllamaModels({ available: true, listOutput: OLLAMA_LIST_FIXTURE, hwCapability: hw });
  assert.ok(!models.some((m) => m.model === 'qwen3:30b'), 'blocked model must be excluded');
  assert.ok(models.some((m) => m.model === 'qwen2.5-coder:7b'));
});

test('ollamaSlug: colon and dot become hyphens', () => {
  assert.equal(ollamaSlug('qwen3:30b'), 'qwen3-30b');
  assert.equal(ollamaSlug('qwen2.5-coder:7b'), 'qwen2-5-coder-7b');
});

test('discoverAllModels: ChatGPT sub + OpenAI key → both available, preferCodex true', () => {
  const all = discoverAllModels({
    anthropic: { detectAnthropic: () => ({ available: false }) },
    codex: { detectCodex: () => ({ available: true }) },
    openai: { available: true },
    ollama: { available: false },
  });
  assert.equal(all.preferCodex, true);
  assert.ok(all.codex.some((m) => m.available));
  assert.ok(all.openai.some((m) => m.available));
  assert.deepEqual(all.ollama, []);
});

test('discoverAllModels: returns the four provider buckets', () => {
  const all = discoverAllModels({
    anthropic: { detectAnthropic: () => ({ available: false }) },
    codex: { detectCodex: () => ({ available: false }) },
    openai: { available: false },
    ollama: { available: false },
  });
  assert.ok(Array.isArray(all.anthropic) && Array.isArray(all.codex) && Array.isArray(all.openai) && Array.isArray(all.ollama));
  assert.equal(all.preferCodex, false);
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

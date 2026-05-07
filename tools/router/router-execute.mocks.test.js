#!/usr/bin/env node
// @ts-check
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  createMockProvider,
  createMockTracker,
  createMockProviderState,
  buildProviderMockSuite,
} = require('./router-execute.mocks');

test('createMockProvider: null spec resolves to null', async () => {
  const fn = createMockProvider(null);
  assert.equal(await fn('any prompt'), null);
});

test('createMockProvider: undefined spec resolves to null', async () => {
  const fn = createMockProvider(undefined);
  assert.equal(await fn('any prompt'), null);
});

test('createMockProvider: throws spec rejects with the configured message', async () => {
  const fn = createMockProvider({ throws: 'ECONNREFUSED' });
  await assert.rejects(() => fn('any prompt'), /ECONNREFUSED/);
});

test('createMockProvider: ok spec resolves to the shape verbatim', async () => {
  const spec = {
    ok: true,
    text: 'hello',
    model: 'qwen2.5:3b',
    tokens_in: 10,
    tokens_out: 3,
    cost_usd: 0,
    duration_ms: 120,
  };
  const fn = createMockProvider(spec);
  const result = await fn('any prompt');
  assert.deepEqual(result, spec);
});

test('createMockTracker: records every recordUsage call', () => {
  const t = createMockTracker();
  t.recordUsage('ollama', { tokens_in: 10, tokens_out: 3, cost_usd: 0 });
  t.recordUsage('codex_cli', { tokens_in: 50, tokens_out: 100, cost_usd: 0 });
  assert.equal(t._calls.length, 2);
  assert.equal(t._calls[0].provider, 'ollama');
  assert.equal(t._calls[1].provider, 'codex_cli');
});

test('createMockTracker: summary() returns a fresh object copy', () => {
  const t = createMockTracker({ summary: { anthropic_remaining_pct: 42 } });
  const a = t.summary();
  const b = t.summary();
  assert.notEqual(a, b); // different object refs
  assert.equal(a.anthropic_remaining_pct, 42);
});

test('createMockTracker: shouldPreferCodex returns false by default', () => {
  const t = createMockTracker();
  assert.equal(t.shouldPreferCodex(), false);
});

test('createMockProviderState: defaults all to ok except gemini=off', () => {
  const s = createMockProviderState();
  assert.equal(s.claude, 'ok');
  assert.equal(s.ollama, 'ok');
  assert.equal(s.codex_cli, 'ok');
  assert.equal(s.gemini, 'off');
});

test('createMockProviderState: overrides apply', () => {
  const s = createMockProviderState({ claude: 'degraded', codex_cli: 'exhausted' });
  assert.equal(s.claude, 'degraded');
  assert.equal(s.codex_cli, 'exhausted');
  assert.equal(s.ollama, 'ok'); // default preserved
});

test('createMockProviderState: result is frozen', () => {
  const s = createMockProviderState();
  assert.throws(() => { s.claude = 'down'; }, TypeError);
});

test('buildProviderMockSuite: converts fixture block into callable mocks', async () => {
  const block = {
    codex_cli: { ok: true, text: 'codex says hi', model: 'gpt-5-codex', tokens_in: 10, tokens_out: 5, cost_usd: 0, duration_ms: 100 },
    ollama:    null,
    openai_api: { throws: 'rate_limited' },
  };
  const suite = buildProviderMockSuite(block);
  assert.equal(typeof suite.codex_cli, 'function');
  assert.equal(typeof suite.ollama,    'function');
  assert.equal(typeof suite.openai_api, 'function');

  const codexResult = await suite.codex_cli('p');
  assert.equal(codexResult.text, 'codex says hi');

  const ollamaResult = await suite.ollama('p');
  assert.equal(ollamaResult, null);

  await assert.rejects(() => suite.openai_api('p'), /rate_limited/);
});

test('buildProviderMockSuite: empty block returns empty object', () => {
  assert.deepEqual(buildProviderMockSuite({}), {});
  assert.deepEqual(buildProviderMockSuite(undefined), {});
});

test('createMockProvider: records usage on tracker when opts.tracker + opts.providerKey provided', async () => {
  const tracker = createMockTracker();
  const fn = createMockProvider(
    { ok: true, text: 'done', model: 'qwen2.5:3b', tokens_in: 32, tokens_out: 12, cost_usd: 0, duration_ms: 480 },
    { providerKey: 'ollama', tracker }
  );
  await fn('any prompt');
  assert.equal(tracker._calls.length, 1);
  assert.equal(tracker._calls[0].provider, 'ollama');
  assert.equal(tracker._calls[0].payload.tokens_in, 32);
  assert.equal(tracker._calls[0].payload.tokens_out, 12);
});

test('createMockProvider: does NOT record usage on null spec', async () => {
  const tracker = createMockTracker();
  const fn = createMockProvider(null, { providerKey: 'ollama', tracker });
  const r = await fn('any prompt');
  assert.equal(r, null);
  assert.equal(tracker._calls.length, 0);
});

test('createMockProvider: does NOT record usage on throws spec', async () => {
  const tracker = createMockTracker();
  const fn = createMockProvider({ throws: 'boom' }, { providerKey: 'codex_cli', tracker });
  await assert.rejects(() => fn('p'), /boom/);
  assert.equal(tracker._calls.length, 0);
});

test('createMockProvider: accepts both snake_case and camelCase token fields', async () => {
  const tracker = createMockTracker();
  const fnCamel = createMockProvider(
    { ok: true, text: 't', model: 'm', tokensIn: 5, tokensOut: 2, costUsd: 0, durationMs: 100 },
    { providerKey: 'openai_api', tracker }
  );
  await fnCamel('p');
  assert.equal(tracker._calls[0].payload.tokens_in, 5);
  assert.equal(tracker._calls[0].payload.tokens_out, 2);

  const fnSnake = createMockProvider(
    { ok: true, text: 't', model: 'm', tokens_in: 7, tokens_out: 3, cost_usd: 0, duration_ms: 100 },
    { providerKey: 'openai_api', tracker }
  );
  await fnSnake('p');
  assert.equal(tracker._calls[1].payload.tokens_in, 7);
  assert.equal(tracker._calls[1].payload.tokens_out, 3);
});

test('buildProviderMockSuite: threads tracker into every mock', async () => {
  const tracker = createMockTracker();
  const block = {
    ollama:    { ok: true, text: 'hi', model: 'qwen2.5:3b', tokens_in: 4, tokens_out: 2, cost_usd: 0, duration_ms: 80 },
    codex_cli: { ok: true, text: 'codex', model: 'gpt-5-codex', tokens_in: 50, tokens_out: 100, cost_usd: 0, duration_ms: 1000 },
  };
  const suite = buildProviderMockSuite(block, { tracker });
  await suite.ollama('p');
  await suite.codex_cli('p');
  assert.equal(tracker._calls.length, 2);
  assert.equal(tracker._calls[0].provider, 'ollama');
  assert.equal(tracker._calls[1].provider, 'codex_cli');
});

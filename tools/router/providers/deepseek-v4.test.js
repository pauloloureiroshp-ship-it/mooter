#!/usr/bin/env node
// @ts-check
/**
 * Tests for providers/deepseek-v4.js (Wave 29 Phase 29.D).
 *
 * No real API calls. We exercise: isAvailable() degradation, cost math against
 * the documented DeepSeek pricing, the pure T2 routing heuristic branches, and
 * callDeepSeek() success/failure paths via a mocked global fetch.
 *
 * Run with:  node --test providers/deepseek-v4.test.js
 */

'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

let SAVED_KEY;
let SAVED_FETCH;

function loadFresh() {
  try { delete require.cache[require.resolve('./deepseek-v4.js')]; } catch {}
  return require('./deepseek-v4.js');
}

beforeEach(() => { SAVED_KEY = process.env.DEEPSEEK_API_KEY; });
afterEach(() => {
  if (SAVED_KEY === undefined) delete process.env.DEEPSEEK_API_KEY;
  else process.env.DEEPSEEK_API_KEY = SAVED_KEY;
  if (SAVED_FETCH) { globalThis.fetch = SAVED_FETCH; SAVED_FETCH = undefined; }
});

function withMockedFetch(stub, fn) {
  SAVED_FETCH = globalThis.fetch;
  globalThis.fetch = stub;
  return fn();
}

// ── isAvailable ────────────────────────────────────────────────────────
test('isAvailable: false without key, true with key', () => {
  const ds = loadFresh();
  delete process.env.DEEPSEEK_API_KEY;
  assert.equal(ds.isAvailable(), false);
  assert.match(ds.keyWarning() || '', /DEEPSEEK_API_KEY/);
  process.env.DEEPSEEK_API_KEY = 'sk-fake';
  assert.equal(ds.isAvailable(), true);
  assert.equal(ds.keyWarning(), null);
});

// ── computeCost ────────────────────────────────────────────────────────
test('computeCost: uses DeepSeek pricing (cheap vs frontier)', () => {
  const ds = loadFresh();
  // 1M in + 1M out → 0.27 + 1.10 = 1.37
  const cost = ds.computeCost('deepseek-chat', 1_000_000, 1_000_000);
  assert.ok(Math.abs(cost - 1.37) < 1e-6, `expected 1.37, got ${cost}`);
});

// ── shouldPreferDeepSeekT2 (pure heuristic) ────────────────────────────
test('T2 heuristic: no key → never prefer', () => {
  const ds = loadFresh();
  assert.deepEqual(ds.shouldPreferDeepSeekT2({ available: false, task_type: 'swe' }), { prefer: false, reason: 'no_api_key' });
});

test('T2 heuristic: Claude Max keeps Sonnet (marginal cost ~0)', () => {
  const ds = loadFresh();
  const r = ds.shouldPreferDeepSeekT2({ available: true, subscription_tier: 'claude-max', task_type: 'coding' });
  assert.equal(r.prefer, false);
  assert.equal(r.reason, 'max_marginal_cost_zero');
});

test('T2 heuristic: SWE/code tasks prefer DeepSeek', () => {
  const ds = loadFresh();
  assert.equal(ds.shouldPreferDeepSeekT2({ available: true, subscription_tier: 'claude-pro', task_type: 'swe-bench' }).prefer, true);
  assert.equal(ds.shouldPreferDeepSeekT2({ available: true, subscription_tier: 'claude-pro', task_type: 'refactor' }).reason, 'swe_bench_strength');
});

test('T2 heuristic: PAYG biases to the cheaper open-weight option', () => {
  const ds = loadFresh();
  assert.equal(ds.shouldPreferDeepSeekT2({ available: true, subscription_tier: 'none', task_type: 'prose' }).prefer, true);
  assert.equal(ds.shouldPreferDeepSeekT2({ available: true, subscription_tier: 'byok', task_type: 'prose' }).reason, 'payg_cost_bias');
});

test('T2 heuristic: default keeps Sonnet', () => {
  const ds = loadFresh();
  assert.equal(ds.shouldPreferDeepSeekT2({ available: true, subscription_tier: 'multi', task_type: 'prose' }).prefer, false);
  assert.equal(ds.shouldPreferDeepSeekT2({ available: true, subscription_tier: 'claude-pro', latency_pref: 'low' }).reason, 'latency_pref_default');
});

// ── callDeepSeek ───────────────────────────────────────────────────────
test('callDeepSeek: returns null without a key', async () => {
  const ds = loadFresh();
  delete process.env.DEEPSEEK_API_KEY;
  const r = await ds.callDeepSeek('hi', { timeoutMs: 1000 });
  assert.equal(r, null);
});

test('callDeepSeek: success returns text + token counts + cost', async () => {
  const ds = loadFresh();
  process.env.DEEPSEEK_API_KEY = 'sk-fake';
  const r = await withMockedFetch(
    async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'compiled answer' } }], usage: { prompt_tokens: 100, completion_tokens: 50 } }) }),
    () => ds.callDeepSeek('refactor this', { timeoutMs: 1000 }),
  );
  assert.equal(r.ok, true);
  assert.equal(r.text, 'compiled answer');
  assert.equal(r.tokensIn, 100);
  assert.equal(r.tokensOut, 50);
  assert.ok(r.costUsd > 0);
});

test('callDeepSeek: null on non-ok response', async () => {
  const ds = loadFresh();
  process.env.DEEPSEEK_API_KEY = 'sk-fake';
  const r = await withMockedFetch(
    async () => ({ ok: false, json: async () => ({ error: 'boom' }) }),
    () => ds.callDeepSeek('p', { timeoutMs: 1000 }),
  );
  assert.equal(r, null);
});

test('callDeepSeek: throws on empty prompt', async () => {
  const ds = loadFresh();
  await assert.rejects(() => ds.callDeepSeek(''), /non-empty/);
});

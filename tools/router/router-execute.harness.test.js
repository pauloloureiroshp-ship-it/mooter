#!/usr/bin/env node
// @ts-check
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const harness = require('./router-execute.harness');

test('harness exports the documented API', () => {
  assert.equal(typeof harness.runExecutorWithFixture, 'function');
  assert.equal(typeof harness.runExecutorLoop, 'function');
  assert.equal(typeof harness.reset, 'function');
});

test('runExecutorWithFixture: rejects without a fixture', async () => {
  await assert.rejects(
    () => harness.runExecutorWithFixture({}),
    /fixture is required/
  );
});

test('runExecutorLoop: rejects when times < 1', async () => {
  await assert.rejects(
    () => harness.runExecutorLoop({ fixture: { prompt: 'x', classification: {} }, times: 0 }),
    /times must be/
  );
});

test('runExecutorWithFixture: surfaces a clean error when router-execute.js is absent (pre T-05)', async (t) => {
  // T-05 has not shipped yet; the harness must produce an actionable error,
  // not a cryptic MODULE_NOT_FOUND stack. Once T-05 lands this test should
  // be replaced by a real "executor returns structured Error" assertion.
  const fs = require('node:fs');
  const path = require('node:path');
  const executorPath = path.resolve(__dirname, 'router-execute.js');

  if (fs.existsSync(executorPath)) {
    t.skip('router-execute.js now exists — replace this test with a real run assertion in T-05');
    return;
  }

  await assert.rejects(
    () => harness.runExecutorWithFixture({
      fixture: {
        prompt: 'rename foo to bar',
        classification: { tier: 'T0', confidence: 0.9, suggested_providers: ['ollama'], task_category: 'mechanical_trivial' },
        provider_state: {},
        provider_mocks: { ollama: { ok: true, text: 'done', model: 'qwen2.5:3b', tokens_in: 5, tokens_out: 1, cost_usd: 0, duration_ms: 80 } },
      },
    }),
    /failed to load .\/router-execute\.js/
  );
});

test('reset(): does not throw when require cache has no router-execute entry', () => {
  // Idempotent — calling reset twice is fine.
  assert.doesNotThrow(() => harness.reset());
  assert.doesNotThrow(() => harness.reset());
});

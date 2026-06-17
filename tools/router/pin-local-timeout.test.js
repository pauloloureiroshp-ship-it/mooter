// Wave 66 — local pins get a generous per-attempt timeout so large Ollama models
// can cold-load + answer. Measured: gemma4:e4b ~9.6GB → 79s cold / ~120s warm at
// 69% CPU on Paulo's Mac; the old 30s default returned no_output before answering.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { executePinned } = require('./router-execute.js');

// Capture the timeoutMs the wrapper receives, for a given env/options setup.
async function capture({ provider = 'ollama', options = {}, env = {} } = {}) {
  let seen = null;
  const saved = {};
  for (const k of Object.keys(env)) { saved[k] = process.env[k]; process.env[k] = env[k]; }
  try {
    await executePinned({
      prompt: 'p', provider,
      options: { ...options, __deps: {
        availability: { ollama: true, openai_api: true },
        providers: {
          ollama:     async (_p, o) => { seen = o.timeoutMs; return { ok: true, text: 'ok', model: 'm', tokensIn: 1, tokensOut: 1, costUsd: 0, durationMs: 1 }; },
          openai_api: async (_p, o) => { seen = o.timeoutMs; return { ok: true, text: 'ok', model: 'm', tokensIn: 1, tokensOut: 1, costUsd: 0, durationMs: 1 }; },
        },
      } },
    });
  } finally {
    for (const k of Object.keys(env)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
  return seen;
}

test('local (ollama) pin with no timeout → generous 240s default (was 30s)', async () => {
  const t = await capture({ provider: 'ollama' });
  assert.equal(t, 240_000);
});

test('MOOTER_LOCAL_PIN_TIMEOUT_MS overrides the local default', async () => {
  const t = await capture({ provider: 'ollama', env: { MOOTER_LOCAL_PIN_TIMEOUT_MS: '90000' } });
  assert.equal(t, 90_000);
});

test('explicit options.timeoutMs wins over the local default', async () => {
  const t = await capture({ provider: 'ollama', options: { timeoutMs: 5_000 } });
  assert.equal(t, 5_000);
});

test('cloud pin (openai_api) keeps the short 30s default — only local gets the bump', async () => {
  const t = await capture({ provider: 'openai_api' });
  assert.equal(t, 30_000);
});

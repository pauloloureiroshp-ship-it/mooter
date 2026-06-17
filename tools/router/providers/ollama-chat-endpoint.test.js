// Wave 66 — ollama-api dispatches via /api/chat (not the legacy /api/generate).
// Root cause (validated live on Paulo's Mac, gemma4:e4b 9.6GB):
//   /api/generate -> EMPTY response for modern instruct/reasoning models
//   /api/chat     -> answer in message.content (done_reason: stop)
// These tests pin the contract so we never silently regress to /api/generate.
'use strict';
const test = require('node:test');
const assert = require('node:assert');

function withFetch(stub, fn) {
  const saved = global.fetch;
  global.fetch = stub;
  return (async () => { try { return await fn(); } finally { global.fetch = saved; } })();
}

test('callOllama hits /api/chat with a messages[] body (system+user), not /api/generate', async () => {
  const { callOllama } = require('./ollama-api.js');
  let seenUrl = null, seenBody = null;
  await withFetch(async (url, init) => {
    seenUrl = url; seenBody = JSON.parse(init.body);
    return { ok: true, status: 200, json: async () => ({ message: { content: 'ok' }, prompt_eval_count: 5, eval_count: 2 }) };
  }, async () => {
    const r = await callOllama('qual modelo es', { model: 'gemma4:e4b', timeoutMs: 1000 });
    assert.ok(r && r.ok, 'call succeeds');
    assert.equal(r.text, 'ok');
  });
  assert.ok(seenUrl.endsWith('/api/chat'), 'uses /api/chat, got ' + seenUrl);
  assert.ok(Array.isArray(seenBody.messages), 'body has messages[]');
  assert.equal(seenBody.messages[0].role, 'system');
  assert.equal(seenBody.messages[1].role, 'user');
  assert.equal(seenBody.messages[1].content, 'qual modelo es');
  assert.ok(!('prompt' in seenBody), 'no legacy top-level prompt field');
});

test('callOllama reads answer from message.content (chat shape) + token counts', async () => {
  const { callOllama } = require('./ollama-api.js');
  await withFetch(
    async () => ({ ok: true, status: 200, json: async () => ({ message: { content: '  42  ', thinking: '' }, prompt_eval_count: 11, eval_count: 7 }) }),
    async () => {
      const r = await callOllama('p', { timeoutMs: 1000 });
      assert.equal(r.text, '42', 'trimmed message.content');
      assert.equal(r.tokensIn, 11);
      assert.equal(r.tokensOut, 7);
      assert.equal(r.costUsd, 0);
    }
  );
});

test('regression gemma4: prefers message.content even when legacy response is empty', async () => {
  const { callOllama } = require('./ollama-api.js');
  await withFetch(
    async () => ({ ok: true, status: 200, json: async () => ({ response: '', message: { content: 'olá' }, prompt_eval_count: 1, eval_count: 1 }) }),
    async () => {
      const r = await callOllama('p', { timeoutMs: 1000 });
      assert.ok(r && r.ok, 'does not return null when message.content present');
      assert.equal(r.text, 'olá');
    }
  );
});

test('empty message.content (and no response) → null (no silent fabricated text)', async () => {
  const { callOllama } = require('./ollama-api.js');
  await withFetch(
    async () => ({ ok: true, status: 200, json: async () => ({ message: { content: '' } }) }),
    async () => {
      const r = await callOllama('p', { timeoutMs: 1000 });
      assert.equal(r, null);
    }
  );
});

// ollama-api → token_tracker wiring (Wave 19 Day 4.1, BUG B).
// Proves callOllama records REAL T0 tokens into the per-tier tracker. Before
// this fix the token_tracker module existed (Day 1) but no executor ever called
// trackCall, so T0 always read 0 in the 🪙 chip + Stop report.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const tt = require('./token_tracker.js');
const { callOllama } = require('./providers/ollama-api.js');

test('callOllama records real T0 tokens via trackCall (prompt_eval_count + eval_count)', async () => {
  const sid = `ollama-wire-${process.pid}`;
  try { fs.unlinkSync(tt.cachePath(sid)); } catch { /* none */ }

  // Stub global fetch to return a realistic Ollama /api/generate payload.
  const realFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      response: 'olá',
      model: 'qwen2.5-coder:7b',
      prompt_eval_count: 100,
      eval_count: 300,
    }),
  });

  try {
    const res = await callOllama('resume isto', { sessionId: sid, timeoutMs: 1000 });
    assert.ok(res && res.ok, 'call succeeds');
    assert.equal(res.tokensIn, 100);
    assert.equal(res.tokensOut, 300);

    const snap = tt.snapshot(sid);
    assert.equal(snap.T0.calls, 1, 'one T0 call recorded');
    assert.equal(snap.T0.tokens_in, 100);
    assert.equal(snap.T0.tokens_out, 300);
    // Cloud tiers untouched.
    for (const t of ['T1', 'T2', 'T3']) {
      assert.equal(snap[t].tokens_in + snap[t].tokens_out, 0, `${t} stays 0`);
    }
  } finally {
    global.fetch = realFetch;
    try { fs.unlinkSync(tt.cachePath(sid)); } catch { /* none */ }
  }
});

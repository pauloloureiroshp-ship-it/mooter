// token_tracker — unit tests (Wave 19, 19.A).
// Proves: (1) T0/local tokens pushed by the executor land in snapshot();
// (2) real cloud tokens (T1–T3) aggregate from a session transcript and merge
// with the T0 push into one per-tier snapshot. Runs in a temp dir, cleans up
// its own cache + fixture, and never touches ~/.claude or the live transcript.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const tt = require('./token_tracker.js');

function cleanup(sessionId, extra) {
  try { fs.unlinkSync(tt.cachePath(sessionId)); } catch { /* gone */ }
  if (extra) { try { fs.unlinkSync(extra); } catch { /* gone */ } }
}

test('snapshot reflects T0/local tokens pushed by the executor', () => {
  const sid = `tt-t0-${process.pid}`;
  cleanup(sid);
  try {
    tt.trackCall('T0', 'qwen3:30b', 100, 250, { sessionId: sid });
    tt.trackCall('T0', 'qwen3:30b', 50, 50, { sessionId: sid });
    const snap = tt.snapshot(sid);

    assert.equal(snap.T0.calls, 2);
    assert.equal(snap.T0.tokens_in, 150);
    assert.equal(snap.T0.tokens_out, 300);
    assert.equal(snap.T0.real, true);
    // Cloud tiers untouched (no transcript synced).
    for (const t of ['T1', 'T2', 'T3']) {
      assert.equal(snap[t].tokens_in + snap[t].tokens_out, 0);
    }
  } finally {
    cleanup(sid);
  }
});

test('mixed tiers: real cloud tokens from transcript merge with the T0 push', () => {
  const sid = `tt-mixed-${process.pid}`;
  const fixture = path.join(os.tmpdir(), `tt-fixture-${process.pid}.jsonl`);
  // Real Claude Code transcript shape: assistant rows carry message.model +
  // message.usage. Include a non-tier model (gpt) and a zero-usage row to prove
  // both are skipped.
  const rows = [
    { type: 'assistant', message: { model: 'claude-opus-4-8', usage: { input_tokens: 1000, output_tokens: 200 } } },
    { type: 'assistant', message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 400, output_tokens: 100 } } },
    { type: 'assistant', message: { model: 'claude-haiku-4-5', usage: { input_tokens: 80, output_tokens: 20 } } },
    { type: 'assistant', message: { model: 'gpt-4o', usage: { input_tokens: 999, output_tokens: 999 } } }, // null tier → skipped
    { type: 'assistant', message: { model: 'claude-opus-4-8', usage: { input_tokens: 0, output_tokens: 0 } } }, // zero → skipped
    { type: 'user', message: { content: 'hello' } }, // not assistant → skipped
  ];
  fs.writeFileSync(fixture, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  cleanup(sid, fixture);
  fs.writeFileSync(fixture, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

  try {
    // Local tier arrives via the executor push (T0 is never in the transcript).
    tt.trackCall('T0', 'llama3.1', 300, 700, { sessionId: sid });
    // Cloud tiers sync from the transcript (real recorded usage, no extra API call).
    tt.syncFromTranscript(sid, { transcriptPath: fixture });

    const snap = tt.snapshot(sid);
    assert.equal(snap.T0.tokens_in, 300);
    assert.equal(snap.T0.tokens_out, 700);
    assert.equal(snap.T3.calls, 1);            // gpt + zero-usage opus excluded
    assert.equal(snap.T3.tokens_in, 1000);
    assert.equal(snap.T3.tokens_out, 200);
    assert.equal(snap.T2.tokens_in, 400);
    assert.equal(snap.T2.tokens_out, 100);
    assert.equal(snap.T1.tokens_in, 80);
    assert.equal(snap.T1.tokens_out, 20);

    // All four tiers present in one snapshot.
    for (const t of ['T0', 'T1', 'T2', 'T3']) {
      assert.ok(snap[t].tokens_in + snap[t].tokens_out > 0, `${t} should have tokens`);
    }
  } finally {
    cleanup(sid, fixture);
  }
});

test('🪙 chip: shows ALL FOUR tiers (incl. zeros), compact units', () => {
  const { buildTokenChip, fmtTokens } = require('./statusline-multi.js');
  assert.equal(fmtTokens(1898286), '1.9M');
  assert.equal(fmtTokens(13300), '13.3k');
  assert.equal(fmtTokens(24200), '24.2k');
  assert.equal(fmtTokens(940), '940');

  const snap = {
    T0: { tokens_in: 8000, tokens_out: 5300 }, // 13.3k
    T1: { tokens_in: 0, tokens_out: 0 },        // 0 — still shown
    T2: { tokens_in: 20000, tokens_out: 4200 }, // 24.2k
    T3: { tokens_in: 0, tokens_out: 0 },        // 0 — still shown
  };
  // Wave 19 Day 4.1 — every tier visible; hiding zeros mislead "only uses Opus".
  // color:false → bare text (ANSI on by default; see the 19.B-1 color test).
  assert.equal(buildTokenChip(snap, { color: false }), '🪙 T0:13.3k tkns · T1:0 · T2:24.2k · T3:0');
  assert.equal(buildTokenChip(null, { color: false }), null); // no data ≠ all-zero
});

test('🪙 chip Day 4.1: an all-zero session still renders the full 4-tier chip', () => {
  const { buildTokenChip } = require('./statusline-multi.js');
  // A fresh session (snapshot returns zeros, not null) must show every tier at 0
  // — the honest "no spend yet", never a misleading single-tier chip or nothing.
  const zero = { T0: { tokens_in: 0, tokens_out: 0 }, T1: {}, T2: {}, T3: {} };
  assert.equal(buildTokenChip(zero, { color: false }), '🪙 T0:0 tkns · T1:0 · T2:0 · T3:0');
  // A T3-only session shows the zeros that prove cheaper tiers were available.
  const t3only = { T0: {}, T1: {}, T2: {}, T3: { tokens_in: 2000000, tokens_out: 400000 } };
  assert.equal(buildTokenChip(t3only, { color: false }), '🪙 T0:0 tkns · T1:0 · T2:0 · T3:2.4M');
});

test('modelToTier maps models to tiers and ignores non-T0–T3 models', () => {
  assert.equal(tt.modelToTier('claude-opus-4-8'), 'T3');
  assert.equal(tt.modelToTier('claude-sonnet-4-6'), 'T2');
  assert.equal(tt.modelToTier('claude-haiku-4-5'), 'T1');
  assert.equal(tt.modelToTier('qwen3:30b'), 'T0');
  assert.equal(tt.modelToTier('llama3.1'), 'T0');
  assert.equal(tt.modelToTier('gpt-4o'), null);
  assert.equal(tt.modelToTier('gemini-2.0'), null);
  assert.equal(tt.modelToTier(''), null);
});

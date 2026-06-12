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

// ── Wave 58 (C): additive per-agent bucket ───────────────────────────────────

function writeAgentTranscript(p, model, rows) {
  const lines = rows.map((r) => JSON.stringify({
    type: 'assistant', message: { model, usage: { input_tokens: r[0], output_tokens: r[1] } },
  }));
  fs.writeFileSync(p, lines.join('\n') + '\n');
}

test('snapshotByAgent: per-agent bucket records real tokens + dominant tier/model', () => {
  const sid = `tt-ba-${process.pid}`;
  const tA = path.join(os.tmpdir(), `tt-ba-A-${process.pid}.jsonl`);
  const tB = path.join(os.tmpdir(), `tt-ba-B-${process.pid}.jsonl`);
  cleanup(sid, tA);
  try { fs.unlinkSync(tB); } catch { /* gone */ }
  // local-summarizer wrapped by Haiku; model-reasoner wrapped by Sonnet.
  writeAgentTranscript(tA, 'claude-haiku-4-5-20251001', [[3, 2], [5, 90]]);
  writeAgentTranscript(tB, 'claude-sonnet-4-6', [[400, 100]]);
  try {
    tt.trackSubagentTranscript(sid, 'agent-A1', tA, { agentName: 'local-summarizer' });
    tt.trackSubagentTranscript(sid, 'agent-B1', tB, { agentName: 'model-reasoner' });

    const ba = tt.snapshotByAgent(sid);
    assert.deepEqual(Object.keys(ba).sort(), ['local-summarizer', 'model-reasoner']);

    assert.equal(ba['local-summarizer'].calls, 2);
    assert.equal(ba['local-summarizer'].tokens_in, 8);
    assert.equal(ba['local-summarizer'].tokens_out, 92);
    assert.equal(ba['local-summarizer'].tier, 'T1');
    assert.equal(ba['local-summarizer'].model, 'claude-haiku-4-5-20251001');

    assert.equal(ba['model-reasoner'].calls, 1);
    assert.equal(ba['model-reasoner'].tokens_in, 400);
    assert.equal(ba['model-reasoner'].tokens_out, 100);
    assert.equal(ba['model-reasoner'].tier, 'T2');
    assert.equal(ba['model-reasoner'].model, 'claude-sonnet-4-6');

    // Per-TIER snapshot stays byte-identical in SHAPE + correct totals (additive).
    const snap = tt.snapshot(sid);
    assert.deepEqual(Object.keys(snap).sort(), ['T0', 'T1', 'T2', 'T3']);
    assert.equal(snap.T1.tokens_in + snap.T1.tokens_out, 100);
    assert.equal(snap.T2.tokens_in + snap.T2.tokens_out, 500);
  } finally {
    cleanup(sid, tA);
    try { fs.unlinkSync(tB); } catch { /* gone */ }
  }
});

test('snapshotByAgent: same agent name across spawns accumulates; dedup by agent_id holds', () => {
  const sid = `tt-ba-dedup-${process.pid}`;
  const t1 = path.join(os.tmpdir(), `tt-ba-d1-${process.pid}.jsonl`);
  cleanup(sid, t1);
  writeAgentTranscript(t1, 'claude-haiku-4-5', [[10, 20]]);
  try {
    assert.equal(tt.trackSubagentTranscript(sid, 'spawn-1', t1, { agentName: 'cheap-triage' }), true);
    // Second DISTINCT spawn of the same agent name → accumulate.
    assert.equal(tt.trackSubagentTranscript(sid, 'spawn-2', t1, { agentName: 'cheap-triage' }), true);
    // Re-fire of spawn-1 (hook retry) → no double-count.
    assert.equal(tt.trackSubagentTranscript(sid, 'spawn-1', t1, { agentName: 'cheap-triage' }), false);

    const ba = tt.snapshotByAgent(sid);
    assert.equal(ba['cheap-triage'].calls, 2, 'two distinct spawns counted once each');
    assert.equal(ba['cheap-triage'].tokens_in, 20);
    assert.equal(ba['cheap-triage'].tokens_out, 40);
  } finally {
    cleanup(sid, t1);
  }
});

test('snapshotByAgent: agentName falls back to agentId when not supplied', () => {
  const sid = `tt-ba-fallback-${process.pid}`;
  const t1 = path.join(os.tmpdir(), `tt-ba-f1-${process.pid}.jsonl`);
  cleanup(sid, t1);
  writeAgentTranscript(t1, 'claude-opus-4-8', [[100, 50]]);
  try {
    tt.trackSubagentTranscript(sid, 'agent-XYZ', t1); // no opts.agentName
    const ba = tt.snapshotByAgent(sid);
    assert.equal(ba['agent-XYZ'].tier, 'T3');
    assert.equal(ba['agent-XYZ'].tokens_out, 50);
  } finally {
    cleanup(sid, t1);
  }
});

test('snapshotByAgent: empty session → {} (no fabricated rows)', () => {
  const sid = `tt-ba-empty-${process.pid}`;
  cleanup(sid);
  try {
    assert.deepEqual(tt.snapshotByAgent(sid), {});
  } finally {
    cleanup(sid);
  }
});

test('dominantAgentTier: picks the tier with the most tokens; honest null when none', () => {
  const tmix = path.join(os.tmpdir(), `tt-dom-${process.pid}.jsonl`);
  // Sonnet=500 tokens vs Haiku=10 → Sonnet (T2) dominates.
  fs.writeFileSync(tmix, [
    JSON.stringify({ type: 'assistant', message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 400, output_tokens: 100 } } }),
    JSON.stringify({ type: 'assistant', message: { model: 'claude-haiku-4-5', usage: { input_tokens: 5, output_tokens: 5 } } }),
  ].join('\n') + '\n');
  try {
    const dom = tt.dominantAgentTier(tmix);
    assert.equal(dom.tier, 'T2');
    assert.equal(dom.model, 'claude-sonnet-4-6');
  } finally {
    try { fs.unlinkSync(tmix); } catch { /* gone */ }
  }
  assert.deepEqual(tt.dominantAgentTier('/no/such/transcript.jsonl'), { tier: null, model: null });
});

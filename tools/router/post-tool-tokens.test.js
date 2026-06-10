'use strict';
// Wave 53 Phase C.2 — opt-in cumulative token segment for the per-Bash badge.
// Per-command tokens are NOT exposed by CC (usage is per assistant message, not
// per tool_use), so the badge only ever shows the routed tier's REAL cumulative
// session total or an explicit `tokens?` — never a fabricated per-command figure.
const test = require('node:test');
const assert = require('node:assert');
const { tokensEnabled, fmtTokens, tokenSegment } = require('./post_tool_badge.js');

test('tokensEnabled: opt-in only, default off', () => {
  assert.strictEqual(tokensEnabled({ post_tool_tokens: true }), true);
  assert.strictEqual(tokensEnabled({ post_tool_tokens: false }), false);
  assert.strictEqual(tokensEnabled({}), false);
  assert.strictEqual(tokensEnabled(null), false);
});

test('fmtTokens: compact form', () => {
  assert.strictEqual(fmtTokens(0), '0');
  assert.strictEqual(fmtTokens(940), '940');
  assert.strictEqual(fmtTokens(1300), '1.3k');
  assert.strictEqual(fmtTokens(12000), '12k');
  assert.strictEqual(fmtTokens(undefined), '0');
});

const snap = { T0: { tokens_in: 0, tokens_out: 0 }, T2: { tokens_in: 8000, tokens_out: 4300 } };

test('tokenSegment: real cumulative tier total (Σ-labelled, not per-command)', () => {
  assert.strictEqual(tokenSegment(snap, 'T2'), ' · ΣT2 12k');
});

test('tokenSegment: honest `tokens?` fallback when no real data', () => {
  assert.strictEqual(tokenSegment(snap, 'T0'), ' · tokens?');   // tier present but zero
  assert.strictEqual(tokenSegment(snap, 'T5'), ' · tokens?');   // tier not aggregated
  assert.strictEqual(tokenSegment(snap, undefined), ' · tokens?');
  assert.strictEqual(tokenSegment(null, 'T2'), ' · tokens?');
});

test('tokenSegment: never fabricates — only Σ or tokens?', () => {
  const out = tokenSegment(snap, 'T2');
  assert.ok(out.startsWith(' · Σ') || out === ' · tokens?', out);
  assert.ok(!/per|cmd|each/.test(out));
});

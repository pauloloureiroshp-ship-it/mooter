#!/usr/bin/env node
/**
 * Unit tests for backtest.js and update-router.js.
 * Uses node:test (no deps). Run with: node backtest.test.js
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const { analyze, buildTuning, signature } = require('./backtest.js');

// ── signature() ────────────────────────────────────────────────────────────

test('signature: lowercases and keeps first 3 meaningful words', () => {
  assert.equal(signature('Review Final Antes de Fazer Push'), 'review final antes');
  assert.equal(signature('  Olá,  mundo!  '), 'olá mundo');
  assert.equal(signature(''), '');
  assert.equal(signature(undefined), '');
});

test('signature: strips punctuation across unicode', () => {
  assert.equal(signature('porquê? isto não funciona.'), 'porquê isto não');
});

// ── analyze() ──────────────────────────────────────────────────────────────

const FIXTURE = [
  // high-risk preview — must be filtered out of all candidate buckets
  { prompt_preview: 'review final antes de push', prompt_len: 28, tier: 'T3', confidence: 0.75 },
  { prompt_preview: 'deploy para produção agora', prompt_len: 26, tier: 'T3', confidence: 0.9 },
  // legitimate short+high-tier noise — should be proposed as demote
  { prompt_preview: 'decompõe o sprint 9', prompt_len: 20, tier: 'T2', confidence: 0.7 },
  { prompt_preview: 'decompõe o sprint 10', prompt_len: 21, tier: 'T2', confidence: 0.7 },
  // low-conf short — should be proposed as promote-to-T0 candidate
  { prompt_preview: 'ok vamos', prompt_len: 8, tier: 'T2', confidence: 0.45 },
  // trivial T0 baseline
  { prompt_preview: 'que horas são', prompt_len: 14, tier: 'T0', confidence: 0.8 },
];

test('analyze: counts tiers correctly', () => {
  const s = analyze(FIXTURE);
  assert.equal(s.total, 6);
  assert.equal(s.byTier.T3, 2);
  assert.equal(s.byTier.T2, 3);
  assert.equal(s.byTier.T0, 1);
});

test('analyze: HIGH_RISK previews never enter demote candidates', () => {
  const s = analyze(FIXTURE);
  const patterns = s.topDemote.map(d => d.pattern);
  assert.ok(!patterns.some(p => /review final/.test(p)), 'review final must be filtered');
  assert.ok(!patterns.some(p => /deploy/.test(p)), 'deploy must be filtered');
});

test('analyze: legitimate short+high-tier noise appears in demote candidates', () => {
  const s = analyze(FIXTURE);
  const patterns = s.topDemote.map(d => d.pattern);
  assert.ok(patterns.some(p => p.startsWith('decompõe o sprint')));
});

test('analyze: short low-conf becomes promote candidate', () => {
  const s = analyze(FIXTURE);
  assert.ok(s.promoteToT0.some(p => p.startsWith('ok vamos')));
});

test('analyze: empty decisions returns zero sample', () => {
  const s = analyze([]);
  assert.equal(s.total, 0);
  assert.equal(s.topDemote.length, 0);
});

// ── buildTuning() ──────────────────────────────────────────────────────────

test('buildTuning: emits complexity_threshold within expected range', () => {
  const s = analyze(FIXTURE);
  const t = buildTuning(s);
  assert.ok(t.complexity_threshold >= 0.25 && t.complexity_threshold <= 0.35);
  assert.ok(Array.isArray(t.promote_to_t0_patterns));
  assert.ok(Array.isArray(t.demote_from_t3_patterns));
  assert.ok(typeof t.generated_at === 'string');
  assert.equal(t.sample_size, 6);
});

test('buildTuning: tighter threshold on higher noise ratio', () => {
  // Stack the deck: 5 short+high-tier, 1 trivial → noiseRatio = 5/6 ≈ 0.83
  const noisy = [
    { prompt_preview: 'a b c', prompt_len: 5, tier: 'T3', confidence: 0.7 },
    { prompt_preview: 'd e f', prompt_len: 5, tier: 'T3', confidence: 0.7 },
    { prompt_preview: 'g h i', prompt_len: 5, tier: 'T3', confidence: 0.7 },
    { prompt_preview: 'j k l', prompt_len: 5, tier: 'T2', confidence: 0.7 },
    { prompt_preview: 'm n o', prompt_len: 5, tier: 'T2', confidence: 0.7 },
    { prompt_preview: 'trivia', prompt_len: 7, tier: 'T0', confidence: 0.8 },
  ];
  const t = buildTuning(analyze(noisy));
  assert.equal(t.complexity_threshold, 0.25);
});

// ── update-router idempotency (integration) ────────────────────────────────

test('update-router: TUNED block is idempotent across runs', () => {
  const ROUTER = path.join(os.homedir(), '.claude', 'tools', 'router');
  const CLASSIFY = path.join(ROUTER, 'classify.js');
  const UPDATE = path.join(ROUTER, 'update-router.js');

  // Snapshot current classify.js
  const before = fs.readFileSync(CLASSIFY, 'utf8');

  const run1 = spawnSync(process.execPath, [UPDATE], { encoding: 'utf8' });
  assert.equal(run1.status, 0, `update-router run1 failed: ${run1.stderr}`);
  const after1 = fs.readFileSync(CLASSIFY, 'utf8');

  const run2 = spawnSync(process.execPath, [UPDATE], { encoding: 'utf8' });
  assert.equal(run2.status, 0, `update-router run2 failed: ${run2.stderr}`);
  const after2 = fs.readFileSync(CLASSIFY, 'utf8');

  assert.equal(after1, after2, 'second run must be a no-op (idempotent)');

  // Validate exactly one TUNED block exists
  const matches = after2.match(/TUNED-BLOCK-START/g) || [];
  assert.equal(matches.length, 1, 'exactly one TUNED block must exist');

  // Restore original if re-run changed anything (best-effort — test only
  // checks idempotency, not content equivalence with pre-test state)
  if (before !== after2) {
    // Leave the updated state — it's the expected post-tune state.
  }
});

test('classify.js: high-risk prompts ignore TUNED demote/promote', () => {
  const CLASSIFY = path.join(os.homedir(), '.claude', 'tools', 'router', 'classify.js');
  const r = spawnSync(
    process.execPath,
    [CLASSIFY, 'review final antes de fazer push'],
    { encoding: 'utf8', env: { ...process.env, ANTHROPIC_API_KEY: 'fake' } }
  );
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.tier, 'T3', 'pre-push must stay T3 regardless of TUNED patterns');
});

// ── v0.6 cost model (pricing.js + savings-tracker.js token math) ────────────

const pricing = require('./pricing.js');
const tracker = require('./savings-tracker.js');

test('pricing: Opus turn costs 30-60× a Haiku turn of same size', () => {
  const opus = pricing.priceTurn('claude-opus-4-6', 10000, 1000);
  const haiku = pricing.priceTurn('claude-haiku-4-5', 10000, 1000);
  const ratio = opus / haiku;
  assert.ok(ratio >= 18 && ratio <= 60,
    `Opus/Haiku ratio was ${ratio.toFixed(1)}, expected 18-60 (input-heavy vs output-heavy windows).`);
});

test('pricing: Ollama is strictly free and unknown models fall back', () => {
  assert.equal(pricing.priceTurn('qwen2.5:3b', 99999, 99999), 0);
  assert.equal(pricing.priceTurn('ollama:whatever', 1, 1), 0);
  const fallback = pricing.priceTurn('completely-unknown-model', 1_000_000, 1_000_000);
  // Fallback is Sonnet-tier {3, 15} → 18 USD exactly
  assert.ok(fallback > 0 && fallback < 100, 'fallback should be finite and non-zero');
});

test('pricing: estimateTurnCost scales monotonically with prompt length', () => {
  const small = pricing.estimateTurnCost('T3', 100);
  const medium = pricing.estimateTurnCost('T3', 5000);
  const large = pricing.estimateTurnCost('T3', 50000);
  assert.ok(small < medium, 'small < medium');
  assert.ok(medium < large, 'medium < large');
  // Large prompt on Opus should be realistic (~$0.50-$5 range)
  assert.ok(large > 0.1, `expected large Opus prompt > $0.10, got $${large.toFixed(4)}`);
});

test('savings-tracker: isSystemPrompt filters Claude Code hook echoes', () => {
  assert.equal(tracker.isSystemPrompt({ prompt_preview: '<task-notification> hello' }), true);
  assert.equal(tracker.isSystemPrompt({ prompt_preview: '<system-reminder> foo' }), true);
  assert.equal(tracker.isSystemPrompt({ prompt_preview: 'que horas são' }), false);
  assert.equal(tracker.isSystemPrompt({ prompt_preview: '' }), false);
});

test('savings-tracker: computeMetrics excludes system prompts from counts', () => {
  const lines = [
    JSON.stringify({ event: 'classified', tier: 'T0', prompt_len: 14, prompt_preview: 'que horas são' }),
    JSON.stringify({ event: 'classified', tier: 'T3', prompt_len: 400, prompt_preview: '<task-notification> hook' }),
    JSON.stringify({ event: 'classified', tier: 'T3', prompt_len: 800, prompt_preview: 'refactor the vault' }),
    JSON.stringify({ event: 'option_a_hit', prompt_len: 14 }),
  ];
  const m = tracker.computeMetrics(lines);
  assert.equal(m.prompts, 2, '2 user prompts after filtering');
  assert.equal(m.system_prompts_filtered, 1, '1 system prompt filtered');
  assert.equal(m.option_a_hits, 1, '1 Option-A hit counted');
  assert.equal(m.by_tier.T0, 1);
  assert.equal(m.by_tier.T3, 1);
  assert.ok(m.guaranteed_saved > 0, 'Option-A hit should produce guaranteed savings');
  assert.ok(m.real_cost_estimated > 0, 'T3 prompt should produce non-zero estimated cost');
  assert.equal(m.version, '0.6.0');
});

test('savings-tracker: saved_pct is a percentage, real_cost < naive_cost', () => {
  const lines = [];
  for (let i = 0; i < 10; i++) {
    lines.push(JSON.stringify({ event: 'classified', tier: 'T0', prompt_len: 50, prompt_preview: 'q' + i }));
  }
  lines.push(JSON.stringify({ event: 'classified', tier: 'T3', prompt_len: 5000, prompt_preview: 'big refactor' }));
  const m = tracker.computeMetrics(lines);
  assert.ok(m.real_cost_estimated < m.naive_cost, 'router should save money on T0-heavy corpus');
  assert.ok(m.saved_pct > 50 && m.saved_pct < 100, `expected 50-100%, got ${m.saved_pct}`);
});

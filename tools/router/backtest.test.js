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

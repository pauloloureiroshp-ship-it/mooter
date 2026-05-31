// Wave 2.8 Ponto #7+#8 — Moo card gains quant + honest adapter lines.
// node:test + assert.

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const { buildMooCard } = require('./stop_hook.js');

const localStats = {
  tier: 'T0', model: 'qwen3:7b', backend: 'ollama',
  confidence: 0.9, promptLen: 30, tierMix: 'T0:6 T1:1 T2:1 T3:0',
};
const cloudStats = {
  tier: 'T2', model: 'claude-sonnet-4-6', backend: 'anthropic',
  confidence: 0.84, promptLen: 50, tierMix: 'T0:4 T1:2 T2:4 T3:0',
};

test('Moo card: quant line for a local Moo (honest baseline + FP16 ref)', () => {
  const card = buildMooCard(localStats, null);
  assert.match(card, /quant     Q4_K_M \(baseline · ~-73% vs FP16\)/);
});

test('Moo card: no quant line for a cloud Moo', () => {
  const card = buildMooCard(cloudStats, null);
  assert.ok(!/quant/.test(card), 'cloud model is not locally quantized');
});

test('Moo card: honest adapter line in every card (baseline + forge install hint)', () => {
  assert.match(buildMooCard(localStats, null), /adapter   ◌ baseline · add one with `mooter forge install <gguf>`/);
  assert.match(buildMooCard(cloudStats, null), /adapter   ◌ baseline · add one with `mooter forge install/);
});

test('Moo card: adapter line keeps the honest disclosure parity (W2.7 MIN-2)', () => {
  // The W2.7 audit flagged the card omitting the adapter disclosure the dashboard
  // carries; this asserts the card still discloses the baseline state + how to add one.
  const card = buildMooCard(localStats, null);
  assert.ok(/◌ baseline · add one with `mooter forge install/.test(card));
});

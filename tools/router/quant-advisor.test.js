'use strict';

// Tests for the adaptive-quantization advisor (Wave 52 Phase 4).
// Contract: a PURE offline calculator. No Ollama spawn, no network, no routing.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const adv = require('./quant-advisor.js');

test('toParamsB parses string and numeric model sizes', () => {
  assert.equal(adv.toParamsB('7b'), 7);
  assert.equal(adv.toParamsB('7.6B'), 7.6);
  assert.equal(adv.toParamsB(32), 32);
  assert.equal(adv.toParamsB('32'), 32);
  assert.ok(Number.isNaN(adv.toParamsB('')));
  assert.ok(Number.isNaN(adv.toParamsB(undefined)));
});

test('estimateWeightsMb is calibrated to the known qwen2.5-coder:7.6b Q4_K_M (~4.7 GB)', () => {
  const w = adv.estimateWeightsMb(7.6, 'Q4_K_M');
  assert.ok(w > 4400 && w < 5000, `weights ${w} MiB outside calibrated band`);
});

test('estimateWeightsMb grows with higher-precision quant', () => {
  assert.ok(adv.estimateWeightsMb(7, 'Q8_0') > adv.estimateWeightsMb(7, 'Q4_K_M'));
  assert.ok(adv.estimateWeightsMb(7, 'Q4_K_M') > adv.estimateWeightsMb(7, 'Q2_K'));
});

test('estimateWeightsMb returns NaN for unknown quant or bad params', () => {
  assert.ok(Number.isNaN(adv.estimateWeightsMb(7, 'Q9_NOPE')));
  assert.ok(Number.isNaN(adv.estimateWeightsMb(0, 'Q4_K_M')));
});

test('estimateKvCacheMb scales linearly with context and shrinks with KV-bit quant', () => {
  const a = adv.estimateKvCacheMb(8000, 7, 16);
  const b = adv.estimateKvCacheMb(16000, 7, 16);
  assert.ok(Math.abs(b - 2 * a) < 1, 'KV cache should double when context doubles');
  assert.ok(adv.estimateKvCacheMb(8000, 7, 3) < a, '3-bit KV must be smaller than FP16');
  assert.equal(adv.estimateKvCacheMb(0, 7, 16), 0);
  assert.equal(adv.estimateKvCacheMb(8000, 0, 16), 0);
});

test('recommendQuant: Ollama default fits a 7.6B model on a 24GB card → pull nothing', () => {
  const r = adv.recommendQuant({ vramMb: 24576, paramsB: '7.6b', contextTokens: 8192 });
  assert.equal(r.fits, true);
  assert.equal(r.defaultFits, true);
  assert.equal(r.recommended, 'Q4_K_M');
  assert.match(r.action, /pull nothing/i);
  assert.equal(r.advisory, true);
  assert.match(r.note, /does not requantize at runtime/i);
});

test('recommendQuant: tight VRAM drops below the default → recommend a smaller tag', () => {
  // 13B on a 6GB card: Q4_K_M won't fit, a lower quant might.
  const r = adv.recommendQuant({ vramMb: 6144, paramsB: 13, contextTokens: 4096 });
  assert.equal(r.defaultFits, false);
  if (r.fits) {
    assert.notEqual(r.recommended, 'Q4_K_M');
    assert.match(r.action, /smaller `:/);
  }
});

test('recommendQuant: nothing fits → advises a smaller model, no crash', () => {
  const r = adv.recommendQuant({ vramMb: 4096, paramsB: 70, contextTokens: 8192 });
  assert.equal(r.fits, false);
  assert.equal(r.recommended, null);
  assert.equal(r.breakdown, null);
  assert.match(r.action, /smaller model/i);
});

test('recommendQuant: ample VRAM still recommends the sweet spot, not FP16', () => {
  // 80GB card, 7B model: best-fitting is FP16, but recommendation stays at the
  // quality-floor sweet spot (Q4_K_M) since gains above it are negligible.
  const r = adv.recommendQuant({ vramMb: 81920, paramsB: 7, contextTokens: 8192 });
  assert.equal(r.best, 'FP16');
  assert.equal(r.recommended, 'Q4_K_M');
});

test('recommendQuant: fits_list is ordered highest-quality first', () => {
  const r = adv.recommendQuant({ vramMb: 24576, paramsB: 7, contextTokens: 8192 });
  const qualities = r.fits_list.map((f) => f.quality_pct);
  for (let i = 1; i < qualities.length; i++) {
    assert.ok(qualities[i] <= qualities[i - 1], 'fits_list must be quality-descending');
  }
});

test('recommendQuant: 3-bit KV cache frees budget vs FP16 KV', () => {
  const fp16 = adv.recommendQuant({ vramMb: 9000, paramsB: 13, contextTokens: 32000, kvQuantBits: 16 });
  const tbq3 = adv.recommendQuant({ vramMb: 9000, paramsB: 13, contextTokens: 32000, kvQuantBits: 3 });
  assert.ok(tbq3.fits_list.length >= fp16.fits_list.length, '3-bit KV should fit at least as many quants');
});

test('recommendQuant throws on non-positive vram or params', () => {
  assert.throws(() => adv.recommendQuant({ vramMb: 0, paramsB: 7 }), TypeError);
  assert.throws(() => adv.recommendQuant({ vramMb: 8192, paramsB: 'abc' }), TypeError);
});

test('maxModelParamsB: bigger budget fits a bigger model; tiny budget fits none', () => {
  const big = adv.maxModelParamsB({ vramMb: 24576, quant: 'Q4_K_M', contextTokens: 8192 });
  const small = adv.maxModelParamsB({ vramMb: 6144, quant: 'Q4_K_M', contextTokens: 8192 });
  assert.ok(big > small);
  assert.ok(big > 10, `expected >10B on 24GB, got ${big}`);
  assert.equal(adv.maxModelParamsB({ vramMb: 256, quant: 'Q4_K_M' }), 0);
});

test('maxModelParamsB throws on bad input', () => {
  assert.throws(() => adv.maxModelParamsB({ vramMb: 0, quant: 'Q4_K_M' }), TypeError);
  assert.throws(() => adv.maxModelParamsB({ vramMb: 8192, quant: 'Q9_NOPE' }), TypeError);
});

test('HW_TIER_VRAM_MB mirrors env-detect classifyHwTier thresholds', () => {
  assert.equal(adv.HW_TIER_VRAM_MB['gpu-high'], 20480);
  assert.equal(adv.HW_TIER_VRAM_MB['gpu-mid'], 8192);
  assert.equal(adv.HW_TIER_VRAM_MB['gpu-low'], 4096);
});

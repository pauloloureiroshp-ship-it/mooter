// Wave 5 D3 — quantization tooltip (detailed/compact). node:test + assert.

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { formatQuantChipDetailed, formatQuantChipCompact, QUANT_INFO } = require('./quantization.js');

test('detailed: Q4_K_M → size + quality vs FP16 (verifiable Ollama figures)', () => {
  assert.equal(formatQuantChipDetailed('Q4_K_M'), 'quant Q4_K_M (-72% size · ~99% quality vs FP16)');
});

test('detailed: Q8_0 ≈ half size, ~99.9% quality', () => {
  assert.equal(formatQuantChipDetailed('Q8_0'), 'quant Q8_0 (-47% size · ~99.9% quality vs FP16)');
});

test('detailed: unknown quant → bare fallback (no invented numbers)', () => {
  assert.equal(formatQuantChipDetailed('Q9_X'), 'quant Q9_X');
});

test('compact: just the format', () => {
  assert.equal(formatQuantChipCompact('Q4_K_M'), 'quant Q4_K_M');
});

test('QUANT_INFO: quality decreases as size shrinks (sanity)', () => {
  assert.ok(QUANT_INFO.Q4_K_M.quality_pct > QUANT_INFO.Q2_K.quality_pct);
  assert.ok(QUANT_INFO.Q4_K_M.size_pct_vs_fp16 > QUANT_INFO.Q2_K.size_pct_vs_fp16);
  assert.equal(QUANT_INFO.FP16.quality_pct, 100);
});

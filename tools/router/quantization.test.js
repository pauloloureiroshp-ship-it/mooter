// Wave 2.8 — quantization detection. node:test + assert.

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const { detectQuantization, detectQuantizationLive, BASELINE } = require('./quantization.js');

test('detectQuantization: local models → Q4_K_M baseline', () => {
  assert.equal(detectQuantization('qwen3:7b').format, 'Q4_K_M');
  assert.equal(detectQuantization('qwen3:30b').format, 'Q4_K_M');
  assert.equal(detectQuantization('llama3:8b').format, 'Q4_K_M');
  assert.equal(detectQuantization('deepseek-r1:7b').reduction_vs_fp16, 73);
});

test('detectQuantization: cloud models → null (not locally quantized)', () => {
  assert.equal(detectQuantization('claude-sonnet-4-6'), null);
  assert.equal(detectQuantization('claude-opus-4-8'), null);
  assert.equal(detectQuantization('gpt-4o'), null);
  assert.equal(detectQuantization(''), null);
  assert.equal(detectQuantization(null), null);
});

test('detectQuantizationLive: parses ollama show output', () => {
  const fakeSpawn = () => ({ stdout: '  Model\n    quantization    Q4_K_M\n    parameters    7B\n' });
  const r = detectQuantizationLive('qwen3:7b', fakeSpawn);
  assert.equal(r.format, 'Q4_K_M');
});

test('detectQuantizationLive: falls back to baseline on failure', () => {
  const throwingSpawn = () => { throw new Error('ollama not found'); };
  assert.equal(detectQuantizationLive('qwen3:7b', throwingSpawn).format, BASELINE.format);
  const emptySpawn = () => ({ stdout: '' });
  assert.equal(detectQuantizationLive('qwen3:7b', emptySpawn).format, BASELINE.format);
});

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { maxLocalMoos, laneModel } = require('./local-fleet');

const M3 = { recommended_t0: 'qwen2.5-coder:14b-q4', option_a_model: 'qwen2.5:3b' };

test('Moo count scales with RAM — never a hardcoded constant', () => {
  const small = maxLocalMoos(M3, 8192).max_local_moos;   // 8 GB
  const big = maxLocalMoos(M3, 65536).max_local_moos;    // 64 GB
  assert.ok(big > small, `more RAM must allow more Moos (${small} -> ${big})`);
});

test('honest floor: at least 1 lane, never 0 or fabricated', () => {
  const tiny = maxLocalMoos(M3, 512); // 0.5 GB — nothing really fits
  assert.strictEqual(tiny.max_local_moos, 1);
  assert.ok(tiny.basis.includes('clamped'));
});

test('capped at the ceiling regardless of huge RAM', () => {
  const huge = maxLocalMoos(M3, 1024 * 1024).max_local_moos; // 1 TB
  assert.ok(huge <= 8);
});

test('lane model defaults to the fast small model (option_a)', () => {
  assert.strictEqual(laneModel(M3), 'qwen2.5:3b');
});

test('no memory signal → single lane + honest basis', () => {
  const r = maxLocalMoos(M3, NaN);
  assert.strictEqual(r.max_local_moos, 1);
  assert.match(r.basis, /no memory signal/);
});

test('basis string shows the real computation (auditable, sem inventar)', () => {
  const r = maxLocalMoos(M3, 8192);
  assert.match(r.basis, /8192MB/);
  assert.match(r.basis, /qwen2\.5:3b/);
});

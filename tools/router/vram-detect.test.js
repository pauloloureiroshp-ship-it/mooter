// Wave 5 D3 — VRAM detection. node:test + assert. Injected spawn (no real nvidia-smi).

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { getVram, formatVramChip, _resetCache } = require('./vram_detect.js');

function fakeSpawn(stdout, status = 0) {
  return () => ({ status, stdout });
}

test('formatVramChip: null → null', () => {
  assert.equal(formatVramChip(null), null);
});

test('formatVramChip: used/total → "X.XGB / YGB"', () => {
  assert.equal(formatVramChip({ used_mb: 12400, total_mb: 24576 }), '12.1GB / 24GB');
});

test('formatVramChip: M-series shared (used -1) → "YGB shared"', () => {
  assert.equal(formatVramChip({ used_mb: -1, total_mb: 32768 }), '32.0GB shared');
});

test('getVram: parses nvidia-smi csv (linux)', () => {
  if (process.platform !== 'linux') return; // path is platform-specific
  _resetCache();
  const v = getVram(fakeSpawn('8595, 24564\n'), 1000);
  assert.deepEqual(v, { used_mb: 8595, total_mb: 24564 });
});

test('getVram: nvidia-smi failure → null (never invents)', () => {
  if (process.platform !== 'linux') return;
  _resetCache();
  assert.equal(getVram(fakeSpawn('', 1), 1000), null);
  _resetCache();
  assert.equal(getVram(() => { throw new Error('not found'); }, 1000), null);
});

test('getVram: 5s cache (does not re-spawn within window)', () => {
  if (process.platform !== 'linux') return;
  _resetCache();
  let calls = 0;
  const spawn = () => { calls++; return { status: 0, stdout: '100, 200\n' }; };
  getVram(spawn, 1000);
  getVram(spawn, 3000); // within 5s → cached
  assert.equal(calls, 1, 'second call within 5s used the cache');
  getVram(spawn, 7000); // past 5s → re-spawn
  assert.equal(calls, 2);
});

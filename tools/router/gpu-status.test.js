'use strict';
// Wave 58.2 — gpu-status chip. Hermetic: pure buildGpuChip covers the formatting
// + degrade branches; readCapability uses a temp HOME so it never touches the
// developer's real ~/.claude/tools/router/hw-capability.json.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { buildGpuChip, readCapability, capabilityPath } = require('./gpu-status.js');

// ── buildGpuChip (pure) ──────────────────────────────────────────────────────

test('renders name + VRAM + tier from a real nvidia record', () => {
  const cap = { vendor: 'nvidia', name: 'RTX 4090', vram_mb: 24564, hw_tier: 'gpu-high' };
  assert.equal(buildGpuChip(cap), '🎮 RTX 4090 24GB · gpu-high');
});

test('rounds VRAM to whole GB', () => {
  assert.equal(
    buildGpuChip({ vendor: 'nvidia', name: 'RTX 3060', vram_mb: 12288, hw_tier: 'gpu-mid' }),
    '🎮 RTX 3060 12GB · gpu-mid',
  );
});

test('apple silicon (no VRAM) shows name + tier only', () => {
  assert.equal(
    buildGpuChip({ vendor: 'apple', name: 'Apple M3 Max', vram_mb: null, hw_tier: 'apple-silicon' }),
    '🎮 Apple M3 Max · apple-silicon',
  );
});

test('cpu-only / no-vendor record is silent (no fabrication)', () => {
  assert.equal(buildGpuChip({ vendor: 'cpu', name: 'CPU-only', hw_tier: 'cpu-only' }), '');
  assert.equal(buildGpuChip({ name: 'RTX 4090', vram_mb: 24564 }), ''); // missing vendor
});

test('malformed / empty input is silent', () => {
  assert.equal(buildGpuChip(null), '');
  assert.equal(buildGpuChip(undefined), '');
  assert.equal(buildGpuChip({}), '');
  assert.equal(buildGpuChip({ vendor: 'nvidia', name: '   ' }), ''); // blank name
});

test('drops a cpu-only hw_tier suffix but keeps a named GPU', () => {
  assert.equal(
    buildGpuChip({ vendor: 'nvidia', name: 'GTX 1050', vram_mb: 0, hw_tier: 'cpu-only' }),
    '🎮 GTX 1050',
  );
});

// ── readCapability (file read, hermetic temp HOME) ───────────────────────────

test('readCapability reads the cache from the given home, null when absent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-gpuchip-'));
  assert.equal(readCapability(dir), null); // nothing written yet
  const p = capabilityPath(dir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ vendor: 'nvidia', name: 'RTX 4090', vram_mb: 24564, hw_tier: 'gpu-high' }));
  const cap = readCapability(dir);
  assert.equal(cap.name, 'RTX 4090');
  assert.equal(buildGpuChip(cap), '🎮 RTX 4090 24GB · gpu-high');
});

test('readCapability returns null on malformed JSON (never throws)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-gpuchip-'));
  const p = capabilityPath(dir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, '{ not json');
  assert.equal(readCapability(dir), null);
});

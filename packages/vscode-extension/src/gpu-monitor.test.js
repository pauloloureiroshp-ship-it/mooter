'use strict';
// gpu-monitor.test.js — Frente 0 · Foundation.
// Parses nvidia-smi output, aggregates the GPU slice, and proves the fail-soft contract:
// no GPU / parse error → cache file holds JSON `null` (snapshot shows n/d, never fabricated).

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const gm = require('../../../tools/router/gpu-monitor.js');

let HOME;
before(() => {
  HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-gpu-'));
  process.env.MOOTER_HOME = HOME;
});
after(() => { try { fs.rmSync(HOME, { recursive: true, force: true }); } catch {} delete process.env.MOOTER_HOME; });

test('mooterCacheDir / gpuCachePath honor MOOTER_HOME', () => {
  assert.equal(gm.mooterCacheDir(), path.join(HOME, 'cache'));
  assert.equal(gm.gpuCachePath(), path.join(HOME, 'cache', 'gpu-snapshot.json'));
});

test('parseNvidiaSmi parses real csv rows and computes freeMb', () => {
  const out = gm.parseNvidiaSmi(
    '0, NVIDIA GeForce RTX 4090, 37, 4096, 24564\n' +
    '1, NVIDIA RTX A6000, 5, 1024, 49140\n');
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { index: 0, name: 'NVIDIA GeForce RTX 4090', utilPct: 37, usedMb: 4096, totalMb: 24564, freeMb: 24564 - 4096 });
  assert.equal(out[1].freeMb, 49140 - 1024);
});

test('parseNvidiaSmi tolerates blank/garbage/short lines (never throws, drops bad rows)', () => {
  const out = gm.parseNvidiaSmi('\n  \nnot,enough\n0, GPU, x, 100, 200\nrubbish line without commas\n');
  // Row with non-numeric util but valid memory is kept (utilPct → null); short/garbage dropped.
  assert.equal(out.length, 1);
  assert.equal(out[0].utilPct, null);
  assert.equal(out[0].usedMb, 100);
  assert.equal(out[0].freeMb, 100);
});

test('buildGpuSnapshot aggregates total/free/util and estimates fitsMoos', () => {
  const gpus = gm.parseNvidiaSmi('0, A, 40, 2000, 24000\n1, B, 60, 4000, 24000\n');
  const snap = gm.buildGpuSnapshot(gpus, 111);
  assert.equal(snap.at, 111);
  assert.equal(snap.totalMb, 48000);
  assert.equal(snap.freeMb, (24000 - 2000) + (24000 - 4000)); // 42000
  assert.equal(snap.utilPct, 50); // avg of 40 and 60
  assert.equal(snap.fitsMoos, Math.floor(42000 / gm.MOO_VRAM_MB));
  assert.equal(snap.gpus.length, 2);
});

test('buildGpuSnapshot returns null for empty/invalid input (honest n/d)', () => {
  assert.equal(gm.buildGpuSnapshot([]), null);
  assert.equal(gm.buildGpuSnapshot(null), null);
});

test('collectOnce success path writes the aggregated snapshot to cache', async () => {
  const file = path.join(HOME, 'cache', 'gpu-ok.json');
  const fakeRun = (cb) => cb(null, '0, RTX, 10, 1000, 24000\n');
  const snap = await gm.collectOnce({ file, run: fakeRun, now: 42 });
  assert.ok(snap && snap.totalMb === 24000);
  const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(onDisk.freeMb, 23000);
  assert.equal(onDisk.at, 42);
});

test('collectOnce fail-soft: nvidia-smi error → writes JSON null (never fabricates)', async () => {
  const file = path.join(HOME, 'cache', 'gpu-fail.json');
  const fakeRun = (cb) => cb(new Error('nvidia-smi not found'), '');
  const snap = await gm.collectOnce({ file, run: fakeRun });
  assert.equal(snap, null);
  const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(onDisk, null); // reader sees gpu: null → n/d
});

test('collectOnce fail-soft: a throwing runner still resolves and writes null', async () => {
  const file = path.join(HOME, 'cache', 'gpu-throw.json');
  const fakeRun = () => { throw new Error('boom'); };
  const snap = await gm.collectOnce({ file, run: fakeRun });
  assert.equal(snap, null);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')), null);
});

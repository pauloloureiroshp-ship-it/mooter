'use strict';
// gpu-monitor.js — Frente 0 · Foundation (Mission Control backend integration).
//
// Background writer: polls `nvidia-smi` on its OWN timer (~2.5s) and writes a small
// JSON to ~/.mooter/cache/gpu-snapshot.json. The render tick NEVER calls nvidia-smi
// directly — it only reads this cache file (cheap). This is the §3 anti-WCOCKPIT-5
// pattern: slow sources decoupled from the render path.
//
// Honesty: no nvidia-smi / no GPU / parse error → writes JSON `null` (fail-soft), so the
// snapshot shows GPU `n/d` instead of fabricating numbers. Never invents values.
//
// Standalone node (no vscode). Run directly to start the writer loop:
//   node tools/router/gpu-monitor.js
//
// Cache dir honors MOOTER_HOME for test isolation (same convention as host-extra
// `_handoffDir`); defaults to ~/.mooter/cache.

const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// A "moo" (local Ollama worker) roughly fits in this much VRAM (qwen3:30b-class, quantised).
// Used only to estimate `fitsMoos` — an estimate, clearly derived, never a hard claim.
const MOO_VRAM_MB = Number(process.env.MOOTER_MOO_VRAM_MB) || 6000;

const NVIDIA_ARGS = [
  '--query-gpu=index,name,utilization.gpu,memory.used,memory.total',
  '--format=csv,noheader,nounits',
];

function mooterCacheDir() {
  const home = (process.env.MOOTER_HOME && process.env.MOOTER_HOME.length > 0)
    ? process.env.MOOTER_HOME
    : path.join(os.homedir(), '.mooter');
  return path.join(home, 'cache');
}

function gpuCachePath() {
  return path.join(mooterCacheDir(), 'gpu-snapshot.json');
}

// Parse `nvidia-smi --format=csv,noheader,nounits` output into structured rows.
// Tolerates blank/garbage lines; drops any row without usable memory numbers.
function parseNvidiaSmi(text) {
  const out = [];
  const lines = String(text || '').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(',').map((s) => s.trim());
    if (parts.length < 5) continue;
    const index = parseInt(parts[0], 10);
    const name = parts[1] || null;
    const util = parseFloat(parts[2]);
    const usedMb = parseFloat(parts[3]);
    const totalMb = parseFloat(parts[4]);
    if (!Number.isFinite(usedMb) || !Number.isFinite(totalMb)) continue;
    out.push({
      index: Number.isFinite(index) ? index : null,
      name,
      utilPct: Number.isFinite(util) ? util : null,
      usedMb,
      totalMb,
      freeMb: Math.max(0, totalMb - usedMb),
    });
  }
  return out;
}

// Aggregate GPU rows into the snapshot's `gpu` slice. Empty/invalid → null (honest n/d).
function buildGpuSnapshot(gpus, at) {
  if (!Array.isArray(gpus) || gpus.length === 0) return null;
  let totalMb = 0;
  let freeMb = 0;
  let utilSum = 0;
  let utilN = 0;
  for (const g of gpus) {
    if (Number.isFinite(g.totalMb)) totalMb += g.totalMb;
    if (Number.isFinite(g.freeMb)) freeMb += g.freeMb;
    if (g.utilPct != null && Number.isFinite(g.utilPct)) { utilSum += g.utilPct; utilN++; }
  }
  return {
    at: at != null ? at : Date.now(),
    gpus,
    totalMb: totalMb || null,
    freeMb: freeMb || null,
    utilPct: utilN ? Math.round(utilSum / utilN) : null,
    fitsMoos: freeMb ? Math.floor(freeMb / MOO_VRAM_MB) : null,
  };
}

function _atomicWrite(file, str) {
  const dir = path.dirname(file);
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* exists / race */ }
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, str);
  fs.renameSync(tmp, file);
}

// Writes the snapshot (or `null`) to the cache file atomically. Returns true on success.
function writeGpuSnapshot(snapshot, file) {
  const target = file || gpuCachePath();
  try { _atomicWrite(target, JSON.stringify(snapshot)); return true; } catch { return false; }
}

// Default runner: shell out to nvidia-smi. Injectable (opts.run) for tests so we never
// depend on a real GPU in CI. Callback style: cb(err, stdout).
function _runNvidiaSmi(cb) {
  try {
    execFile('nvidia-smi', NVIDIA_ARGS, { timeout: 4000, windowsHide: true }, (err, stdout) => cb(err, stdout));
  } catch (e) { cb(e, ''); }
}

// One collection cycle: run nvidia-smi, parse, aggregate, write cache. ALWAYS writes —
// `null` on any failure (fail-soft) so the reader gets a deterministic "no GPU".
function collectOnce(opts) {
  opts = opts || {};
  const file = opts.file || gpuCachePath();
  const run = opts.run || _runNvidiaSmi;
  return new Promise((resolve) => {
    let done = false;
    const finish = (snap) => {
      if (done) return; done = true;
      writeGpuSnapshot(snap, file);
      resolve(snap);
    };
    try {
      run((err, stdout) => {
        let snap = null;
        if (!err && stdout) {
          try { snap = buildGpuSnapshot(parseNvidiaSmi(stdout), opts.now); } catch { snap = null; }
        }
        finish(snap);
      });
    } catch { finish(null); }
  });
}

// Start the background writer loop. Returns a stop() handle. Self-throttling: drops a
// tick if the previous nvidia-smi call hasn't returned (never piles up processes).
function start(opts) {
  opts = opts || {};
  const intervalMs = opts.intervalMs || 2500;
  let busy = false;
  let stopped = false;
  const tick = async () => {
    if (busy || stopped) return;
    busy = true;
    try { await collectOnce(opts); } catch { /* fail-soft */ } finally { busy = false; }
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  if (timer.unref) timer.unref();
  return () => { stopped = true; clearInterval(timer); };
}

module.exports = {
  MOO_VRAM_MB,
  mooterCacheDir,
  gpuCachePath,
  parseNvidiaSmi,
  buildGpuSnapshot,
  writeGpuSnapshot,
  collectOnce,
  start,
};

if (require.main === module) {
  // eslint-disable-next-line no-console
  start();
}

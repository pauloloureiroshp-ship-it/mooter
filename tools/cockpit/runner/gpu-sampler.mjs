/**
 * gpu-sampler.mjs — real GPU utilisation on Apple Silicon, without sudo.
 *
 * `ioreg -r -d 1 -c IOAccelerator` exposes PerformanceStatistics, which carries
 * device utilisation and VRAM in use. This settles an earlier claim in the
 * project that GPU% "cannot be measured" on this machine — it can, and the
 * numbers move (17-99% observed live).
 *
 * Every field is nullable on purpose: a sampler that guesses is worse than one
 * that says `null`, because the cockpit renders `n/d` for null and a confident
 * lie for a fabricated number.
 */

import { execFile } from 'node:child_process';
import os from 'node:os';

const IOREG_TIMEOUT_MS = 2000;

const UTIL_KEYS = ['Device Utilization %', 'GPU Activity(%)', 'Renderer Utilization %'];
const VRAM_KEYS = ['In use system memory', 'vramUsedBytes'];
const ALLOC_KEYS = ['Alloc system memory'];

function grab(text, keys) {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(`"${escaped}"=(\\d+)`).exec(text);
    if (m) return Number(m[1]);
  }
  return null;
}

function bytesToGb(value) {
  return value === null ? null : Math.round((value / 1e9) * 100) / 100;
}

function run(cmd, args, timeoutMs) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      resolve(err ? null : String(stdout));
    });
  });
}

/** Parses ioreg output. Exported so the parser is testable without a GPU. */
export function parseIoreg(text) {
  if (!text) {
    return { util_pct: null, vram_inuse_gb: null, vram_alloc_gb: null, fonte: 'n/a' };
  }
  return {
    util_pct: grab(text, UTIL_KEYS),
    vram_inuse_gb: bytesToGb(grab(text, VRAM_KEYS)),
    vram_alloc_gb: bytesToGb(grab(text, ALLOC_KEYS)),
    fonte: 'ioreg:IOAccelerator',
  };
}

/**
 * Samples the GPU. On a platform without `ioreg` it reports `n/d` with the
 * reason rather than pretending zero, so a Windows/Linux device is visibly
 * unmeasured instead of visibly idle.
 */
/**
 * NVIDIA path (Windows / Linux). `nvidia-smi` is the only sampler here that
 * needs no driver SDK and no elevation, which matters because the RTX 4090 box
 * must be able to report without a privileged install.
 *
 * Multi-GPU: the busiest card wins the headline number and the count travels,
 * so a 2-GPU box is never silently reported as if it had one.
 */
export function parseNvidiaSmi(text) {
  if (!text) return { util_pct: null, vram_inuse_gb: null, vram_alloc_gb: null, fonte: 'n/a' };
  const cards = [];
  for (const line of String(text).trim().split('\n')) {
    const parts = line.split(',').map((s) => s.trim());
    if (parts.length < 3) continue;
    const [util, used, total] = parts.map((n) => Number(n));
    if (!Number.isFinite(util) || !Number.isFinite(used) || !Number.isFinite(total)) continue;
    cards.push({ util, usedGb: used / 1024, totalGb: total / 1024 });
  }
  if (cards.length === 0) {
    return { util_pct: null, vram_inuse_gb: null, vram_alloc_gb: null, fonte: 'n/a',
             motivo: 'nvidia-smi returned no readable lines' };
  }
  const hottest = cards.reduce((a, b) => (b.util > a.util ? b : a));
  return {
    util_pct: Math.round(hottest.util),
    vram_inuse_gb: Math.round(hottest.usedGb * 100) / 100,
    vram_alloc_gb: Math.round(hottest.totalGb * 100) / 100,
    fonte: 'nvidia-smi',
    gpus: cards.length,
  };
}

const NVIDIA_ARGS = [
  '--query-gpu=utilization.gpu,memory.used,memory.total',
  '--format=csv,noheader,nounits',
];

export async function sampleGpu({ runImpl = run, platform = os.platform() } = {}) {
  if (platform === 'darwin') {
    const out = await runImpl('ioreg', ['-r', '-d', '1', '-c', 'IOAccelerator'], IOREG_TIMEOUT_MS);
    return out === null
      ? { util_pct: null, vram_inuse_gb: null, vram_alloc_gb: null, fonte: 'n/a',
          motivo: 'ioreg failed or timed out' }
      : parseIoreg(out);
  }

  if (platform === 'win32' || platform === 'linux') {
    const out = await runImpl('nvidia-smi', NVIDIA_ARGS, IOREG_TIMEOUT_MS);
    return out === null
      ? { util_pct: null, vram_inuse_gb: null, vram_alloc_gb: null, fonte: 'n/a',
          motivo: 'nvidia-smi missing or unresponsive (non-NVIDIA GPU?)' }
      : parseNvidiaSmi(out);
  }

  return {
    util_pct: null, vram_inuse_gb: null, vram_alloc_gb: null, fonte: 'n/a',
    motivo: `no sampler for ${platform}`,
  };
}

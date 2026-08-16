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
    return { util_pct: null, vram_inuse_gb: null, vram_alloc_gb: null, fonte: 'n/d' };
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
export async function sampleGpu({ runImpl = run, platform = os.platform() } = {}) {
  if (platform !== 'darwin') {
    return {
      util_pct: null,
      vram_inuse_gb: null,
      vram_alloc_gb: null,
      fonte: 'n/d',
      motivo: `sem amostrador para ${platform}`,
    };
  }
  const out = await runImpl('ioreg', ['-r', '-d', '1', '-c', 'IOAccelerator'], IOREG_TIMEOUT_MS);
  if (out === null) {
    return {
      util_pct: null,
      vram_inuse_gb: null,
      vram_alloc_gb: null,
      fonte: 'n/d',
      motivo: 'ioreg falhou ou expirou',
    };
  }
  return parseIoreg(out);
}

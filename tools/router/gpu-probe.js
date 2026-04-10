#!/usr/bin/env node
/**
 * gpu-probe.js — GPU detection for the frugal savings-tracker (v0.9).
 *
 * Exports:
 *   probeSync()      → { vendor, name_short, vramMB, utilPct, platform }
 *   fetchUtilSync()  → number | null   (NVIDIA only; current gpu-util %)
 *
 * Detection order:
 *   1. NVIDIA via `nvidia-smi` (Windows + Linux)
 *   2. macOS Apple Silicon via `system_profiler SPDisplaysDataType -json`
 *   3. Linux AMD via /sys/class/drm/card0/device/gpu_busy_percent
 *   4. Fallback: { vendor: 'cpu', name_short: 'CPU-only', ... }
 *
 * All probes use short timeouts and swallow errors — the tracker must never
 * crash because nvidia-smi isn't on PATH.
 */

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function runNvidiaSmi() {
  const r = spawnSync(
    'nvidia-smi',
    ['--query-gpu=name,memory.total,utilization.gpu', '--format=csv,noheader,nounits'],
    { encoding: 'utf8', timeout: 3000, windowsHide: true }
  );
  if (r.status !== 0 || !r.stdout) return null;
  // Use the first GPU line only.
  const firstLine = r.stdout.split(/\r?\n/).find(Boolean);
  if (!firstLine) return null;
  const parts = firstLine.split(',').map((s) => s.trim());
  if (parts.length < 3) return null;
  const [nameRaw, vramStr, utilStr] = parts;
  const nameShort = nameRaw.replace(/^NVIDIA\s+GeForce\s+/i, '').replace(/^NVIDIA\s+/i, '').trim();
  const vramMB = parseInt(vramStr, 10);
  const utilPct = parseInt(utilStr, 10);
  return {
    vendor: 'nvidia',
    name_short: nameShort || 'NVIDIA GPU',
    vramMB: Number.isFinite(vramMB) ? vramMB : null,
    utilPct: Number.isFinite(utilPct) ? utilPct : null,
    platform: process.platform,
  };
}

function runAppleProbe() {
  const r = spawnSync('system_profiler', ['SPDisplaysDataType', '-json'], {
    encoding: 'utf8',
    timeout: 3000,
  });
  if (r.status !== 0 || !r.stdout) return null;
  try {
    const data = JSON.parse(r.stdout);
    const entry =
      (data && data.SPDisplaysDataType && data.SPDisplaysDataType[0]) || null;
    if (!entry) return null;
    const name =
      entry.sppci_model || entry.spdisplays_device_name || entry._name || 'Apple GPU';
    return {
      vendor: 'apple',
      name_short: String(name).replace(/^Apple /, 'Apple '),
      vramMB: null,
      utilPct: null, // powermetrics requires sudo — skip gracefully.
      platform: 'darwin',
    };
  } catch {
    return null;
  }
}

function runAmdLinuxProbe() {
  try {
    const raw = fs.readFileSync('/sys/class/drm/card0/device/gpu_busy_percent', 'utf8');
    const util = parseInt(raw.trim(), 10);
    if (Number.isFinite(util)) {
      return {
        vendor: 'amd',
        name_short: 'AMD GPU',
        vramMB: null,
        utilPct: util,
        platform: 'linux',
      };
    }
  } catch { /* no sysfs entry */ }
  return null;
}

function probeSync() {
  const plat = process.platform;
  // 1. NVIDIA first (Windows + Linux).
  if (plat === 'win32' || plat === 'linux') {
    const nv = runNvidiaSmi();
    if (nv) return nv;
  }
  // 2. macOS Apple Silicon.
  if (plat === 'darwin') {
    const apple = runAppleProbe();
    if (apple) return apple;
  }
  // 3. Linux AMD fallback.
  if (plat === 'linux') {
    const amd = runAmdLinuxProbe();
    if (amd) return amd;
  }
  // 4. Fallback.
  return {
    vendor: 'cpu',
    name_short: 'CPU-only',
    vramMB: null,
    utilPct: null,
    platform: plat,
  };
}

function fetchUtilSync() {
  // Cheap nvidia-smi for utilization only — used every 5s by the tracker.
  const r = spawnSync(
    'nvidia-smi',
    ['--query-gpu=utilization.gpu', '--format=csv,noheader,nounits'],
    { encoding: 'utf8', timeout: 2000, windowsHide: true }
  );
  if (r.status !== 0 || !r.stdout) return null;
  const n = parseInt(r.stdout.trim().split(/\r?\n/)[0], 10);
  return Number.isFinite(n) ? n : null;
}

// ── Hardware Capability (v0.9.1) ───────────────────────────────────────────
// Maps VRAM to available T0 models and writes hw-capability.json.
const HW_CAPABILITY_PATH = path.join(os.homedir(), '.claude', 'tools', 'router', 'hw-capability.json');

const MODEL_VRAM_REQ = {
  'qwen2.5:3b':                    2048,
  'qwen2.5-coder:7b':              4096,
  'qwen2.5-coder:14b-q4':         9216,
  'deepseek-r1-distill-qwen:14b': 9216,
  'qwen2.5:32b-q4':               20480,
  'qwen3:30b':                    20480,
};

function classifyHwTier(probe) {
  if (!probe) return 'cpu-only';
  if (probe.vendor === 'apple') return 'apple-silicon';
  if (probe.vendor === 'cpu') return 'cpu-only';
  const vram = probe.vramMB || 0;
  if (vram >= 20480) return 'gpu-high';
  if (vram >= 8192)  return 'gpu-mid';
  if (vram >= 4096)  return 'gpu-low';
  return 'cpu-only';
}

function buildHwCapability(probe) {
  if (!probe || (probe.vendor === 'cpu')) return null;

  const vram = probe.vramMB || 0;
  const hwTier = classifyHwTier(probe);

  const t0Models = Object.entries(MODEL_VRAM_REQ).map(([model, req]) => ({
    model,
    vram_req_mb: req,
    can_run: probe.vendor === 'apple' ? req <= 9216 : vram >= req,
  }));

  // recommended_t0: largest model that can_run, preferring qwen3:30b over qwen2.5:32b
  // (qwen3 is the primary T0 model in the frugal doctrine)
  const PREFER_ORDER = ['qwen3:30b', 'qwen2.5:32b-q4', 'deepseek-r1-distill-qwen:14b', 'qwen2.5-coder:14b-q4', 'qwen2.5-coder:7b', 'qwen2.5:3b'];
  const runnable = t0Models.filter(m => m.can_run);
  const recommended = PREFER_ORDER.find(m => runnable.some(r => r.model === m)) || 'qwen2.5:3b';

  const capability = {
    probed_at: new Date().toISOString(),
    vendor: probe.vendor,
    name: probe.name_short,
    vram_mb: vram || null,
    hw_tier: hwTier,
    t0_models_available: t0Models,
    recommended_t0: recommended,
  };

  try {
    fs.writeFileSync(HW_CAPABILITY_PATH, JSON.stringify(capability, null, 2) + '\n');
  } catch { /* non-fatal — hw-capability is a cache */ }

  return capability;
}

module.exports = { probeSync, fetchUtilSync, buildHwCapability, classifyHwTier, MODEL_VRAM_REQ };

if (require.main === module) {
  const probe = probeSync();
  console.log(JSON.stringify(probe, null, 2));
  const cap = buildHwCapability(probe);
  if (cap) {
    console.log('\nhw-capability:');
    console.log(JSON.stringify(cap, null, 2));
  } else {
    console.log('\nNo GPU detected — hw-capability.json not written.');
  }
}

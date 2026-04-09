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

module.exports = { probeSync, fetchUtilSync };

if (require.main === module) {
  console.log(JSON.stringify(probeSync(), null, 2));
}

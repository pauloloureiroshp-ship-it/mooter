'use strict';

// VRAM detection (Wave 5 D3). Best-effort live GPU memory via nvidia-smi (Linux/
// WSL) or system_profiler (macOS, unified memory). Returns null on ANY failure —
// never invents numbers. Cached for 5s because the spawn is ~50-200ms and the
// statusline renders ~1×/s.

const { spawnSync } = require('node:child_process');

let _cache = null; // { at_ms, value }
const CACHE_MS = 5000;

function detectVramLinux(spawn) {
  try {
    const r = spawn('nvidia-smi', ['--query-gpu=memory.used,memory.total', '--format=csv,noheader,nounits'], { timeout: 1500, encoding: 'utf8', windowsHide: true });
    if (!r || r.status !== 0) return null;
    const line = String(r.stdout || '').trim().split('\n')[0];
    const [used, total] = line.split(',').map((s) => parseInt(s.trim(), 10));
    if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return null;
    return { used_mb: used, total_mb: total };
  } catch {
    return null;
  }
}

function detectVramMac(spawn) {
  try {
    const r = spawn('system_profiler', ['SPHardwareDataType', '-json'], { timeout: 1500, encoding: 'utf8', windowsHide: true });
    if (!r || r.status !== 0) return null;
    const data = JSON.parse(String(r.stdout || ''));
    const ramText = data && data.SPHardwareDataType && data.SPHardwareDataType[0] && data.SPHardwareDataType[0].physical_memory;
    if (!ramText) return null;
    const totalGb = parseInt(ramText, 10);
    if (!Number.isFinite(totalGb) || totalGb <= 0) return null;
    return { used_mb: -1, total_mb: totalGb * 1024 }; // M-series shared memory
  } catch {
    return null;
  }
}

/**
 * Live VRAM, or null. `spawn` is injectable for tests (default spawnSync).
 * @returns {null | { used_mb: number, total_mb: number }}
 */
function getVram(spawn = spawnSync, nowMs = Date.now()) {
  if (_cache && nowMs - _cache.at_ms < CACHE_MS) return _cache.value;
  const value = process.platform === 'darwin' ? detectVramMac(spawn) : process.platform === 'win32' ? null : detectVramLinux(spawn);
  _cache = { at_ms: nowMs, value };
  return value;
}

/** Reset the 5s cache (tests). */
function _resetCache() { _cache = null; }

/** "12.1GB / 24GB", or "32.0GB shared" (M-series), or null. */
function formatVramChip(vram) {
  if (!vram) return null;
  if (vram.used_mb < 0) return `${(vram.total_mb / 1024).toFixed(1)}GB shared`;
  return `${(vram.used_mb / 1024).toFixed(1)}GB / ${(vram.total_mb / 1024).toFixed(0)}GB`;
}

module.exports = { getVram, formatVramChip, _resetCache };

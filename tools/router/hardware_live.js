'use strict';

// hardware_live.js — Wave 19 (19.B-2): file-backed live VRAM for the statusline.
//
// Why a new module when vram_detect.js already spawns nvidia-smi? Because the
// statusline runs as a FRESH process on every render, so vram_detect's in-memory
// 5s cache never survives — nvidia-smi would spawn on EVERY render (~50-200ms
// each). This module persists the last reading to os.tmpdir() and only re-spawns
// when it is older than CACHE_MS, honoring the "cache 5s minimum" perf rule.
//
// Honest by construction: returns null whenever there is no real live reading
// (no nvidia-smi, macOS shared memory, spawn failure) — never invents a number.

const fs = require('fs');
const os = require('os');
const path = require('path');

const CACHE_PATH = path.join(os.tmpdir(), 'mooter-vram-cache.json');
const CACHE_MS = 5000;

// undefined = cache stale/missing (must re-query); null = a *confirmed* "no live
// data" reading we cached so we don't re-spawn nvidia-smi for 5s on no-GPU hosts.
function readCache(nowMs) {
  try {
    const c = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    if (c && typeof c.at_ms === 'number' && nowMs - c.at_ms < CACHE_MS) return c.value;
  } catch { /* missing/corrupt → stale */ }
  return undefined;
}

function writeCache(nowMs, value) {
  try { fs.writeFileSync(CACHE_PATH, JSON.stringify({ at_ms: nowMs, value })); } catch { /* best-effort */ }
}

/**
 * Live VRAM, file-cached 5s. Returns { usedMb, totalMb, pct } or null.
 * @param {{now?:number, force?:boolean, getVram?:Function}} opts
 *   - now: clock injection (tests). force: bypass cache. getVram: detector injection (tests).
 * @returns {{usedMb:number, totalMb:number, pct:number}|null}
 */
function vramSnapshot({ now = Date.now(), force = false, getVram } = {}) {
  if (!force) {
    const hit = readCache(now);
    if (hit !== undefined) return hit;
  }
  let value = null;
  try {
    const detect = getVram || require('./vram_detect.js').getVram;
    const v = detect();
    // used_mb < 0 is macOS shared memory (no discrete VRAM %) → treat as no live data.
    if (v && Number.isFinite(v.used_mb) && v.used_mb >= 0 && v.total_mb > 0) {
      value = { usedMb: v.used_mb, totalMb: v.total_mb, pct: Math.round((v.used_mb / v.total_mb) * 100) };
    }
  } catch { value = null; }
  writeCache(now, value);
  return value;
}

/** Reset the file cache (tests). */
function _resetCache() { try { fs.unlinkSync(CACHE_PATH); } catch { /* already gone */ } }

module.exports = { vramSnapshot, _resetCache, CACHE_PATH, CACHE_MS };

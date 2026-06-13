#!/usr/bin/env node
'use strict';
/**
 * gpu-status.js — Wave 58.2 (honest residue).
 *
 * Dense-line chip naming the local GPU, e.g. `🎮 RTX 4090 24GB · gpu-high`.
 *
 * WHY THIS CHIP (Day-0 recon WAVE58_2_DAY0_RECON.md): the brief asked to "restore"
 * VRAM / ollama-model / embed / user chips. The recon found those were never
 * dropped — `quant-status.js` (📦 model · quant · GB), `vector-status.js`
 * (🧭 embed nomic 768d) and `user-status.js` (👤) already cover them. The ONE
 * piece of the old Wave-Mega dense line with NO chip was the GPU/VRAM segment.
 * `vram_detect.js` returns null on win32, but `gpu-probe.js` probes nvidia-smi on
 * Windows + Linux and caches the result to hw-capability.json. This chip reads
 * THAT cache — no spawn on the render hot path (mirrors quant/vector), single
 * file read, honest `''` when there is no cache / no GPU.
 *
 * SOURCE OF TRUTH: `~/.claude/tools/router/hw-capability.json`, written by
 * gpu-probe.js#buildHwCapability(). Shape used here:
 *   { vendor, name, vram_mb, hw_tier }
 * util% is intentionally NOT shown: it is live-only (not in the cache) and
 * spawning nvidia-smi on every render would blow the ≤10ms budget. No fabrication.
 *
 * Silent (no chip) when: vendor is 'cpu'/absent, the cache is missing/malformed,
 * or the user hid it via `hidden_chips: ["gpu"]` in preferences.json.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/** Path to the hw-capability cache gpu-probe.js writes. `home` is injectable for tests. */
function capabilityPath(home = os.homedir()) {
  return path.join(home, '.claude', 'tools', 'router', 'hw-capability.json');
}

/** Best-effort read of the cached capability record, or null. Never throws. */
function readCapability(home = os.homedir()) {
  try {
    return JSON.parse(fs.readFileSync(capabilityPath(home), 'utf8'));
  } catch {
    return null;
  }
}

function prefs() {
  try {
    return JSON.parse(fs.readFileSync(path.join(os.homedir(), '.mooter', 'preferences.json'), 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Pure: build the GPU chip from an already-parsed capability record.
 * Returns '' (silent) for CPU-only / malformed / no-name records — never
 * fabricates a GPU. VRAM and tier are appended only when present in the cache.
 *
 * @param {{vendor?:string, name?:string, vram_mb?:number, hw_tier?:string}|null} cap
 * @returns {string}
 */
function buildGpuChip(cap) {
  if (!cap || typeof cap !== 'object') return '';
  if (cap.vendor === 'cpu' || !cap.vendor) return ''; // no discrete GPU → silent
  const name = typeof cap.name === 'string' ? cap.name.trim() : '';
  if (!name) return ''; // without a name there is nothing honest to show
  const vramGb = Number.isFinite(cap.vram_mb) && cap.vram_mb > 0
    ? ` ${Math.round(cap.vram_mb / 1024)}GB`
    : '';
  const tier = typeof cap.hw_tier === 'string' && cap.hw_tier && cap.hw_tier !== 'cpu-only'
    ? ` · ${cap.hw_tier}`
    : '';
  return `🎮 ${name}${vramGb}${tier}`;
}

function statusLine() {
  try {
    const p = prefs();
    if (Array.isArray(p.hidden_chips) && p.hidden_chips.includes('gpu')) return '';
    return buildGpuChip(readCapability());
  } catch {
    return '';
  }
}

module.exports = { statusLine, buildGpuChip, readCapability, capabilityPath };

if (require.main === module) {
  const out = statusLine();
  if (out) process.stdout.write(out + '\n');
}

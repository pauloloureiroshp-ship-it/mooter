'use strict';
/**
 * compression-status.js — L12 statusline line-3 chip (Wave 29 Phase 29.J).
 *
 * Standalone, defensive, fast (file reads only, no spawn/network). Returns null
 * when compression is off so the chip simply doesn't render. Mirrors the
 * workflow-status.js shape (pure builder + statusLine() + CLI).
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function mooterHome() {
  return process.env.MOOTER_HOME && process.env.MOOTER_HOME.length > 0
    ? process.env.MOOTER_HOME
    : path.join(os.homedir(), '.mooter');
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

/** Pure: build the compression chip from a preferences object (or null). */
function buildCompressionChip(prefs) {
  if (!prefs || !prefs.compression || prefs.compression.enabled !== true) return null;
  const ratio = Number(prefs.compression.target_ratio) || 4;
  return `📦 lingua ${ratio}×`;
}

function statusLine() {
  try {
    return buildCompressionChip(readJson(path.join(mooterHome(), 'preferences.json')));
  } catch {
    return null;
  }
}

module.exports = { buildCompressionChip, statusLine };

if (require.main === module) {
  const s = statusLine();
  if (s) process.stdout.write(s + '\n');
}

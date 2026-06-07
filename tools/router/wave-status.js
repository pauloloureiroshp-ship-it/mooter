'use strict';
/**
 * wave-status.js — statusline line-3 chip (Wave 30 Phase N).
 *
 * Reads ~/.mooter/state.json (written by `mooter wave`) and shows the active
 * wave's phase progress. Null when no active wave. Opt-in line-3 only.
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

/** Pure: build the wave chip from a central-state object. */
function buildWaveChip(state) {
  const w = state && state.currentWave;
  if (!w || typeof w.number !== 'number' || !Array.isArray(w.phases)) return null;
  const done = w.phases.filter((p) => p && p.status === 'done').length;
  const total = w.phases.length;
  if (total === 0) return null;
  return `🔄 W${w.number} ${done}/${total}`;
}

function statusLine() {
  try {
    return buildWaveChip(readJson(path.join(mooterHome(), 'state.json')));
  } catch {
    return null;
  }
}

module.exports = { buildWaveChip, statusLine };

if (require.main === module) {
  const s = statusLine();
  if (s) process.stdout.write(s + '\n');
}

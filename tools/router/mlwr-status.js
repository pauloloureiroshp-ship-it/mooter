'use strict';
/**
 * mlwr-status.js — statusline line-3 chip (Wave 30 Phase N).
 *
 * Reads the cached MLWR snapshot (~/.mooter/mlwr_snapshot.json, written by
 * `mooter benchmark run`) and shows the overall local win-rate. Null when no
 * snapshot. Opt-in line-3 only.
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

/** Pure: build the MLWR chip from a snapshot ({ mlwr: { overall } }). */
function buildMlwrChip(snap) {
  if (!snap || !snap.mlwr || typeof snap.mlwr.overall !== 'number') return null;
  const pct = Math.round(snap.mlwr.overall * 100);
  return `📊 MLWR ${pct}% local`;
}

function statusLine() {
  try {
    return buildMlwrChip(readJson(path.join(mooterHome(), 'mlwr_snapshot.json')));
  } catch {
    return null;
  }
}

module.exports = { buildMlwrChip, statusLine };

if (require.main === module) {
  const s = statusLine();
  if (s) process.stdout.write(s + '\n');
}

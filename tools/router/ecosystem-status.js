'use strict';
/**
 * ecosystem-status.js — L15 statusline line-3 chip (Wave 29 Phase 29.J).
 *
 * Shows the cached recommendation count written by `mooter ecosystem recommend`
 * (~/.mooter/ecosystem/reco_count.json). No ranking is computed at render time —
 * the chip is a cheap read of the last computed count. Null when none cached.
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

/** Pure: build the ecosystem chip from a cached reco-count object. */
function buildEcosystemChip(reco) {
  if (!reco || typeof reco.count !== 'number' || reco.count <= 0) return null;
  return `📚 ${reco.count} recommendation${reco.count > 1 ? 's' : ''}`;
}

function statusLine() {
  try {
    return buildEcosystemChip(readJson(path.join(mooterHome(), 'ecosystem', 'reco_count.json')));
  } catch {
    return null;
  }
}

module.exports = { buildEcosystemChip, statusLine };

if (require.main === module) {
  const s = statusLine();
  if (s) process.stdout.write(s + '\n');
}

'use strict';
/**
 * limits-status.js — statusline line-3 chip (Wave 30 Phase N).
 *
 * Reflects cost-cap status. Reads an optional session-spend cache
 * (~/.mooter/limits-status.json: { ok, sessionSpend, sessionCap }) written by
 * the cost-cap enforcer; falls back to "limits OK" when limits.toml exists but
 * no breach is recorded. Null when cost-cap isn't configured. Opt-in line-3.
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

/** Pure: build the limits chip from a status object + whether limits.toml exists. */
function buildLimitsChip(status, configured) {
  if (status && typeof status.ok === 'boolean') {
    return status.ok ? '🔒 limits OK' : '🔓 limits HIT';
  }
  return configured ? '🔒 limits OK' : null;
}

function statusLine() {
  try {
    const home = mooterHome();
    const status = readJson(path.join(home, 'limits-status.json'));
    const configured = fs.existsSync(path.join(home, 'limits.toml'));
    return buildLimitsChip(status, configured);
  } catch {
    return null;
  }
}

module.exports = { buildLimitsChip, statusLine };

if (require.main === module) {
  const s = statusLine();
  if (s) process.stdout.write(s + '\n');
}

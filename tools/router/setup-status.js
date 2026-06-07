'use strict';
/**
 * setup-status.js — L14 statusline line-3 chip (Wave 29 Phase 29.J).
 *
 * Shows the detected hardware class · subscription tier · installed-pack count.
 * Standalone, defensive, fast. Returns null when no profile has been detected.
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

/** Pure: build the setup chip from a profile + installed-packs registry. */
function buildSetupChip(profile, installed) {
  if (!profile || !profile.hardware) return null;
  const hc = profile.hardware.hardware_class || profile.hardware.hw_tier || 'setup';
  const sub = (profile.subscriptions && profile.subscriptions.subscription_tier) || 'none';
  const n = installed && Array.isArray(installed.packs) ? installed.packs.length : 0;
  return `🔧 ${hc} · ${sub}${n > 0 ? ` · ${n} pack${n > 1 ? 's' : ''}` : ''}`;
}

function statusLine() {
  try {
    const home = mooterHome();
    return buildSetupChip(
      readJson(path.join(home, 'setup_profile.json')),
      readJson(path.join(home, 'installed_packs.json')),
    );
  } catch {
    return null;
  }
}

module.exports = { buildSetupChip, statusLine };

if (require.main === module) {
  const s = statusLine();
  if (s) process.stdout.write(s + '\n');
}

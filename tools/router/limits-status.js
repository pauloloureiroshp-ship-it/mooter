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
  // Wave 48 (1.5) — "limits OK" was vague. This chip is Mooter's own COST-CAP
  // (the spend ceiling in limits.toml) — NOT the Anthropic/Claude Max quota,
  // which is the separate `☁ Claude Max %` chip. Relabel to "cost-cap" and show
  // the live $spend/$cap when the enforcer recorded it.
  if (status && typeof status.ok === 'boolean') {
    if (status.ok) {
      const spend = Number(status.sessionSpend);
      const cap = Number(status.sessionCap);
      if (Number.isFinite(spend) && Number.isFinite(cap) && cap > 0) {
        return `🔒 cost-cap $${spend.toFixed(2)}/$${cap.toFixed(2)}`;
      }
      return '🔒 cost-cap OK';
    }
    return '🔓 cost-cap HIT';
  }
  return configured ? '🔒 cost-cap OK' : null;
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

'use strict';
/**
 * pastor-status.js — statusline line-3 chip (Wave 30 Phase N).
 *
 * Shows the latest Pastor routing hint (~/.mooter/pastor-hint.json) as a single
 * recommendation chip. Null when no hint cached. Opt-in line-3 only.
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

/** Pure: build the pastor chip from a hint object. */
function buildPastorChip(hint) {
  if (!hint) return null;
  if (typeof hint.label === 'string' && hint.label.length > 0) return `💡 ${hint.label}`;
  if (typeof hint.hint === 'string' && hint.hint.length > 0) return `💡 ${hint.hint}`;
  return null;
}

function statusLine() {
  try {
    return buildPastorChip(readJson(path.join(mooterHome(), 'pastor-hint.json')));
  } catch {
    return null;
  }
}

module.exports = { buildPastorChip, statusLine };

if (require.main === module) {
  const s = statusLine();
  if (s) process.stdout.write(s + '\n');
}

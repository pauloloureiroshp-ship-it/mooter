'use strict';
/**
 * dogfood-status.js — statusline line-3 chip (Wave 30 Phase N).
 *
 * Counts today's friction entries in ~/.mooter/dogfood.jsonl (written by
 * `mooter dogfood log`). Cheap read; null when nothing logged today. Opt-in
 * line-3 only — lines 1-2 of statusline-multi.js are unaffected.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function mooterHome() {
  return process.env.MOOTER_HOME && process.env.MOOTER_HOME.length > 0
    ? process.env.MOOTER_HOME
    : path.join(os.homedir(), '.mooter');
}

function sameUTCDay(a, b) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/** Pure: count entries whose ts is "today" (UTC) relative to `now`. */
function countToday(lines, now) {
  let n = 0;
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    try {
      const d = new Date(JSON.parse(t).ts);
      if (!Number.isNaN(d.getTime()) && sameUTCDay(d, now)) n++;
    } catch { /* skip corrupt line */ }
  }
  return n;
}

function buildDogfoodChip(count) {
  if (!count || count <= 0) return null;
  return `🍖 ${count} friction today`;
}

function statusLine(now) {
  try {
    const p = path.join(mooterHome(), 'dogfood.jsonl');
    if (!fs.existsSync(p)) return null;
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    return buildDogfoodChip(countToday(lines, now || new Date()));
  } catch {
    return null;
  }
}

module.exports = { buildDogfoodChip, countToday, statusLine };

if (require.main === module) {
  const s = statusLine();
  if (s) process.stdout.write(s + '\n');
}

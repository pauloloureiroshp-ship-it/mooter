#!/usr/bin/env node
/**
 * quota-status.js — MP-Q Q4 — the 📅 weekly-quota statusline chip.
 *
 * OPT-IN line chip showing how much of the OFFICIAL Anthropic weekly window
 * is gone, with the defcon colour and days until reset:
 *   `📅 semana 89% 🔴 (reset 3d)`
 *   `📅 semana n/d`               (opted in but no fresh official data)
 * Off unless `statusline_chips.quota: true` in <MOOTER_HOME>/preferences.json
 * OR env `MOOTER_STATUSLINE_QUOTA=1`. Default OFF → the wired statusline is
 * BYTE-IDENTICAL (this module returns '' until opted in; registered in
 * chip-composer alongside the other self-gating chips).
 * `hidden_chips: ["quota"]` also drops it.
 *
 * ONE real source (no fabrication): ~/.mooter/quota-live.json — the official
 * rate_limits Claude Code pipes to the statusline, persisted by quota-live.js.
 * When that snapshot is missing or stale the chip says the honest `n/d`,
 * never a remembered number.
 *
 * Budget: one readFileSync of a small JSON. Any failure → '' (silent).
 */
'use strict';

const fs = require('fs');
const path = require('path');

let QL;
try { QL = require('./quota-live.js'); } catch { QL = null; }

function prefs() {
  try {
    if (!QL) return {};
    return JSON.parse(fs.readFileSync(path.join(QL.mooterHome(), 'preferences.json'), 'utf8'));
  } catch {
    return {};
  }
}

/** Opt-IN gate: env MOOTER_STATUSLINE_QUOTA=1 OR statusline_chips.quota === true. */
function optedIn(p) {
  if (process.env.MOOTER_STATUSLINE_QUOTA === '1') return true;
  if (!(p && p.statusline_chips && p.statusline_chips.quota === true)) return false;
  if (Array.isArray(p.hidden_chips) && p.hidden_chips.includes('quota')) return false;
  return true;
}

/** Whole days until an ISO timestamp (floor, min 0); null when absent/garbage. */
function daysUntil(iso, now) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((t - now) / (24 * 60 * 60 * 1000)));
}

/**
 * Pure renderer — quota-live snapshot injected → chip string.
 * @param {Record<string, any>|null} live readQuotaLive() result
 * @param {number} now epoch ms (injectable for tests)
 */
function buildQuotaChip(live, now) {
  if (!live || !live.fresh || typeof live.seven_day_pct !== 'number') {
    return '📅 semana n/d';
  }
  const lvl = QL ? QL.quotaDefconLevel(live.seven_day_pct) : null;
  const days = daysUntil(live.resets && live.resets.seven_day, now);
  return `📅 semana ${Math.round(live.seven_day_pct)}%`
    + (lvl ? ` ${lvl.emoji}` : '')
    + (days != null ? ` (reset ${days}d)` : '');
}

function statusLine() {
  try {
    if (!optedIn(prefs())) return '';
    return buildQuotaChip(QL ? QL.readQuotaLive() : null, Date.now());
  } catch {
    return '';
  }
}

module.exports = { buildQuotaChip, statusLine, optedIn, daysUntil };

if (require.main === module) {
  const s = statusLine();
  if (s) process.stdout.write(s + '\n');
}

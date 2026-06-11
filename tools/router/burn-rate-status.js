#!/usr/bin/env node
/**
 * burn-rate-status.js — Wave 55 (Phase J): the 🔥 burn-rate chip.
 *
 * OPT-IN line-3 chip showing how fast THIS machine is spending, e.g.
 * `🔥 $2.40/h burn`. The number is the real USD cost of the `classified`
 * decisions written to decisions.log in the trailing 60 minutes — i.e. your
 * measured spend over the last hour, not an extrapolation. Off unless
 * `statusline_chips.burn_rate: true` in ~/.mooter/preferences.json OR env
 * `MOOTER_STATUSLINE_BURN=1`.
 *
 * Honesty (Doctrine V4 #5): cost is computed with pricing.js — the SAME single
 * source of truth savings-tracker uses (T0 local = $0, T1 Haiku, T2 Sonnet,
 * T3 Opus) — never the stale per-tier constants that floated around in briefs.
 * Synthetic tester traffic (`source: mooter-tester`) is excluded so the chip
 * reflects what Paulo actually spent, not the 24/7 lab.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { estimateTurnCost } = require('./pricing.js');

const WINDOW_MS = 60 * 60 * 1000; // trailing 60-minute window
const TAIL_BYTES = 256 * 1024; // match statusline-multi readDecisionsTail budget

/** decisions.log location: runtime ROUTER_DIR via ./paths, else ~/.claude fallback. */
function decisionsLogPath() {
  try { return require('./paths').DECISIONS_LOG; }
  catch { return path.join(os.homedir(), '.claude', 'tools', 'router', 'decisions.log'); }
}

function prefs() {
  const home = process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
  try { return JSON.parse(fs.readFileSync(path.join(home, 'preferences.json'), 'utf8')); }
  catch { return {}; }
}

/** Opt-IN gate: env MOOTER_STATUSLINE_BURN=1 OR statusline_chips.burn_rate === true. */
function optedIn(p) {
  if (process.env.MOOTER_STATUSLINE_BURN === '1') return true;
  return !!(p && p.statusline_chips && p.statusline_chips.burn_rate === true);
}

/**
 * Tail-read decisions.log and return the `classified` events inside the trailing
 * `windowMs` (real traffic only — tester events excluded). Best-effort: a
 * missing/unreadable log yields []. `now`/`logPath` are injectable for tests.
 */
function readRecentDecisions(now = Date.now(), windowMs = WINDOW_MS, logPath = decisionsLogPath()) {
  let fd;
  try { fd = fs.openSync(logPath, 'r'); } catch { return []; }
  try {
    const stat = fs.fstatSync(fd);
    const len = Math.min(TAIL_BYTES, stat.size);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, stat.size - len);
    const text = buf.toString('utf8');
    const nl = text.indexOf('\n'); // drop the first (likely partial) line
    const lines = text.slice(nl + 1).split('\n').filter(Boolean);
    const out = [];
    for (const ln of lines) {
      let o;
      try { o = JSON.parse(ln); } catch { continue; }
      if (!o || o.event !== 'classified') continue;
      if (o.source === 'mooter-tester') continue; // exclude synthetic lab traffic
      const t = Number.isFinite(Number(o.ts_ms)) ? Number(o.ts_ms) : Date.parse(o.ts);
      if (!Number.isFinite(t) || t > now || now - t > windowMs) continue;
      out.push(o);
    }
    return out;
  } finally {
    fs.closeSync(fd);
  }
}

/** Sum the routed USD cost of the given decisions (pricing.js SSOT). */
function burnRateUsd(decisions) {
  let usd = 0;
  for (const d of decisions || []) {
    usd += estimateTurnCost(d.tier, Number(d.prompt_len) || 0);
  }
  return usd;
}

/** Green < $1/h, yellow < $5/h, red ≥ $5/h. */
function colorFor(usd) {
  if (usd < 1) return 'green';
  if (usd < 5) return 'yellow';
  return 'red';
}

/**
 * Pure renderer (decisions injected) → { chip, usd, color, warn }. The caller
 * uses .chip for the plain line-3 text and may use .color/.warn to highlight.
 */
function buildBurnChip(decisions) {
  const usd = burnRateUsd(decisions);
  return {
    chip: `🔥 $${usd.toFixed(2)}/h burn`,
    usd,
    color: colorFor(usd),
    warn: usd > 5,
  };
}

/** Line-3 entry: '' unless opted in, else the trailing-hour burn chip. */
function statusLine(now = Date.now()) {
  try {
    if (!optedIn(prefs())) return ''; // opt-IN: silent unless explicitly enabled
    return buildBurnChip(readRecentDecisions(now)).chip;
  } catch {
    return '';
  }
}

module.exports = {
  buildBurnChip,
  burnRateUsd,
  colorFor,
  readRecentDecisions,
  optedIn,
  prefs,
  statusLine,
  WINDOW_MS,
};

if (require.main === module) {
  const out = statusLine();
  if (out) process.stdout.write(out + '\n');
}

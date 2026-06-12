#!/usr/bin/env node
/**
 * cca-f-status.js — Wave 55 (Phase C.4): the 📜 CCA-F audit chip.
 *
 * OPT-IN line-3 chip showing the latest CCA-F audit result, e.g.
 * `📜 cca-f 78% pass (60q, n=1)`. Off unless `statusline_chips.cca_f: true` in
 * ~/.mooter/preferences.json OR env `MOOTER_STATUSLINE_CCAF=1`.
 *
 * Reads the NEWEST `~/.mooter/cca-f/audit/<session>/report.json` written by
 * `mooter cca-f audit` (Wave 54). Anti-fabrication (Doctrine V4 #5): when no
 * audit has run, or the latest is stale (>30 days) / malformed, the chip shows
 * `📜 cca-f ?` — never a remembered number. (The Wave 54 audit had not run as of
 * Day-0; `~/.mooter/cca-f/audit/` was absent — so `?` is the honest default.)
 *
 * NOTE: the audit dir is `~/.mooter/cca-f/audit/`, NOT `~/.mooter/fable-observe/
 * audit/` — `fable-observe` is the source folder, never a runtime dir (see
 * packages/cli/src/fable-observe/config.ts, which refutes the Wave 54 brief).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const STALE_DAYS = 30;
const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000;

function mooterHome() {
  return process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
}

function prefs() {
  try { return JSON.parse(fs.readFileSync(path.join(mooterHome(), 'preferences.json'), 'utf8')); }
  catch { return {}; }
}

/** Opt-IN gate: env MOOTER_STATUSLINE_CCAF=1 OR statusline_chips.cca_f === true. */
function optedIn(p) {
  if (process.env.MOOTER_STATUSLINE_CCAF === '1') return true;
  return !!(p && p.statusline_chips && p.statusline_chips.cca_f === true);
}

function auditRoot(home = mooterHome()) {
  return path.join(home, 'cca-f', 'audit');
}

/** Newest report.json across all audit session dirs (by mtime). null if none. */
function readLatestReport(home = mooterHome()) {
  let entries;
  try { entries = fs.readdirSync(auditRoot(home), { withFileTypes: true }); }
  catch { return null; }
  let best = null;
  let bestMtime = -1;
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const rp = path.join(auditRoot(home), e.name, 'report.json');
    try {
      const m = fs.statSync(rp).mtimeMs;
      if (m > bestMtime) { bestMtime = m; best = rp; }
    } catch { /* no report.json in this dir */ }
  }
  if (!best) return null;
  try { return JSON.parse(fs.readFileSync(best, 'utf8')); } catch { return null; }
}

/** Fresh = has a parseable started_at within STALE_DAYS. */
function isFresh(r, now) {
  const t = r && r.started_at ? Date.parse(r.started_at) : NaN;
  return Number.isFinite(t) && now - t <= STALE_MS;
}

/**
 * Pure renderer (report injected) → chip string. Honest `?` when not fresh or
 * the pass rate is missing/non-numeric.
 */
function buildCcaChip(r, now = Date.now()) {
  if (!isFresh(r, now)) return '📜 cca-f ?';
  const pr = r.summary ? Number(r.summary.pass_rate) : NaN;
  if (!Number.isFinite(pr)) return '📜 cca-f ?';
  const pct = pr <= 1 ? Math.round(pr * 100) : Math.round(pr); // accept 0.78 or 78
  const total = Number(r.summary && r.summary.total) || 0;
  const detail = total ? ` (${total}q, n=1)` : ' (n=1)';
  return `📜 cca-f ${pct}% pass${detail}`;
}

/** Line-3 entry: '' unless opted in, else the latest-audit chip (or honest `?`). */
function statusLine() {
  try {
    if (!optedIn(prefs())) return ''; // opt-IN: silent unless explicitly enabled
    return buildCcaChip(readLatestReport(), Date.now());
  } catch {
    return '';
  }
}

module.exports = {
  buildCcaChip, isFresh, optedIn, readLatestReport, statusLine, auditRoot, STALE_DAYS,
};

if (require.main === module) {
  const out = statusLine();
  if (out) process.stdout.write(out + '\n');
}

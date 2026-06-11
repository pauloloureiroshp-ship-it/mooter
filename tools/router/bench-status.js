#!/usr/bin/env node
/**
 * bench-status.js — Wave 53 Phase H.1 (empirical evidence chip).
 *
 * OPT-IN line-3 chip showing MooterBench routing accuracy, e.g.
 * `🧪 bench 60% acc (50 wf, n=1)`. Unlike the other line-3 chips (opt-OUT via
 * hidden_chips), this one is OFF unless `statusline_chips.bench: true` is set in
 * ~/.mooter/preferences.json — empirical numbers are noisier and not for everyone.
 *
 * Anti-fabrication (Doctrine V4 #5 · Wave 53 Decision 4): the chip reads a real
 * RESULTS.json (packages/mooter-bench is stdout-only TODAY and does not yet write
 * one — persisting it is deferred to a later wave). When that file is ABSENT,
 * STALE (>30 days), or malformed, the chip shows `🧪 bench ?` — never the README's
 * documented 60% snapshot dressed up as live data.
 *
 * RESULTS.json shape (matches `npm run bench -- --json`): { accuracy (0..1 or %),
 * total, cohorts?, generated_at (ISO) }.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const STALE_DAYS = 30;
const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000;

function prefs() {
  try {
    return JSON.parse(fs.readFileSync(path.join(os.homedir(), '.mooter', 'preferences.json'), 'utf8'));
  } catch {
    return {};
  }
}

/** Opt-IN gate: default off unless statusline_chips.bench === true. */
function optedIn(p) {
  return !!(p && p.statusline_chips && p.statusline_chips.bench === true);
}

/** Candidate RESULTS.json locations: runtime home first, dev checkout second. */
function resultsPaths() {
  const explicitHome = process.env.MOOTER_HOME;
  const home = explicitHome || path.join(os.homedir(), '.mooter');
  const paths = [path.join(home, 'bench', 'RESULTS.json')];
  // Wave 55 (Phase G) — the dev-checkout fallback exists so the chip can read a
  // locally-generated bench when running from the repo with no runtime home. But
  // an EXPLICIT MOOTER_HOME means "read results only from here": skip the repo
  // checkout so an isolated/test home can't leak the repo's RESULTS.json.
  if (!explicitHome) {
    paths.push(path.resolve(__dirname, '..', '..', 'packages', 'mooter-bench', 'RESULTS.json'));
  }
  return paths;
}

function readResults() {
  for (const f of resultsPaths()) {
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* try next */ }
  }
  return null;
}

/** Fresh = has a parseable generated_at within STALE_DAYS. */
function isFresh(r, now) {
  if (!r || !r.generated_at) return false;
  const t = Date.parse(r.generated_at);
  return !Number.isNaN(t) && now - t <= STALE_MS;
}

/**
 * Pure renderer (results injected) → chip string. Always returns a chip when
 * opted in: a real reading when data is fresh, else the honest `🧪 bench ?`.
 */
function buildBenchChip(r, now = Date.now()) {
  if (!isFresh(r, now)) return '🧪 bench ?';
  const acc = Number(r.accuracy);
  if (!Number.isFinite(acc)) return '🧪 bench ?';
  const pct = acc <= 1 ? Math.round(acc * 100) : Math.round(acc); // accept 0.60 or 60
  const total = Number(r.total) || 0;
  const cohorts = Number(r.cohorts || r.n_cohorts) || 1;
  const detail = total ? ` (${total} wf, n=${cohorts})` : ` (n=${cohorts})`;
  return `🧪 bench ${pct}% acc${detail}`;
}

function statusLine() {
  try {
    if (!optedIn(prefs())) return ''; // opt-IN: silent unless explicitly enabled
    return buildBenchChip(readResults(), Date.now());
  } catch {
    return '';
  }
}

module.exports = { buildBenchChip, isFresh, optedIn, readResults, statusLine, STALE_DAYS };

if (require.main === module) {
  const out = statusLine();
  if (out) process.stdout.write(out + '\n');
}

#!/usr/bin/env node
/**
 * council-status.js — W4 Council persistent statusline chip.
 *
 * OPT-IN chip showing the last council run result, e.g.
 *   `🏛 council 1.2s · $0.00 · saved ~100%`  (real data from vault)
 *   `🏛 —`                                     (opted-in, no run yet)
 * Off (→ '') unless `statusline_council: true` in ~/.mooter/preferences.json.
 * Default OFF → wired statusline is BYTE-IDENTICAL (A.5 contract preserved).
 *
 * Data source: ~/.mooter/council-last.json written by packages/council/src/ledger.ts
 * (writeLastCouncilState). Reads ONLY from disk → naturally cross-restart
 * persistent: a fresh process reading the same file recovers identical state.
 *
 * LastCouncilState shape (from ledger.ts):
 *   { latencyMs, costUsd, modelCalls, convergence, savedPct, category, ts? }
 *
 * Anti-fabrication: if council-last.json is missing/malformed the chip shows
 * `🏛 —` (honest placeholder, never an invented number). The `—` signals
 * "opted-in, but no council run persisted yet on this machine".
 *
 * Reuses the W3 pattern (loop-status.js + chip-composer.js) — reads disk, never
 * invents, opt-in default OFF, honest fallback.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// ── vault-dir discovery ──────────────────────────────────────────────────────────

/**
 * Find the Mooter home (vault) directory. Tries in order:
 *  1. MOOTER_HOME env var (explicit override — mirrors packages/council/src/ledger.ts)
 *  2. ~/.mooter  (default)
 * Returns the resolved path (may or may not contain council-last.json).
 *
 * NOTE: also used for preferences.json so tests can control everything via
 * one env var — consistent with how loop-status.js tests use MOOTER_REPO_ROOT.
 */
function mooterHome() {
  return process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
}

// ── preferences ──────────────────────────────────────────────────────────────────

function prefs() {
  try {
    return JSON.parse(fs.readFileSync(path.join(mooterHome(), 'preferences.json'), 'utf8'));
  } catch {
    return {};
  }
}

/** Opt-IN gate: default OFF unless preferences.statusline_council === true. */
function optedIn(p) {
  return !!(p && p.statusline_council === true);
}

// ── disk reader ──────────────────────────────────────────────────────────────────

/**
 * Read council-last.json from the vault. Returns parsed object or null on any error.
 * Validates presence of at least { latencyMs, costUsd, savedPct } (the minimum needed
 * to render the chip). Missing/corrupt file → null → placeholder `—`.
 */
function readLastState() {
  try {
    const file = path.join(mooterHome(), 'council-last.json');
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (
      raw &&
      typeof raw.latencyMs === 'number' &&
      typeof raw.costUsd === 'number' &&
      typeof raw.savedPct === 'number'
    ) {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}

// ── chip renderer ────────────────────────────────────────────────────────────────

/**
 * Format a USD cost — mirrors packages/council/src/chip.ts#fmtUsd.
 *   0       → '$0.00'
 *   <0.01   → '$0.0042'  (4 decimals to avoid '$0.00' for tiny values)
 *   ≥0.01   → '$0.12'
 */
function fmtUsd(x) {
  if (x === 0) return '$0.00';
  if (x < 0.01) return `$${x.toFixed(4)}`;
  return `$${x.toFixed(2)}`;
}

/**
 * Format a latency in ms as seconds — mirrors chip.ts#fmtSecs.
 */
function fmtSecs(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Pure renderer: state → chip string.
 * Mirrors packages/council/src/chip.ts#renderCouncilChip in plain CJS.
 *
 * With real state:  `🏛 council 1.2s · $0.00 · saved ~100%`
 * No savedPct baseline: `🏛 council 1.2s · $0.00`
 * null state:       `🏛 —`  (honest placeholder: opted-in, no run yet)
 */
function buildCouncilChip(state) {
  if (!state) return '🏛 —';
  const timeStr = fmtSecs(state.latencyMs);
  const costStr = fmtUsd(state.costUsd);
  const savedStr = state.savedPct > 0 ? ` · saved ~${state.savedPct}%` : '';
  return `🏛 council ${timeStr} · ${costStr}${savedStr}`;
}

// ── public API ───────────────────────────────────────────────────────────────────

function statusLine() {
  try {
    if (!optedIn(prefs())) return ''; // OPT-IN: silent by default → byte-identical statusline
    const state = readLastState();
    return buildCouncilChip(state); // real data, or '🏛 —' when no run yet
  } catch {
    return ''; // never crash the statusline
  }
}

module.exports = {
  buildCouncilChip,
  fmtUsd,
  fmtSecs,
  mooterHome,
  optedIn,
  readLastState,
  statusLine,
};

if (require.main === module) {
  const out = statusLine();
  if (out) process.stdout.write(out + '\n');
}

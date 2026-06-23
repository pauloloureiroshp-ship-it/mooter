#!/usr/bin/env node
/**
 * loop-status.js — W3 Autopilot Loop polish — the 🔄 loop statusline chip.
 *
 * OPT-IN chip showing the current autopilot loop wave and round, e.g.
 *   `🔄 W3·r1 · —`      (no cost data in ledger yet)
 *   `🔄 W3·r2 · $0.12`  (real cost from ledger.jsonl)
 * Off (→ '') unless `statusline_loop: true` in ~/.mooter/preferences.json.
 * Default OFF → wired statusline is BYTE-IDENTICAL (A.5 contract preserved).
 *
 * Covers W3 pieces 1 + 2 + 3:
 *  1. Chip shows wave+round (OPT-IN, default off → byte-identical).
 *  2. Cost aggregated from ledger.jsonl; "—" when no cost field in bus data.
 *  3. Reads ONLY from disk (STATE.json + ledger.jsonl) — naturally survives
 *     service/PC restarts: a fresh process reading the same files recovers
 *     identical state. See smoke-W3-restart.mjs for the restart proof.
 *
 * Anti-fabrication (Doctrine V4 §5): if STATE.json is missing/malformed the
 * chip shows `🔄 ?` — never an invented wave label.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// ── preferences ──────────────────────────────────────────────────────────────────

function prefs() {
  try {
    return JSON.parse(fs.readFileSync(path.join(os.homedir(), '.mooter', 'preferences.json'), 'utf8'));
  } catch {
    return {};
  }
}

/** Opt-IN gate: default OFF unless preferences.statusline_loop === true. */
function optedIn(p) {
  return !!(p && p.statusline_loop === true);
}

// ── loop-dir discovery ───────────────────────────────────────────────────────────

/**
 * Walk up from a starting directory looking for _handoff/loop/STATE.json.
 * Returns the _handoff/loop/ dir path, or null.
 */
function _walkUp(start) {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, '_handoff', 'loop');
    if (fs.existsSync(path.join(candidate, 'STATE.json'))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Find the _handoff/loop/ directory. Tries in order:
 *  1. MOOTER_REPO_ROOT env var (explicit override)
 *  2. Walk up from __dirname  (works when chip runs inside the repo checkout)
 *  3. Walk up from process.cwd() (works when CC is launched from the repo root)
 * Returns the full path, or null when the loop bus is not visible.
 */
function findLoopDir() {
  if (process.env.MOOTER_REPO_ROOT) {
    const d = path.join(process.env.MOOTER_REPO_ROOT, '_handoff', 'loop');
    if (fs.existsSync(path.join(d, 'STATE.json'))) return d;
  }
  return _walkUp(__dirname) || _walkUp(process.cwd()) || null;
}

// ── disk readers — always pure fs, always fresh ──────────────────────────────────

/**
 * Read STATE.json from loopDir. Returns the parsed object or null on any error.
 * Validates that wave (string) and round (number) are present — the minimum
 * fields needed to render the chip. Any corrupt/partial STATE → null → `🔄 ?`.
 */
function readState(loopDir) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(loopDir, 'STATE.json'), 'utf8'));
    if (raw && typeof raw.wave === 'string' && typeof raw.round === 'number') return raw;
    return null;
  } catch {
    return null;
  }
}

/**
 * Read ledger.jsonl and sum all `cost` fields whose `wave` matches.
 *
 * Returns a positive number when cost data exists, or null when no entry
 * carries a `cost` field for this wave (caller renders "—").
 *
 * Pure fs read → always fresh; naturally cross-restart persistent because
 * the ledger lives on disk and a fresh process reads the same file.
 */
function readWaveCost(loopDir, wave) {
  if (!loopDir || !wave) return null;
  try {
    const text = fs.readFileSync(path.join(loopDir, 'ledger.jsonl'), 'utf8');
    let total = null;
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.wave !== wave) continue;
        const c = Number(entry.cost);
        if (Number.isFinite(c) && c > 0) total = (total || 0) + c;
      } catch { /* malformed line — skip, never crash */ }
    }
    return total;
  } catch {
    return null;
  }
}

// ── chip renderer ────────────────────────────────────────────────────────────────

/**
 * Format a cost number for chip display.
 * null / non-finite → '—'   (honest: no data)
 * < $0.01           → '$0.0042' (4 decimals to avoid "0.00")
 * ≥ $0.01           → '$0.12'   (2 decimals, readable)
 */
function fmtCost(c) {
  if (c === null || c === undefined || !Number.isFinite(c) || c < 0) return '—';
  if (c < 0.01) return `$${c.toFixed(4)}`;
  return `$${c.toFixed(2)}`;
}

/**
 * Pure renderer: (state, cost) → chip string.
 * Always returns a chip when called (opted-in path): `🔄 ?` on missing state.
 * Format:  🔄 W3·r1 · —    (no cost)
 *          🔄 W3·r2 · $0.12 (real cost)
 */
function buildLoopChip(state, cost) {
  if (!state) return '🔄 ?';
  const wave = String(state.wave || '?');
  const round = Number(state.round) || 0;
  return `🔄 ${wave}·r${round} · ${fmtCost(cost)}`;
}

// ── public API ───────────────────────────────────────────────────────────────────

function statusLine() {
  try {
    if (!optedIn(prefs())) return ''; // OPT-IN: silent by default → byte-identical statusline
    const loopDir = findLoopDir();
    if (!loopDir) return '🔄 ?'; // opted-in but loop bus not found (e.g. runtime chip, no repo)
    const state = readState(loopDir);
    const wave = state ? state.wave : null;
    const cost = wave ? readWaveCost(loopDir, wave) : null;
    return buildLoopChip(state, cost);
  } catch {
    return ''; // never crash the statusline
  }
}

module.exports = {
  buildLoopChip,
  findLoopDir,
  fmtCost,
  optedIn,
  readState,
  readWaveCost,
  statusLine,
};

if (require.main === module) {
  const out = statusLine();
  if (out) process.stdout.write(out + '\n');
}

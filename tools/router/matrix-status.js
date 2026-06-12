#!/usr/bin/env node
/**
 * matrix-status.js — Wave 58 A.13 (matrix coverage chip).
 *
 * DEFAULT-ON line-3 chip showing the Wave 58 model × category specialization
 * matrix coverage, e.g. `🎯 Matrix: 14 mod × 24 cat · 13/336 measured · refreshed 1d ago`.
 *
 * Wave 58 A.5 — this chip is shown by DEFAULT (the matrix is the headline Wave 58
 * artifact). It is HIDDEN only when the user explicitly opts out via any of:
 *   - env `MOOTER_STATUSLINE_MATRIX=0`
 *   - `statusline_chips.matrix === false` in ~/.mooter/preferences.json
 *   - `hidden_chips` includes "matrix"
 * The affirmative opt-ins (`MOOTER_STATUSLINE_MATRIX=1`, `statusline_chips.matrix:
 * true`) still work but are now redundant. Every other modular chip stays opt-IN.
 *
 * Anti-fabrication (Doctrine V4 #5): when the seed file cannot be read, or the
 * `as_of` date is absent/unparseable, the chip shows `🎯 Matrix: ?` — never an
 * invented count or age.
 *
 * WHY DIRECT JSON READ (not TS import):
 *   packages/router/src/benchmark-fetcher.ts and specialization-matrix.ts are
 *   TypeScript ESM modules.  The tools/router runtime is CommonJS Node, and there
 *   is no tsx/ts-node wired in the statusline execution path.  Rather than adding
 *   a compile step or a new dep, this chip reads `data/benchmark-seed-2026.json`
 *   (the same file the TS code reads) directly and replicates the tiny merge +
 *   coverage computation inline.  This matches the precedent set by conductor-
 *   status.js (which "re-reads [the conductor] schema here in zero-dep CommonJS
 *   because the statusline runtime cannot import the TS package").
 *
 * Constants (kept in sync with packages/router/src/specialization-matrix.ts):
 *   14 models × 24 categories = 336 total cells.
 *   These are stable for the Wave 58 release; bump both sides if the roster grows.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Constants (must match specialization-matrix.ts MATRIX_MODELS / TASK_CATEGORIES) ──
const MATRIX_MODELS_COUNT = 14;
const MATRIX_CATEGORIES_COUNT = 24;
const MATRIX_TOTAL_CELLS = MATRIX_MODELS_COUNT * MATRIX_CATEGORIES_COUNT; // 336

// ── File paths ────────────────────────────────────────────────────────────────

function mooterHome() {
  return process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
}

/**
 * Canonical seed path: <repo>/data/benchmark-seed-2026.json.
 * Resolved relative to this file's __dirname (tools/router → ../../data).
 * Falls back to MOOTER_REPO_ROOT env when the relative path is unavailable
 * (e.g. in a bundled/installed context).
 */
function seedFilePath() {
  const relative = path.resolve(__dirname, '..', '..', 'data', 'benchmark-seed-2026.json');
  if (fs.existsSync(relative)) return relative;
  const root = process.env.MOOTER_REPO_ROOT;
  if (root) return path.join(root, 'data', 'benchmark-seed-2026.json');
  return relative; // return anyway; caller handles missing file
}

/** User-local overrides: ~/.mooter/benchmarks-overrides.json */
function overridesFilePath() {
  return path.join(mooterHome(), 'benchmarks-overrides.json');
}

// ── Preferences ───────────────────────────────────────────────────────────────

function prefs() {
  try {
    return JSON.parse(fs.readFileSync(path.join(mooterHome(), 'preferences.json'), 'utf8'));
  } catch {
    return {};
  }
}

/**
 * DEFAULT-ON gate (Wave 58 A.5): the matrix chip shows unless explicitly hidden.
 * Returns false ONLY when the user opts out via env MOOTER_STATUSLINE_MATRIX=0,
 * statusline_chips.matrix === false, or hidden_chips includes "matrix". The
 * affirmative env =1 short-circuits to true (lets a user force-show even if a
 * stray hidden_chips entry exists). Otherwise: visible.
 */
function optedIn(p) {
  if (process.env.MOOTER_STATUSLINE_MATRIX === '1') return true;   // explicit force-show
  if (process.env.MOOTER_STATUSLINE_MATRIX === '0') return false;  // explicit hide
  if (p && p.statusline_chips && p.statusline_chips.matrix === false) return false;
  if (p && Array.isArray(p.hidden_chips) && p.hidden_chips.includes('matrix')) return false;
  return true; // default-ON
}

// ── Seed + overrides loading ──────────────────────────────────────────────────

/** Parse a benchmark JSON file; returns null on any failure. */
function readBenchmarkFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.cells)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Load + merge seed and user overrides.  Returns { cells, meta } where:
 *   cells — merged BenchmarkCell array (overrides win on duplicate model+category)
 *   meta  — raw _meta from the seed file (for as_of date), or null
 *
 * Mirrors the merge logic in benchmark-fetcher.ts mergeLayers().
 */
function loadMerged() {
  const seedFile = readBenchmarkFile(seedFilePath());
  const overridesFile = readBenchmarkFile(overridesFilePath());

  const seedCells = (seedFile && seedFile.cells) || [];
  const overrideCells = (overridesFile && overridesFile.cells) || [];

  // rightmost layer wins (overrides beat seed)
  const map = new Map();
  for (const cell of seedCells) {
    if (cell && cell.model && cell.category) {
      map.set(`${cell.model}\0${cell.category}`, cell);
    }
  }
  for (const cell of overrideCells) {
    if (cell && cell.model && cell.category) {
      map.set(`${cell.model}\0${cell.category}`, cell);
    }
  }

  return {
    cells: Array.from(map.values()),
    meta: (seedFile && seedFile._meta) || null,
  };
}

// ── Coverage computation ──────────────────────────────────────────────────────

/**
 * Count the cells where measured === true.  Only measured cells contribute to
 * the coverage number — this matches coverageStats() in specialization-matrix.ts.
 */
function countMeasured(cells) {
  let n = 0;
  for (const cell of cells) {
    if (cell && cell.measured === true) n++;
  }
  return n;
}

// ── Age formatting ────────────────────────────────────────────────────────────

/**
 * Parse the seed's _meta.as_of field (e.g. "2026-06" or "2026-06-12") to a Date.
 * Returns null when the string is absent or unparseable.
 * When only a month is given ("2026-06"), treat as the 1st of that month.
 */
function parseAsOf(asOf) {
  if (!asOf || typeof asOf !== 'string') return null;
  // Normalise "2026-06" → "2026-06-01" so Date.parse works cross-platform.
  const normalised = /^\d{4}-\d{2}$/.test(asOf.trim()) ? `${asOf.trim()}-01` : asOf.trim();
  const t = Date.parse(normalised);
  return Number.isFinite(t) ? new Date(t) : null;
}

/**
 * Format the age of the matrix data relative to `now`.
 * Examples: `0d`, `1d`, `30d`, `2mo`, `1y`.
 * Returns '?' when asOfDate is null.
 */
function fmtAge(asOfDate, now) {
  if (!asOfDate) return '?';
  const diffMs = now - asOfDate.getTime();
  if (diffMs < 0) return '0d'; // future date — show 0d
  const days = Math.floor(diffMs / 86400000);
  if (days < 31) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 13) return `${months}mo`;
  const years = Math.floor(days / 365);
  return `${years}y`;
}

// ── Pure renderer ─────────────────────────────────────────────────────────────

/**
 * Pure renderer — data injected, no filesystem calls.
 *
 * @param {object|null} data   Result from loadMerged() (cells + meta), or null.
 * @param {number}      [now]  Current timestamp ms (injectable for tests).
 * @returns {string}           Chip string, or '🎯 Matrix: ?' when data is absent.
 *
 * Format: `🎯 Matrix: 14 mod × 24 cat · M/336 measured · refreshed Xd ago`
 * When data is null/unreadable: `🎯 Matrix: ?`
 */
function buildMatrixChip(data, now = Date.now()) {
  if (!data || !Array.isArray(data.cells)) return '🎯 Matrix: ?';

  const measured = countMeasured(data.cells);
  const asOfDate = parseAsOf(data.meta && data.meta.as_of);
  const age = fmtAge(asOfDate, now);

  return (
    `🎯 Matrix: ${MATRIX_MODELS_COUNT} mod × ${MATRIX_CATEGORIES_COUNT} cat` +
    ` · ${measured}/${MATRIX_TOTAL_CELLS} measured` +
    ` · refreshed ${age} ago`
  );
}

// ── Line-3 entry point ────────────────────────────────────────────────────────

/** Line-3 entry: '' unless opted in, else the matrix coverage chip (or honest '?'). */
function statusLine() {
  try {
    if (!optedIn(prefs())) return ''; // opt-IN: silent unless explicitly enabled
    const data = loadMerged();
    return buildMatrixChip(data, Date.now());
  } catch {
    return '';
  }
}

module.exports = {
  buildMatrixChip,
  countMeasured,
  fmtAge,
  loadMerged,
  optedIn,
  parseAsOf,
  statusLine,
  MATRIX_TOTAL_CELLS,
  MATRIX_MODELS_COUNT,
  MATRIX_CATEGORIES_COUNT,
};

if (require.main === module) {
  const out = statusLine();
  if (out) process.stdout.write(out + '\n');
}

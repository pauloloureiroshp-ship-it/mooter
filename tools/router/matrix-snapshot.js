#!/usr/bin/env node
'use strict';
/**
 * matrix-snapshot.js — Wave 58 (A.15): daily matrix state persistence +
 * TES evolution reader.
 *
 * ## writeSnapshot(opts)
 *
 * Saves one day-file to `~/.mooter/matrix-snapshots/<YYYY-MM-DD>.json`:
 *
 *   {
 *     date,                 // "YYYY-MM-DD"
 *     coverage,             // coverageStats() result from specialization-matrix, or null
 *     cells_measured,       // number of cells with a non-null TES, or 0
 *     tes_by_cell,          // { "<model>|<category>": <tes> | null } for all cells
 *     total_routings,       // best-effort integer from cost-perf-log, or 0
 *     pricing_pending_count // integer — cells where TES is null due to pending pricing
 *   }
 *
 * If a file for that date already exists it is **overwritten** (idempotent re-run).
 * After writing, prunes snapshots older than MAX_SNAPSHOT_DAYS (90) day-files.
 *
 * ## computeEvolution({category, period_days, dir})
 *
 * Reads the snapshot dir → returns an array of `{ date, tes }` trend points for
 * the given `category`, one entry per day-file within `period_days`. Only points
 * where a real (non-null) TES median exists for that category are included.
 * Order: chronological (oldest first). Returns [] when no data.
 *
 * ## Anti-fabrication (Doctrine V4 #5)
 *
 * - Unknown / un-computable values stored as `null`, never a remembered/invented
 *   number.
 * - `tes_by_cell` carries `null` exactly where computeTES returned null (pending
 *   pricing or missing benchmark score).
 * - `computeEvolution` returns only points where data exists; it never interpolates
 *   or invents missing days.
 *
 * ## Pure-ish design (injectable for tests)
 *
 * All I/O paths accept an optional `dir` (or `home`) override so tests can write
 * to a temp dir without touching real ~/.mooter. The module itself has no side
 * effects at require-time.
 *
 * ## Dependency resilience
 *
 * specialization-matrix, tes-calculator, and benchmark-fetcher are Wave 58
 * deliverables that may not yet exist on disk. Each is wrapped in try/catch so
 * this module degrades gracefully (cells_measured = 0, coverage = null) rather
 * than hard-failing when loaded before its siblings are present.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

/** Maximum number of daily snapshot files to keep (prune anything older). */
const MAX_SNAPSHOT_DAYS = 90;

// ── optional sibling modules (Wave 58 deliverables, may not exist yet) ────────
let specializationMatrix;
try { specializationMatrix = require('./specialization-matrix.js'); } catch { specializationMatrix = null; }

let tesCalculator;
try { tesCalculator = require('./tes-calculator.js'); } catch { tesCalculator = null; }

let benchmarkFetcher;
try { benchmarkFetcher = require('./benchmark-fetcher.js'); } catch { benchmarkFetcher = null; }

let costPerfTracker;
try { costPerfTracker = require('./cost-perf-tracker.js'); } catch { costPerfTracker = null; }

// ── path helpers ───────────────────────────────────────────────────────────────

function mooterHome() {
  return process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
}

/**
 * Directory that holds daily snapshot files.
 * Pass `dir` to override (useful in tests).
 */
function snapshotDir(dir) {
  return dir || path.join(mooterHome(), 'matrix-snapshots');
}

/**
 * Derive a YYYY-MM-DD date string from a timestamp (ms since epoch).
 * Uses UTC to ensure consistency across time zones.
 */
function dateKey(nowMs) {
  return new Date(nowMs).toISOString().slice(0, 10); // "YYYY-MM-DD"
}

// ── prune helper ───────────────────────────────────────────────────────────────

/**
 * Remove day-files in `dir` that are older than `maxDays`.
 * Best-effort: any individual unlink failure is silently skipped.
 * Returns the number of files removed, or `null` when the dir could not be read
 * (contagem desconhecida).
 */
function pruneOldSnapshots(dir, maxDays = MAX_SNAPSHOT_DAYS) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (e) {
    // Dir inexistente é mesmo "não há nada para podar" → 0. Qualquer outra falha
    // (permissões, caminho que não é um dir) devolvia esse mesmo 0, e um prune
    // que nunca chegou a correr ficava indistinguível de um prune sem trabalho:
    // os day-files passavam dos 90 dias sem um único sinal. Agora null = não sei.
    if (e && e.code === 'ENOENT') return 0;
    try { process.stderr.write(`[matrix-snapshot] prune não conseguiu ler ${dir} (${(e && e.message) || e}) — contagem n/d\n`); } catch { /* best-effort */ }
    return null;
  }
  const dateFiles = names.filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort();
  if (dateFiles.length <= maxDays) return 0;
  const toRemove = dateFiles.slice(0, dateFiles.length - maxDays);
  let removed = 0;
  for (const n of toRemove) {
    try { fs.unlinkSync(path.join(dir, n)); removed++; } catch { /* skip */ }
  }
  return removed;
}

// ── TES cell computation ───────────────────────────────────────────────────────

/**
 * Build the tes_by_cell map from the matrix cells.
 * Returns { tes_by_cell, cells_measured, pricing_pending_count }.
 * When the required modules are absent, returns safe zeros/nulls.
 *
 * @param {object[]} cells  — array of { model, category, benchmark_score }
 */
function buildTesByCellFromCells(cells) {
  const tes_by_cell = {};
  let cells_measured = 0;
  let pricing_pending_count = 0;

  if (!Array.isArray(cells) || cells.length === 0) {
    return { tes_by_cell, cells_measured, pricing_pending_count };
  }

  for (const cell of cells) {
    const { model, category, benchmark_score } = cell || {};
    if (!model || !category) continue;
    const key = `${model}|${category}`;

    if (tesCalculator && typeof tesCalculator.computeTES === 'function') {
      let result;
      try { result = tesCalculator.computeTES({ model, category, benchmark_score }); } catch { result = null; }
      const tes = (result && Number.isFinite(result.tes)) ? result.tes : null;
      tes_by_cell[key] = tes;
      if (tes !== null) {
        cells_measured++;
      } else {
        pricing_pending_count++;
      }
    } else {
      // tes-calculator not yet available; all cells pending
      tes_by_cell[key] = null;
      pricing_pending_count++;
    }
  }

  return { tes_by_cell, cells_measured, pricing_pending_count };
}

/**
 * Gather matrix cells from specialization-matrix + benchmark-fetcher.
 * Returns [] when modules are unavailable (graceful degradation).
 */
function gatherCells() {
  if (!specializationMatrix) return [];

  let matrixCells = [];
  try {
    // coverageStats() returns { categories, models, cells[], ... }
    // cells is the canonical enumeration of (model, category) pairs
    const stats = typeof specializationMatrix.coverageStats === 'function'
      ? specializationMatrix.coverageStats()
      : null;
    if (stats && Array.isArray(stats.cells)) {
      matrixCells = stats.cells;
    }
  } catch { /* specialization-matrix unavailable or malformed */ }

  if (matrixCells.length === 0) return [];

  // Enrich with benchmark scores when benchmark-fetcher is available
  if (benchmarkFetcher && typeof benchmarkFetcher.getScore === 'function') {
    return matrixCells.map((cell) => {
      const { model, category } = cell || {};
      let benchmark_score = null;
      try {
        const raw = benchmarkFetcher.getScore(model, category);
        benchmark_score = Number.isFinite(raw) ? raw : null;
      } catch { /* leave null */ }
      return { model, category, benchmark_score };
    });
  }

  // No benchmark-fetcher — cells have null scores; TES will be null (pending)
  return matrixCells.map((c) => ({ model: c.model, category: c.category, benchmark_score: null }));
}

// ── total_routings helper ──────────────────────────────────────────────────────

/**
 * Best-effort count of total routing events recorded in cost-perf-log.
 * Returns 0 when the log is absent or the tracker module is unavailable.
 *
 * We read all rows (no time filter) to give a cumulative total count.
 */
function totalRoutingsFromLog(home) {
  if (!costPerfTracker || typeof costPerfTracker.readRows !== 'function') return 0;
  try {
    const rows = costPerfTracker.readRows({ home, last_days: Infinity });
    return Array.isArray(rows) ? rows.length : 0;
  } catch { return 0; }
}

// ── coverage helper ────────────────────────────────────────────────────────────

/**
 * Returns the coverageStats object from specialization-matrix, or null when
 * the module is unavailable.
 */
function getCoverageStats() {
  if (!specializationMatrix || typeof specializationMatrix.coverageStats !== 'function') return null;
  try { return specializationMatrix.coverageStats(); } catch { return null; }
}

// ── writeSnapshot ──────────────────────────────────────────────────────────────

/**
 * Save (or overwrite) a day-file for today's matrix state, then prune old files.
 *
 * @param {object} opts
 * @param {string} [opts.dir]   — override snapshot dir (for tests)
 * @param {string} [opts.home]  — override mooter home (for cost-perf-log lookup)
 * @param {number} [opts.now]   — override current timestamp ms (for tests)
 * @returns {{ written: boolean, file: string, pruned: number|null, snapshot: object }}
 *          `pruned` é null quando o dir de snapshots não pôde ser lido (n/d).
 */
function writeSnapshot(opts = {}) {
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const date = dateKey(now);
  const dir = snapshotDir(opts.dir);
  const home = opts.home || mooterHome();

  const coverage = getCoverageStats();
  const cells = gatherCells();
  const { tes_by_cell, cells_measured, pricing_pending_count } = buildTesByCellFromCells(cells);
  const total_routings = totalRoutingsFromLog(home);

  const snapshot = {
    date,
    coverage: coverage || null,
    cells_measured,
    tes_by_cell,
    total_routings,
    pricing_pending_count,
  };

  let written = false;
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* may already exist */ }
  const file = path.join(dir, `${date}.json`);
  try {
    fs.writeFileSync(file, JSON.stringify(snapshot, null, 2));
    written = true;
  } catch { /* write failed — caller can inspect written: false */ }

  // pruned pode vir null (dir ilegível) e passa assim para quem lê — n/d em vez
  // de um 0 que diria "não havia nada velho".
  const pruned = written ? pruneOldSnapshots(dir, MAX_SNAPSHOT_DAYS) : 0;

  return { written, file, pruned, snapshot };
}

// ── computeEvolution ───────────────────────────────────────────────────────────

/**
 * TES trend for a single category over `period_days` of snapshots.
 *
 * For each day-file within the period, extracts all TES values for cells whose
 * category matches, then computes the median of the non-null values for that day.
 * Only days with at least one real TES value are included in the output (honest:
 * missing days are not interpolated or zero-filled).
 *
 * @param {object} opts
 * @param {string} opts.category     — the category to trend (e.g. "coding.completion")
 * @param {number} [opts.period_days=30] — how many days of history to include
 * @param {string} [opts.dir]        — override snapshot dir (for tests)
 * @param {number} [opts.now]        — override current timestamp ms (for tests)
 * @returns {{ date: string, tes: number }[]}  — chronological (oldest first)
 */
function computeEvolution({ category, period_days = 30, dir, now } = {}) {
  if (!category || typeof category !== 'string') return [];

  const nowMs = Number.isFinite(now) ? now : Date.now();
  const cutoffMs = nowMs - Math.max(0, period_days) * 86400000;
  const snapDir = snapshotDir(dir);

  let names;
  try { names = fs.readdirSync(snapDir); } catch { return []; }

  const dateFiles = names
    .filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n))
    .sort(); // lexicographic = chronological for YYYY-MM-DD

  const points = [];

  for (const name of dateFiles) {
    const dateStr = name.replace(/\.json$/, '');
    const fileMs = Date.parse(`${dateStr}T00:00:00Z`);
    if (!Number.isFinite(fileMs) || fileMs < cutoffMs) continue;

    let snap;
    try { snap = JSON.parse(fs.readFileSync(path.join(snapDir, name), 'utf8')); } catch { continue; }

    const tbc = (snap && typeof snap.tes_by_cell === 'object' && snap.tes_by_cell !== null)
      ? snap.tes_by_cell
      : {};

    // Collect all TES values for this category (any model)
    const tesValues = [];
    for (const [key, tes] of Object.entries(tbc)) {
      // key format: "<model>|<category>"
      const sep = key.lastIndexOf('|');
      if (sep < 0) continue;
      const cellCategory = key.slice(sep + 1);
      if (cellCategory !== category) continue;
      if (Number.isFinite(tes)) tesValues.push(tes);
    }

    if (tesValues.length === 0) continue; // honest: no data for this day → skip

    // Median TES for this category on this day
    tesValues.sort((a, b) => a - b);
    const mid = Math.floor(tesValues.length / 2);
    const medianTes = tesValues.length % 2 === 0
      ? (tesValues[mid - 1] + tesValues[mid]) / 2
      : tesValues[mid];

    points.push({ date: dateStr, tes: medianTes });
  }

  return points; // already chronological (files were sorted)
}

// ── exports ────────────────────────────────────────────────────────────────────

module.exports = {
  writeSnapshot,
  computeEvolution,
  pruneOldSnapshots,
  // exposed for unit tests / introspection
  buildTesByCellFromCells,
  dateKey,
  snapshotDir,
  MAX_SNAPSHOT_DAYS,
};

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === 'evolve') {
    const category = args[1] || 'coding.completion';
    const period_days = Number(args[2]) || 30;
    const result = computeEvolution({ category, period_days });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    const result = writeSnapshot();
    process.stdout.write(JSON.stringify({
      written: result.written,
      file: result.file,
      pruned: result.pruned,
      cells_measured: result.snapshot.cells_measured,
      pricing_pending_count: result.snapshot.pricing_pending_count,
      total_routings: result.snapshot.total_routings,
    }, null, 2) + '\n');
  }
}

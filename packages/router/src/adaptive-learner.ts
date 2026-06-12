// adaptive-learner.ts — Wave 58 (A.12): the weekly EWMA learning loop.
//
// ── WHAT THIS DOES ───────────────────────────────────────────────────────────
//
// The specialization matrix (specialization-matrix.ts) ships SPARSE: only the
// (model, category) cells with a real cited benchmark are measured; everything
// else is the empty sentinel awaiting evidence.  This module is the "awaiting
// evidence" half of that contract: it reads THIS user's own real routing
// outcomes from ~/.mooter/cost-perf-log.jsonl, learns a per-cell quality score
// via an exponentially-weighted moving average (EWMA), and writes the result to
// ~/.mooter/specialization-overrides.json.
//
// Those overrides LAYER ON TOP of the cited baseline matrix.  An override is the
// router's own learned belief about how well a model does on a category for THIS
// install's traffic — it is NOT a cited benchmark, so its provenance is kept
// honest: source = "adaptive-learned", confidence = "low" (it is local, n-bounded
// evidence, never a published number).
//
// ── ANTI-FABRICATION (DOCTRINE V4 #5) ────────────────────────────────────────
//
//   1. A cell is only learned when it has >= MIN_DATAPOINTS (5) REAL outcomes
//      carrying a finite actual_score in [0,1].  One sample never moves a cell —
//      we refuse to manufacture a "learned" score from noise.
//   2. EWMA is computed ONLY over real, finite, in-range actual_score values.
//      Missing/null scores are skipped, never zero-filled (a null score is
//      "unknown", and Number(null) === 0 would silently fabricate a 0% quality).
//   3. Cells below the threshold are NOT written — the overrides file stays
//      sparse and truthful, mirroring the baseline matrix's honesty.
//   4. The layered lookup (getLearnedCell) marks every learned cell
//      source:"adaptive-learned" (NEVER a benchmark name) so the UI can always
//      distinguish "we measured this from your traffic" from "a vendor published
//      this".  driftReport() compares the two without ever inventing a baseline.
//
// ── PURITY / TESTABILITY ─────────────────────────────────────────────────────
//
// All filesystem paths are injectable: recomputeFromOutcomes({ log_path,
// overrides_path, now }) lets tests point at a temp dir.  The module performs no
// IO at import time and never throws on a missing/corrupt log (it degrades to an
// empty result).

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { TASK_CATEGORIES } from "./task-categories.ts";
import { MATRIX_MODELS, getCell, type SpecializationCell } from "./specialization-matrix.ts";

// ---------------------------------------------------------------------------
// Documented constants (change here + in the SPEC together).
// ---------------------------------------------------------------------------

/**
 * EWMA smoothing factor.  alpha=0.3 weights the most recent outcome at 30% and
 * the running history at 70% — recent traffic adapts the cell without letting a
 * single turn swing it.  Applied in chronological order (oldest → newest).
 */
export const EWMA_ALPHA = 0.3 as const;

/**
 * Minimum real outcomes before a cell is allowed to be learned.  Below this the
 * cell stays untouched (the baseline matrix value is authoritative).  Five is
 * the documented floor: enough to damp single-sample noise, low enough that a
 * lightly-used install still learns within a week of normal traffic.
 */
export const MIN_DATAPOINTS = 5 as const;

/** Provenance tag stamped on every learned cell — NEVER a benchmark name. */
export const LEARNED_SOURCE = "adaptive-learned" as const;

/** Schema version of the overrides file, so a future reader can migrate. */
export const OVERRIDES_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Paths (all injectable for tests).
// ---------------------------------------------------------------------------

function mooterHome(): string {
  return process.env.MOOTER_HOME || join(homedir(), ".mooter");
}

/** Default cost/perf journal path — mirrors cost-perf-tracker.js logPath(). */
export function defaultLogPath(): string {
  return join(mooterHome(), "cost-perf-log.jsonl");
}

/** Default overrides output path. */
export function defaultOverridesPath(): string {
  return join(mooterHome(), "specialization-overrides.json");
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One learned (model, category) override cell written to the overrides file. */
export interface LearnedCell {
  model: string;
  category: string;
  /** EWMA of real actual_score values, rounded to 4 dp, in [0, 1]. */
  score: number;
  /** Always LEARNED_SOURCE — provenance is local evidence, not a benchmark. */
  source: typeof LEARNED_SOURCE;
  /** Always true: a learned cell is backed by >= MIN_DATAPOINTS real outcomes. */
  measured: true;
  /** Learned cells are always low confidence (local, n-bounded evidence). */
  confidence: "low";
  /** How many real outcomes fed the EWMA. */
  datapoints: number;
  /** ISO timestamp the cell was learned. */
  as_of: string;
}

/** The on-disk shape of ~/.mooter/specialization-overrides.json. */
export interface OverridesFile {
  version: number;
  generated_at: string;
  alpha: number;
  min_datapoints: number;
  cells: LearnedCell[];
}

export interface RecomputeOptions {
  /** Override the cost-perf-log path (tests). */
  log_path?: string;
  /** Override the overrides output path (tests). */
  overrides_path?: string;
  /** Override "now" (ms) for deterministic timestamps in tests. */
  now?: number;
  /** When false, compute but DO NOT write the file (dry run). Default true. */
  write?: boolean;
}

export interface RecomputeResult {
  /** Cells that crossed MIN_DATAPOINTS and were learned. */
  cells: LearnedCell[];
  /** True when the overrides file was actually written. */
  written: boolean;
  /** Resolved overrides path (whether or not written). */
  overrides_path: string;
  /** Total JSONL rows read from the log. */
  rows_read: number;
  /** (model, category) groups that had >=1 row but < MIN_DATAPOINTS (skipped). */
  below_threshold: number;
  /** Groups skipped because model/category was outside the roster/taxonomy. */
  out_of_roster: number;
}

// ---------------------------------------------------------------------------
// Membership sets — only learn cells that live in the real roster/taxonomy.
// ---------------------------------------------------------------------------

const MODEL_SET: ReadonlySet<string> = new Set(MATRIX_MODELS);
const CATEGORY_SET: ReadonlySet<string> = new Set(TASK_CATEGORIES);

/** Composite key for grouping outcomes by cell. */
function cellKey(model: string, category: string): string {
  return `${model}\0${category}`;
}

/** Finite number in [0,1], else null (an out-of-range/garbage score is dropped). */
function validScore(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1) return null;
  return n;
}

/** A single parsed outcome row we care about. */
interface Outcome {
  model: string;
  category: string;
  score: number;
  /** ms since epoch for chronological ordering; null when ts is absent/unparsable. */
  t: number | null;
}

// ---------------------------------------------------------------------------
// Log reading (best-effort, never throws).
// ---------------------------------------------------------------------------

/**
 * Read the JSONL journal and project it onto the outcomes we learn from.
 * Only rows with an in-roster model, in-taxonomy category, AND a finite
 * actual_score in [0,1] survive.  Returns { outcomes, rows_read }.
 */
function readOutcomes(logPath: string): { outcomes: Outcome[]; rows_read: number } {
  let raw: string;
  try {
    if (!existsSync(logPath)) return { outcomes: [], rows_read: 0 };
    raw = readFileSync(logPath, "utf8");
  } catch {
    return { outcomes: [], rows_read: 0 };
  }

  const outcomes: Outcome[] = [];
  let rows_read = 0;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let row: Record<string, unknown>;
    try {
      row = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue; // a corrupt line never poisons prior rows
    }
    if (!row || typeof row !== "object") continue;
    rows_read++;

    const model =
      typeof row.model_chosen === "string"
        ? row.model_chosen
        : typeof row.model === "string"
          ? row.model
          : null;
    const category =
      typeof row.task_category === "string"
        ? row.task_category
        : typeof row.category === "string"
          ? row.category
          : null;
    if (!model || !category) continue;

    const score = validScore(row.actual_score);
    if (score === null) continue; // unknown quality → never zero-filled

    const ts = typeof row.ts === "string" ? Date.parse(row.ts) : NaN;
    outcomes.push({ model, category, score, t: Number.isFinite(ts) ? ts : null });
  }
  return { outcomes, rows_read };
}

// ---------------------------------------------------------------------------
// EWMA.
// ---------------------------------------------------------------------------

/**
 * Exponentially-weighted moving average over chronologically-ordered values.
 * ewma_0 = v_0; ewma_i = alpha*v_i + (1-alpha)*ewma_{i-1}.
 * Caller guarantees `values` is non-empty and all finite.
 */
export function ewma(values: number[], alpha: number = EWMA_ALPHA): number {
  let acc = values[0];
  for (let i = 1; i < values.length; i++) {
    acc = alpha * values[i] + (1 - alpha) * acc;
  }
  return acc;
}

// ---------------------------------------------------------------------------
// Core: recompute overrides from outcomes.
// ---------------------------------------------------------------------------

/**
 * Read outcomes, group by (model, category), and learn an EWMA score for every
 * cell with >= MIN_DATAPOINTS real outcomes.  Writes the overrides file (unless
 * write:false).  Never throws; degrades to an empty result when the log is
 * absent/corrupt.
 */
export function recomputeFromOutcomes(opts: RecomputeOptions = {}): RecomputeResult {
  const logPath = opts.log_path ?? defaultLogPath();
  const overridesPath = opts.overrides_path ?? defaultOverridesPath();
  const now = Number.isFinite(opts.now) ? (opts.now as number) : Date.now();
  const doWrite = opts.write !== false;

  const { outcomes, rows_read } = readOutcomes(logPath);

  // Group by cell; track out-of-roster groups for honest reporting.
  const groups = new Map<string, Outcome[]>();
  let out_of_roster = 0;
  const outOfRosterKeys = new Set<string>();
  for (const o of outcomes) {
    const k = cellKey(o.model, o.category);
    if (!MODEL_SET.has(o.model) || !CATEGORY_SET.has(o.category)) {
      if (!outOfRosterKeys.has(k)) {
        outOfRosterKeys.add(k);
        out_of_roster++;
      }
      continue;
    }
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(o);
  }

  const as_of = new Date(now).toISOString();
  const cells: LearnedCell[] = [];
  let below_threshold = 0;

  for (const group of groups.values()) {
    if (group.length < MIN_DATAPOINTS) {
      below_threshold++;
      continue; // not enough evidence — leave the baseline cell authoritative
    }
    // Chronological order: rows with a timestamp sort by it; timestamp-less rows
    // keep their (file/append) order at the end so the most recent appended row
    // still weighs heaviest in the typical (timestamped) case.
    const ordered = group
      .map((o, i) => ({ o, i }))
      .sort((a, b) => {
        if (a.o.t === null && b.o.t === null) return a.i - b.i;
        if (a.o.t === null) return 1;
        if (b.o.t === null) return -1;
        return a.o.t - b.o.t || a.i - b.i;
      })
      .map((x) => x.o);

    const score = Math.round(ewma(ordered.map((o) => o.score)) * 1e4) / 1e4;
    cells.push({
      model: ordered[0].model,
      category: ordered[0].category,
      score,
      source: LEARNED_SOURCE,
      measured: true,
      confidence: "low",
      datapoints: ordered.length,
      as_of,
    });
  }

  // Stable, deterministic ordering of the output file.
  cells.sort((a, b) =>
    a.model === b.model ? a.category.localeCompare(b.category) : a.model.localeCompare(b.model),
  );

  let written = false;
  if (doWrite) {
    const file: OverridesFile = {
      version: OVERRIDES_VERSION,
      generated_at: as_of,
      alpha: EWMA_ALPHA,
      min_datapoints: MIN_DATAPOINTS,
      cells,
    };
    try {
      mkdirSync(dirname(overridesPath), { recursive: true });
      writeFileSync(overridesPath, JSON.stringify(file, null, 2));
      written = true;
    } catch {
      written = false; // best-effort — caller can inspect written:false
    }
  }

  return {
    cells,
    written,
    overrides_path: overridesPath,
    rows_read,
    below_threshold,
    out_of_roster,
  };
}

// ---------------------------------------------------------------------------
// Reading overrides back + layered lookup.
// ---------------------------------------------------------------------------

/** Read and validate the overrides file. Returns [] when absent/corrupt. */
export function readOverrides(overridesPath: string = defaultOverridesPath()): LearnedCell[] {
  try {
    if (!existsSync(overridesPath)) return [];
    const parsed = JSON.parse(readFileSync(overridesPath, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") return [];
    const cellsRaw = (parsed as OverridesFile).cells;
    if (!Array.isArray(cellsRaw)) return [];
    const out: LearnedCell[] = [];
    for (const c of cellsRaw) {
      if (!c || typeof c !== "object") continue;
      const cell = c as Partial<LearnedCell>;
      const score = validScore(cell.score);
      if (
        typeof cell.model !== "string" ||
        typeof cell.category !== "string" ||
        score === null ||
        cell.source !== LEARNED_SOURCE ||
        typeof cell.datapoints !== "number" ||
        cell.datapoints < MIN_DATAPOINTS
      ) {
        continue; // refuse to surface a malformed / under-threshold override
      }
      out.push({
        model: cell.model,
        category: cell.category,
        score,
        source: LEARNED_SOURCE,
        measured: true,
        confidence: "low",
        datapoints: cell.datapoints,
        as_of: typeof cell.as_of === "string" ? cell.as_of : "",
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Override-aware single-cell lookup: prefers a learned override when present,
 * else falls back to the cited baseline cell from specialization-matrix.
 *
 * A learned cell is returned in the matrix's SpecializationCell shape with
 * source:"adaptive-learned" so provenance stays honest — it is NEVER presented
 * as a cited benchmark.  Returns the baseline cell (or null for an off-roster
 * model/category) when no override exists.
 *
 * The overrides list can be passed in (already read) to avoid re-reading the
 * file on every call; otherwise it is read from `overrides_path`.
 */
export function getLearnedCell(
  model: string,
  category: string,
  opts: { overrides?: LearnedCell[]; overrides_path?: string } = {},
): SpecializationCell | null {
  const overrides = opts.overrides ?? readOverrides(opts.overrides_path);
  const hit = overrides.find((c) => c.model === model && c.category === category);
  if (hit) {
    return {
      score: hit.score,
      source: LEARNED_SOURCE, // honest provenance — not a benchmark name
      measured: true,
      confidence: "low",
      as_of: hit.as_of || undefined,
    };
  }
  // Fall back to the cited baseline matrix (returns null only when off-roster).
  return getCell(model, category as (typeof TASK_CATEGORIES)[number]);
}

// ---------------------------------------------------------------------------
// Drift report: learned vs baseline.
// ---------------------------------------------------------------------------

export interface DriftRow {
  model: string;
  category: string;
  /** Learned EWMA score (always present — these are the learned cells). */
  learned_score: number;
  /** Baseline cited score, or null when the baseline cell is empty/qualitative. */
  baseline_score: number | null;
  /** learned − baseline, or null when there is no numeric baseline to compare. */
  drift: number | null;
  datapoints: number;
}

export interface DriftReport {
  /** Per learned cell, learned vs baseline. */
  rows: DriftRow[];
  /** Learned cells that have a numeric baseline to compare against. */
  comparable: number;
  /** Learned cells whose baseline was empty/qualitative (drift = null). */
  no_baseline: number;
  /** Mean absolute drift over the comparable cells, or null when none. */
  mean_abs_drift: number | null;
}

/**
 * Compare every learned override against its cited baseline.
 *
 * Honest contract: when the baseline cell is empty (unmeasured) or qualitative
 * (measured but score === null) there is nothing numeric to compare, so
 * `drift` is null — never coerced to 0.  mean_abs_drift averages ONLY the cells
 * with a real numeric baseline.
 */
export function driftReport(opts: { overrides_path?: string; overrides?: LearnedCell[] } = {}): DriftReport {
  const overrides = opts.overrides ?? readOverrides(opts.overrides_path);
  const rows: DriftRow[] = [];
  let comparable = 0;
  let no_baseline = 0;
  const absDrifts: number[] = [];

  for (const o of overrides) {
    const base = getCell(o.model, o.category as (typeof TASK_CATEGORIES)[number]);
    const baseline_score =
      base && base.measured && typeof base.score === "number" ? base.score : null;
    let drift: number | null = null;
    if (baseline_score !== null) {
      drift = Math.round((o.score - baseline_score) * 1e4) / 1e4;
      comparable++;
      absDrifts.push(Math.abs(drift));
    } else {
      no_baseline++;
    }
    rows.push({
      model: o.model,
      category: o.category,
      learned_score: o.score,
      baseline_score,
      drift,
      datapoints: o.datapoints,
    });
  }

  const mean_abs_drift =
    absDrifts.length > 0
      ? Math.round((absDrifts.reduce((a, b) => a + b, 0) / absDrifts.length) * 1e4) / 1e4
      : null;

  return { rows, comparable, no_baseline, mean_abs_drift };
}

// ---------------------------------------------------------------------------
// Thin status helper (for a future `mooter specialization status`).
// ---------------------------------------------------------------------------

export interface LearnerStatus {
  overrides_path: string;
  /** True when an overrides file exists and parsed. */
  exists: boolean;
  /** Number of learned cells currently on disk. */
  learned_cells: number;
  /** When the overrides were last generated (from the file), or null. */
  generated_at: string | null;
  alpha: number;
  min_datapoints: number;
}

/**
 * Cheap status snapshot for the CLI / dashboard — reads the overrides file once.
 * Never throws; reports honest zeros when the file is absent.
 */
export function learnerStatus(overridesPath: string = defaultOverridesPath()): LearnerStatus {
  let exists = false;
  let generated_at: string | null = null;
  let learned_cells = 0;
  try {
    if (existsSync(overridesPath)) {
      const parsed = JSON.parse(readFileSync(overridesPath, "utf8")) as Partial<OverridesFile>;
      if (parsed && typeof parsed === "object") {
        exists = true;
        generated_at = typeof parsed.generated_at === "string" ? parsed.generated_at : null;
        learned_cells = Array.isArray(parsed.cells) ? parsed.cells.length : 0;
      }
    }
  } catch {
    exists = false;
  }
  return {
    overrides_path: overridesPath,
    exists,
    learned_cells,
    generated_at,
    alpha: EWMA_ALPHA,
    min_datapoints: MIN_DATAPOINTS,
  };
}

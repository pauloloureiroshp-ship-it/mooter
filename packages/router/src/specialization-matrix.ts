// specialization-matrix.ts — Wave 58 model × category specialization matrix.
//
// ── WHY THIS MATRIX IS SPARSE (anti-fabrication + adaptive growth) ───────────
//
// The matrix is 14 models × 24 categories = 336 logical cells.  The vast
// majority start EMPTY ({ score: null, source: "unknown", measured: false }).
// This is a deliberate design choice, not an oversight:
//
//   1. ANTI-FABRICATION (DOCTRINE V4 #5).  Mooter's brand is honest pricing and
//      honest capability claims.  We seed ONLY the cells for which a real,
//      cited benchmark exists (read from the Wave 58 benchmark seed via
//      benchmark-fetcher's loadBenchmarks()).  We never invent a score to make
//      the matrix look "complete".  An empty cell is the truthful state of our
//      knowledge — most (model, category) pairs simply have no public,
//      category-aligned benchmark, and pretending otherwise would be a NO-SHIP.
//
//   2. ADAPTIVE GROWTH (A.12 adaptive-learner).  The empty cells are not dead
//      space — they are the workspace for the adaptive learner, which fills
//      them over time from REAL routing outcomes (user feedback + measured
//      quality on this user's own traffic).  A learned cell carries
//      source: "adaptive" and measured: true once enough observations exist.
//      So the matrix densifies organically, per install, grounded in evidence —
//      never by fabrication.
//
// The UI can therefore say, honestly, "N of 336 cells measured" (coverageStats).
//
// ── SHAPE ────────────────────────────────────────────────────────────────────
//
//   matrix[model][category] = SpecializationCell {
//     score:      number | null   // [0,1]; null = cited-but-qualitative OR empty
//     source:     string          // "unknown" for empty cells; otherwise the
//                                  //   benchmark name / "adaptive" / etc.
//     measured:   boolean         // true only when a real source backs the cell
//     confidence?: "high"|"medium"|"low"  // proxy-mapping confidence (seeded)
//     as_of?:     string          // when the score was established
//   }
//
// SEED SOURCE: ~/.mooter/benchmarks-overrides.json + data/benchmark-seed-2026.json
// (companion to docs/strategy/BENCHMARK_SOURCES_2026.md), loaded through
// benchmark-fetcher.loadBenchmarks().  Only `measured` cells from that merge get
// a score here; every other cell is the empty sentinel above.
//
// §13.3 INVARIANT: numeric scores are raw provider-reported values in [0,1].
// null is the ONLY substitute when a benchmark is cited but has no numeric
// score.  Never interpolate; never fabricate.

import { TASK_CATEGORIES, type TaskCategory } from "./task-categories.ts";
import { loadBenchmarks, type BenchmarkCell } from "./benchmark-fetcher.ts";

// ---------------------------------------------------------------------------
// Models — the Wave 58 roster.
//
// The product copy labels this "12 models"; the honest count is 14 (the brief
// over-counts under a marketing "12" label — we cover ALL 14 and report the
// real number).  qwen3-30b is the local (free) model.
// ---------------------------------------------------------------------------

export const MATRIX_MODELS = [
  "claude-opus-4-6",
  "claude-opus-4-7",
  "claude-opus-4-8",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "claude-fable-5",
  "gpt-5",
  "gpt-5-3-codex",
  "gpt-oss",
  "gemini-3.1-pro",
  "deepseek-v3.2",
  "minimax",
  "qwen3.6",
  "qwen3-30b",
] as const;

export type MatrixModel = (typeof MATRIX_MODELS)[number];

// ---------------------------------------------------------------------------
// Cell type
// ---------------------------------------------------------------------------

/**
 * A single (model, category) cell in the specialization matrix.
 *
 * Empty cells use { score: null, source: "unknown", measured: false } — they are
 * intentionally blank, to be filled by the adaptive learner (A.12) from real
 * outcomes.  A null `score` on a *measured* cell means the benchmark is cited
 * but only qualitative (no numeric score) — distinct from an empty cell, which
 * is unmeasured entirely.
 */
export interface SpecializationCell {
  /** Numeric score in [0, 1], or null (qualitative-only OR empty). */
  score: number | null;
  /** Benchmark name / "adaptive" / "unknown" for empty cells. */
  source: string;
  /** true only when a real source backs the cell; false for empty cells. */
  measured: boolean;
  /** Proxy-mapping confidence when the benchmark is a proxy for the category. */
  confidence?: "high" | "medium" | "low";
  /** When the score was established (e.g. "2026-06"). */
  as_of?: string;
}

/** The full matrix: matrix[model][category]. */
export type SpecializationMatrix = Record<string, Record<string, SpecializationCell>>;

// ---------------------------------------------------------------------------
// Empty-cell sentinel
// ---------------------------------------------------------------------------

/** The canonical empty cell — intentionally blank, awaiting adaptive learning. */
function emptyCell(): SpecializationCell {
  return { score: null, source: "unknown", measured: false };
}

// ---------------------------------------------------------------------------
// Build the matrix (once, lazily) from the benchmark seed.
// ---------------------------------------------------------------------------

let _matrix: SpecializationMatrix | null = null;

/** Composite key matching benchmark-fetcher's internal dedup key. */
function key(model: string, category: string): string {
  return `${model}\0${category}`;
}

/**
 * Construct a fully dense matrix where every (model, category) starts as an
 * empty cell, then overlay the MEASURED cells from the benchmark seed.
 *
 * Only cells with `measured: true` from loadBenchmarks() are overlaid; an
 * unmeasured/estimated benchmark cell is ignored here (the matrix's "measured"
 * surface must stay honest — estimates do not count as measurements).
 *
 * Seed cells for a model or category outside the Wave 58 roster/taxonomy are
 * silently skipped (forward-compatible: a future seed can name new ids without
 * breaking this build).
 */
function buildMatrix(): SpecializationMatrix {
  const matrix: SpecializationMatrix = {};

  // 1. Dense empty scaffold — every model × every category.
  for (const model of MATRIX_MODELS) {
    matrix[model] = {};
    for (const category of TASK_CATEGORIES) {
      matrix[model][category] = emptyCell();
    }
  }

  // 2. Overlay measured seed cells.
  const { cells } = loadBenchmarks();
  const modelSet: ReadonlySet<string> = new Set(MATRIX_MODELS);
  const categorySet: ReadonlySet<string> = new Set(TASK_CATEGORIES);

  for (const cell of cells) {
    if (!cell.measured) continue; // estimates never enter the measured surface
    if (!modelSet.has(cell.model)) continue; // outside the roster
    if (!categorySet.has(cell.category)) continue; // outside the taxonomy

    matrix[cell.model][cell.category] = seedCellToMatrixCell(cell);
  }

  return matrix;
}

/** Project a benchmark seed cell onto the matrix cell shape (no fabrication). */
function seedCellToMatrixCell(cell: BenchmarkCell): SpecializationCell {
  const out: SpecializationCell = {
    score: cell.score, // number | null — passed through verbatim
    source: cell.source,
    measured: true,
  };
  if (cell.confidence) out.confidence = cell.confidence;
  if (cell.as_of) out.as_of = cell.as_of;
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * The full matrix — built once, cached.  Always dense (every model × category
 * present); empty cells are the explicit sentinel, not missing keys.
 */
export function getMatrix(): SpecializationMatrix {
  if (_matrix) return _matrix;
  _matrix = buildMatrix();
  return _matrix;
}

/**
 * Look up a single (model, category) cell.
 *
 * Returns the empty sentinel ({ score: null, source: "unknown", measured: false })
 * for any in-roster model + in-taxonomy category that has no measured seed.
 * Returns null ONLY when the model or category is outside the Wave 58
 * roster/taxonomy entirely — that is a programming error, not an empty cell.
 */
export function getCell(model: string, category: TaskCategory): SpecializationCell | null {
  const m = getMatrix();
  const row = m[model];
  if (!row) return null; // model not in roster
  return row[category] ?? null; // category not in taxonomy → null
}

// ---------------------------------------------------------------------------
// Coverage — so the UI can honestly report "N of <total> cells measured".
// ---------------------------------------------------------------------------

export interface CoverageStats {
  /** 14 × 24 = 336. */
  total_cells: number;
  /** Cells backed by a real measurement (measured: true). */
  measured_cells: number;
  /** Empty cells awaiting adaptive learning (measured: false). */
  empty_cells: number;
  /** measured_cells / total_cells, rounded to 4 decimals (0..1). */
  coverage: number;
  /** Whole-number percentage for display: round(coverage * 100). */
  coverage_pct: number;
  /** Of the measured cells, how many carry a numeric score (vs qualitative null). */
  measured_with_score: number;
  /** Of the measured cells, how many are qualitative-only (score === null). */
  measured_qualitative: number;
  /** Per-model count of measured cells (for per-row UI bars). */
  by_model: Record<string, number>;
  /** Per-category count of measured cells (for per-column UI bars). */
  by_category: Record<string, number>;
}

/**
 * Honest coverage report over the full matrix.
 *
 * The headline the UI should surface is `measured_cells of total_cells`
 * (e.g. "13 of 336 cells measured") — never round the sparse reality up.
 */
export function coverageStats(): CoverageStats {
  const m = getMatrix();
  const total_cells = MATRIX_MODELS.length * TASK_CATEGORIES.length;

  let measured_cells = 0;
  let measured_with_score = 0;
  let measured_qualitative = 0;
  const by_model: Record<string, number> = {};
  const by_category: Record<string, number> = {};

  for (const model of MATRIX_MODELS) {
    by_model[model] = 0;
    for (const category of TASK_CATEGORIES) {
      const cell = m[model][category];
      if (!cell.measured) continue;
      measured_cells++;
      by_model[model]++;
      by_category[category] = (by_category[category] ?? 0) + 1;
      if (cell.score === null) measured_qualitative++;
      else measured_with_score++;
    }
  }

  const coverage = total_cells > 0 ? Number((measured_cells / total_cells).toFixed(4)) : 0;

  return {
    total_cells,
    measured_cells,
    empty_cells: total_cells - measured_cells,
    coverage,
    coverage_pct: Math.round(coverage * 100),
    measured_with_score,
    measured_qualitative,
    by_model,
    by_category,
  };
}

// Re-export the key helper for callers that build their own dedup maps.
export { key as cellKey };

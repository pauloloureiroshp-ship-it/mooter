// benchmark-fetcher.ts — Wave 58 benchmark matrix loader (A.16: MANUAL CURATION ONLY).
//
// Design decision A.16 (2026-06-12): no HTML scraping, no new dependencies.
// Benchmarks grow via two curation paths — both are file reads, never network:
//
//   1. docs/strategy/BENCHMARK_SOURCES_2026.md companion JSON  (repo-controlled)
//      Path: <repo>/data/benchmark-seed-2026.json  — ships with each release.
//      Populated by the team from cited, confirmed benchmark reports.
//
//   2. ~/.mooter/benchmarks-overrides.json  (user-local overrides)
//      User (or `mooter benchmark-update`) writes here to add/correct cells.
//      Always takes precedence over the repo seed for the same (model, category)
//      composite key.
//
// FUTURE SCRAPING SEAM (disabled):
//   A future async fn `_scrapeRemoteSources(sources: ScrapingSource[])` would
//   fetch leaderboard URLs, parse vendor-specific HTML, and write to a third
//   layer (local cache) below the overrides. It is not implemented here to keep
//   the Wave 58 scope clean and avoid a network dependency that would break
//   offline installs. The `BenchmarkCell.source_url` field is pre-populated so
//   the scraper would know exactly which URL to revisit per cell. Integration
//   point: after merging that layer, call `_scrapeRemoteSources(SCRAPING_SOURCES)`
//   inside `refreshBenchmarks()` and merge results at the lowest priority level.
//
// CONTRACT:
//   loadBenchmarks()    — sync merge of seed + overrides; degrades gracefully.
//   refreshBenchmarks() — re-reads both files and reports cell counts + any
//                         update notes. Never touches the network.
//
// §13.3 INVARIANT: all numeric scores are the raw provider-reported values (0–1).
// null is the ONLY substitute when the benchmark is cited but no numeric score
// exists (qualitative-only results). Never interpolate; never fabricate.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** All 24 routing categories — kept in sync with the matrix engine constants. */
export type Category =
  | "coding.frontend"
  | "coding.backend"
  | "coding.data"
  | "coding.infra"
  | "coding.security"
  | "coding.competitive"
  | "coding.refactor"
  | "coding.test"
  | "coding.debug"
  | "reasoning.math"
  | "reasoning.science"
  | "reasoning.general"
  | "reasoning.agentic"
  | "writing.prose-pt-pt"
  | "writing.prose-en"
  | "writing.structured"
  | "writing.translation"
  | "agents.coordinator"
  | "agents.implementor"
  | "agents.reviewer"
  | "context.large"
  | "context.small"
  | "context.multimodal"
  | "context.audio";

/** All 17 (keep in sync with MATRIX_MODELS). */
export type ModelId =
  | "claude-opus-4-6"
  | "claude-opus-4-7"
  | "claude-opus-4-8"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5"
  | "claude-fable-5"
  | "gpt-5"
  | "gpt-5-3-codex"
  | "gpt-oss"
  | "gemini-3.1-pro"
  | "gemini-3-flash"
  | "deepseek-v3.2"
  | "deepseek-v4-pro"
  | "minimax"
  | "kimi-k2.6"
  | "qwen3.6"
  | "qwen3-30b";

/**
 * A single measured cell in the benchmark matrix.
 * score === null means the result is qualitative (cited but not numeric).
 * measured: true  → a real source was cited; do not further qualify.
 * measured: false → estimated / interpolated — use with caution.
 */
export interface BenchmarkCell {
  model: string; // typically ModelId, but open to new models
  category: string; // typically Category, but open to new categories
  /** Numeric score in [0, 1] or null for qualitative-only results. */
  score: number | null;
  source: string;
  source_url: string;
  mapping_note?: string;
  /** Confidence level when the benchmark is a proxy for the category. */
  confidence?: "high" | "medium" | "low";
  measured: boolean;
  as_of?: string;
}

/** The top-level shape expected from both the seed and the overrides file. */
interface RawBenchmarkFile {
  _meta?: Record<string, unknown>;
  cells: BenchmarkCell[];
}

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------

/**
 * Seed file: ships in the repo alongside the pricing snapshot.
 * packages/router/src/benchmark-fetcher.ts → <repo>/data/benchmark-seed-2026.json
 */
function seedFilePath(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    return join(here, "..", "..", "..", "data", "benchmark-seed-2026.json");
  } catch {
    // Bundled context — fall back to env or reasonable default.
    const repoRoot = process.env.MOOTER_REPO_ROOT ?? ".";
    return join(repoRoot, "data", "benchmark-seed-2026.json");
  }
}

/** User-local overrides: ~/.mooter/benchmarks-overrides.json */
function overridesFilePath(): string {
  const home = homedir();
  return join(home, ".mooter", "benchmarks-overrides.json");
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

function readJsonFile(path: string): RawBenchmarkFile | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("cells" in parsed) ||
      !Array.isArray((parsed as RawBenchmarkFile).cells)
    ) {
      return null;
    }
    return parsed as RawBenchmarkFile;
  } catch {
    return null;
  }
}

/** Composite key for deduplication: model + "\0" + category. */
function cellKey(cell: BenchmarkCell): string {
  return `${cell.model}\0${cell.category}`;
}

/**
 * Merge a list of cell layers — rightmost layer wins for duplicate
 * (model, category) pairs (i.e. overrides beat the seed).
 */
function mergeLayers(layers: BenchmarkCell[][]): BenchmarkCell[] {
  const map = new Map<string, BenchmarkCell>();
  for (const layer of layers) {
    for (const cell of layer) {
      map.set(cellKey(cell), cell);
    }
  }
  return Array.from(map.values());
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Notes returned by load / refresh to describe the merge result. */
export interface BenchmarkNotes {
  seed_cells: number;
  override_cells: number;
  merged_cells: number;
  seed_missing: boolean;
  overrides_missing: boolean;
  manual_update_hint?: string;
}

export interface BenchmarkResult {
  cells: BenchmarkCell[];
  notes: BenchmarkNotes;
}

/**
 * Load and merge the benchmark matrix.
 *
 * Priority (highest wins): user overrides → repo seed.
 * Missing files degrade gracefully — the function never throws.
 *
 * Usage:
 *   const { cells, notes } = loadBenchmarks();
 *   // cells is the merged set; iterate or index by (model, category).
 */
export function loadBenchmarks(): BenchmarkResult {
  const seedPath = seedFilePath();
  const overridesPath = overridesFilePath();

  const seedFile = readJsonFile(seedPath);
  const overridesFile = readJsonFile(overridesPath);

  const seedCells = seedFile?.cells ?? [];
  const overrideCells = overridesFile?.cells ?? [];

  const merged = mergeLayers([seedCells, overrideCells]);

  const seedMissing = seedFile === null;
  const overridesMissing = overridesFile === null;

  const notes: BenchmarkNotes = {
    seed_cells: seedCells.length,
    override_cells: overrideCells.length,
    merged_cells: merged.length,
    seed_missing: seedMissing,
    overrides_missing: overridesMissing,
  };

  if (seedMissing && overridesMissing) {
    notes.manual_update_hint =
      `No benchmark data found. Seed expected at: ${seedPath}. ` +
      `User overrides expected at: ${overridesPath}. ` +
      `Add real cited cells to ${overridesPath} (see docs/strategy/BENCHMARK_SOURCES_2026.md).`;
  } else if (seedMissing) {
    notes.manual_update_hint =
      `Repo seed file missing (${seedPath}) — only user overrides loaded. ` +
      `To add seeded cells: update ${overridesPath} following the format in docs/strategy/BENCHMARK_SOURCES_2026.md.`;
  } else if (overridesMissing) {
    notes.manual_update_hint =
      `User overrides file not found at ${overridesPath}. ` +
      `Create it to add or correct benchmark cells locally ` +
      `(see docs/strategy/BENCHMARK_SOURCES_2026.md §How to Add a Cell).`;
  }

  return { cells: merged, notes };
}

/**
 * Re-read both source files and report current counts.
 *
 * This is the implementation of `mooter benchmark-update --dry-run` — it shows
 * what is available without touching the network or modifying any file.
 *
 * Returns the same shape as loadBenchmarks() so callers can diff old vs new.
 */
export function refreshBenchmarks(): BenchmarkResult {
  // Re-reads from disk — no cache, no network.
  return loadBenchmarks();
}

/**
 * Convenience index: look up a single (model, category) cell.
 * Returns null when the cell is absent (not an error — the matrix is sparse).
 */
export function getCell(
  cells: BenchmarkCell[],
  model: string,
  category: string,
): BenchmarkCell | null {
  return cells.find((c) => c.model === model && c.category === category) ?? null;
}

/**
 * All cells for a given model (useful for per-model capability summaries).
 */
export function getCellsForModel(cells: BenchmarkCell[], model: string): BenchmarkCell[] {
  return cells.filter((c) => c.model === model);
}

/**
 * All cells for a given category (useful for head-to-head model comparisons).
 */
export function getCellsForCategory(
  cells: BenchmarkCell[],
  category: string,
): BenchmarkCell[] {
  return cells.filter((c) => c.category === category);
}

// ---------------------------------------------------------------------------
// FUTURE SCRAPING SEAM (disabled — A.16)
// ---------------------------------------------------------------------------
//
// When a scraping layer is eventually added, implement:
//
//   interface ScrapingSource {
//     url: string;
//     provider: string;         // "anthropic" | "openai" | "google" | ...
//     parser: "swebench_leaderboard" | "openai_evals" | "google_gemini_tech_report";
//   }
//
//   async function _scrapeRemoteSources(
//     _sources: ScrapingSource[],
//   ): Promise<BenchmarkCell[]> {
//     // 1. fetch(source.url) — requires allow-list in project permissions
//     // 2. parse HTML via cheerio or a vendor-specific JSON API
//     // 3. map provider rows to BenchmarkCell[]
//     // 4. write to ~/.mooter/benchmarks-cache.json (not overrides — user edits win)
//     throw new Error("_scrapeRemoteSources: not yet implemented (A.16 freeze)");
//   }
//
// Integration point in refreshBenchmarks():
//   const scraped = await _scrapeRemoteSources(SCRAPING_SOURCES);
//   return mergeLayers([seedCells, scraped, overrideCells]);
//   // priority: overrides > scrape cache > seed
//
// Zero new deps needed: Node 22+ fetch() is available; cheerio is the one dep
// to add when this lands. Add it to packages/router/package.json devDependencies.

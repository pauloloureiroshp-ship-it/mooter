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

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
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
function overridesFilePath(home: string = homedir()): string {
  return join(home, ".mooter", "benchmarks-overrides.json");
}

/** Public path accessor — so a writer (e.g. `mooter benchmarks refresh --from-hub`)
 *  targets the exact same file the loader reads. Honest single-source-of-truth. */
export function benchmarkOverridesPath(home: string = homedir()): string {
  return overridesFilePath(home);
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

// ---------------------------------------------------------------------------
// Override ingestion (A.16 v2 — data-only writes from the curated hub).
// ---------------------------------------------------------------------------

/**
 * Normalise an arbitrary cell-like object into a strict BenchmarkCell, refusing
 * to fabricate: a non-finite/out-of-range score collapses to null (qualitative),
 * and `measured` is preserved as the source declared it. Cells missing a model
 * or category are dropped (they cannot key into the matrix).
 *
 * This is the ONLY place hub-supplied cells are coerced, so the §13.3 invariant
 * (raw provider score in [0,1] or null — never interpolated) is enforced once.
 */
export function normalizeHubCell(raw: unknown): BenchmarkCell | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.model !== "string" || typeof o.category !== "string") return null;
  const scoreOk =
    typeof o.score === "number" && Number.isFinite(o.score) && o.score >= 0 && o.score <= 1;
  const cell: BenchmarkCell = {
    model: o.model,
    category: o.category,
    score: scoreOk ? (o.score as number) : null, // never fabricate a numeric score
    source: typeof o.source === "string" ? o.source : "hub",
    source_url: typeof o.source_url === "string" ? o.source_url : "",
    measured: o.measured === true, // only a cited source counts as measured
  };
  if (o.confidence === "high" || o.confidence === "medium" || o.confidence === "low") {
    cell.confidence = o.confidence;
  }
  if (typeof o.as_of === "string") cell.as_of = o.as_of;
  if (typeof o.mapping_note === "string") cell.mapping_note = o.mapping_note;
  return cell;
}

/**
 * Write a set of cells to the user-local overrides file, preserving the exact
 * shape the loader reads back. Used by `mooter benchmarks refresh --from-hub`.
 *
 * Honest by construction:
 *   - cells are run through normalizeHubCell (no fabricated numerics);
 *   - the _meta block records provenance (source + as_of + count) so a reader
 *     can always tell where the local overrides came from;
 *   - writes are atomic-enough for this use (single writeFileSync) and create
 *     the ~/.mooter directory if absent. Never throws on a malformed cell — it
 *     is simply skipped.
 *
 * Returns the count actually written (after normalisation/dropping).
 */
export function writeBenchmarkOverrides(
  cells: unknown[],
  meta: { source: string; as_of: string },
  home: string = homedir(),
): { written: number; path: string } {
  const normalized = cells
    .map(normalizeHubCell)
    .filter((c): c is BenchmarkCell => c !== null);
  const path = overridesFilePath(home);
  const body: RawBenchmarkFile = {
    _meta: {
      description:
        "User-local benchmark overrides, written by `mooter benchmarks refresh --from-hub` (A.16 v2, data-only). " +
        "Takes precedence over the repo seed. Numeric scores are raw provider values or null — never fabricated.",
      source: meta.source,
      as_of: meta.as_of,
      written_cells: normalized.length,
    },
    cells: normalized,
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(body, null, 2) + "\n");
  return { written: normalized.length, path };
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

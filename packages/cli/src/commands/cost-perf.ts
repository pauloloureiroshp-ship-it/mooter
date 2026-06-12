// `mooter cost-perf` + `mooter benchmarks` — Wave 58 batch 3.
//
// Two thin CLI commands over existing Wave 58 batch 1/2 engines:
//
//   mooter cost-perf report [--last 7d|30d|Nd] [--json]
//     → per-category breakdown + drift + Pareto, via tools/router/cost-perf-tracker.js
//       (CommonJS module; loaded with a lazy createRequire to keep the ESM CLI
//        load-safe; mirrors the workflow.ts pattern for native/CommonJS deps).
//
//   mooter benchmarks refresh [--json]
//     → re-reads seed + overrides, prints cell counts + manual-update hint.
//
//   mooter benchmarks list [--model <m>] [--category <c>] [--json]
//     → seeded cells from loadBenchmarks(), with coverage summary.
//
// Anti-fabrication (Doctrine V4 #5):
//   - Unknown numerics are surfaced as "?" not invented zeros.
//   - Drift is only shown when BOTH expected and actual are known.
//   - Empty log or missing files → honest empty-state message, never a fake row.
//
// Lazy import pattern: the CommonJS cost-perf-tracker.js and the ESM router
// module are only required/imported after subcommand + argument validation, so
// every no-arg / --help path never touches them.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export interface CmdResult {
  exitCode: number;
  output: string;
}

// ── arg parsing ─────────────────────────────────────────────────────────────

interface Parsed {
  positional: string[];
  flags: Record<string, string | boolean>;
}
function parseArgs(args: string[]): Parsed {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

// ── --last parsing ───────────────────────────────────────────────────────────

/**
 * Parse a --last value like "7d", "30d", or bare "7" into a day count.
 * Returns null when the input is unrecognisable (honest — never defaults silently).
 */
export function parseLastDays(raw: string | boolean | undefined): number | null {
  if (raw === undefined || raw === true) return null; // no value
  const s = String(raw).trim().toLowerCase();
  // "7d", "30d", "1d"
  const m = s.match(/^(\d+)d?$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ── lazy CommonJS tracker loader ─────────────────────────────────────────────

/**
 * Lazy-load cost-perf-tracker.js (CommonJS) via createRequire. Resolves relative
 * to this file: packages/cli/src/commands/ → ../../../../tools/router/
 * Returns null when the module cannot be found (honest — not a crash).
 */
function loadTracker(): null | { reportCostPerf: (opts: { last_days: number }) => unknown } {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const trackerPath = join(here, "..", "..", "..", "..", "tools", "router", "cost-perf-tracker.js");
    const req = createRequire(import.meta.url);
    return req(trackerPath) as { reportCostPerf: (opts: { last_days: number }) => unknown };
  } catch {
    return null;
  }
}

// ── lazy ESM benchmark-fetcher loader ────────────────────────────────────────

async function loadFetcher() {
  // Dynamic import avoids pulling the router into the CLI bundle top-level.
  const mod = await import("../../../router/src/benchmark-fetcher.ts");
  return mod;
}

// ── cost-perf formatters ─────────────────────────────────────────────────────

function fmtUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v as number)) return "?";
  return `$${(v as number).toFixed(4)}`;
}

function fmtScore(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v as number)) return "?";
  return (v as number).toFixed(3);
}

function fmtMs(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v as number)) return "?";
  return `${Math.round(v as number)}ms`;
}

function fmtDrift(v: number | null | undefined, fmt: (x: number | null | undefined) => string): string {
  if (v == null || !Number.isFinite(v as number)) return "?";
  const sign = (v as number) >= 0 ? "+" : "";
  return `${sign}${fmt(v)}`;
}

// ── report renderer ──────────────────────────────────────────────────────────

interface CategoryRow {
  category: string;
  count: number;
  model_chosen: string | null;
  expected_cost: number | null;
  actual_cost: number | null;
  cost_drift: number | null;
  expected_score: number | null;
  actual_score: number | null;
  score_drift: number | null;
  expected_duration_ms: number | null;
  actual_duration_ms: number | null;
  duration_drift: number | null;
}

interface ParetoSection {
  top_cost_category: string | null;
  top_cost_share: number | null;
  insight: string | null;
}

interface ReportShape {
  window_days: number;
  since: string | null;
  total: number;
  totals: {
    expected_cost: number;
    actual_cost: number;
    cost_drift: number | null;
  };
  categories: CategoryRow[];
  pareto: ParetoSection;
}

function renderReport(report: ReportShape): string {
  const lines: string[] = [];
  lines.push(`mooter cost-perf report  (last ${report.window_days}d · ${report.total} turns)`);
  if (report.total === 0) {
    lines.push("");
    lines.push("  No entries in the window. Run some prompts first.");
    lines.push("  Journal: ~/.mooter/cost-perf-log.jsonl");
    return lines.join("\n");
  }

  if (report.since) {
    lines.push(`  since ${report.since}`);
  }

  lines.push("");
  lines.push("Totals:");
  lines.push(`  expected  ${fmtUsd(report.totals.expected_cost)}`);
  lines.push(`  actual    ${fmtUsd(report.totals.actual_cost)}`);
  lines.push(`  drift     ${fmtDrift(report.totals.cost_drift, fmtUsd)}`);

  if (report.categories.length > 0) {
    lines.push("");
    lines.push("Per-category breakdown:");
    const hdr =
      "  category".padEnd(28) +
      "turns".padStart(6) +
      "  model".padEnd(22) +
      "exp$".padStart(9) +
      "act$".padStart(9) +
      "drift$".padStart(9) +
      "  exp.score".padStart(10) +
      "act.score".padStart(10) +
      "  exp.dur".padStart(10) +
      "act.dur".padStart(8);
    lines.push(hdr);
    lines.push("  " + "-".repeat(hdr.length - 2));

    for (const cat of report.categories) {
      const model = (cat.model_chosen ?? "?").slice(0, 18);
      const row =
        `  ${cat.category.padEnd(26)}` +
        `${String(cat.count).padStart(6)}` +
        `  ${model.padEnd(20)}` +
        `${fmtUsd(cat.expected_cost).padStart(9)}` +
        `${fmtUsd(cat.actual_cost).padStart(9)}` +
        `${fmtDrift(cat.cost_drift, fmtUsd).padStart(9)}` +
        `  ${fmtScore(cat.expected_score).padStart(8)}` +
        `${fmtScore(cat.actual_score).padStart(10)}` +
        `  ${fmtMs(cat.expected_duration_ms).padStart(8)}` +
        `${fmtMs(cat.actual_duration_ms).padStart(8)}`;
      lines.push(row);
    }
  }

  if (report.pareto.insight) {
    lines.push("");
    lines.push(`Pareto: ${report.pareto.insight}`);
  }

  return lines.join("\n");
}

// ── mooter cost-perf ─────────────────────────────────────────────────────────

const COST_PERF_USAGE = `mooter cost-perf — cost / performance journal (Wave 58)

Usage:
  mooter cost-perf report [--last <Nd>] [--json]
      Per-category breakdown with expected vs actual cost, score and duration drift.
      Pareto insight: which category drives the most realized spend.
      --last  window (default 30d); accepts "7d", "30d", "90d", or bare "7"
      --json  raw JSON for scripting

Journal: ~/.mooter/cost-perf-log.jsonl (appended by the SubagentStop hook)`;

export async function runCostPerf(args: string[]): Promise<CmdResult> {
  const [sub, ...rest] = args;

  if (!sub || sub === "help" || sub === "--help" || sub === "-h") {
    return { exitCode: 0, output: COST_PERF_USAGE };
  }

  if (sub === "report") {
    const { flags } = parseArgs(rest);

    const rawLast = flags["last"];
    const lastDays = rawLast !== undefined ? (parseLastDays(rawLast) ?? 30) : 30;
    const asJson = flags["json"] === true;

    const tracker = loadTracker();
    if (!tracker) {
      return {
        exitCode: 1,
        output:
          "mooter cost-perf: cannot load cost-perf-tracker.js. " +
          "Run from a source checkout (frugal-wave56/tools/router/ must be present).",
      };
    }

    const report = tracker.reportCostPerf({ last_days: lastDays }) as ReportShape;

    if (asJson) {
      return { exitCode: 0, output: JSON.stringify(report, null, 2) };
    }

    return { exitCode: 0, output: renderReport(report) };
  }

  return {
    exitCode: 1,
    output: `mooter cost-perf: unknown subcommand '${sub}'\n\n${COST_PERF_USAGE}`,
  };
}

// ── mooter benchmarks ────────────────────────────────────────────────────────

const BENCHMARKS_USAGE = `mooter benchmarks — benchmark matrix viewer (Wave 58)

Usage:
  mooter benchmarks refresh [--json]
      Re-read seed + user overrides, report cell counts and any manual-update hint.
      No network — manual curation only (A.16).

  mooter benchmarks list [--model <id>] [--category <cat>] [--json]
      Show seeded cells and overall coverage (N of 336 logical cells measured).
      --model     filter to one model (e.g. --model claude-opus-4-6)
      --category  filter to one category (e.g. --category coding.frontend)
      --json      raw JSON for scripting

Seed: <repo>/data/benchmark-seed-2026.json
Overrides: ~/.mooter/benchmarks-overrides.json
See: docs/strategy/BENCHMARK_SOURCES_2026.md`;

function renderBenchmarkList(
  cells: Array<{
    model: string;
    category: string;
    score: number | null;
    source: string;
    measured: boolean;
    confidence?: string;
    as_of?: string;
  }>,
  totalLogical: number,
): string {
  const lines: string[] = [];
  const measured = cells.filter((c) => c.measured);
  lines.push(`mooter benchmarks list  (${measured.length} measured of ${totalLogical} logical cells)`);

  if (cells.length === 0) {
    lines.push("");
    lines.push("  No cells match the filter.");
    return lines.join("\n");
  }

  if (measured.length === 0) {
    lines.push("");
    lines.push("  No measured cells yet. Add data to:");
    lines.push("    ~/.mooter/benchmarks-overrides.json");
    lines.push("  See: docs/strategy/BENCHMARK_SOURCES_2026.md §How to Add a Cell");
    return lines.join("\n");
  }

  lines.push("");
  const hdr =
    "  model".padEnd(28) +
    "category".padEnd(26) +
    "score".padStart(7) +
    "  conf".padStart(8) +
    "  source".padEnd(32) +
    "as_of";
  lines.push(hdr);
  lines.push("  " + "-".repeat(hdr.length - 2));

  for (const c of cells) {
    if (!c.measured) continue;
    const score = c.score == null ? "null" : c.score.toFixed(3);
    const conf = (c.confidence ?? "").slice(0, 6);
    const source = (c.source ?? "").slice(0, 30);
    const as_of = c.as_of ?? "";
    lines.push(
      `  ${c.model.slice(0, 26).padEnd(26)}` +
        `  ${c.category.slice(0, 24).padEnd(24)}` +
        `${score.padStart(7)}` +
        `  ${conf.padEnd(6)}` +
        `  ${source.padEnd(30)}` +
        `  ${as_of}`,
    );
  }

  // Coverage summary
  lines.push("");
  const pct = totalLogical > 0 ? ((measured.length / totalLogical) * 100).toFixed(1) : "?";
  lines.push(`Coverage: ${measured.length}/${totalLogical} cells measured (${pct}%)`);

  return lines.join("\n");
}

export async function runBenchmarks(args: string[]): Promise<CmdResult> {
  const [sub, ...rest] = args;

  if (!sub || sub === "help" || sub === "--help" || sub === "-h") {
    return { exitCode: 0, output: BENCHMARKS_USAGE };
  }

  if (sub === "refresh") {
    const { flags } = parseArgs(rest);
    const asJson = flags["json"] === true;

    let fetcher: Awaited<ReturnType<typeof loadFetcher>>;
    try {
      fetcher = await loadFetcher();
    } catch {
      return {
        exitCode: 1,
        output:
          "mooter benchmarks: cannot load benchmark-fetcher. " +
          "Run from a source checkout (packages/router/src/ must be present).",
      };
    }

    const result = fetcher.refreshBenchmarks();

    if (asJson) {
      return { exitCode: 0, output: JSON.stringify(result, null, 2) };
    }

    const { notes } = result;
    const lines: string[] = [];
    lines.push("mooter benchmarks refresh");
    lines.push("");
    lines.push(`  seed cells      ${notes.seed_cells}${notes.seed_missing ? "  (file missing)" : ""}`);
    lines.push(`  override cells  ${notes.override_cells}${notes.overrides_missing ? "  (file missing)" : ""}`);
    lines.push(`  merged total    ${notes.merged_cells}`);
    if (notes.manual_update_hint) {
      lines.push("");
      lines.push("  Note: " + notes.manual_update_hint);
    } else {
      lines.push("");
      lines.push("  To add or correct cells: edit ~/.mooter/benchmarks-overrides.json");
      lines.push("  See: docs/strategy/BENCHMARK_SOURCES_2026.md §How to Add a Cell");
    }
    return { exitCode: 0, output: lines.join("\n") };
  }

  if (sub === "list") {
    const { flags } = parseArgs(rest);
    const modelFilter = typeof flags["model"] === "string" ? flags["model"] : null;
    const categoryFilter = typeof flags["category"] === "string" ? flags["category"] : null;
    const asJson = flags["json"] === true;

    let fetcher: Awaited<ReturnType<typeof loadFetcher>>;
    try {
      fetcher = await loadFetcher();
    } catch {
      return {
        exitCode: 1,
        output:
          "mooter benchmarks: cannot load benchmark-fetcher. " +
          "Run from a source checkout (packages/router/src/ must be present).",
      };
    }

    const { cells } = fetcher.loadBenchmarks();

    const filtered = cells.filter((c) => {
      if (modelFilter && c.model !== modelFilter) return false;
      if (categoryFilter && c.category !== categoryFilter) return false;
      return true;
    });

    // 14 models × 24 categories = 336
    const LOGICAL_CELLS = 14 * 24;

    if (asJson) {
      return {
        exitCode: 0,
        output: JSON.stringify(
          {
            total_logical: LOGICAL_CELLS,
            total_cells: filtered.length,
            measured_cells: filtered.filter((c) => c.measured).length,
            cells: filtered,
          },
          null,
          2,
        ),
      };
    }

    return { exitCode: 0, output: renderBenchmarkList(filtered, LOGICAL_CELLS) };
  }

  return {
    exitCode: 1,
    output: `mooter benchmarks: unknown subcommand '${sub}'\n\n${BENCHMARKS_USAGE}`,
  };
}

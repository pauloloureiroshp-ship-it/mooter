// `mooter matrix` — Wave 58 (batch 3) read-only view over the model × category
// specialization matrix + Token-Efficiency Score (TES) engine.
//
// Three subcommands, all read-only and all honest about missing data:
//
//   mooter matrix [--category <cat>]            TES table for one category
//   mooter matrix evolution --category <cat>    TES trend over a period
//        [--period 30d]
//   mooter matrix snapshot                      persist today's matrix state
//
// `--json` is accepted everywhere. The engine (packages/router/src/*) declares
// no native deps, but to keep the CLI load-safe and tests fast we still LAZY
// `import()` it only after a subcommand has valid args — exactly the pattern in
// workflow.ts. The day-file snapshot + evolution helpers live in the CommonJS
// tools/router/matrix-snapshot.js; we reach them via createRequire (the cca-f
// precedent), so this command works from a source checkout.
//
// ── NO FABRICATION (Doctrine V4 #5) ──────────────────────────────────────────
// We NEVER print a TES we did not compute from a real measured benchmark score
// and a real price. The engine (tes-calculator.computeTES) returns status
// 'pending' when the score or price is missing; this command surfaces that as
// `pending` (and `unmeasured` for an entirely empty matrix cell) — never a
// guessed number. A free local model shows its labelled-floor TES with a `free`
// tag so it is never mistaken for a priced score.

import type { CmdResult } from "./trail.ts";
// Type-only imports — erased at build, so they never pull the engine into the
// zero-runtime-deps bundle. The real values come from the lazy import() below.
import type { TaskCategory } from "../../../router/src/task-categories.ts";

// ── arg parsing (cheap; no engine import) ─────────────────────────────────────

interface Parsed {
  positional: string[];
  flags: Record<string, string | boolean>;
}
function parseArgs(rest: string[]): Parsed {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = rest[i + 1];
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

export const MATRIX_USAGE = `mooter matrix — model × category specialization matrix + Token-Efficiency Score (TES)

Usage:
  mooter matrix [--category <cat>]                TES table for a category (default: coding.backend)
  mooter matrix evolution --category <cat> [--period 30d]   TES trend from daily snapshots
  mooter matrix snapshot                          persist today's matrix state to ~/.mooter/matrix-snapshots

Flags:
  --category <cat>   one of the 24 task categories (e.g. coding.backend, reasoning.math)
  --period <Nd>      evolution window, e.g. 30d / 7d (default 30d)
  --json             machine-readable output (works on every subcommand)

TES = (benchmark_score * 100) / (cost_per_1k_in + 0.3 * cost_per_1k_out): higher = more
measured capability per dollar. Cells with no measured benchmark show 'unmeasured';
cells whose price is not yet known show 'pending'. We never print a fabricated TES.`;

const DEFAULT_CATEGORY = "coding.backend";

function err(message: string): CmdResult {
  return { exitCode: 1, output: `${message}\n\n${MATRIX_USAGE}` };
}

// ── lazy engine loaders ───────────────────────────────────────────────────────
//
// Wave 61: literal specifiers (NOT the old array.join() trick) so esbuild INLINES
// the engine into the bundled CLI — required for ~/.mooter/cli-v1 to run without
// the source tree present. Still lazy: only imported after a subcommand validates.

type MatrixMod = typeof import("../../../router/src/specialization-matrix.ts");
type TesMod = typeof import("../../../router/src/tes-calculator.ts");
type DecideMod = typeof import("../../../router/src/decide-agent.ts");
type CategoriesMod = typeof import("../../../router/src/task-categories.ts");

// Wave 61: literal specifiers so esbuild INLINES the engine into the bundled CLI.
// The previous array.join() specifiers were deliberately left unresolved by esbuild
// — which broke the installed bundle (`Cannot find module .../specialization-matrix.ts`
// from ~/.mooter/cli-v1). Still lazy: only imported after a subcommand validates args.
async function loadEngine(): Promise<{
  matrix: MatrixMod;
  tes: TesMod;
  decide: DecideMod;
  categories: CategoriesMod;
}> {
  const [matrix, tes, decide, categories] = await Promise.all([
    import("../../../router/src/specialization-matrix.ts") as Promise<MatrixMod>,
    import("../../../router/src/tes-calculator.ts") as Promise<TesMod>,
    import("../../../router/src/decide-agent.ts") as Promise<DecideMod>,
    import("../../../router/src/task-categories.ts") as Promise<CategoriesMod>,
  ]);
  return { matrix, tes, decide, categories };
}

// matrix-snapshot.js is CommonJS (tools/router runtime). Load it via
// createRequire after finding the repo file by walking up from this module.
interface MatrixSnapshotModule {
  writeSnapshot(opts?: { dir?: string; home?: string; now?: number }): {
    written: boolean;
    file: string;
    pruned: number;
    snapshot: {
      date: string;
      cells_measured: number;
      pricing_pending_count: number;
      total_routings: number;
    };
  };
  computeEvolution(opts: {
    category: string;
    period_days?: number;
    dir?: string;
    now?: number;
  }): Array<{ date: string; tes: number }>;
}

async function loadSnapshotModule(): Promise<MatrixSnapshotModule | null> {
  const { createRequire } = await import("node:module");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const { existsSync } = await import("node:fs");

  const bases: string[] = [];
  try {
    bases.push(dirname(fileURLToPath(import.meta.url)));
  } catch {
    /* bundled — cwd only */
  }
  bases.push(process.cwd());
  for (const base of bases) {
    let dir = base;
    for (let i = 0; i < 9; i++) {
      const cand = join(dir, "tools", "router", "matrix-snapshot.js");
      if (existsSync(cand)) {
        const req = createRequire(import.meta.url);
        return req(cand) as MatrixSnapshotModule;
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

// ── period parsing (e.g. "30d", "7d", "30") ───────────────────────────────────

/** Parse "Nd" / "N" → integer days. Returns null when not a positive integer. */
export function parsePeriodDays(raw: string | boolean | undefined): number | null {
  if (raw === undefined || raw === true) return null;
  const s = String(raw).trim().toLowerCase();
  const m = /^(\d+)\s*d?$/.exec(s);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ── status labelling for a single (model, category) cell ──────────────────────

export type CellStatus = "measured" | "free" | "pending" | "unmeasured";

export interface MatrixRow {
  model: string;
  /** Measured benchmark score [0,1], or null when unmeasured/qualitative. */
  score: number | null;
  /** Computed TES, or null when not computable (pending/unmeasured). */
  tes: number | null;
  status: CellStatus;
  /** Cited benchmark source for a measured cell, else null. */
  source: string | null;
}

// ── default view: TES table for one category ──────────────────────────────────

interface DecideResultShape {
  chosen_model: string | null;
  reason: string;
  tes: number | null;
  cited_source: string | null;
  coverage_note: string;
}

interface DefaultView {
  category: string;
  rows: MatrixRow[];
  /** Fable-5-inspired recommendation chain (decideAgent), honest about basis. */
  recommendation: DecideResultShape;
  coverage: {
    measured_cells_in_category: number;
    total_models: number;
  };
}

function buildDefaultView(
  category: TaskCategory,
  eng: { matrix: MatrixMod; tes: TesMod; decide: DecideMod },
): DefaultView {
  const { MATRIX_MODELS, getCell } = eng.matrix;
  const { computeTES } = eng.tes;
  const { decideAgent } = eng.decide;

  const rows: MatrixRow[] = [];
  let measuredInCategory = 0;

  for (const model of MATRIX_MODELS) {
    const cell = getCell(model, category); // null only if out of roster (won't happen)
    const measuredScore =
      cell && cell.measured && typeof cell.score === "number" ? cell.score : null;
    if (cell && cell.measured) measuredInCategory++;

    const tesResult = computeTES({ model, category, benchmark_score: measuredScore });

    let status: CellStatus;
    if (tesResult.status === "ok") status = "measured";
    else if (tesResult.status === "free") status = "free";
    else if (cell && cell.measured) status = "pending"; // measured score but price pending
    else status = measuredScore === null && !(cell && cell.measured) ? "unmeasured" : "pending";

    rows.push({
      model,
      score: measuredScore,
      tes: tesResult.tes,
      status,
      source: cell && cell.measured ? cell.source : null,
    });
  }

  // Sort: real TES desc first, then everything else (null TES) by model id so the
  // output is deterministic and the most efficient measured model is on top.
  rows.sort((a, b) => {
    const ta = a.tes;
    const tb = b.tes;
    if (ta !== null && tb !== null) {
      if (tb !== ta) return tb - ta;
      return a.model < b.model ? -1 : a.model > b.model ? 1 : 0;
    }
    if (ta !== null) return -1; // a has a TES, b doesn't → a first
    if (tb !== null) return 1;
    return a.model < b.model ? -1 : a.model > b.model ? 1 : 0;
  });

  // Fable-5-inspired recommendation chain: decideAgent picks the Pareto-optimal
  // model by TES, honest about whether it is measured or a tier heuristic.
  const decision = decideAgent({ task_category: category });
  const recommendation: DecideResultShape = {
    chosen_model: decision.chosen_model,
    reason: decision.reason,
    tes: decision.tes,
    cited_source: decision.cited_source,
    coverage_note: decision.coverage_note,
  };

  return {
    category,
    rows,
    recommendation,
    coverage: { measured_cells_in_category: measuredInCategory, total_models: MATRIX_MODELS.length },
  };
}

function fmtScore(s: number | null): string {
  return s === null ? "  —  " : s.toFixed(2);
}
function fmtTes(tes: number | null, status: CellStatus): string {
  if (status === "unmeasured") return "unmeasured";
  if (status === "pending") return "pending";
  if (tes === null) return "pending";
  return status === "free" ? `${tes} (free)` : String(tes);
}

function renderDefaultHuman(view: DefaultView): string {
  const lines: string[] = [];
  lines.push(`🎯 Matrix · TES for ${view.category}`);
  lines.push(
    `   ${view.coverage.measured_cells_in_category}/${view.coverage.total_models} models measured for this category · TES = quality per $ (higher is better)`,
  );
  lines.push("");
  lines.push(`   ${"model".padEnd(20)} ${"score".padEnd(6)} ${"TES".padEnd(14)} status`);
  for (const r of view.rows) {
    lines.push(
      `   ${r.model.padEnd(20)} ${fmtScore(r.score).padEnd(6)} ${fmtTes(r.tes, r.status).padEnd(14)} ${r.status}` +
        (r.source ? `  (${r.source})` : ""),
    );
  }
  lines.push("");
  const rec = view.recommendation;
  if (rec.chosen_model) {
    lines.push(`👉 Recommended: ${rec.chosen_model}${rec.tes !== null ? ` (TES ${rec.tes})` : ""}`);
    lines.push(`   ${rec.reason}`);
  } else {
    lines.push(`👉 Recommended: none — ${rec.reason}`);
  }
  lines.push(`   ${rec.coverage_note}`);
  lines.push("");
  lines.push("   'unmeasured' = no cited benchmark for this cell · 'pending' = price not yet known.");
  lines.push("   Mooter never prints a fabricated TES (Doctrine V4 #5).");
  return lines.join("\n");
}

async function dispatchDefault(flags: Record<string, string | boolean>): Promise<CmdResult> {
  const eng = await loadEngine();
  const requested = typeof flags.category === "string" ? flags.category : DEFAULT_CATEGORY;
  const category = eng.categories.parseTaskCategory(requested);
  if (category === null) {
    return err(
      `mooter matrix: unknown category "${requested}" — must be one of the 24 categories (e.g. ${DEFAULT_CATEGORY}, reasoning.math).`,
    );
  }

  const view = buildDefaultView(category, eng);
  if (flags.json) {
    return { exitCode: 0, output: JSON.stringify(view, null, 2) };
  }
  return { exitCode: 0, output: renderDefaultHuman(view) };
}

// ── evolution view ─────────────────────────────────────────────────────────────

function renderEvolutionHuman(
  category: string,
  periodDays: number,
  points: Array<{ date: string; tes: number }>,
): string {
  const lines: string[] = [];
  lines.push(`📈 Matrix · TES evolution for ${category} (last ${periodDays}d)`);
  lines.push("");
  if (points.length === 0) {
    lines.push("   No snapshot data for this category in the period.");
    lines.push("   This is honest sparsity, not an error: run `mooter matrix snapshot` daily");
    lines.push("   to build a trend (only days with a real, priced TES are recorded).");
    return lines.join("\n");
  }

  // Sparkline over the median-TES-per-day series (honest: only real points).
  const values = points.map((p) => p.tes);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const bars = "▁▂▃▄▅▆▇█";
  const spark = points
    .map((p) => {
      if (max === min) return bars[0];
      const idx = Math.round(((p.tes - min) / (max - min)) * (bars.length - 1));
      return bars[idx];
    })
    .join("");
  lines.push(`   ${spark}   (${points.length} day(s) with data · TES ${min} → ${max})`);
  lines.push("");
  for (const p of points) {
    lines.push(`   ${p.date}   median TES ${p.tes}`);
  }
  return lines.join("\n");
}

async function dispatchEvolution(flags: Record<string, string | boolean>): Promise<CmdResult> {
  const eng = await loadEngine();
  const requested = typeof flags.category === "string" ? flags.category : undefined;
  if (!requested) {
    return err("mooter matrix evolution: --category <cat> is required");
  }
  const category = eng.categories.parseTaskCategory(requested);
  if (category === null) {
    return err(`mooter matrix evolution: unknown category "${requested}" (see the 24-category taxonomy).`);
  }

  const periodDays = flags.period !== undefined ? parsePeriodDays(flags.period) : 30;
  if (periodDays === null) {
    return err(`mooter matrix evolution: --period must be a positive number of days (e.g. 30d).`);
  }

  const snap = await loadSnapshotModule();
  if (!snap) {
    return {
      exitCode: 1,
      output:
        "mooter matrix evolution: tools/router/matrix-snapshot.js not found (run from a source checkout).",
    };
  }

  const points = snap.computeEvolution({ category, period_days: periodDays });

  if (flags.json) {
    return {
      exitCode: 0,
      output: JSON.stringify({ category, period_days: periodDays, points }, null, 2),
    };
  }
  return { exitCode: 0, output: renderEvolutionHuman(category, periodDays, points) };
}

// ── snapshot trigger ─────────────────────────────────────────────────────────

async function dispatchSnapshot(flags: Record<string, string | boolean>): Promise<CmdResult> {
  const snap = await loadSnapshotModule();
  if (!snap) {
    return {
      exitCode: 1,
      output:
        "mooter matrix snapshot: tools/router/matrix-snapshot.js not found (run from a source checkout).",
    };
  }

  const result = snap.writeSnapshot();

  if (flags.json) {
    return {
      exitCode: result.written ? 0 : 1,
      output: JSON.stringify(
        {
          written: result.written,
          file: result.file,
          pruned: result.pruned,
          date: result.snapshot.date,
          cells_measured: result.snapshot.cells_measured,
          pricing_pending_count: result.snapshot.pricing_pending_count,
          total_routings: result.snapshot.total_routings,
        },
        null,
        2,
      ),
    };
  }

  if (!result.written) {
    return { exitCode: 1, output: `mooter matrix snapshot: failed to write ${result.file}` };
  }
  const s = result.snapshot;
  const lines = [
    `📸 Matrix snapshot · ${s.date}`,
    `   ${s.cells_measured} cell(s) with a real TES · ${s.pricing_pending_count} pending price · ${s.total_routings} routing(s) on record`,
    `   → ${result.file}` + (result.pruned ? ` (pruned ${result.pruned} old day-file(s))` : ""),
  ];
  return { exitCode: 0, output: lines.join("\n") };
}

// ── entry point ────────────────────────────────────────────────────────────────

const KNOWN_SUBCOMMANDS = ["evolution", "snapshot"] as const;

export async function runMatrix(args: string[]): Promise<CmdResult> {
  const [maybeSub, ...rest] = args;

  if (maybeSub === "help" || maybeSub === "--help" || maybeSub === "-h") {
    return { exitCode: 0, output: MATRIX_USAGE };
  }

  try {
    if (maybeSub === "evolution") {
      return await dispatchEvolution(parseArgs(rest).flags);
    }
    if (maybeSub === "snapshot") {
      return await dispatchSnapshot(parseArgs(rest).flags);
    }
    // Default view — `maybeSub` is not a known subcommand, so treat the whole
    // arg list as flags (e.g. `mooter matrix --category reasoning.math --json`).
    if (maybeSub !== undefined && !maybeSub.startsWith("--")) {
      return err(`mooter matrix: unknown subcommand '${maybeSub}'`);
    }
    return await dispatchDefault(parseArgs(args).flags);
  } catch (e) {
    return { exitCode: 1, output: `mooter matrix: ${(e as Error).message}` };
  }
}

// Re-export for tests + introspection.
export { buildDefaultView, KNOWN_SUBCOMMANDS };

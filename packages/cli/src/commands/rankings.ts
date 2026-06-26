// `mooter rankings build` + `mooter rankings schedule` — Wave 5 "Rankings-as-proof".
//
// Emits landing/public/rankings-seed.json: the field of models ranked PER TASK
// CATEGORY through Mooter's own routing lens — quality-per-$, the tier we route
// to, and the two columns a cloud aggregator does not have (local $0,
// subscription $0). It is the routing thesis made public, WITHOUT fabricating a
// single number.
//
// ── Honest by construction (Doctrine V4 #5) ──────────────────────────────────
//   - quality comes from the specialization matrix's MEASURED cells only; an
//     unmeasured (model, category) renders { score: null, measured: false } — a
//     "—", never an invented 0.
//   - TES is taken verbatim from tes-calculator.computeTES() — never recomputed
//     by hand. Pending-price models yield tes: null.
//   - price is read from the frozen pricing snapshot; pending/unknown → null
//     (pending: true), never an estimate.
//   - tok/s does not exist in our catalog yet → cloud_p50: null, labelled.
//   - verdict.recommended is decideAgent()'s choice for the category (the
//     router's own pick), READ-ONLY — never invented here.
//   - local $0 and subscription $0 are FACTS of the user's context (a free local
//     model; a Claude tier covered by a Max plan), not "magically free".
//
// Pure data join — no network, no model calls. Deterministic given the seed.

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

import { MATRIX_MODELS, getCell as getMatrixCell } from "../../../router/src/specialization-matrix.ts";
import { TASK_CATEGORIES, type TaskCategory } from "../../../router/src/task-categories.ts";
import { computeTES } from "../../../router/src/tes-calculator.ts";
import { decideAgent, tierForModel } from "../../../router/src/decide-agent.ts";
import pricingSnapshot from "../../../../data/pricing-snapshot-2026-05-27.json";

export interface CmdResult {
  exitCode: number;
  output: string;
}

// ── pricing snapshot probe (price + local roster) ─────────────────────────────

interface SnapshotModel {
  input_per_mtok: number | null;
  output_per_mtok: number | null;
  pricing_status?: string;
  tier?: string;
}
interface Snapshot {
  snapshot_version: string;
  models: Record<string, SnapshotModel>;
  ollama_models?: string[];
  local_models_free?: string[];
}
const SNAP = pricingSnapshot as unknown as Snapshot;

/** Local/free roster: snapshot's free list + ollama tag ids + any ':tag' id. */
const LOCAL_FREE = new Set<string>([...(SNAP.local_models_free ?? []), ...(SNAP.ollama_models ?? [])]);
function isLocalRoster(model: string): boolean {
  return LOCAL_FREE.has(model) || model.includes(":");
}

/** Honest provider label from a well-known id prefix; "unknown" when unsure
 *  (we never guess a provider for an opaque id — it is metadata, not a metric). */
function providerFor(model: string): string {
  if (isLocalRoster(model)) return "ollama";
  if (model.startsWith("claude-")) return "anthropic";
  if (model.startsWith("gpt-") || model === "gpt-oss") return "openai";
  if (model.startsWith("gemini-")) return "google";
  if (model.startsWith("deepseek-")) return "deepseek";
  if (model.startsWith("kimi")) return "moonshot";
  if (model === "minimax") return "minimax";
  if (model.startsWith("qwen")) return "ollama";
  return "unknown";
}

interface PriceCell {
  in_per_mtok: number | null;
  out_per_mtok: number | null;
  pending: boolean;
}
function priceFor(model: string): PriceCell {
  if (isLocalRoster(model)) return { in_per_mtok: 0, out_per_mtok: 0, pending: false };
  const m = SNAP.models[model.replace(/-\d{8}$/, "")];
  if (!m || m.input_per_mtok == null || m.output_per_mtok == null || m.pricing_status === "pending") {
    return { in_per_mtok: null, out_per_mtok: null, pending: true };
  }
  return { in_per_mtok: m.input_per_mtok, out_per_mtok: m.output_per_mtok, pending: false };
}

// ── seed types ────────────────────────────────────────────────────────────────

export interface RankingRow {
  model: string;
  provider: string;
  tier: string;
  quality: { score: number | null; source: string | null; as_of: string | null; measured: boolean };
  price: PriceCell;
  toks: { cloud_p50: number | null; source: string };
  tes: number | null;
  local: { is_local: boolean; cost_usd: number | null };
  /** $0 to a Claude Max subscriber — true for standard Claude tiers (not @fable T5). */
  subscription_zero: boolean;
  verdict: { recommended: boolean; tier: string; reason: string };
}

export interface RankingsSeed {
  schema: "mooter-rankings-v1";
  generated_utc: string;
  pricing_snapshot: string;
  models_total: number;
  categories: string[];
  rows: Record<string, RankingRow[]>;
  savings: {
    measured: boolean;
    window_days: number;
    source: string;
    note: string;
    by_category: Record<string, { saved_usd: number; vs: string }>;
  };
}

/** Row comparator: priceable (numeric TES) first, by TES desc; then measured
 *  score desc; then tier band desc; then model id — fully deterministic. */
const TIER_RANK: Record<string, number> = { T0: 0, T1: 1, T2: 2, T3: 3, T5: 3 };
function compareRows(a: RankingRow, b: RankingRow): number {
  const at = typeof a.tes === "number" ? a.tes : null;
  const bt = typeof b.tes === "number" ? b.tes : null;
  if (at !== null && bt !== null && at !== bt) return bt - at;
  if (at !== null && bt === null) return -1;
  if (at === null && bt !== null) return 1;
  const as = a.quality.score ?? -1;
  const bs = b.quality.score ?? -1;
  if (as !== bs) return bs - as;
  const ar = TIER_RANK[a.tier] ?? 2;
  const br = TIER_RANK[b.tier] ?? 2;
  if (ar !== br) return br - ar;
  return a.model < b.model ? -1 : a.model > b.model ? 1 : 0;
}

// ── builder ───────────────────────────────────────────────────────────────────

/**
 * Deterministic JOIN: MATRIX_MODELS × benchmark quality × pricing × TES × the
 * router's per-category verdict. Given the same seed data it always emits the
 * same rows. `now` is injectable so the generated_utc stamp is testable.
 */
export function buildRankings(opts: { now?: number } = {}): RankingsSeed {
  const generated_utc = new Date(opts.now ?? Date.now()).toISOString();
  const rows: Record<string, RankingRow[]> = {};

  for (const category of TASK_CATEGORIES as readonly TaskCategory[]) {
    // The router's own pick for this category — READ-ONLY (never invented here).
    const decision = decideAgent({ task_category: category });
    const chosen = decision.chosen_model;

    const catRows: RankingRow[] = MATRIX_MODELS.map((model) => {
      const cell = getMatrixCell(model, category); // measured overlay or empty sentinel
      const measured = !!cell && cell.measured;
      const numericScore = measured && typeof cell!.score === "number" ? cell!.score : null;

      const tier = tierForModel(model);
      const tesResult = computeTES({ model, category, benchmark_score: numericScore });

      const recommended = chosen !== null && model === chosen;

      return {
        model,
        provider: providerFor(model),
        tier,
        quality: {
          score: numericScore,
          source: measured ? cell!.source : null,
          as_of: measured ? cell!.as_of ?? null : null,
          measured,
        },
        price: priceFor(model),
        toks: { cloud_p50: null, source: "not measured (no tok/s in catalog yet)" },
        tes: tesResult.tes,
        local: { is_local: isLocalRoster(model), cost_usd: isLocalRoster(model) ? 0 : null },
        subscription_zero: model.startsWith("claude-") && tier !== "T5",
        verdict: {
          recommended,
          tier,
          reason: recommended ? decision.reason : "",
        },
      };
    });

    catRows.sort(compareRows);
    rows[category] = catRows;
  }

  return {
    schema: "mooter-rankings-v1",
    generated_utc,
    pricing_snapshot: SNAP.snapshot_version,
    models_total: MATRIX_MODELS.length,
    categories: [...TASK_CATEGORIES],
    rows,
    // Savings are MEASURED LOCALLY from the user's own cost-perf journal; they are
    // never fabricated for the committed seed. The page renders the strip only
    // when measured:true (populated by a local rebuild with real data).
    savings: {
      measured: false,
      window_days: 7,
      source: "mooter savings-tracker (local, per-machine)",
      note: "Per-category savings are computed from your own routing journal on a local rebuild; not shipped to keep the public seed free of machine-specific numbers.",
      by_category: {},
    },
  };
}

// ── seed output path ──────────────────────────────────────────────────────────

/** Default seed path: <repo>/landing/public/rankings-seed.json
 *  packages/cli/src/commands/rankings.ts → ../../../../landing/public/… */
function defaultSeedPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "..", "..", "landing", "public", "rankings-seed.json");
}

// ── scheduled-task registration (PASSO 4 — data-only, idempotent) ─────────────
//
// We do NOT silently mutate the OS scheduler (a system-level side effect). We
// PRINT the platform-appropriate, idempotent registration command for the
// refresh+build pipeline, so the user opts in explicitly. The job itself only
// touches DATA (`benchmarks refresh --from-hub && rankings build`) — it never
// installs or acts.

const REFRESH_PIPELINE = "mooter benchmarks refresh --from-hub && mooter rankings build";

function scheduleHelp(): string {
  return [
    "mooter rankings schedule — print the data-only refresh registration (idempotent)",
    "",
    "The scheduled job runs (cost + tok/s daily, quality weekly is curated hub-side):",
    `  ${REFRESH_PIPELINE}`,
    "",
    "It only refreshes DATA — never installs, never acts. Register it yourself:",
    "",
    "Windows (Task Scheduler, daily 04:00 — re-running replaces the task, idempotent):",
    `  schtasks /Create /TN "MooterRankingsRefresh" /SC DAILY /ST 04:00 /F \\`,
    `    /TR "cmd /c ${REFRESH_PIPELINE}"`,
    "",
    "Linux/macOS (cron — add once; the marker comment keeps it idempotent):",
    `  (crontab -l 2>/dev/null | grep -v 'mooter-rankings-refresh'; \\`,
    `   echo '0 4 * * * ${REFRESH_PIPELINE}  # mooter-rankings-refresh') | crontab -`,
    "",
    "To remove: schtasks /Delete /TN \"MooterRankingsRefresh\" /F   (Windows)",
    "           crontab -l | grep -v mooter-rankings-refresh | crontab -   (cron)",
  ].join("\n");
}

// ── command ───────────────────────────────────────────────────────────────────

const RANKINGS_USAGE = `mooter rankings — model rankings through Mooter's routing lens (Wave 5)

Usage:
  mooter rankings build [--out <path>] [--json]
      Join the specialization matrix × benchmark quality × pricing × TES × the
      router's per-category verdict, and write landing/public/rankings-seed.json.
      Anti-fabrication: unmeasured cells → null (never 0). TES from the calculator.
      --out   write somewhere else (default: landing/public/rankings-seed.json)
      --json  print the seed to stdout instead of writing a file

  mooter rankings schedule
      Print the idempotent, data-only registration command for the refresh job
      (benchmarks refresh --from-hub && rankings build). Never mutates the OS.

Honest by construction: measured/null is sacred; every cell carries its source.`;

function parseFlags(args: string[]): { positional: string[]; flags: Record<string, string | boolean> } {
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

export async function runRankings(args: string[]): Promise<CmdResult> {
  const [sub, ...rest] = args;

  if (!sub || sub === "help" || sub === "--help" || sub === "-h") {
    return { exitCode: 0, output: RANKINGS_USAGE };
  }

  if (sub === "schedule") {
    return { exitCode: 0, output: scheduleHelp() };
  }

  if (sub === "build") {
    const { flags } = parseFlags(rest);
    const asJson = flags["json"] === true;

    let seed: RankingsSeed;
    try {
      seed = buildRankings();
    } catch (e) {
      return { exitCode: 1, output: `mooter rankings build: failed to build seed (${(e as Error).message}).` };
    }

    if (asJson) {
      return { exitCode: 0, output: JSON.stringify(seed, null, 2) };
    }

    const outPath = typeof flags["out"] === "string" ? (flags["out"] as string) : defaultSeedPath();
    try {
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, JSON.stringify(seed, null, 2) + "\n");
    } catch (e) {
      return { exitCode: 1, output: `mooter rankings build: could not write ${outPath} (${(e as Error).message}).` };
    }

    // Honest summary: how many cells are measured vs the field.
    let measured = 0;
    let total = 0;
    let recommended = 0;
    for (const cat of seed.categories) {
      for (const r of seed.rows[cat]) {
        total++;
        if (r.quality.measured) measured++;
        if (r.verdict.recommended) recommended++;
      }
    }
    const lines = [
      "mooter rankings build",
      "",
      `  wrote           ${outPath}`,
      `  categories      ${seed.categories.length}`,
      `  models          ${seed.models_total}`,
      `  measured cells  ${measured} of ${total}  (the rest render "—", never a fabricated 0)`,
      `  router verdicts ${recommended} categories have a priceable measured pick (✦ mooter routes here)`,
      "",
      "  Pricing snapshot: " + seed.pricing_snapshot,
    ];
    return { exitCode: 0, output: lines.join("\n") };
  }

  return { exitCode: 1, output: `mooter rankings: unknown subcommand '${sub}'\n\n${RANKINGS_USAGE}` };
}

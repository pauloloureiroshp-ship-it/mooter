// `mooter route adaptive` (Wave 58 batch 3 · A.17) — the user-facing surface for
// the Fable-5-inspired adaptive escalation engine (packages/router/src/
// fable-5-routing.ts). It ranks REAL-TES candidates for a category, runs the
// cheapest viable model first, has a JUDGE score the answer, and escalates to
// the next-TES candidate only when the answer is not good enough.
//
// ── BOUNDARY / DECOUPLING ────────────────────────────────────────────────────
//
// classify.js (FROZEN) is NOT touched and NOT imported. adaptiveRoute picks a
// MODEL within a category and never re-tiers. The engine import is LAZY (inside
// the handler, after args validate) — same pattern as workflow.ts — so the
// zero-runtime-deps CLI and its tests load without pulling the engine.
//
// ── NO FABRICATION (Doctrine V4 #5) ──────────────────────────────────────────
//
// Every number printed comes from a real attempt record or is honestly null/'?':
//   • confidence is the JUDGE score (Sonnet self-judge by default), never the
//     classifier's routing confidence; printed as '?' when the judge returned
//     null (honest unknown), never invented.
//   • TES is the candidate's measured ranking key (or '?' if the test seam
//     injected one without it); we never synthesise a score.
//   • total cost is the SUM OF KNOWN attempt costs; when any attempt's cost is
//     unknown we say so ("≥ $X, partial") rather than guessing.
//   • the non-adaptive comparison is printed ONLY when the data is real: it
//     compares the cheapest-candidate cost against the priciest attempted, and
//     is suppressed (with an honest note) when costs are incomplete or there is
//     nothing to compare.
//
// ── --dry-run (demoable + testable without burning models) ───────────────────
//
// --dry-run swaps in a DETERMINISTIC stub executor + judge so the command can be
// demoed and unit-tested without calling a real model. The stub judge fails the
// first attempt(s) and passes a later one, so an escalation walk is visible. The
// real run wires the default claude-CLI Sonnet self-judge + a real Ollama/cloud
// executor (only available in a source checkout with the engine deps).

import type { CmdResult } from "./trail.ts";
// Type-only import: erased at build, so it does NOT pull the engine at module load.
import type {
  AdaptiveRouteResult,
  AttemptRecord,
  Executor,
  Judge,
  RankedCandidate,
} from "../../../router/src/fable-5-routing.ts";

export const ROUTE_ADAPTIVE_USAGE = `mooter route adaptive — Fable-5-inspired adaptive escalation (Wave 58)

Usage:
  mooter route adaptive "<task>" [options]

Options:
  --category <cat>          one of the 24 task categories (default: reasoning.general)
  --min-confidence <0..1>   judge-confidence floor an answer must clear (default 0.75)
  --max-attempts <n>        max models to try, incl. the first (default 3)
  --min-score <0..1>        candidate quality gate (default 0.75)
  --dry-run                 deterministic stub executor + judge — no real model call
  --json                    machine-readable result

Ranks REAL-TES candidates for the category (cheapest-viable first), runs one, has
a Sonnet self-judge score it, and escalates to the next candidate only when the
score is below --min-confidence. classify.js is NOT touched: this picks a MODEL
within a category, it never re-tiers. The real run needs a source checkout with
the engine deps; --dry-run works anywhere.`;

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

function err(message: string): CmdResult {
  return { exitCode: 1, output: `${message}\n\n${ROUTE_ADAPTIVE_USAGE}` };
}

const DEFAULT_CATEGORY = "reasoning.general" as const;

// ── per-model emoji (decoupled mirror of tools/router/llm-emoji-map.js) ───────
//
// The CLI stays decoupled from tools/router internals (same boundary as
// dashboard.ts ↔ glyphs.js, env-detect.ts ↔ gpu-probe.js): the published CLI
// can't import that CommonJS module, so the family→emoji rules are duplicated
// here deliberately. Anti-fabrication: any unrecognised model → 🤖 (unknown),
// never a guessed family.
function emojiForModel(model: string): string {
  const m = (model || "").trim().toLowerCase();
  if (!m) return "🤖";
  if (m === "mooter" || m.startsWith("mooter-") || m.startsWith("mooter:")) return "🐮";
  if (m.includes("fable")) return "🌟";
  if (m.startsWith("claude") || m.startsWith("anthropic") || m.startsWith("us.anthropic") || m.includes("claude-")) return "✨";
  if (m.startsWith("gpt") || m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4") || m.startsWith("codex") || m.includes("openai")) return "🟢";
  if (m.startsWith("gemini") || m.includes("gemini")) return "💎";
  if (
    m.startsWith("ollama:") || m.startsWith("ollama/") || m.includes("llama") ||
    m.startsWith("qwen") || m.startsWith("mistral") || m.startsWith("phi") ||
    m.startsWith("gemma") || m.startsWith("deepseek") || m.startsWith("mixtral")
  ) return "🦙";
  return "🤖";
}

// ── honest formatters (never fabricate; null/unknown → '?') ───────────────────

function fmtConf(c: number | null | undefined): string {
  return typeof c === "number" && Number.isFinite(c) ? c.toFixed(2) : "?";
}
function fmtTes(t: number | null | undefined): string {
  return typeof t === "number" && Number.isFinite(t) ? String(t) : "?";
}
function fmtCost(c: number | null | undefined): string {
  return typeof c === "number" && Number.isFinite(c) ? `$${c.toFixed(4)}` : "$?";
}

// ── deterministic stub executor + judge for --dry-run ─────────────────────────
//
// The stub never calls a model. Behaviour, by design, is deterministic and
// honest about the engine's real candidate pool (which it cannot see ahead of
// time — most categories have exactly ONE measured+priced candidate):
//   • --max-attempts 1 (or the engine clamps to 1 candidate): the single attempt
//     PASSES (conf 0.95) — the common "show me a clean accept" demo.
//   • --max-attempts >= 2 with a pool of >= 2 candidates: attempt 1 FAILS
//     (conf 0.50, below the 0.75 default) and attempt 2 PASSES (0.95), so the
//     escalation walk is visible.
//   • --max-attempts >= 2 but a pool of only 1 candidate: that single attempt
//     fails (0.50) and the command honestly reports "threshold not reached" —
//     we never fake a pass to make the demo look nicer (Doctrine V4 #5).
// Costs are fixed and KNOWN so the dry-run demonstrates a complete cost line.
function buildDryRun(requestedMaxAttempts: number): { executor: Executor; judge: Judge } {
  // tag the answer with its 1-indexed attempt number so the judge is deterministic.
  let m = 0;
  const executor: Executor = (model, task) => {
    m++;
    return {
      text: `[dry-run #${m}] ${model} would answer: ${task.slice(0, 60)}`,
      cost: 0.001 * m,
      tokens: 100 * m,
    };
  };
  const judge: Judge = (_task, answer) => {
    // single-attempt run → pass the only attempt; multi-attempt run → escalate
    // once then pass attempt 2 (only reachable if the real pool has >= 2).
    if (requestedMaxAttempts <= 1) return answer.includes("#1") ? 0.95 : 0.5;
    return answer.includes("#2") ? 0.95 : 0.5;
  };
  return { executor, judge };
}

// ── non-adaptive comparison (printed ONLY when honest) ────────────────────────
//
// "Non-adaptive" = always pay for the strongest candidate up front. We can only
// state this honestly when (a) costs are complete and (b) more than one model
// was actually attempted, so the priciest attempted cost is a real figure. The
// comparison is the adaptive total vs that single priciest call.
function buildComparison(res: AdaptiveRouteResult): string | null {
  if (!res.cost_complete) return null; // unknown costs ⇒ no honest comparison
  if (res.attempts.length < 2) return null; // nothing escalated ⇒ nothing to compare
  const costs = res.attempts
    .map((a) => a.cost)
    .filter((c): c is number => typeof c === "number" && Number.isFinite(c));
  if (costs.length !== res.attempts.length) return null;
  const priciest = Math.max(...costs);
  const adaptive = res.total_cost;
  if (priciest <= 0) return null;
  const delta = priciest - adaptive;
  // Only claim a saving when adaptive genuinely cost less (it may not, e.g. if
  // escalation walked through cheaper-then-pricier and summed above the single
  // priciest call — be honest either way).
  if (delta > 0) {
    const pct = Math.round((delta / priciest) * 100);
    return `non-adaptive (always strongest): ${fmtCost(priciest)} · adaptive: ${fmtCost(adaptive)} → saved ${fmtCost(delta)} (${pct}%)`;
  }
  return `non-adaptive (always strongest): ${fmtCost(priciest)} · adaptive: ${fmtCost(adaptive)} → no saving this run (escalation summed above the single strongest call)`;
}

// ── rendering ─────────────────────────────────────────────────────────────────

function renderAttempt(a: AttemptRecord): string {
  const e = emojiForModel(a.model);
  const verdict = a.met_threshold ? "✓" : "✗";
  return `  ${a.attempt}. ${e} ${a.model.padEnd(22)} conf ${fmtConf(a.confidence)} ${verdict}  tes ${fmtTes(a.tes)}  cost ${fmtCost(a.cost)}`;
}

function renderHuman(res: AdaptiveRouteResult, opts: { category: string; dryRun: boolean }): string {
  const lines: string[] = [];
  lines.push(`🪜 mooter route adaptive — ${opts.category}${opts.dryRun ? "  (dry-run · stub executor + judge)" : ""}`);
  lines.push("");

  if (res.attempts.length === 0) {
    // nothing ran (bad category / empty candidate pool) — honest reason.
    lines.push(`  (nothing run) ${res.escalation_reason}`);
    return lines.join("\n");
  }

  lines.push("Attempts (TES-descending · cheapest-viable first):");
  for (const a of res.attempts) lines.push(renderAttempt(a));
  lines.push("");

  const wm = res.winning_model ?? "?";
  const we = emojiForModel(wm);
  if (res.final_confidence_met) {
    lines.push(`Winner: ${we} ${wm} · confidence ${fmtConf(res.final_confidence)} (met ≥)`);
  } else {
    lines.push(`Winner: ${we} ${wm} · confidence ${fmtConf(res.final_confidence)} (best-so-far — threshold NOT met)`);
  }

  const costLine = res.cost_complete
    ? `Total cost: ${fmtCost(res.total_cost)}`
    : `Total cost: ≥ ${fmtCost(res.total_cost)} (partial — one or more attempts reported no cost)`;
  lines.push(costLine);

  lines.push(`Escalation: ${res.escalation_reason}`);

  const cmp = buildComparison(res);
  if (cmp) {
    lines.push("");
    lines.push(cmp);
  } else if (res.attempts.length >= 2 && !res.cost_complete) {
    lines.push("");
    lines.push("non-adaptive comparison: unavailable (attempt costs incomplete — not fabricated)");
  }

  if (res.final) {
    lines.push("");
    lines.push("Answer:");
    lines.push(res.final);
  }

  return lines.join("\n");
}

// ── handler ───────────────────────────────────────────────────────────────────

export async function runRouteAdaptive(args: string[]): Promise<CmdResult> {
  const [sub, ...rest] = args;

  if (!sub || sub === "help" || sub === "--help" || sub === "-h") {
    return { exitCode: 0, output: ROUTE_ADAPTIVE_USAGE };
  }
  if (sub !== "adaptive") {
    return { exitCode: 1, output: `mooter route: unknown subcommand '${sub}'\n\n${ROUTE_ADAPTIVE_USAGE}` };
  }

  const { positional, flags } = parseArgs(rest);
  const task = positional.join(" ").trim();
  if (!task) {
    return err('mooter route adaptive: a task is required, e.g. mooter route adaptive "explain CAP theorem"');
  }

  const category = typeof flags.category === "string" ? flags.category : DEFAULT_CATEGORY;
  const json = flags.json === true;
  const dryRun = flags["dry-run"] === true;

  const minConfidence = typeof flags["min-confidence"] === "string" ? Number(flags["min-confidence"]) : undefined;
  const minScore = typeof flags["min-score"] === "string" ? Number(flags["min-score"]) : undefined;
  const maxAttempts = typeof flags["max-attempts"] === "string" ? Number(flags["max-attempts"]) : undefined;

  if (minConfidence !== undefined && (!Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1)) {
    return err(`mooter route adaptive: --min-confidence must be a number in [0,1] (got "${flags["min-confidence"]}")`);
  }
  if (minScore !== undefined && (!Number.isFinite(minScore) || minScore < 0 || minScore > 1)) {
    return err(`mooter route adaptive: --min-score must be a number in [0,1] (got "${flags["min-score"]}")`);
  }
  if (maxAttempts !== undefined && (!Number.isFinite(maxAttempts) || maxAttempts < 1)) {
    return err(`mooter route adaptive: --max-attempts must be a number >= 1 (got "${flags["max-attempts"]}")`);
  }

  // LAZY engine import — only after args validate (matches workflow.ts).
  let engine: typeof import("../../../router/src/fable-5-routing.ts");
  try {
    engine = await import("../../../router/src/fable-5-routing.ts");
  } catch (e) {
    return { exitCode: 1, output: `mooter route adaptive: the adaptive-routing engine could not load.\n  (${(e as Error).message})` };
  }

  // Wire executor + judge. --dry-run uses a deterministic stub (no real model);
  // a real run wires the default claude-CLI Sonnet self-judge + a real executor.
  let executor: Executor;
  let judge: Judge | undefined;
  const effectiveMaxAttempts = maxAttempts ?? 3;
  if (dryRun) {
    const stub = buildDryRun(effectiveMaxAttempts);
    executor = stub.executor;
    judge = stub.judge;
  } else {
    executor = buildRealExecutor();
    judge = undefined; // engine defaults to the Sonnet self-judge (claude --print)
  }

  let res: AdaptiveRouteResult;
  try {
    res = await engine.adaptiveRoute({
      task,
      task_category: category,
      max_attempts: maxAttempts,
      min_confidence: minConfidence,
      min_score: minScore,
      executor,
      judge,
    });
  } catch (e) {
    return { exitCode: 1, output: `mooter route adaptive: the route failed.\n  (${(e as Error).message})` };
  }

  // Exit non-zero when nothing ran (bad category / empty pool) so scripts notice
  // — consistently across both the human and the --json surfaces.
  const exitCode = res.attempts.length === 0 ? 1 : 0;

  if (json) {
    return { exitCode, output: JSON.stringify({ category, dry_run: dryRun, ...res }, null, 2) };
  }

  return { exitCode, output: renderHuman(res, { category, dryRun }) };
}

// ── real executor (source-checkout path) ──────────────────────────────────────
//
// Runs one model against the task via `claude --print --model <model>` (no API
// key; the CLI is on PATH, same transport as the engine's default Sonnet judge).
// cost/tokens are honestly null — the CLI subprocess does not report them, and
// we never fabricate a figure (Doctrine V4 #5). On any transport failure the
// executor returns empty text, which the judge scores low → escalation, never a
// crash.
function buildRealExecutor(): Executor {
  return (model, task) => {
    let res;
    try {
      // node:child_process is loaded lazily so the pure arg-validation path (and
      // its tests) never pull it.
      const { spawnSync } = require("node:child_process") as typeof import("node:child_process");
      res = spawnSync("claude", ["--print", "--model", model], {
        input: task,
        encoding: "utf8",
        timeout: 120_000,
        maxBuffer: 8 * 1024 * 1024,
      });
    } catch {
      return { text: "", cost: null, tokens: null };
    }
    if (res.error || res.status !== 0 || typeof res.stdout !== "string") {
      return { text: "", cost: null, tokens: null };
    }
    return { text: res.stdout.trim(), cost: null, tokens: null };
  };
}

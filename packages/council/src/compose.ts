// Council composition — diversity > redundancy.
//
// Council Mode + Mixture-of-Models agree: heterogeneity (different families/trainings)
// is what kills correlated errors. So the Council NEVER stacks 3× the same model — it
// seats 3–5 members of DISTINCT families. Rules (design Parte 4 + 11d):
//   - ≥1 local seat always (a high-risk council stays possible 100% offline: NDA/HIPAA).
//   - distinct families (one member per family).
//   - odd number of seats (clean tie-break).
//   - size scales with CAS (3 moderate, 5 high — capped by available distinct families).
//   - judge cross-family (Opus), adjudicates but does NOT vote; never == a seat.
//   - Fable NEVER auto (T5 opt-in invariant).
//   - budget cap: a cloud seat is admitted only if its estimate fits the budget.
//
// Reuses decideAgent (best-value reference per category) + makeOllama/Anthropic factories.
// Only models with a real caller (local Ollama + Anthropic) are seatable; matrix-only
// models (gpt/gemini/deepseek-cloud/…) are scored elsewhere but cannot be invoked here.

import { makeOllamaModel, makeAnthropicModel } from "../../validation/src/benchmark/callers.ts";
import type { Tier } from "../../validation/src/types.ts";
import { decideAgent } from "../../router/src/decide-agent.ts";
import type { Council, ModelSpec } from "./types.ts";
import type { CasResult } from "./cas.ts";

export interface RosterEntry {
  /** Callable id (Ollama tag or Anthropic model id). */
  id: string;
  family: string;
  tier: Tier;
  kind: "local" | "cloud";
  /** Maps to MATRIX_MODELS for scoring/transparency where a clean mapping exists. */
  matrixId?: string;
  /** Per-deliberation admission estimate (USD). Local = 0. The REAL cost is measured
   *  at runtime from CallOutcome.costUsd — this is only for the budget gate. */
  estCostUsd: number;
}

/** Local-first default roster: 3 distinct local families + 1 cheap cloud family. */
export const DEFAULT_ROSTER: RosterEntry[] = [
  { id: "qwen3:30b", family: "qwen", tier: "T0", kind: "local", matrixId: "qwen3-30b", estCostUsd: 0 },
  { id: "gemma3:12b", family: "gemma", tier: "T0", kind: "local", estCostUsd: 0 },
  { id: "deepseek-r1:7b", family: "deepseek", tier: "T0", kind: "local", estCostUsd: 0 },
  { id: "claude-haiku-4-5-20251001", family: "anthropic", tier: "T1", kind: "cloud", estCostUsd: 0.02 },
];

/** Default judge: Opus, cross-family, outside the council (never votes). */
export const DEFAULT_JUDGE: RosterEntry = {
  id: "claude-opus-4-8",
  family: "anthropic",
  tier: "T3",
  kind: "cloud",
  matrixId: "claude-opus-4-8",
  estCostUsd: 0.3,
};

export interface ComposeBudget {
  /** Max admissible estimated USD for one Advisory deliberation. 0 → all-local. */
  maxCostUsd: number;
}

export interface ComposeOptions {
  roster?: RosterEntry[];
  judge?: RosterEntry | null;
  /** Force all-local (offline / NDA). */
  localOnly?: boolean;
  /** Whether an Anthropic key is present. Default: !!process.env.ANTHROPIC_API_KEY. */
  hasCloudKey?: boolean;
  /** Allow Fable as an auto seat (invariant: false). */
  allowFable?: boolean;
  /** Injectable decideAgent for testing / determinism. */
  decide?: typeof decideAgent;
}

function isFable(id: string): boolean {
  return /fable/i.test(id);
}

function largestOdd(n: number): number {
  if (n <= 1) return 1;
  return n % 2 === 1 ? n : n - 1;
}

function buildSpec(e: RosterEntry): ModelSpec {
  return e.kind === "local"
    ? makeOllamaModel(e.id, e.tier)
    : makeAnthropicModel(e.id, e.tier);
}

/**
 * Compose a council for `category` given the CAS result and a budget.
 * Pure w.r.t. the network: factories build specs but do not call any model here.
 */
export function composeCouncil(
  category: string,
  cas: CasResult,
  budget: ComposeBudget,
  opts: ComposeOptions = {},
): Council {
  const hasCloudKey = opts.hasCloudKey ?? !!process.env.ANTHROPIC_API_KEY;
  const decide = opts.decide ?? decideAgent;
  const notes: string[] = [];

  let roster = (opts.roster ?? DEFAULT_ROSTER).filter((e) => opts.allowFable || !isFable(e.id));
  if ((opts.roster ?? DEFAULT_ROSTER).some((e) => isFable(e.id)) && !opts.allowFable) {
    notes.push("excluded Fable seat (T5 opt-in invariant)");
  }

  const cloudUsable = !opts.localOnly && hasCloudKey && budget.maxCostUsd > 0;
  if (opts.localOnly) notes.push("local-only (offline/NDA)");
  else if (!hasCloudKey) notes.push("no cloud key → all-local council");
  else if (budget.maxCostUsd <= 0) notes.push("zero budget → all-local council");

  const locals = roster.filter((e) => e.kind === "local");
  const clouds = cloudUsable
    ? roster.filter((e) => e.kind === "cloud" && e.estCostUsd <= budget.maxCostUsd)
    : [];

  // decideAgent best-value reference (transparency + cloud-seat bias). Defensive: the
  // matrix uses different ids than Ollama tags, so failures degrade gracefully.
  let bestValueRef: string | null = null;
  try {
    const d = decide({ task_category: category, max_cost_usd: budget.maxCostUsd || undefined });
    bestValueRef = d.chosen_model;
    if (bestValueRef) notes.push(`decideAgent best-value(${category})=${bestValueRef}`);
  } catch {
    /* matrix guidance unavailable — proceed with roster defaults */
  }

  // Target seat count: scales with CAS, capped by distinct callable families (odd).
  const candidates = [...locals, ...clouds];
  const distinctFamilies = new Set(candidates.map((e) => e.family)).size;
  const desired = cas.score >= 0.8 ? 5 : 3;
  const target = largestOdd(Math.min(desired, distinctFamilies));
  if (desired > target) {
    notes.push(`wanted ${desired} seats but only ${distinctFamilies} distinct callable families → ${target}`);
  }

  // Greedy distinct-family pick: mandatory local anchor first, then prefer one cloud seat
  // (local-vs-cloud training diversity), then remaining distinct local families.
  const chosen: RosterEntry[] = [];
  const usedFamilies = new Set<string>();
  const take = (e: RosterEntry) => {
    chosen.push(e);
    usedFamilies.add(e.family);
  };

  const anchor = locals[0];
  if (!anchor) {
    throw new Error("composeCouncil: roster has no local seat (≥1 local is invariant)");
  }
  take(anchor);

  const cloudSeat = clouds.find((e) => !usedFamilies.has(e.family));
  if (cloudSeat && chosen.length < target) take(cloudSeat);

  for (const e of candidates) {
    if (chosen.length >= target) break;
    if (usedFamilies.has(e.family)) continue;
    take(e);
  }

  // Judge: cross-family Opus, only when cloud is usable; else deterministic synthesis.
  let judgeSpec: ModelSpec | null = null;
  let judgeId: string | null = null;
  const judgeEntry = opts.judge === undefined ? DEFAULT_JUDGE : opts.judge;
  if (cloudUsable && judgeEntry && !isFable(judgeEntry.id)) {
    if (chosen.some((s) => s.id === judgeEntry.id)) {
      notes.push("judge id collides with a seat → deterministic synthesis instead");
    } else {
      judgeSpec = buildSpec(judgeEntry);
      judgeId = judgeEntry.id;
      if (usedFamilies.has(judgeEntry.family)) {
        notes.push(
          `judge shares family (${judgeEntry.family}) with a seat → length-neutral rubric + anonymization to mitigate self-preference`,
        );
      }
    }
  } else {
    notes.push("deterministic synthesis (no cloud judge available)");
  }

  const seatEst = chosen.reduce((s, e) => s + e.estCostUsd, 0);
  const judgeEst = judgeSpec ? judgeEntry!.estCostUsd : 0;
  const allLocal = chosen.every((e) => e.kind === "local") && !judgeSpec;
  const estCostUsd = allLocal ? 0 : seatEst + judgeEst;

  const families = chosen.map((e) => `${e.id}(${e.family}/${e.kind})`).join(", ");
  const note = `seats=[${families}] judge=${judgeId ?? "deterministic"} · ${notes.join("; ")}`;

  return {
    seats: chosen.map(buildSpec),
    judge: judgeSpec,
    note,
    estCostUsd,
  };
}

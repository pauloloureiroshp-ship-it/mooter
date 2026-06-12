// decide-agent.ts — Wave 58 Pareto-optimal model selection WITHIN a tier.
//
// ── WHAT THIS IS (and the boundary it does NOT cross) ────────────────────────
//
// classify.js (FROZEN) decides the TIER for a prompt (T0/T1/T2/T3) on the
// complexity axis. decideAgent() answers the *next* question: given a task
// CATEGORY (one of the 24 in task-categories.ts), which concrete MODEL is the
// best value for the quality you need? It picks a model from the Wave 58 roster
// by Token-Efficiency Score (TES) — most measured capability per dollar.
//
//   classify.js : prompt → TIER          (NOT touched here; frozen sha)
//   decideAgent : (category, budget) → MODEL within/around that capability band
//
// decideAgent NEVER re-classifies a prompt and NEVER imports classify.js. It
// operates on already-measured capability (specialization-matrix) and real
// prices (cost.ts / the frozen snapshot), via the TES calculator. The two axes
// compose: the classifier sets the tier ceiling/floor; decideAgent shops within.
//
// ── NO FABRICATION (Doctrine V4 #5) ──────────────────────────────────────────
//
// A model is only a *measured* candidate for a category when the specialization
// matrix has a real, cited score for that (model, category) cell. We NEVER
// invent a score to make a model selectable. When a category has ZERO measured
// cells, we fall back to a TIER HEURISTIC (the snapshot's per-model `tier`
// field) and SAY SO loudly in coverage_note — the chosen model then carries
// `measured: false` and `score: null` so a consumer can never mistake a
// heuristic pick for a benchmarked one.
//
// Likewise we never manufacture a TES for a pending-price model: TES math is
// delegated wholesale to tes-calculator.computeTES(), which returns null/pending
// for any model whose snapshot price is null. Pending-price candidates are kept
// in `alternatives` with an honest `why_not` ("price pending"), never chosen by
// the TES sort (you cannot rank what you cannot price).
//
// Pure module: file reads only (the snapshot + benchmark seed, both already read
// by the modules we reuse). No network, never throws.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { MATRIX_MODELS, getCell, type MatrixModel } from "./specialization-matrix.ts";
import { TASK_CATEGORIES, type TaskCategory, parseTaskCategory } from "./task-categories.ts";
import { computeTES, priceStatusForModel, type PriceStatus } from "./tes-calculator.ts";
import { isLocalModel } from "./cost.ts";
import { maxTier } from "./policy.ts";

// ---------------------------------------------------------------------------
// Snapshot tier probe (for the heuristic fallback + per-model tier band).
//
// We reuse the SAME frozen snapshot the cost/TES modules read. We only read the
// per-model `tier` field here — never re-implement cost math (that stays in
// cost.ts / tes-calculator.ts). Local models are not in the snapshot `models`
// map; they are T0 by definition.
// ---------------------------------------------------------------------------

interface SnapshotModelTier {
  tier?: string;
}
interface PricingSnapshotTiers {
  models: Record<string, SnapshotModelTier>;
  /** Roster ids of free local models (e.g. "qwen3-30b", "qwen3.6"). cost.ts's
   *  isLocalModel only knows the ':tag' ollama ids, so we read this list to also
   *  recognise the matrix's local roster ids that carry no colon. */
  local_models_free?: string[];
}

// packages/router/src/decide-agent.ts -> <repo>/data/pricing-snapshot-2026-05-27.json
const SNAPSHOT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "data",
  "pricing-snapshot-2026-05-27.json",
);

let _snapshotTiers: PricingSnapshotTiers | null = null;
function loadSnapshotTiers(): PricingSnapshotTiers {
  if (_snapshotTiers) return _snapshotTiers;
  _snapshotTiers = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as PricingSnapshotTiers;
  return _snapshotTiers;
}

/** Strip a trailing `-YYYYMMDD` so dated API ids resolve to the snapshot key. */
function normalizeModel(model: string): string {
  return model.replace(/-\d{8}$/, "");
}

export type ModelTier = "T0" | "T1" | "T2" | "T3" | "T5";

/** True for any free local model — either a ':tag' ollama id (cost.ts) or a
 *  matrix roster id listed in the snapshot's `local_models_free` (e.g.
 *  "qwen3-30b", which carries no colon and is invisible to cost.ts). */
function isLocalRosterModel(model: string): boolean {
  if (isLocalModel(model)) return true;
  const list = loadSnapshotTiers().local_models_free ?? [];
  return list.includes(model);
}

/**
 * The capability tier band of a model, from the frozen snapshot's `tier` field.
 *   - free local models (ollama tag OR local_models_free) → "T0" (lowest band)
 *   - snapshot entry with a tier                          → that tier (incl. "T5" = Fable)
 *   - unknown / no tier on the entry                      → "T2" (conservative middle)
 * This is a coarse capability *band*, NOT a measured score — it backs the
 * heuristic fallback only, and any pick made from it is flagged measured:false.
 */
export function tierForModel(model: string): ModelTier {
  if (isLocalRosterModel(model)) return "T0";
  const m = loadSnapshotTiers().models[normalizeModel(model)];
  const t = m?.tier;
  if (t === "T0" || t === "T1" || t === "T2" || t === "T3" || t === "T5") return t;
  return "T2";
}

/**
 * A monotonic capability proxy in (0,1) for a tier band, used ONLY by the
 * heuristic fallback when a category has no measured cells. It is deliberately
 * NOT presented as a benchmark score (the chosen cell stays score:null,
 * measured:false). Ordering is what matters: T3/T5 > T2 > T1 > T0. We keep all
 * values below 1.0 so a heuristic pick never out-ranks a real measured score on
 * the rare mixed comparison, and we leave a gap below 0.75 (the default
 * min_score) so heuristic picks do not silently pass a measured-quality gate.
 */
const TIER_HEURISTIC_CAPABILITY: Record<ModelTier, number> = {
  T0: 0.45,
  T1: 0.55,
  T2: 0.68,
  T3: 0.74,
  T5: 0.74,
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DecideAgentArgs {
  /** One of the 24 Wave 58 categories (task-categories.ts). Required. */
  task_category: string;
  /** Minimum acceptable capability score in [0,1]. Default 0.75. Applied to a
   *  candidate's measured score, OR to its tier-heuristic proxy in fallback. */
  min_score?: number;
  /** Optional hard cap on the per-1k *blended* cost (USD): cost_per_1k_in +
   *  0.3*cost_per_1k_out, the same blend the TES denominator uses. Candidates
   *  above this are filtered (with an honest why_not). Free/local models always
   *  pass. Omit for no cap. */
  max_cost_usd?: number;
  /** When true, prefer a free local model if it is within 5% of the top
   *  candidate's TES (utility). Default false. */
  prefer_local?: boolean;
  /** Override the choice with this exact model id, bypassing the TES sort. The
   *  result is flagged (reason notes the override) and still reports the model's
   *  measured/heuristic standing honestly. */
  force_model?: string;
}

export interface AgentAlternative {
  model: string;
  /** Measured benchmark score for (model, category), or null when unmeasured
   *  (heuristic) or when the cell is qualitative-only. */
  score: number | null;
  /** Token-Efficiency Score, or null when not priceable (pending/unknown). */
  tes: number | null;
  /** Blended per-1k cost (USD) used for the cap + TES, or null when not priced. */
  cost: number | null;
  /** Why this model was NOT chosen (filtered, pending price, lower TES, …). */
  why_not: string;
}

export interface DecideAgentResult {
  /** The selected model id, or null when nothing qualified (all filtered /
   *  unpriceable and no heuristic candidate cleared min_score). */
  chosen_model: string | null;
  /** Human-readable rationale for the choice (or for the empty result). */
  reason: string;
  /** The chosen model's TES (null when free-floored-but-incomparable, pending,
   *  or when chosen by heuristic with a pending price). */
  tes: number | null;
  /** Every other in-band candidate, ranked, each with a why_not. */
  alternatives: AgentAlternative[];
  /** The benchmark source(s) backing the chosen model's score, or a heuristic
   *  marker when the pick came from the tier fallback. */
  cited_source: string | null;
  /** ALWAYS populated. States measured-vs-heuristic basis + any pending-price
   *  caveat, so the UI/CLI can render an honest capability claim. */
  coverage_note: string;
}

// ---------------------------------------------------------------------------
// Internal candidate shape
// ---------------------------------------------------------------------------

interface Candidate {
  model: string;
  /** Effective score used for the min_score gate + ranking tie-breaks: the
   *  measured score when measured, else the tier-heuristic proxy. */
  effective_score: number;
  /** The real measured score (null when heuristic or qualitative-only). */
  measured_score: number | null;
  /** true when backed by a real measured matrix cell; false when heuristic. */
  measured: boolean;
  /** Cited benchmark source, or a "tier-heuristic:<Tx>" marker. */
  source: string;
  /** TES result fields (delegated to tes-calculator). */
  tes: number | null;
  tes_status: "ok" | "free" | "pending";
  price_status: PriceStatus;
  /** Blended per-1k cost (USD), or null when not priced. */
  blended_cost: number | null;
}

const DEFAULT_MIN_SCORE = 0.75;
/** prefer_local utility window: a local model wins if within 5% of top TES. */
const LOCAL_PREFERENCE_WINDOW = 0.05;

/** Blended per-1k cost matching the TES denominator (in + 0.3*out). */
function blendedCost(per1kIn: number | null, per1kOut: number | null): number | null {
  if (per1kIn === null || per1kOut === null) return null;
  return Number((per1kIn + 0.3 * per1kOut).toFixed(6));
}

/**
 * Build a candidate for one (model, category):
 *   - measured cell with a numeric score → measured candidate.
 *   - no measured numeric score          → heuristic candidate (tier proxy),
 *                                           flagged measured:false.
 * TES + price status come straight from computeTES (no fabrication).
 */
function buildCandidate(model: string, category: TaskCategory): Candidate {
  const cell = getCell(model, category); // null only if model out of roster
  const measuredScore =
    cell && cell.measured && typeof cell.score === "number" ? cell.score : null;
  const measured = measuredScore !== null;

  const tier = tierForModel(model);
  const effective_score = measured ? (measuredScore as number) : TIER_HEURISTIC_CAPABILITY[tier];
  const source = measured ? (cell as { source: string }).source : `tier-heuristic:${tier}`;

  // TES is only meaningful with a real measured score. For heuristic candidates
  // we still report the model's price_status (so the cap + transparency work)
  // but DO NOT compute a TES off the heuristic proxy — that would be fabricating
  // efficiency from a fabricated capability. So feed computeTES the measured
  // score (which is null for heuristic candidates → status 'pending').
  const tesResult = computeTES({ model, category, benchmark_score: measuredScore });

  return {
    model,
    effective_score,
    measured_score: measuredScore,
    measured,
    source,
    tes: tesResult.tes,
    tes_status: tesResult.status,
    price_status: tesResult.price_status,
    blended_cost: blendedCost(tesResult.cost_per_1k_in, tesResult.cost_per_1k_out),
  };
}

/** A candidate is rankable by TES only when its TES is a finite number. */
function isRankable(c: Candidate): boolean {
  return typeof c.tes === "number" && Number.isFinite(c.tes);
}

/** Project an internal candidate to the public alternative shape. */
function toAlternative(c: Candidate, why_not: string): AgentAlternative {
  return {
    model: c.model,
    score: c.measured_score,
    tes: c.tes,
    cost: c.blended_cost,
    why_not,
  };
}

/**
 * Pareto-optimal model selection for a task category.
 *
 * Algorithm (documented step-by-step, matching the Wave 58 brief):
 *   1. Candidates = every roster model; mark each measured (real matrix score)
 *      or heuristic (tier proxy, measured:false). If NO model has a measured
 *      score for this category, the whole decision is heuristic — coverage_note
 *      says so explicitly.
 *   2. Filter by min_score (default 0.75) against the effective score, and by
 *      max_cost_usd against the blended per-1k cost (free/local always pass).
 *   3. Compute TES per surviving candidate (delegated to tes-calculator;
 *      pending-price models yield null and are NOT rankable — noted, not chosen).
 *   4. Sort rankable candidates by TES descending (ties: higher measured score,
 *      then local-before-cloud, then model id for determinism).
 *   5. prefer_local: if a free local candidate is within 5% utility (TES) of the
 *      top pick, promote it.
 *   6. force_model: overrides the choice entirely, with a flagged note.
 *
 * Never fabricates a score or a price. Never throws.
 */
export function decideAgent(args: DecideAgentArgs): DecideAgentResult {
  const minScore = args.min_score ?? DEFAULT_MIN_SCORE;
  const maxCost = args.max_cost_usd;
  const preferLocal = args.prefer_local ?? false;

  // --- validate category -----------------------------------------------------
  const category = parseTaskCategory(args.task_category);
  if (category === null) {
    return {
      chosen_model: null,
      reason: `unknown task_category "${args.task_category}" — must be one of the 24 categories (see task-categories.ts)`,
      tes: null,
      alternatives: [],
      cited_source: null,
      coverage_note: `task_category "${args.task_category}" is not in the 24-category taxonomy; cannot decide an agent`,
    };
  }

  // --- step 1: build all candidates ------------------------------------------
  const all: Candidate[] = MATRIX_MODELS.map((m: MatrixModel) => buildCandidate(m, category));
  const anyMeasured = all.some((c) => c.measured);

  // --- force_model short-circuit (step 6, applied first if present) ----------
  if (args.force_model) {
    return decideForced(args.force_model, category, all, anyMeasured);
  }

  // --- step 2: filter by min_score + max_cost_usd ----------------------------
  const filteredOut: AgentAlternative[] = [];
  const surviving: Candidate[] = [];
  for (const c of all) {
    if (c.effective_score < minScore) {
      filteredOut.push(
        toAlternative(
          c,
          `${c.measured ? "score" : "tier-heuristic score"} ${c.effective_score} < min_score ${minScore}`,
        ),
      );
      continue;
    }
    if (
      maxCost !== undefined &&
      c.blended_cost !== null &&
      !isLocalRosterModel(c.model) &&
      c.blended_cost > maxCost
    ) {
      filteredOut.push(
        toAlternative(c, `blended cost $${c.blended_cost}/1k > max_cost_usd $${maxCost}`),
      );
      continue;
    }
    surviving.push(c);
  }

  // --- step 3 + 4: rank by TES (pending-price → unrankable, kept honest) -----
  const rankable = surviving.filter(isRankable);
  const unrankable = surviving.filter((c) => !isRankable(c));

  rankable.sort(compareByTesDesc);

  if (rankable.length === 0) {
    // Nothing priceable survived. Report honestly why.
    const alternatives = [
      ...unrankable.map((c) => toAlternative(c, whyUnrankable(c))),
      ...filteredOut,
    ];
    const reason = buildEmptyReason(surviving.length, unrankable.length, minScore, maxCost);
    return {
      chosen_model: null,
      reason,
      tes: null,
      alternatives,
      cited_source: null,
      coverage_note: buildCoverageNote(category, anyMeasured, null),
    };
  }

  // --- step 5: prefer_local promotion ----------------------------------------
  let chosen = rankable[0];
  let preferLocalApplied = false;
  if (preferLocal) {
    const topTes = chosen.tes as number;
    const localPick = rankable.find(
      (c) =>
        isLocalRosterModel(c.model) &&
        c.model !== chosen.model &&
        (c.tes as number) >= topTes * (1 - LOCAL_PREFERENCE_WINDOW),
    );
    if (localPick) {
      chosen = localPick;
      preferLocalApplied = true;
    }
  }

  // --- assemble alternatives (everyone except the chosen one) ----------------
  const alternatives: AgentAlternative[] = [];
  for (const c of rankable) {
    if (c.model === chosen.model) continue;
    alternatives.push(toAlternative(c, `lower TES (${c.tes}) than chosen ${chosen.model} (${chosen.tes})`));
  }
  for (const c of unrankable) alternatives.push(toAlternative(c, whyUnrankable(c)));
  for (const a of filteredOut) alternatives.push(a);

  const reason = buildChosenReason(chosen, preferLocalApplied, minScore, maxCost);

  return {
    chosen_model: chosen.model,
    reason,
    tes: chosen.tes,
    alternatives,
    cited_source: chosen.measured ? chosen.source : null,
    coverage_note: buildCoverageNote(category, anyMeasured, chosen),
  };
}

// ---------------------------------------------------------------------------
// force_model path (step 6)
// ---------------------------------------------------------------------------

function decideForced(
  forceModel: string,
  category: TaskCategory,
  all: Candidate[],
  anyMeasured: boolean,
): DecideAgentResult {
  const inRoster = (MATRIX_MODELS as readonly string[]).includes(forceModel);
  if (!inRoster) {
    return {
      chosen_model: forceModel,
      reason: `force_model="${forceModel}" honoured, but it is OUTSIDE the Wave 58 roster — no capability or price data; routing it is the caller's responsibility`,
      tes: null,
      alternatives: all.map((c) => toAlternative(c, "not chosen (force_model override)")),
      cited_source: null,
      coverage_note: `force_model "${forceModel}" is not in the roster — no measured cell, no tier band; capability is UNKNOWN`,
    };
  }

  const chosen = all.find((c) => c.model === forceModel) as Candidate;
  const alternatives = all
    .filter((c) => c.model !== forceModel)
    .map((c) => toAlternative(c, "not chosen (force_model override)"));

  return {
    chosen_model: chosen.model,
    reason:
      `force_model="${forceModel}" honoured — TES sort bypassed. ` +
      (chosen.measured
        ? `Measured score ${chosen.measured_score} on ${category}.`
        : `No measured data for ${category}; standing is tier-heuristic only.`) +
      (chosen.tes === null ? " TES unavailable (price pending/unknown)." : ` TES=${chosen.tes}.`),
    tes: chosen.tes,
    alternatives,
    cited_source: chosen.measured ? chosen.source : null,
    coverage_note:
      buildCoverageNote(category, anyMeasured, chosen) + " | selection forced via force_model (not a TES-optimal pick)",
  };
}

// ---------------------------------------------------------------------------
// Ranking + explanation helpers
// ---------------------------------------------------------------------------

/** TES descending; deterministic tie-breaks so output is stable across runs. */
function compareByTesDesc(a: Candidate, b: Candidate): number {
  const ta = a.tes as number;
  const tb = b.tes as number;
  if (tb !== ta) return tb - ta;
  // Tie: prefer the one with the real measured score.
  const sa = a.measured_score ?? -1;
  const sb = b.measured_score ?? -1;
  if (sb !== sa) return sb - sa;
  // Then prefer local (free) over cloud.
  const la = isLocalRosterModel(a.model) ? 1 : 0;
  const lb = isLocalRosterModel(b.model) ? 1 : 0;
  if (lb !== la) return lb - la;
  // Finally model id, for total determinism.
  return a.model < b.model ? -1 : a.model > b.model ? 1 : 0;
}

function whyUnrankable(c: Candidate): string {
  if (c.price_status === "pending") return "price pending (null in snapshot) — cannot compute TES, excluded from ranking";
  if (c.price_status === "unknown") return "not in pricing snapshot — cannot price, excluded from ranking";
  if (!c.measured) return "no measured score for this category — heuristic candidate, no TES to rank by";
  return "no TES (incomputable) — excluded from ranking";
}

function buildChosenReason(
  chosen: Candidate,
  preferLocalApplied: boolean,
  minScore: number,
  maxCost: number | undefined,
): string {
  const parts: string[] = [];
  if (preferLocalApplied) {
    parts.push(
      `chose free local model ${chosen.model} (prefer_local: within ${LOCAL_PREFERENCE_WINDOW * 100}% TES of the top cloud pick)`,
    );
  } else {
    parts.push(`chose ${chosen.model} — highest TES (${chosen.tes}) among candidates`);
  }
  parts.push(
    chosen.measured
      ? `backed by a measured score of ${chosen.measured_score} (source: ${chosen.source})`
      : `(tier-heuristic standing only — no measured score for this category)`,
  );
  const gates = [`min_score=${minScore}`];
  if (maxCost !== undefined) gates.push(`max_cost_usd=$${maxCost}/1k`);
  parts.push(`gates: ${gates.join(", ")}`);
  return parts.join("; ");
}

function buildEmptyReason(
  survivingCount: number,
  unrankableCount: number,
  minScore: number,
  maxCost: number | undefined,
): string {
  if (survivingCount === 0) {
    return (
      `no candidate cleared the gates (min_score=${minScore}` +
      (maxCost !== undefined ? `, max_cost_usd=$${maxCost}/1k` : "") +
      `) — relax the thresholds or supply benchmark/price data`
    );
  }
  return (
    `${survivingCount} candidate(s) cleared the gates but ${unrankableCount} are unpriceable ` +
    `(price pending/unknown) so none could be ranked by TES — supply real prices via 'mooter price-update' to enable selection`
  );
}

function buildCoverageNote(
  category: TaskCategory,
  anyMeasured: boolean,
  chosen: Candidate | null,
): string {
  if (!anyMeasured) {
    return (
      `no measured data for ${category} in the specialization matrix — selection uses the TIER HEURISTIC ` +
      `(snapshot tier band) only; treat the capability as an UNVERIFIED estimate until a cited benchmark is seeded`
    );
  }
  // At least some measured data exists for this category.
  if (chosen === null) {
    return `measured data exists for ${category}, but no priceable candidate could be ranked (see alternatives' why_not)`;
  }
  if (chosen.measured) {
    return `chosen model has a MEASURED score for ${category} (source: ${chosen.source}); other cells in this category may still be heuristic — see alternatives`;
  }
  return (
    `measured data exists for ${category} for other models, but the chosen model fell back to the TIER HEURISTIC ` +
    `(no measured cell for it) — capability is an estimate, not a benchmark`
  );
}

// ---------------------------------------------------------------------------
// Re-exports for callers + tests
// ---------------------------------------------------------------------------

export { TASK_CATEGORIES, type TaskCategory };
export { maxTier };

/** Reset the cached snapshot-tier read (tests only). */
export function __resetSnapshotTierCacheForTests(): void {
  _snapshotTiers = null;
}

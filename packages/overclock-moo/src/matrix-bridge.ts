// matrix-bridge.ts — READ-ONLY adapter over the frozen router engine.
//
// The allocator must "pick the right model per job" by reading
// packages/router/src/specialization-matrix.ts + tes-calculator.ts. This file is
// the ONLY place that imports them, so the coupling is explicit and the rest of
// Overclock Moo stays decoupled (and unit-testable via an injected selector).
//
// HONESTY: we never fabricate a quality score. If the matrix cell is unmeasured
// (the sparse default), the pick falls back to the base model with
// qualityScore = null (rendered as "n/d"), modelSource = "default". A measured
// cell yields modelSource = "matrix" with the real score.
//
// $0 GUARANTEE: tes-calculator.priceStatusForModel must return "free" for the
// local picks — that is the read-only proof, per pick, that Fase 1 spends $0.
//
// CLOUD-$ HELPER (Phase 2, additive): cloudUsdAvoided computes the counterfactual
// cost of the locally-produced tokens on the CHEAPEST cloud tier (Haiku). This is
// the ONLY place that imports cost.ts — metrics.ts stays router-decoupled.
// Conservative: we price at the cheapest tier so as to NEVER over-claim savings.
// Unknown/zero tokens → null (n/d), never fabricated.

import { getCell } from "../../router/src/specialization-matrix.ts";
import { priceStatusForModel } from "../../router/src/tes-calculator.ts";
import { computeCostMicros, isLocalModel } from "../../router/src/cost.ts";
import type { ModelPick } from "./types.ts";

/** Cheapest cloud tier — conservative (we never over-claim savings). */
export const CLOUD_AVOIDED_TIER = "claude-haiku-4-5";

/**
 * Counterfactual USD these local tokens WOULD cost on the cheapest cloud tier.
 * null if both token counts are null/unknown, or if the tier is unpriced (never
 * fabricated). Conservative: pricing at Haiku (cheapest) means the estimate is
 * a lower bound, never inflated.
 *
 * @param tokensIn   Prompt tokens (null = unknown).
 * @param tokensOut  Eval/completion tokens (null = unknown).
 * @param tier       Cloud tier to price against (default: CLOUD_AVOIDED_TIER).
 */
export function cloudUsdAvoided(
  tokensIn: number | null,
  tokensOut: number | null,
  tier = CLOUD_AVOIDED_TIER,
): number | null {
  if (tokensIn == null && tokensOut == null) return null;
  // isLocalModel guard: if somehow a local tag is passed as the tier, return null
  // instead of silently reporting $0 as a real cloud cost (never fabricate).
  if (isLocalModel(tier)) return null;
  const micros = computeCostMicros(tier, tokensIn ?? 0, tokensOut ?? 0);
  if (!(micros > 0)) return null;
  return Math.round(micros) / 1e6; // USD
}

/** Local (free) models that can serve a continuous-batching slot in Fase 1. */
export const DEFAULT_LOCAL_MODELS = ["qwen3-30b", "qwen3.6"] as const;

/** Resident base the batching runtime actually serves (the one heavy model). */
export const DEFAULT_BASE_MODEL = "qwen3-coder:30b";

/**
 * Matrix roster ids → the canonical Ollama tag the runtime serves them under.
 * Grounded in the pricing snapshot's `ollama_models` list (qwen3.6 is already
 * canonical there; qwen3-30b is served as qwen3:30b). The matrix uses the
 * tag-less roster id for its cells; tes-calculator recognises a model as local
 * (⇒ "free") only via the snapshot list or a ':tag'. This map reconciles the two
 * WITHOUT inventing prices — it just names the real local tag.
 */
const LOCAL_OLLAMA_TAG: Record<string, string> = {
  "qwen3-30b": "qwen3:30b",
  "qwen3.6": "qwen3.6",
};

/** The Ollama tag a matrix id is served under (identity if unmapped). */
export function ollamaTag(model: string): string {
  return LOCAL_OLLAMA_TAG[model] ?? model;
}

/** Signature the allocator depends on (injectable for hermetic tests). */
export type SelectModel = (category: string, localModels: readonly string[]) => ModelPick;

function safePriceStatus(model: string): string {
  try {
    // Price the runtime tag (tes-calculator's local check keys off the snapshot
    // list / ':tag'), so a local pick reports "free" — the auditable $0 proof.
    return priceStatusForModel(ollamaTag(model));
  } catch {
    // Fail-soft: never let a pricing read throw inside the planner.
    return "unknown";
  }
}

/**
 * Pick the best LOCAL model for a category from the specialization matrix.
 *
 * Strategy (honest, never fabricated):
 *   1. Among the candidate local models, take the one with the highest MEASURED
 *      numeric cell score for this category.
 *   2. If none is measured (sparse matrix — the common case), fall back to the
 *      first local model with modelSource="default" and qualityScore=null (n/d).
 *
 * Either way we attach the tes-calculator price status; a local pick that is not
 * "free" is surfaced (not silently trusted) so the $0 claim stays auditable.
 */
export const defaultSelectModel: SelectModel = (category, localModels) => {
  let best: { model: string; score: number } | null = null;

  for (const model of localModels) {
    let cell = null;
    try {
      cell = getCell(model, category as never);
    } catch {
      cell = null; // model/category outside roster, or engine threw → treat as unmeasured
    }
    if (cell && cell.measured && typeof cell.score === "number") {
      if (!best || cell.score > best.score) best = { model, score: cell.score };
    }
  }

  if (best) {
    return {
      model: best.model,
      modelSource: "matrix",
      qualityScore: best.score,
      priceStatus: safePriceStatus(best.model),
    };
  }

  const fallback = localModels[0] ?? DEFAULT_BASE_MODEL;
  return {
    model: fallback,
    modelSource: "default",
    qualityScore: null, // n/d — unmeasured, not fabricated
    priceStatus: safePriceStatus(fallback),
  };
};

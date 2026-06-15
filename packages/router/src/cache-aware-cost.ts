// cache-aware-cost.ts — Wave 60 Block A (GAP 2: cache-aware cost).
//
// Switching the routed MODEL mid-session breaks the warm prompt-cache prefix.
// Anthropic prompt caching is keyed per-model, so changing the model — even
// within the same provider (opus → haiku) — abandons the cache: instead of
// reading the prefix at the cache-READ rate (~0.10× the base input price), the
// new model must re-process it at the cache-WRITE rate (~1.25×). decide-agent's
// static per-1k cost ignores this, so it OVERSTATES the savings of jumping tiers.
//
// This module is a PURE WRAPPER over a decide-agent result. It never edits
// decide-agent (FROZEN engine), never re-implements pricing (it reuses cost.ts's
// frozen snapshot via computeCostMicros), and never touches a real KV/prefix
// cache — we adopt only the *idea* of switching cost, not the mechanism (NO-PROXY,
// mission §5). The output is an annotation the caller can weigh; routing stays
// owned by classify.js / decide-agent.

import { isLocalModel, computeCostMicros } from "./cost.ts";
import type { DecideAgentResult, AgentAlternative } from "./decide-agent.ts";

// Anthropic prompt-caching multipliers relative to the base input price
// (documented prompt-caching pricing: cache read ≈ 0.1×, cache write ≈ 1.25×).
export const CACHE_READ_MULT = 0.10;
export const CACHE_WRITE_MULT = 1.25;

export interface SessionCacheContext {
  /** The model the session has been routing to (the warm-cache owner), or null
   *  on the first turn. Cache continuity holds only for THIS exact model. */
  established_model: string | null;
  /** Size of the warm cached prefix in tokens (system prompt + history). The
   *  switching cost scales with this; default 0 ⇒ nothing cached to lose. */
  prefix_tokens?: number;
}

export interface SwitchingAnnotation {
  /** One-time USD cost of switching to this model vs staying on the established
   *  one (re-writing the prefix cold instead of reading it warm). */
  switching_cost_usd: number;
  /** True when choosing this model abandons the session's warm cache. */
  breaks_cache: boolean;
}

/** Base input price in USD per token from the frozen snapshot; 0 for local/unknown.
 *  computeCostMicros(model, 1e6, 0) === round(input_per_mtok × 1e6) microUSD. */
function inputPricePerToken(model: string): number {
  const microsForMillion = computeCostMicros(model, 1_000_000, 0);
  return microsForMillion / 1e6 / 1_000_000; // micros→USD/Mtok, then →USD/token
}

/**
 * One-time USD cost of switching the session to `candidateModel`, given the
 * established model + warm prefix. Zero when there is nothing to lose:
 *   - candidate is local (Ollama is free; no cloud prompt-cache billing),
 *   - candidate has no confirmed price (pending snapshot entry) — never fabricate,
 *   - no established model (first turn),
 *   - established model was local (no cloud cache existed),
 *   - candidate IS the established model (cache stays warm),
 *   - empty prefix.
 * Otherwise the prefix is re-written cold on the new model instead of read warm
 * on the old: prefix_tokens × inputPrice(candidate) × (WRITE − READ).
 */
export function switchingCostUsd(
  candidateModel: string | null,
  ctx: SessionCacheContext,
): number {
  if (!candidateModel || isLocalModel(candidateModel)) return 0;
  const established = ctx?.established_model ?? null;
  if (!established || isLocalModel(established)) return 0;
  if (candidateModel === established) return 0; // same model ⇒ cache warm
  const prefix = Math.max(0, Number(ctx?.prefix_tokens) || 0);
  if (prefix === 0) return 0;
  const price = inputPricePerToken(candidateModel);
  if (price <= 0) return 0;
  return Number((prefix * price * (CACHE_WRITE_MULT - CACHE_READ_MULT)).toFixed(6));
}

/** True when choosing this model abandons the session's warm cache. */
export function breaksCache(
  candidateModel: string | null,
  ctx: SessionCacheContext,
): boolean {
  return switchingCostUsd(candidateModel, ctx) > 0;
}

/**
 * Annotate a decide-agent result (the chosen model + every alternative) with its
 * switching cost. PURE: returns a NEW object; never mutates the input and never
 * touches decide-agent. The caller (e.g. host-side session affinity, Block B)
 * weighs `switching_cost_usd` against the static cost difference before churning
 * backends — routing itself stays owned by classify.js / decide-agent.
 */
export function annotateSwitchingCost(
  result: DecideAgentResult,
  ctx: SessionCacheContext,
): DecideAgentResult & {
  chosen_switching: SwitchingAnnotation;
  alternatives: (AgentAlternative & SwitchingAnnotation)[];
} {
  const annot = (model: string | null): SwitchingAnnotation => ({
    switching_cost_usd: switchingCostUsd(model, ctx),
    breaks_cache: breaksCache(model, ctx),
  });
  return {
    ...result,
    chosen_switching: annot(result.chosen_model),
    alternatives: result.alternatives.map((a) => ({ ...a, ...annot(a.model) })),
  };
}

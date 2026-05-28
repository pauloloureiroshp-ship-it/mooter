// policy.ts — shared tier-decision policy for Pastor (Wave 2 Day 1).
//
// Two consumers replicate the same Pastor pipeline today:
//   - packages/router/src/hooks/inject_context.ts  (production hook)
//   - packages/router/scripts/wave1-benchmark/lib/arm-pastor.ts (benchmark + sanity)
//
// To keep them in sync, the two Wave 2 fixes that change tier resolution
// live here as pure functions (no IO, no SDK):
//   - applyGeneralFallback(): GENERAL pack + low tier → T2 + general-expert
//     scaffold (REPORT §4 #1).
//   - applyTierEscalation(): real pack + keyword match → promote to ceiling
//     (REPORT §4 #2).
//
// Both helpers are total: never throw, never reach the network. The model id
// returned by applyGeneralFallback is the same one TIER_TO_MODEL[T2] uses in
// the benchmark, so the hook's recommendation matches what arm-pastor invokes.

const TIER_ORDER = ["T0", "T1", "T2", "T3"] as const;
type Tier = (typeof TIER_ORDER)[number];

function tierIdx(t: string): number {
  const i = (TIER_ORDER as readonly string[]).indexOf(t);
  return i < 0 ? 2 : i; // default to T2 when unknown
}

/** The higher (more capable) of two tiers. */
export function maxTier(a: string, b: string): Tier {
  return TIER_ORDER[Math.max(tierIdx(a), tierIdx(b))];
}

// --- Fix #1: GENERAL fallback ------------------------------------------------

/** Minimum tier for GENERAL prompts — T2 (Sonnet). Avoids the T0 quality cliff
 *  documented in Wave 1 REPORT §3.5 (GENERAL → qwen3:30b, −30pp quality). */
export const GENERAL_FALLBACK_TIER: Tier = "T2";

/** Scaffold injected on GENERAL fallback. Short on purpose — the cost of a
 *  long scaffold isn't justified when there's no specific domain to constrain. */
export const GENERAL_FALLBACK_SCAFFOLD =
  "You are a senior multi-domain engineer. The user's prompt does not match a specific Pastor pack — address it with general engineering best-practices, citing language/framework idioms when relevant. Be concrete and actionable.";

export interface GeneralFallbackResult {
  /** Tier to use after the fallback (>= original). */
  tier: Tier;
  /** Inline scaffold; empty when no override applied. */
  scaffold: string;
  /** Whether the policy actually changed the tier. */
  applied: boolean;
  /** Short human-readable explanation, suitable for the router-hint reason field. */
  reason: string;
}

/**
 * Apply the GENERAL fallback policy.
 *
 * Only fires when the domain classifier returned `GENERAL` (no specific pack
 * matched). For `AMBIGUOUS` prompts the caller picks its own policy (Wave 2
 * Day 2 ships a separate AMBIGUOUS scaffold).
 *
 * @returns the effective tier and scaffold to use downstream. When the
 * recommended tier is already T2/T3, no change is applied — Opus on a
 * GENERAL prompt is the user's call, not a routing mistake to fix.
 */
export function applyGeneralFallback(args: {
  pack_id: string;
  recommended_tier: string;
}): GeneralFallbackResult {
  if (args.pack_id !== "GENERAL") {
    return { tier: args.recommended_tier as Tier, scaffold: "", applied: false, reason: "" };
  }
  const promoted = maxTier(args.recommended_tier, GENERAL_FALLBACK_TIER);
  const applied = promoted !== args.recommended_tier;
  return {
    tier: promoted,
    scaffold: GENERAL_FALLBACK_SCAFFOLD,
    applied,
    reason: applied
      ? `GENERAL pack — promoted ${args.recommended_tier}→${promoted} (no domain pack to specialise)`
      : "GENERAL pack — tier already at/above T2",
  };
}

// --- Fix #3: AMBIGUOUS scaffold (Wave 2 Day 2) -------------------------------

/** Scaffold injected when the domain classifier returned `AMBIGUOUS` — i.e. two
 *  or more packs scored close enough that picking one would be guesswork. The
 *  scaffold instructs the model to ask one disambiguation question (or proceed
 *  with the more general approach if the answer is obvious) before planning.
 *  AMBIGUOUS does not change the tier — complexity decides as usual; the
 *  scaffold only addresses the domain ambiguity. */
export const AMBIGUOUS_SCAFFOLD_TEMPLATE =
  "Multiple packs match this prompt with similar confidence ({candidates}). Before planning, ask the user 1 clarifying question to disambiguate, OR proceed with the more general approach if obvious. Do not assume.";

export interface AmbiguousScaffoldResult {
  /** Inline scaffold text with candidate packs interpolated; empty when not applicable. */
  scaffold: string;
  /** Whether the scaffold was emitted. */
  applied: boolean;
}

/**
 * Build the AMBIGUOUS scaffold. Pure: takes the list of candidate pack ids and
 * returns the rendered scaffold. Caller decides whether to inject it (typically
 * only when the pack_id is "AMBIGUOUS" and at least two candidates are present).
 */
export function applyAmbiguousScaffold(args: {
  pack_id: string;
  candidates: string[];
}): AmbiguousScaffoldResult {
  if (args.pack_id !== "AMBIGUOUS" || args.candidates.length < 2) {
    return { scaffold: "", applied: false };
  }
  const list = args.candidates.join(", ");
  return {
    scaffold: AMBIGUOUS_SCAFFOLD_TEMPLATE.replace("{candidates}", list),
    applied: true,
  };
}

// --- Fix #2: keyword tier escalation -----------------------------------------

export interface TierEscalationResult {
  /** Tier after applying escalation. */
  tier: Tier;
  /** Whether a keyword matched and the tier was promoted. */
  applied: boolean;
  /** The keyword that triggered escalation (first match), or empty. */
  matched_keyword: string;
  /** Short human-readable explanation. */
  reason: string;
}

/**
 * Apply pack-defined keyword escalation. When the prompt contains any of the
 * pack's `escalation_keywords` (case-insensitive substring), the tier is
 * promoted to `model_ceiling`.
 *
 * Used to keep a pack's floor low for cheap variants (lint, secret scan) while
 * still routing deep / production-grade audits to the ceiling (Opus).
 */
export function applyTierEscalation(args: {
  prompt: string;
  pack: { escalation_keywords?: string[]; model_ceiling: string };
  suggested_tier: string;
}): TierEscalationResult {
  const kws = args.pack.escalation_keywords ?? [];
  if (kws.length === 0) {
    return {
      tier: args.suggested_tier as Tier,
      applied: false,
      matched_keyword: "",
      reason: "",
    };
  }
  const haystack = args.prompt.toLowerCase();
  const matched = kws.find((k) => haystack.includes(k.toLowerCase())) ?? "";
  if (!matched) {
    return {
      tier: args.suggested_tier as Tier,
      applied: false,
      matched_keyword: "",
      reason: "",
    };
  }
  const promoted = maxTier(args.suggested_tier, args.pack.model_ceiling);
  const applied = promoted !== args.suggested_tier;
  return {
    tier: promoted,
    applied,
    matched_keyword: matched,
    reason: applied
      ? `keyword "${matched}" → escalated to ${promoted} (ceiling)`
      : `keyword "${matched}" matched but tier ${args.suggested_tier} already >= ceiling`,
  };
}

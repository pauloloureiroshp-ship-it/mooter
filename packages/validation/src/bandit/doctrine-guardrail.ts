// Doctrine guardrail — classify.js wins the bandit (V4 principle 5, Wave 30 Phase G).
//
// The bandit may only BIAS the model/arm choice; it can never undercut the tier
// that classify.js decided. Hard invariants:
//
//   1. An arm whose tier is BELOW the classify-decided tier is never allowed.
//   2. On a HIGH_RISK decision, NO bias is permitted — the only allowed arm is
//      one matching the classify tier exactly.
//
// `clampTier` is the last-line enforcement: even if a caller hands the bandit a
// bad arm, the chosen tier is clamped up to the doctrine floor.

import type { Tier } from "../types.ts";

const ORDER: Record<Tier, number> = { T0: 0, T1: 1, T2: 2, T3: 3 };

export interface GuardrailInput {
  classifyTier: Tier;
  /** When true, the classify decision is doctrine-protected — no downward OR upward bias. */
  highRisk?: boolean;
}

export interface TieredArm {
  id: string;
  tier: Tier;
  estCostUsd?: number;
}

/** True iff routing to `chosenTier` would undercut the classify floor. */
export function violatesDoctrine(chosenTier: Tier, classifyTier: Tier): boolean {
  return ORDER[chosenTier] < ORDER[classifyTier];
}

/** Clamp a chosen tier UP to the doctrine floor (never returns below the floor). */
export function clampTier(chosen: Tier, floor: Tier): Tier {
  return ORDER[chosen] < ORDER[floor] ? floor : chosen;
}

/**
 * Filter candidate arms to those the bandit is allowed to sample among.
 * - high-risk → exactly the classify tier (no bias at all)
 * - otherwise → arms whose tier ≥ classify tier
 *
 * Throws if no arm satisfies the floor (caller must always include a
 * classify-tier arm so the bandit can never be forced into a violation).
 */
export function allowedArms(arms: TieredArm[], g: GuardrailInput): TieredArm[] {
  const floor = ORDER[g.classifyTier];
  const allowed = g.highRisk
    ? arms.filter((a) => ORDER[a.tier] === floor)
    : arms.filter((a) => ORDER[a.tier] >= floor);
  if (allowed.length === 0) {
    throw new Error(
      `doctrine-guardrail: no arm at or above tier ${g.classifyTier}` +
        (g.highRisk ? " (high-risk requires an exact-tier arm)" : ""),
    );
  }
  return allowed;
}

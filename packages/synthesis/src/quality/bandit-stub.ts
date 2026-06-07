// L16.2 — Online bandit learner (Wave 29 STUB; full impl Wave 30).
//
// In Wave 30 this becomes a Thompson-Sampling contextual bandit keyed on
// (prompt_class × hardware_class × subscription_tier), learning from the
// pastor_v2_decisions outcomes. In Wave 29 it is inert: selectArm() returns null
// so routing is unchanged. Doctrine: classify.js owns the tier; the bandit can
// only ever refine within the guardrail, never override it.

export const BANDIT_ENABLED = false;

export interface BanditContext {
  prompt_class?: string;
  hardware_class?: string;
  subscription_tier?: string;
}

export interface BanditArm {
  tier: string;
  model: string;
}

/** Wave 29: always null (no learning yet). */
export function selectArm(_context: BanditContext): BanditArm | null {
  if (!BANDIT_ENABLED) return null;
  return null; // Wave 30: posterior-sampled arm within the classify.js guardrail.
}

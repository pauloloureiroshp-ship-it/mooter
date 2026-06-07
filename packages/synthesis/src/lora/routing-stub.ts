// L13 routing-stub — the auto hot-swap decision point (Wave 29: ALWAYS null).
//
// In Wave 31 (Pastor v2 / LORAUTER) this selects a per-task LoRA adapter to swap
// in before dispatch. In Wave 29 it is intentionally inert: it returns null so
// routing behaviour is byte-for-byte unchanged. Doctrine principle: classify.js
// owns the tier; a future bandit/LoRA layer never overrides the hard guardrail.

import type { LoraAdapter } from "./adapter-registry.ts";

/** Wave 29: auto-swap is OFF. */
export const AUTO_SWAP_ENABLED = false;

export interface RoutingFeatures {
  prompt_class?: string; // 'T0' | 'T1' | 'T2' | 'T3'
  task_tags?: string[];
  base_model?: string;
}

/**
 * Select an adapter to hot-swap for this task. Wave 29 always returns null
 * (no auto-swap). The signature is the Wave 31 contract; the body is the stub.
 */
export function selectAdapterForTask(_features: RoutingFeatures): LoraAdapter | null {
  if (!AUTO_SWAP_ENABLED) return null;
  // Wave 31: rank registry adapters by task_tag overlap × pastor signal, honour
  // base_model match, never override classify.js tier. (Not active yet.)
  return null;
}

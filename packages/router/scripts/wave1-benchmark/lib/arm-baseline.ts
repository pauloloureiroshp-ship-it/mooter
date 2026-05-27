// arm-baseline.ts — arm B: Sonnet 4.6 always, empty system prompt, zero hints.
// "Vale o Pastor vs Sonnet bare?" (§2). Carries its fixed tier T2 for the record.

import { invokeModel } from "./invoke.ts";
import { BASELINE_MODEL } from "./models.ts";
import type { ArmInvocation } from "./types.ts";

export async function runBaseline(prompt: string): Promise<ArmInvocation> {
  const r = await invokeModel(BASELINE_MODEL, "", prompt);
  return {
    model_used: BASELINE_MODEL,
    tier_routed: "T2",
    pack_routed: null,
    pack_confidence: null,
    latency_classifier_ms: 0,
    latency_llm_ms: r.latency_ms,
    latency_total_ms: r.latency_ms,
    tokens_input: r.tokens_input,
    tokens_output: r.tokens_output,
    response: r.text,
    status: r.status,
    error: r.error,
    system_prompt_used: null,
    skills_invoke: null,
  };
}

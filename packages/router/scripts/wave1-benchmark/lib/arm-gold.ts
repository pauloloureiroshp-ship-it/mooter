// arm-gold.ts — arm C: Opus 4.7 always, empty system prompt, zero hints.
// "Quanto perdemos vs gold standard?" (§2). Carries its fixed tier T3.

import { invokeModel } from "./invoke.ts";
import { GOLD_MODEL } from "./models.ts";
import type { ArmInvocation } from "./types.ts";

export async function runGold(prompt: string): Promise<ArmInvocation> {
  const r = await invokeModel(GOLD_MODEL, "", prompt);
  return {
    model_used: GOLD_MODEL,
    tier_routed: "T3",
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

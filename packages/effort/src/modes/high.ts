import type { EffortConfig } from "../types.ts";

// high — default + LLMLingua prompt compression and a lower workflow auto-trigger.
// Saves more on big prompts without the full ultramoo machinery.
export const HIGH: EffortConfig = {
  mode: "high",
  llmlingua: true,
  caveman: false,
  lorauter: true,
  multiLora: false,
  workflowAutoThreshold: 2000,
  costCap: { workflowUsd: 3, sessionUsd: 40 },
  banditLocalBias: "soft",
  statuslineUltramooChip: false,
};

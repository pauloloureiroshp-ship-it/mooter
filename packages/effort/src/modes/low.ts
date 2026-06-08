import type { EffortConfig } from "../types.ts";

// low — baseline. Nothing extra: no compression, no auto workflows, generous
// cost caps, no local bias. The router still routes; this just adds nothing.
export const LOW: EffortConfig = {
  mode: "low",
  llmlingua: false,
  caveman: false,
  lorauter: false,
  multiLora: false,
  workflowAutoThreshold: null,
  costCap: { workflowUsd: 5, sessionUsd: 50 },
  banditLocalBias: "off",
  statuslineUltramooChip: false,
};

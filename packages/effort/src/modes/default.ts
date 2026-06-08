import type { EffortConfig } from "../types.ts";

// default — Pastor hints active (LORAUTER on) + a soft local bias. The everyday
// mode: route well, prefer local when it's a wash, but don't compress or
// auto-spawn workflows.
export const DEFAULT: EffortConfig = {
  mode: "default",
  llmlingua: false,
  caveman: false,
  lorauter: true,
  multiLora: false,
  workflowAutoThreshold: null,
  costCap: { workflowUsd: 5, sessionUsd: 50 },
  banditLocalBias: "soft",
  statuslineUltramooChip: false,
};

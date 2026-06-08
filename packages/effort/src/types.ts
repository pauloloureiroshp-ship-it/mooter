// Wave 32 (Phase NEW2) — effort mode types.
//
// An EffortConfig is a set of ADVISORY flags persisted to ~/.mooter/effort.json.
// Consumers (statusline line 3, workflow auto-trigger, compression layer, bandit)
// read these flags and adjust behavior. They are NOT a tier override: classify.js
// HIGH_RISK floors and the tier guardrail always win (doctrine principle 6 /
// "Doctrine wins ultramoo"). Ultramoo makes Mooter *try harder to save*, never
// *route a critical task cheaper than it should be*.

export type EffortMode = "low" | "default" | "high" | "ultramoo";

export type BanditBias = "off" | "soft" | "hard";

export interface EffortConfig {
  mode: EffortMode;
  /** LLMLingua prompt compression (4-10×). */
  llmlingua: boolean;
  /** Caveman pack auto-apply for prose. */
  caveman: boolean;
  /** Pastor v2 LORAUTER per-task adapter routing. */
  lorauter: boolean;
  /** Multi-LoRA serving via vLLM (only effective when vLLM is installed). */
  multiLora: boolean;
  /** Auto-trigger the Workflow Engine above this prompt-token estimate; null = manual only. */
  workflowAutoThreshold: number | null;
  /** Cost-cap ceilings the bandit / workflows respect. */
  costCap: { workflowUsd: number; sessionUsd: number };
  /** Bandit Learner local bias strength. */
  banditLocalBias: BanditBias;
  /** Show the `🐄 ultramoo` chip on statusline line 3 (opt-in line 3 only). */
  statuslineUltramooChip: boolean;
}

/** The 8 ultramoo sub-systems, named for the activation gate test. */
export const ULTRAMOO_SUBSYSTEMS = [
  "llmlingua",
  "caveman",
  "lorauter",
  "multiLora",
  "workflowAutoThreshold",
  "costCap",
  "banditLocalBias",
  "statuslineUltramooChip",
] as const;

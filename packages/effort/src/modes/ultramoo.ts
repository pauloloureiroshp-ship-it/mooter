import type { EffortConfig } from "../types.ts";

// ultramoo — maximum frugality. Flips all 8 sub-systems ON simultaneously:
//   1. LLMLingua compression           (4-10× prompt shrink)
//   2. Caveman pack for prose          (terse rewriting)
//   3. LORAUTER per-task routing        (best local adapter per task)
//   4. Multi-LoRA via vLLM             (concurrent adapters, if installed)
//   5. Workflow auto-trigger > 500 tok  (fan out to free local workers early)
//   6. Stricter cost cap ($1/$20)       (hard ceilings)
//   7. Hard local bias                  (bandit strongly prefers T0)
//   8. Statusline ultramoo chip         (🐄 ultramoo on line 3)
//
// All advisory. classify.js HIGH_RISK floors still force T3 — ultramoo never
// downgrades a critical task (doctrine: "Doctrine wins ultramoo").
export const ULTRAMOO: EffortConfig = {
  mode: "ultramoo",
  llmlingua: true,
  caveman: true,
  lorauter: true,
  multiLora: true,
  workflowAutoThreshold: 500,
  costCap: { workflowUsd: 1, sessionUsd: 20 },
  banditLocalBias: "hard",
  statuslineUltramooChip: true,
};

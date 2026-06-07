// Auto-recovery planner (Wave 30 Phase M) — maps machine signals to recovery
// actions deterministically. Pure: detection inputs in, planned actions out. The
// caller decides whether to execute auto actions or just surface them.

import { type ErrorScenarioId, ERROR_CATALOG } from "./error-catalog.ts";

export interface SystemSignals {
  ollamaReachable?: boolean;
  ollamaModelCount?: number;
  hubReachable?: boolean;
  /** 0..100 remaining cloud quota for the window. */
  quotaRemainingPct?: number;
  diskFreeMb?: number;
  /** rolling average cloud latency, ms. */
  avgLatencyMs?: number;
  workflowCrashed?: boolean;
  loraIncompatible?: boolean;
}

export interface RecoveryThresholds {
  diskFreeMbMin: number;
  latencyMsMax: number;
  quotaPctMin: number;
}

export const DEFAULT_THRESHOLDS: RecoveryThresholds = {
  diskFreeMbMin: 500,
  latencyMsMax: 5000,
  quotaPctMin: 10,
};

export type RecoveryActionKind =
  | "repair_ollama"
  | "queue_local"
  | "bias_local_hard"
  | "resume_workflow"
  | "fallback_baseline"
  | "audit_disk"
  | "degrade_tier";

export interface RecoveryAction {
  scenario: ErrorScenarioId;
  kind: RecoveryActionKind;
  message: string;
  auto: boolean;
  chip?: string;
}

function action(scenario: ErrorScenarioId, kind: RecoveryActionKind): RecoveryAction {
  const s = ERROR_CATALOG[scenario];
  return { scenario, kind, message: s.recovery, auto: s.autoRecoverable, chip: s.statuslineChip };
}

/** Plan recovery actions from the current signals (highest-impact first). */
export function planRecovery(
  signals: SystemSignals,
  thresholds: RecoveryThresholds = DEFAULT_THRESHOLDS,
): RecoveryAction[] {
  const out: RecoveryAction[] = [];

  // Ollama down or model-bare → local tier has no backend.
  if (signals.ollamaReachable === false || signals.ollamaModelCount === 0) {
    out.push(action("ollama_down", "repair_ollama"));
  }
  // Quota out → bias local hard (most user-visible cost event).
  if (typeof signals.quotaRemainingPct === "number" && signals.quotaRemainingPct <= thresholds.quotaPctMin) {
    out.push(action("quota_exhausted", "bias_local_hard"));
  }
  // Hub offline → queue locally.
  if (signals.hubReachable === false) {
    out.push(action("hub_unreachable", "queue_local"));
  }
  // Workflow crashed → resume.
  if (signals.workflowCrashed) {
    out.push(action("workflow_crash", "resume_workflow"));
  }
  // LoRA incompatible → baseline.
  if (signals.loraIncompatible) {
    out.push(action("lora_incompat", "fallback_baseline"));
  }
  // Disk low → audit.
  if (typeof signals.diskFreeMb === "number" && signals.diskFreeMb < thresholds.diskFreeMbMin) {
    out.push(action("disk_low", "audit_disk"));
  }
  // Network slow → degrade tier.
  if (typeof signals.avgLatencyMs === "number" && signals.avgLatencyMs > thresholds.latencyMsMax) {
    out.push(action("network_slow", "degrade_tier"));
  }
  return out;
}

/** Convenience: the subset of planned actions that can be applied automatically. */
export function autoActions(actions: RecoveryAction[]): RecoveryAction[] {
  return actions.filter((a) => a.auto);
}

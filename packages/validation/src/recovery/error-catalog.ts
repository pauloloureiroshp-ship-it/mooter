// Recovery error catalog (Wave 30 Phase M) — the 7 failure scenarios Mooter
// detects and the recovery each maps to. See docs/ux/ERROR_CATALOG.md.

export type ErrorScenarioId =
  | "ollama_down"
  | "hub_unreachable"
  | "quota_exhausted"
  | "workflow_crash"
  | "lora_incompat"
  | "disk_low"
  | "network_slow";

export interface RecoveryScenario {
  id: ErrorScenarioId;
  title: string;
  detect: string;
  userImpact: string;
  recovery: string;
  autoRecoverable: boolean;
  statuslineChip?: string;
}

export const ERROR_CATALOG: Record<ErrorScenarioId, RecoveryScenario> = {
  ollama_down: {
    id: "ollama_down",
    title: "Ollama daemon down or model-bare",
    detect: "GET /api/tags fails or returns zero models",
    userImpact: "local-tier routing has no backend; everything would escalate to cloud",
    recovery: "run `mooter setup repair` (starts ollama, pulls the default model)",
    autoRecoverable: true,
    statuslineChip: "🔧 ollama down — setup repair",
  },
  hub_unreachable: {
    id: "hub_unreachable",
    title: "Hub unreachable",
    detect: "hub heartbeat/sync request times out or 5xx",
    userImpact: "telemetry/sync can't upload; Pastor hints stale",
    recovery: "queue events locally (sync-queue.jsonl) and retry later; no data lost",
    autoRecoverable: true,
    statuslineChip: "📡 hub offline — queued",
  },
  quota_exhausted: {
    id: "quota_exhausted",
    title: "Subscription quota exhausted",
    detect: "provider returns 429 / quota header at 0",
    userImpact: "cloud tiers unavailable for the rest of the window",
    recovery: "bias routing hard to local for the remaining window; surface ETA to reset",
    autoRecoverable: true,
    statuslineChip: "🪫 quota out — local only",
  },
  workflow_crash: {
    id: "workflow_crash",
    title: "Workflow crashed mid-run",
    detect: "a workflow run row is left in `running` with no recent checkpoint",
    userImpact: "partial work; user unsure whether to restart from scratch",
    recovery: "resume from last checkpoint: `mooter workflow resume <runId>`",
    autoRecoverable: false,
    statuslineChip: "🔄 workflow resumable",
  },
  lora_incompat: {
    id: "lora_incompat",
    title: "LoRA adapter incompatible",
    detect: "adapter base-model mismatch or signature failure at activation",
    userImpact: "routing bias from the adapter is unsafe/unavailable",
    recovery: "fall back to the baseline router (adapter disabled, no bias)",
    autoRecoverable: true,
    statuslineChip: "🧩 adapter off — baseline",
  },
  disk_low: {
    id: "disk_low",
    title: "Disk space low",
    detect: "free space under threshold (default 500 MB) at pre-flight",
    userImpact: "model pulls / workflow state writes may fail mid-operation",
    recovery: "pre-flight `mooter setup audit` warns before a large pull; suggest cleanup",
    autoRecoverable: false,
    statuslineChip: "💾 disk low",
  },
  network_slow: {
    id: "network_slow",
    title: "Network slow",
    detect: "rolling avg cloud latency over threshold (default 5000 ms)",
    userImpact: "cloud calls feel laggy; sessions stall",
    recovery: "auto-degrade: prefer local tier where quality allows until latency recovers",
    autoRecoverable: true,
    statuslineChip: "🐢 net slow — local-bias",
  },
};

export function lookup(id: ErrorScenarioId): RecoveryScenario {
  return ERROR_CATALOG[id];
}

export const SCENARIO_IDS = Object.keys(ERROR_CATALOG) as ErrorScenarioId[];

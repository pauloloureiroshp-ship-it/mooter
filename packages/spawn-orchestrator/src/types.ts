// Wave 33.5 Block B — Spawn Orchestrator types.

export type Tier = "T0" | "T1" | "T2" | "T3";
export type NetworkPolicy = "none" | "local" | "cloud";

/** The 4 mandatory sandbox layers (brief §B.3). */
export interface SandboxConfig {
  // Layer 1 — network egress.
  network: NetworkPolicy;
  allowedDomains: string[]; // captured for the future per-domain proxy
  // Layer 2 — filesystem boundaries.
  worktreePath: string; // the single writable mount
  readOnlyPaths: string[]; // mounted read-only (informational; root is ro by default)
  blockedPaths: string[]; // masked with an empty tmpfs (e.g. ~/.ssh, ~/.gnupg)
  // Layer 3 — secrets scoping.
  envWhitelist: string[]; // only these env vars reach the child
  // Layer 4 — config protection.
  configReadOnly: string[]; // config files that must never be writable
}

export interface SpawnRequest {
  task: string;
  /** Override the auto-classified tier. */
  forceTier?: Tier;
  /** "cloud" forces a cloud subprocess, "local" forces Ollama. */
  mode?: "auto" | "cloud" | "local";
  /** Base branch the worktree is cut from (defaults to current HEAD). */
  baseBranch?: string;
}

export type SpawnStatus = "pending" | "sandboxed" | "running" | "done" | "failed" | "killed";

export interface SpawnRecord {
  id: string;
  task: string;
  tier: Tier;
  mode: "cloud" | "local";
  status: SpawnStatus;
  worktreePath: string;
  branch: string;
  createdAtMs: number;
  updatedAtMs: number;
  pid: number | null;
  exitCode: number | null;
  sandbox: SandboxConfig;
  /** Token/cost estimate is intentionally absent unless the runner records it. */
  estCostUsd?: number;
}

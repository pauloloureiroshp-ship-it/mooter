// Wave 33.5 Block A — shared types for the Sessions Orchestrator.
//
// Everything here describes read-only, locally-derived state. No field is ever
// a measured cost or a server-authoritative quota; estimates are labelled as
// such at the render layer.

export type Tier = "T0" | "T1" | "T2" | "T3";

export interface TierMix {
  T0: number;
  T1: number;
  T2: number;
  T3: number;
}

/** A single Claude Code session discovered from a local transcript. */
export interface SessionInfo {
  sessionId: string;
  /** Encoded project-dir folder name under ~/.claude/projects (lossy vs cwd). */
  project: string;
  transcriptPath: string;
  birthMs: number;
  mtimeMs: number;
  ageMs: number;
  /** Real user prompts (tool_result-only continuations excluded). */
  prompts: number;
  tiers: TierMix;
  /** Estimated $ saved vs all-Opus baseline (nominal per-tier cost). */
  estSavedUsd: number;
  live: boolean;
  /** Resolved terminal/worktree label (A.7), when the session maps to a worktree. */
  terminalName?: string | null;
  worktreePath?: string | null;
  branch?: string | null;
  /** Active workflow progress (A.6), when one is running for this session. */
  workflow?: WorkflowProgress | null;
}

export interface WorktreeInfo {
  path: string;
  head: string;
  branch: string | null;
  bare: boolean;
  detached: boolean;
  /** The ~/.claude/projects encoded folder name this worktree would map to. */
  encoded: string;
}

export interface QuotaForecast {
  windowHours: number;
  /** Cloud (T2+T3) calls observed inside the trailing window. */
  cloudCallsInWindow: number;
  /** All classified calls inside the window. */
  totalCallsInWindow: number;
  /** Calls/hour over the observed portion of the window. */
  ratePerHour: number;
  /** Projected cloud calls by window end at the current rate. */
  projectedCloudCalls: number;
  /** Minutes until the trailing window's oldest call ages out. */
  windowResetInMin: number;
  /** Honest flag — this is a local rate projection, not a server quota. */
  estimated: true;
}

export interface WorkflowProgress {
  id: string;
  done: number;
  total: number;
  tokens: number;
  status: string;
}

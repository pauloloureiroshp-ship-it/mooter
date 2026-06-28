// types.ts — Overclock Moo Fase 1 shared contracts.
//
// One vocabulary shared by the allocator (planner), the runner (executor) and the
// metrics writer (cockpit contract). Pure types — no IO, no runtime.

/** Deterministic gate a job's output must pass (the hard QA constraint). */
export type GateKind =
  | "test" // run a test suite — exit 0 ⇒ pass
  | "types" // typecheck — exit 0 ⇒ pass
  | "lint" // lint — exit 0 ⇒ pass
  | "compile" // compile/build — exit 0 ⇒ pass
  | "exec"; // any deterministic command whose exit code is the verdict

/** Which physical resource a moo occupies while it works. */
export type Resource =
  | "gpu" // an LLM moo on the GPU (continuous-batching slot; consumes KV-cache VRAM)
  | "cpu"; // a deterministic verification moo (tests/typecheck/lint) — no LLM, no VRAM

/**
 * The asymmetry-safe job catalogue. EVERY kind here is a "brick" or a
 * verification step — NEVER "the piano" (architecture, the creative
 * implementation, an irreversible decision). The allocator hard-rejects any
 * kind outside this union (see ASYMMETRY_SAFE_KINDS in job-catalogue.ts).
 */
export type JobKind =
  // ── CPU verification track (deterministic, no LLM, truly $0) ──────────────
  | "run-tests"
  | "typecheck"
  | "lint"
  | "dead-code-scan"
  | "dep-audit"
  // ── GPU LLM track (local model on the GPU; output gated deterministically) ─
  | "doc-gen"
  | "boilerplate-draft"
  | "test-stubs"
  | "commit-msg"
  | "journal-rollup"
  | "backlog-summarize"
  | "code-review-gated";

/** A unit of REAL pending work offered to the allocator. */
export interface PendingJob {
  id: string;
  kind: JobKind;
  /** Wave-58 TaskCategory used for the specialization-matrix lookup. */
  category: string;
  /**
   * Estimated human-equivalent minutes this job UNBLOCKS when it passes its
   * gate. This is an ESTIMATE per job kind (documented baselines), never a
   * stopwatch reading — see the METR caveat in metrics.ts. It is the knapsack
   * value ("the star: human-time-unblocked"), counted only on a passing gate.
   */
  humanMinutes: number;
  /** Slots consumed (continuous-batching width). Default 1. */
  kvWeight?: number;
  /** gpu (LLM) or cpu (deterministic verification). */
  resource: Resource;
  /** Deterministic gate the output must pass. */
  gate: GateKind;
  /** Shell command the runner executes for the gate (cwd-relative). */
  command?: string;
  /** Working dir for the command (default: repo root). */
  cwd?: string;
  /**
   * TRUE only when there is real pending work behind this job (a diff to test,
   * a missing doc, …). The allocator drops anything with pending=false — no
   * busywork (change ≠ improvement).
   */
  pending: boolean;
}

/** Model pick for a job, attributed from the specialization matrix (read-only). */
export interface ModelPick {
  /** The matrix model id chosen for this job's category. */
  model: string;
  /** "matrix" = a measured cell backed the pick; "default" = honest fallback. */
  modelSource: "matrix" | "default";
  /** Matrix cell score in [0,1], or null (unmeasured ⇒ quality n/d). */
  qualityScore: number | null;
  /** tes-calculator price status — local picks must be "free" ($0 guarantee). */
  priceStatus: string;
}

/** A job the allocator decided to run, with its model pick and slot. */
export interface AllocatedJob extends PendingJob {
  pick: ModelPick;
  /** Slot index within its resource pool (0-based). */
  slot: number;
}

/** Why a candidate job was not allocated. */
export interface RejectedJob {
  id: string;
  reason:
    | "not-asymmetry-safe"
    | "no-pending-work"
    | "no-value"
    | "no-headroom"
    | "slot-capacity";
}

/** The GPU slice of the MissionControlSnapshot (gpu-monitor.js shape). */
export interface GpuSlice {
  totalMb: number | null;
  freeMb: number | null;
  utilPct: number | null;
  fitsMoos: number | null;
  at?: number;
  gpus?: unknown[];
}

/** Minimal snapshot the allocator reads (subset of MissionControlSnapshot). */
export interface OverclockSnapshot {
  gpu?: GpuSlice | null;
  project?: string | null;
}

/** Capacity the allocator derived from the GPU snapshot + guards. */
export interface Capacity {
  /** GPU continuous-batching slots (LLM moos) — bounded by VRAM KV headroom + comfort cap. */
  gpuSlots: number;
  /** Deterministic-verification workers (CPU moos). */
  cpuSlots: number;
  /** 85%-of-total VRAM ceiling we never cross (never OOM). null = no GPU (n/d). */
  vramBudgetMb: number | null;
  /** VRAM left for KV cache after the resident base + others. */
  kvHeadroomMb: number | null;
  /** Comfort cap actually applied (thermal/watt/noise). */
  comfortCap: number;
  /** Resident base model footprint assumed (MB). */
  baseVramMb: number;
}

/** The allocator's output — the plan the runner executes. */
export interface AllocationPlan {
  capacity: Capacity;
  /** Resident base model the continuous-batching runtime serves. */
  baseModel: string;
  jobs: AllocatedJob[];
  /** true when there is no headroom OR no real pending work (honest IDLE). */
  idle: boolean;
  rejected: RejectedJob[];
  /** Sum of allocated jobs' humanMinutes — an ESTIMATE (not yet realized). */
  estHumanMinutes: number;
  /** Human-readable one-liner explaining the plan / idle reason. */
  reason: string;
}

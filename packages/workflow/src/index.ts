// @mooter/workflow — public entry point.
//
// Re-exports the engine surface and publishes phase status. Wave 28 Phase A+B
// ships the skeleton: every export below resolves to a stub that throws
// NotImplementedError until its phase lands. Loading this module pulls in NO
// native/heavy deps (isolated-vm, better-sqlite3, ink, …) — those are imported
// only inside the phase that needs them.

export const WORKFLOW_ENGINE_VERSION = "0.1.0";

/** Per-module implementation status, for `mooter workflow` and tests. */
export const PHASES = {
  agent: { phase: "C", done: false },
  pool: { phase: "C", done: false },
  primitives: { phase: "D", done: false },
  runtime: { phase: "E", done: false },
  state: { phase: "F", done: false },
  writer: { phase: "G", done: false },
  presenter: { phase: "G", done: false },
  tui: { phase: "H", done: false },
} as const;

/** True once every module's stub has been replaced by a real implementation. */
export function isEngineReady(): boolean {
  return Object.values(PHASES).every((m) => m.done);
}

export { NotImplementedError } from "./_stub.ts";
export type { Phase } from "./_stub.ts";

export { agent } from "./agent.ts";
export type { AgentRequest, AgentResult, Backend } from "./agent.ts";

export { AgentPool, detectOptimalConcurrency } from "./pool.ts";
export type { PoolOptions } from "./pool.ts";

export { parallel, vote, converge, checkpoint, log } from "./primitives.ts";

export { runScript, RUNTIME_DEFAULTS } from "./runtime.ts";
export type { RuntimeOptions } from "./runtime.ts";

export { saveCheckpoint, loadRun, resumeFrom } from "./state.ts";
export type { RunRecord, CheckpointRecord, RunStatus } from "./state.ts";

export { writeWorkflow } from "./writer.ts";
export type { WorkflowPlan, PhasePlan } from "./writer.ts";

export { presentPlan } from "./presenter.ts";
export type { PresentDecision, PresentOptions } from "./presenter.ts";

export { watch } from "./tui.ts";
export type { WatchOptions } from "./tui.ts";

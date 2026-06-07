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
  agent: { phase: "C", done: true },
  pool: { phase: "C", done: true },
  primitives: { phase: "D", done: true },
  runtime: { phase: "E", done: true },
  state: { phase: "F", done: true },
  writer: { phase: "G", done: true },
  presenter: { phase: "G", done: true },
  tui: { phase: "H", done: false },
} as const;

/** True once every module's stub has been replaced by a real implementation. */
export function isEngineReady(): boolean {
  return Object.values(PHASES).every((m) => m.done);
}

export { NotImplementedError } from "./_stub.ts";
export type { Phase } from "./_stub.ts";

export { agent, inferBackend, AgentError } from "./agent.ts";
export type { AgentRequest, AgentResult, Backend } from "./agent.ts";

export {
  AgentPool,
  detectOptimalConcurrency,
  DEFAULT_CONCURRENCY,
  PER_WORKER_VRAM_MB,
  MAX_CONCURRENCY,
} from "./pool.ts";
export type { PoolOptions, ConcurrencyOptions, Vram, GetVram } from "./pool.ts";

export { readTool, grepTool, globTool, TOOL_REGISTRY } from "./tools.ts";
export type { ToolContext, GrepMatch, ToolName } from "./tools.ts";

export { priceTurn, prices } from "./pricing.ts";

export {
  parallel,
  vote,
  converge,
  checkpoint,
  log,
  setSink,
  getSink,
  createMemorySink,
} from "./primitives.ts";
export type {
  CheckpointSink,
  MemorySink,
  CheckpointEntry,
  LogEntry,
} from "./primitives.ts";

export { runScript, RUNTIME_DEFAULTS, RuntimeError } from "./runtime.ts";
export type { RuntimeOptions, RuntimeApi } from "./runtime.ts";

export {
  WorkflowStore,
  startRun,
  finishRun,
  saveCheckpoint,
  recordAgent,
  loadRun,
  listRuns,
  resumeFrom,
  defaultDbPath,
  closeDefaultStore,
  createSqliteSink,
  installSqliteSink,
} from "./state.ts";
export type {
  RunRecord,
  CheckpointRecord,
  RunStatus,
  AgentRecord,
  StartRunInput,
  AgentInput,
  SqliteSinkOptions,
} from "./state.ts";

export {
  writeWorkflow,
  parsePlan,
  extractJson,
  countAgentCalls,
  assertCompiles,
  WriterError,
  WRITER_SYSTEM_PROMPT,
  DEFAULT_WRITER_MODEL,
} from "./writer.ts";
export type { WorkflowPlan, PhasePlan, WriteOptions } from "./writer.ts";

export { presentPlan, renderPlan } from "./presenter.ts";
export type { PresentDecision, PresentOptions } from "./presenter.ts";

export { watch } from "./tui.ts";
export type { WatchOptions } from "./tui.ts";

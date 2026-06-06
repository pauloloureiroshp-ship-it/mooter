// SQLite checkpoint store — Phase F (T2). Stub: signatures only.
//
// ~/.mooter/workflows/state.db via better-sqlite3. Tables: runs, checkpoints,
// agents. Enables cross-session resume: kill mid-run, restart, resumeFrom()
// continues exactly where it left off. This is the headline differentiator vs
// Anthropic Dynamic Workflows (which resume same-session only).

import { notImplemented } from "./_stub.ts";

export type RunStatus = "running" | "completed" | "failed" | "cancelled";

export interface RunRecord {
  run_id: string;
  workflow_name?: string;
  ts_start: number;
  ts_end?: number;
  status: RunStatus;
  num_phases?: number;
  num_agents_total?: number;
}

export interface CheckpointRecord {
  run_id: string;
  name: string;
  data: unknown;
  ts: number;
}

export function saveCheckpoint(_runId: string, _name: string, _data: unknown): void {
  notImplemented("saveCheckpoint()", "F");
}

export function loadRun(_runId: string): RunRecord | null {
  return notImplemented("loadRun()", "F");
}

export function resumeFrom(_runId: string): CheckpointRecord[] {
  return notImplemented("resumeFrom()", "F");
}

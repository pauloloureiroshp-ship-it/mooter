// Active-run pointer — Phase H.
//
// A lightweight JSON breadcrumb at ~/.mooter/workflows/active-run.json that the
// statusline (tools/router/workflow-status.js) reads to render its opt-in line 3
// WITHOUT importing better-sqlite3 — the statusline runs on every prompt (hot
// path) and every other router tool is pure-JS/no-native. So the SQLite store
// stays the source of truth for history/resume; this pointer is the cheap live
// view. The reader is the JS counterpart; this file is the engine-side writer.
// Both must agree on ActiveRunSnapshot's shape.

import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { defaultDbPath } from "./state.ts";

export interface ActiveRunSnapshot {
  run_id: string;
  workflow_name?: string;
  /** Usually "running"; the reader hides the line for any other status. */
  status: string;
  /** 1-based current phase. */
  phase?: number;
  num_phases?: number;
  agents_done?: number;
  agents_total?: number;
  /** Last-updated epoch ms; the reader treats an old pointer as stale. */
  ts: number;
}

/** Path of the active-run pointer. Override with MOOTER_WORKFLOW_ACTIVE; else it
 *  sits next to the state.db (so MOOTER_WORKFLOW_DB / MOOTER_HOME flow through). */
export function activePointerPath(): string {
  const explicit = process.env.MOOTER_WORKFLOW_ACTIVE;
  if (explicit) return explicit;
  return path.join(path.dirname(defaultDbPath()), "active-run.json");
}

/** Write/refresh the pointer. Best-effort: a statusline breadcrumb must never
 *  break a run, so all errors are swallowed. `ts` defaults to now. */
export function updateActiveRun(snapshot: Omit<ActiveRunSnapshot, "ts"> & { ts?: number }): void {
  try {
    const p = activePointerPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const full: ActiveRunSnapshot = { ...snapshot, ts: snapshot.ts ?? Date.now() };
    fs.writeFileSync(p, JSON.stringify(full), "utf8");
  } catch {
    /* best-effort */
  }
}

/** Remove the pointer (call when a run finishes/cancels). Best-effort. */
export function clearActiveRun(): void {
  try {
    fs.rmSync(activePointerPath(), { force: true });
  } catch {
    /* best-effort */
  }
}

/** Read the pointer back (engine-side convenience; the statusline uses the JS
 *  reader). Returns null if absent/unparseable. */
export function readActiveRun(): ActiveRunSnapshot | null {
  try {
    return JSON.parse(fs.readFileSync(activePointerPath(), "utf8")) as ActiveRunSnapshot;
  } catch {
    return null;
  }
}

// Re-export so callers can resolve home without pulling os elsewhere.
export const mooterHome = (): string => process.env.MOOTER_HOME || os.homedir();

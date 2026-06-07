// Workflow primitives — Phase D.
//
// The vocabulary a workflow script composes with. Signatures are frozen by the
// brief (WAVE28_WORKFLOW_ENGINE_KICKOFF.md §"Phase D").
//
// `checkpoint`/`log` write to an ambient SINK rather than taking a run_id — the
// run context is implicit (matches the brief's argument-free signatures). The
// default sink is in-memory; Phase F installs a SQLite-backed sink via
// setSink() so progress survives across sessions. No coupling to the Phase F
// store exists yet (state.ts is still a stub).

import { AgentPool } from "./pool.ts";

/** Map `fn` over `items` with bounded concurrency, preserving input order.
 *  Concurrency defaults to the pool's VRAM-derived optimum. Rejects on the
 *  first task error (Promise.all semantics); wrap `fn` to make it resilient. */
export async function parallel<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  options: { concurrency?: number } = {},
): Promise<R[]> {
  if (items.length === 0) return [];
  const pool = new AgentPool({ concurrency: options.concurrency });
  return Promise.all(items.map((item) => pool.run(() => fn(item))));
}

/** Reduce candidates via a voting/adversarial pass; returns the survivors that
 *  voteFn keeps. Empty input short-circuits to []. */
export async function vote<R>(
  candidates: R[],
  voteFn: (candidates: R[]) => Promise<R[]>,
): Promise<R[]> {
  if (!Array.isArray(candidates)) throw new TypeError("vote: candidates must be an array");
  if (candidates.length === 0) return [];
  return voteFn(candidates);
}

/** Iteratively refine until fixpoint or maxIterations.
 *  Contract: refineFn returns the SAME reference when an item needs no further
 *  work (→ contributes to fixpoint), a NEW value to keep refining, or null to
 *  drop the item. Refines run concurrently within each iteration. */
export async function converge<R>(
  initial: R[],
  refineFn: (r: R) => Promise<R | null>,
  maxIterations = 3,
): Promise<R[]> {
  let current = initial;
  for (let iter = 0; iter < maxIterations; iter++) {
    const refined = await parallel<R, R | null>(current, (r) => refineFn(r));
    const next: R[] = [];
    let changed = false;
    for (let i = 0; i < refined.length; i++) {
      const r = refined[i];
      if (r === null) {
        changed = true; // item dropped
        continue;
      }
      if (r !== current[i]) changed = true; // item refined
      next.push(r);
    }
    current = next;
    if (!changed) break; // fixpoint
  }
  return current;
}

// ── Ambient sink (checkpoints + logs) ────────────────────────────────────────

export interface CheckpointEntry {
  name: string;
  data: unknown;
  ts: number;
}
export interface LogEntry {
  message: string;
  metadata?: Record<string, unknown>;
  ts: number;
}

export interface CheckpointSink {
  saveCheckpoint(name: string, data: unknown): void | Promise<void>;
  log(message: string, metadata?: Record<string, unknown>): void | Promise<void>;
}

export interface MemorySink extends CheckpointSink {
  readonly checkpoints: CheckpointEntry[];
  readonly logs: LogEntry[];
  reset(): void;
}

/** A sink that records into in-memory arrays — the Phase D default and a handy
 *  test double. Phase F provides a SQLite-backed sink. */
export function createMemorySink(): MemorySink {
  const checkpoints: CheckpointEntry[] = [];
  const logs: LogEntry[] = [];
  return {
    checkpoints,
    logs,
    saveCheckpoint(name, data) {
      checkpoints.push({ name, data, ts: Date.now() });
    },
    log(message, metadata) {
      logs.push({ message, metadata, ts: Date.now() });
    },
    reset() {
      checkpoints.length = 0;
      logs.length = 0;
    },
  };
}

let _sink: CheckpointSink = createMemorySink();

/** Install a sink (Phase F swaps in the SQLite-backed one). */
export function setSink(sink: CheckpointSink): void {
  _sink = sink;
}

/** The currently installed sink. */
export function getSink(): CheckpointSink {
  return _sink;
}

/** Persist named progress so the run can resume cross-session (Phase F store). */
export async function checkpoint(name: string, data: unknown): Promise<void> {
  await _sink.saveCheckpoint(name, data);
}

/** Emit a progress line to the run log / TUI. */
export async function log(
  message: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await _sink.log(message, metadata);
}

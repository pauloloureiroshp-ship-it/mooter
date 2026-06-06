// Workflow primitives — Phase D (T2). Stub: signatures only.
//
// The vocabulary a workflow script composes with. Signatures are frozen by the
// brief (WAVE28_WORKFLOW_ENGINE_KICKOFF.md §"Phase D") so later phases and the
// script writer (Phase G) target a stable surface.

import { notImplemented } from "./_stub.ts";

/** Map `fn` over `items` with bounded concurrency (default: pool optimum). */
export async function parallel<T, R>(
  _items: T[],
  _fn: (item: T) => Promise<R>,
  _options: { concurrency?: number } = {},
): Promise<R[]> {
  return notImplemented("parallel()", "D");
}

/** Reduce candidates via an adversarial/voting pass; returns survivors. */
export async function vote<R>(
  _candidates: R[],
  _voteFn: (candidates: R[]) => Promise<R[]>,
): Promise<R[]> {
  return notImplemented("vote()", "D");
}

/** Iteratively refine until fixpoint (refineFn → null drops the item). */
export async function converge<R>(
  _initial: R[],
  _refineFn: (r: R) => Promise<R | null>,
  _maxIterations = 3,
): Promise<R[]> {
  return notImplemented("converge()", "D");
}

/** Persist named progress so the run can resume cross-session (Phase F store). */
export async function checkpoint(_name: string, _data: unknown): Promise<void> {
  return notImplemented("checkpoint()", "D");
}

/** Emit a progress line to the run log / TUI. */
export async function log(
  _message: string,
  _metadata?: Record<string, unknown>,
): Promise<void> {
  return notImplemented("log()", "D");
}

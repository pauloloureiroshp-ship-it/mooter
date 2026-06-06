// Sandboxed runtime — Phase E (T3, CRITICAL 🔒). Stub: signatures only.
//
// Executes a workflow script inside an isolated-vm V8 isolate (NOT vm2 — it has
// historical sandbox-escape CVEs). Exposes mooter.agent()/parallel()/vote()/…
// and NOTHING else: no fs, child_process, process, or require(). Per-script
// timeout 4h, per-isolate memory cap 512MB. Doctrine guardrails (push/deploy/
// secrets → T3) are enforced here and cannot be optimized away.

import { notImplemented } from "./_stub.ts";

export interface RuntimeOptions {
  /** Max wall-clock for the whole script. Default 4h. */
  timeoutMs?: number;
  /** Per-isolate memory cap in MB. Default 512. */
  memoryLimitMb?: number;
  /** run_id this script executes under (for checkpoints). */
  runId?: string;
}

export const RUNTIME_DEFAULTS = {
  timeoutMs: 4 * 60 * 60 * 1000,
  memoryLimitMb: 512,
} as const;

/** Compile + run `script` in a fresh isolate; resolves with its return value. */
export async function runScript(
  _script: string,
  _options: RuntimeOptions = {},
): Promise<unknown> {
  return notImplemented("runScript()", "E");
}

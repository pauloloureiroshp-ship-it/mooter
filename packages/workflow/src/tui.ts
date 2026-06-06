// Terminal UI — Phase H (T2). Stub: signatures only.
//
// `mooter workflow watch <run_id>` — live progress tree (ink): phase x/N,
// agents done/total, per-worker model + latency. Reads the SQLite run state
// (Phase F). Distinct from the opt-in statusline line 3 (tools/router/
// workflow-status.js), which is a one-liner, not the full TUI.

import { notImplemented } from "./_stub.ts";

export interface WatchOptions {
  runId: string;
  /** Poll interval for the live view. Default ~500ms. */
  refreshMs?: number;
}

export async function watch(_options: WatchOptions): Promise<void> {
  return notImplemented("watch()", "H");
}

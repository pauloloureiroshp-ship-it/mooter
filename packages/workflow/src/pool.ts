// Concurrency manager — Phase C (T2). Stub: signatures only.
//
// Wraps p-limit so the engine never overruns Ollama. Optimal concurrency is
// derived from VRAM via tools/router/vram_detect.js (IMPORT, do not recreate).
// Queue overflow degrades gracefully (tasks wait, never dropped).

import { notImplemented } from "./_stub.ts";

export interface PoolOptions {
  /** Hard cap. If omitted, detectOptimalConcurrency() decides. */
  concurrency?: number;
}

export class AgentPool {
  readonly concurrency: number;
  constructor(_options: PoolOptions = {}) {
    // Phase C: resolve concurrency, build the p-limit limiter.
    this.concurrency = notImplemented("AgentPool", "C");
  }
  run<R>(_task: () => Promise<R>): Promise<R> {
    return notImplemented("AgentPool.run()", "C");
  }
}

/** Reads VRAM via tools/router/vram_detect.js and picks a safe worker count. */
export function detectOptimalConcurrency(): number {
  return notImplemented("detectOptimalConcurrency()", "C");
}

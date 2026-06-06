// Concurrency manager — Phase C.
//
// Wraps p-limit so the engine never overruns the local worker. Optimal worker
// count is derived from live VRAM via tools/router/vram_detect.js (IMPORTED, not
// recreated). Detection is injectable for tests; any failure degrades gracefully
// to DEFAULT_CONCURRENCY rather than throwing.

import pLimit from "p-limit";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export interface Vram {
  used_mb: number;
  total_mb: number;
}

export type GetVram = () => Vram | null;

/** Safe worker count when VRAM is unknown. */
export const DEFAULT_CONCURRENCY = 2;
/** qwen2.5-coder:7b Q4 footprint + context headroom (MiB). */
export const PER_WORKER_VRAM_MB = 5200;
/** Hard ceiling regardless of VRAM (matches brief: ~8 on a 4090). */
export const MAX_CONCURRENCY = 8;

function loadGetVram(): GetVram {
  try {
    // ../../../tools/router/vram_detect.js relative to packages/workflow/src/
    const m = require("../../../tools/router/vram_detect.js") as { getVram?: GetVram };
    return typeof m.getVram === "function" ? m.getVram : () => null;
  } catch {
    return () => null;
  }
}

export interface ConcurrencyOptions {
  /** Injectable for tests; defaults to the real vram_detect.getVram. */
  getVram?: GetVram;
  perWorkerMb?: number;
  max?: number;
}

/** Choose a worker count from free VRAM. Never throws. */
export function detectOptimalConcurrency(options: ConcurrencyOptions = {}): number {
  const getVram = options.getVram ?? loadGetVram();
  const perWorker = options.perWorkerMb ?? PER_WORKER_VRAM_MB;
  const max = options.max ?? MAX_CONCURRENCY;
  let vram: Vram | null = null;
  try {
    vram = getVram();
  } catch {
    vram = null;
  }
  if (!vram || !Number.isFinite(vram.total_mb) || vram.total_mb <= 0) return DEFAULT_CONCURRENCY;
  // M-series reports used_mb = -1 (shared memory) → treat total as available.
  const freeMb = vram.used_mb < 0 ? vram.total_mb : Math.max(0, vram.total_mb - vram.used_mb);
  const n = Math.floor(freeMb / perWorker);
  return Math.max(1, Math.min(max, n || 1));
}

export interface PoolOptions {
  /** Explicit cap. If omitted/invalid, detectOptimalConcurrency() decides. */
  concurrency?: number;
  /** Injectable VRAM probe (forwarded to detection when concurrency is auto). */
  getVram?: GetVram;
}

/**
 * Bounded-concurrency task runner. Tasks beyond the limit queue (graceful
 * degradation — never dropped) and run as slots free.
 */
export class AgentPool {
  readonly concurrency: number;
  #limit: ReturnType<typeof pLimit>;
  #completed = 0;

  constructor(options: PoolOptions = {}) {
    this.concurrency =
      typeof options.concurrency === "number" && options.concurrency > 0
        ? Math.floor(options.concurrency)
        : detectOptimalConcurrency({ getVram: options.getVram });
    this.#limit = pLimit(this.concurrency);
  }

  /** Schedule a task; resolves with its result once a slot is free. */
  run<R>(task: () => Promise<R>): Promise<R> {
    return this.#limit(async () => {
      const r = await task();
      this.#completed += 1;
      return r;
    });
  }

  /** Tasks currently executing. */
  get activeCount(): number {
    return this.#limit.activeCount;
  }

  /** Tasks waiting for a slot. */
  get pendingCount(): number {
    return this.#limit.pendingCount;
  }

  /** Tasks completed successfully. */
  get completedCount(): number {
    return this.#completed;
  }
}

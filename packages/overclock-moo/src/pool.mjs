// pool.mjs — bounded worker-pool executor for Overclock Moo Phase 2.
//
// THREE PRIMITIVES, ONE RULE: the slot cap is a HARD GUARANTEE.
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │  runBoundedPool   — N jobs, at most `width` in-flight at once.          │
// │                     Maps to GPU KV-cache slots → NEVER OOM.             │
// │  runOverlapped    — GPU pool ∥ CPU pool via Promise.all (OVERLAP).       │
// │                     CPU verification runs while GPU is generating.       │
// │  runIdleFill      — loop until queue empties or a guard fires (IDLE).    │
// │                     HONEST: never invents busywork, never spins on air.  │
// └──────────────────────────────────────────────────────────────────────────┘
//
// BACKPRESSURE: a worker that has cleared the gate (inFlight < allowed) must
// increment inFlight SYNCHRONOUSLY (no await between gate-check and increment)
// because JS is single-threaded.  That is the only way to prevent transient
// overshoot even when many promises settle at the same microtask boundary.
//
// DYNAMIC COMFORT / THERMAL THROTTLE: optional `opts.comfort` is an async
// function returning the currently-allowed concurrency.  Workers poll ~25ms
// while inFlight ≥ allowed.  The effective concurrency is clamped to [1,width]
// so it can REDUCE below width during a thermal event but never EXCEED it.
//
// HARD GUARDS (do not bend):
//   • inFlight NEVER exceeds width at any point.
//   • gpuPeak  ≤ plan.capacity.gpuSlots
//   • cpuPeak  ≤ plan.capacity.cpuSlots
//   • IDLE is declared only when planRound signals no real pending work.

const COMFORT_POLL_MS = 25;

/**
 * @param {unknown[]} jobs           - Array of job descriptors (passed to runJob).
 * @param {number} width             - Maximum in-flight concurrency.  HARD CAP.
 * @param {(job:unknown,index:number)=>Promise<unknown>} runJob - Executor.
 * @param {{ comfort?: () => Promise<number> }} [opts]
 * @returns {Promise<{ results: unknown[], peakConcurrency: number, ran: number }>}
 */
export async function runBoundedPool(jobs, width, runJob, opts = {}) {
  if (width <= 0 || !jobs || jobs.length === 0) {
    return { results: [], peakConcurrency: 0, ran: 0 };
  }

  const results = new Array(jobs.length);
  const { comfort } = opts;

  let inFlight = 0;
  let peakConcurrency = 0;
  let ran = 0;
  let nextIdx = 0;

  /**
   * Worker loop: picks jobs from the shared queue until exhausted.
   */
  async function worker() {
    while (true) {
      // Wait while at or above the allowed concurrency.
      // HARD: allowed is always clamped to [1, width].
      while (true) {
        const allowed = comfort
          ? Math.max(1, Math.min(width, await comfort()))
          : width;
        if (inFlight < allowed) break;
        await new Promise((r) => setTimeout(r, COMFORT_POLL_MS));
      }

      // Claim a job index SYNCHRONOUSLY after passing the gate.
      // No await between gate-check and inFlight++ — JS single-thread guarantees
      // that no other microtask can interleave here.
      const idx = nextIdx++;
      if (idx >= jobs.length) {
        // Another worker already claimed the remaining jobs; we're done.
        break;
      }

      inFlight++;
      if (inFlight > peakConcurrency) peakConcurrency = inFlight;

      try {
        results[idx] = await runJob(jobs[idx], idx);
      } finally {
        inFlight--;
        ran++;
      }
    }
  }

  // Spawn min(width, jobs.length) workers so we saturate the pool immediately.
  const workerCount = Math.min(width, jobs.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return { results, peakConcurrency, ran };
}

/**
 * Run GPU and CPU pools concurrently (OVERLAP: CPU verification ∥ GPU generation).
 *
 * @param {{ jobs: Array<{id:string,resource:string}>, capacity: {gpuSlots:number,cpuSlots:number} }} plan
 * @param {{ runGpuJob?: Function, runCpuJob?: Function, comfort?: ()=>Promise<number> }} [callbacks]
 * @returns {Promise<{ results: unknown[], gpuPeak: number, cpuPeak: number }>}
 */
export async function runOverlapped(plan, { runGpuJob, runCpuJob, comfort } = {}) {
  const gpuJobs = plan.jobs.filter((j) => j.resource === "gpu");
  const cpuJobs = plan.jobs.filter((j) => j.resource === "cpu");

  const gpuWidth = plan.capacity.gpuSlots;
  const cpuWidth = plan.capacity.cpuSlots;

  const [gpuOut, cpuOut] = await Promise.all([
    runBoundedPool(gpuJobs, gpuWidth, runGpuJob || (() => Promise.resolve(undefined)), { comfort }),
    runBoundedPool(cpuJobs, cpuWidth, runCpuJob || (() => Promise.resolve(undefined))),
  ]);

  const results = [...gpuOut.results, ...cpuOut.results].filter((r) => r !== undefined);

  return {
    results,
    gpuPeak: gpuOut.peakConcurrency,
    cpuPeak: cpuOut.peakConcurrency,
  };
}

/**
 * The idle-fill loop: keep the GPU busy until the queue empties or a guard stops.
 *
 * Each round re-discovers the CURRENT pending work (planRound).
 * HONEST IDLE: if planRound returns a plan with idle===true or no jobs, we stop
 * immediately — we never invent busywork.
 *
 * @param {{
 *   planRound: () => Promise<object|null>,
 *   runGpuJob?: Function,
 *   runCpuJob?: Function,
 *   comfort?: () => Promise<number>,
 *   shouldStop?: () => { stop: boolean, reason?: string } | Promise<{ stop: boolean, reason?: string }>,
 *   maxRounds?: number,
 * }} opts
 * @returns {Promise<Array<object>>}
 */
export async function runIdleFill({ planRound, runGpuJob, runCpuJob, comfort, shouldStop, maxRounds = 50 } = {}) {
  const rounds = [];

  for (let round = 1; round <= maxRounds; round++) {
    // Guard: check stop condition before doing any work.
    if (shouldStop) {
      const verdict = await shouldStop();
      if (verdict && verdict.stop) {
        rounds.push({ round, stopped: verdict.reason, results: [] });
        break;
      }
    }

    const plan = await planRound();

    // HONEST IDLE: no plan, plan.idle, or no jobs → stop, never invent busywork.
    if (!plan || plan.idle || plan.jobs.length === 0) {
      rounds.push({ round, idle: true, results: [] });
      break;
    }

    const out = await runOverlapped(plan, { runGpuJob, runCpuJob, comfort });
    rounds.push({
      round,
      results: out.results,
      gpuPeak: out.gpuPeak,
      cpuPeak: out.cpuPeak,
    });
  }

  return rounds;
}

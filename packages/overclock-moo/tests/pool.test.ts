// pool.test.ts — bounded worker-pool executor tests.
//
// Guards pinned by these tests:
//   • runBoundedPool never exceeds the declared width (GPU slot cap → never OOM).
//   • comfort throttle can reduce effective concurrency below width without exceeding it.
//   • width 0 is a no-op (nothing runs).
//   • runOverlapped runs GPU and CPU pools concurrently (real OVERLAP observable).
//   • runOverlapped honours gpuSlots as a hard cap.
//   • runIdleFill loops until honest IDLE; never invents busywork.
//   • runIdleFill's shouldStop guard fires before any work is done.

import { test } from "node:test";
import assert from "node:assert";

// @ts-ignore — .mjs has no type declarations; JSDoc-only
import { runBoundedPool, runOverlapped, runIdleFill } from "../src/pool.mjs";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * Creates a runJob function that tracks live concurrency and records the peak.
 * Each job increments a shared counter on entry, sleeps, decrements on exit.
 */
function makeConcurrencyTracker(durationMs = 20): {
  runJob: (job: unknown, idx: number) => Promise<unknown>;
  getObservedPeak: () => number;
} {
  let live = 0;
  let peak = 0;

  async function runJob(job: unknown, idx: number): Promise<unknown> {
    live++;
    if (live > peak) peak = live;
    await sleep(durationMs);
    live--;
    return { idx, job };
  }

  return { runJob, getObservedPeak: () => peak };
}

// ---------------------------------------------------------------------------
// runBoundedPool
// ---------------------------------------------------------------------------

test("runBoundedPool never exceeds width", async () => {
  const { runJob, getObservedPeak } = makeConcurrencyTracker(15);
  const jobs = Array.from({ length: 20 }, (_, i) => ({ id: i }));

  const { results, peakConcurrency, ran } = await runBoundedPool(jobs, 4, runJob);

  assert.ok(getObservedPeak() <= 4, `observed peak ${getObservedPeak()} must be ≤ 4`);
  assert.ok(peakConcurrency <= 4, `reported peakConcurrency ${peakConcurrency} must be ≤ 4`);
  assert.equal(ran, 20);
  assert.equal(results.length, 20);
  for (let i = 0; i < results.length; i++) {
    assert.notEqual(results[i], undefined, `result[${i}] must be defined`);
  }
});

test("runBoundedPool comfort throttle reduces effective concurrency", async () => {
  const { runJob, getObservedPeak } = makeConcurrencyTracker(30);
  const jobs = Array.from({ length: 12 }, (_, i) => ({ id: i }));

  const comfort = async () => 2;

  const { results, ran } = await runBoundedPool(jobs, 6, runJob, { comfort });

  assert.ok(getObservedPeak() <= 2, `comfort throttle: observed peak ${getObservedPeak()} must be ≤ 2`);
  assert.equal(ran, 12);
  assert.equal(results.length, 12);
});

test("runBoundedPool width 0 → nothing runs", async () => {
  let ran = 0;
  const runJob = async () => { ran++; return {}; };
  const jobs = [{ id: 0 }, { id: 1 }];

  const out = await runBoundedPool(jobs, 0, runJob);

  assert.equal(out.ran, 0);
  assert.deepEqual(out.results, []);
  assert.equal(ran, 0);
});

// ---------------------------------------------------------------------------
// runOverlapped
// ---------------------------------------------------------------------------

test("runOverlapped runs GPU and CPU pools concurrently (overlap)", async () => {
  let gpuLive = 0;
  let cpuLive = 0;
  let overlapObserved = false;

  const JOB_MS = 30;

  const runGpuJob = async (job: unknown) => {
    gpuLive++;
    await sleep(JOB_MS);
    gpuLive--;
    return { gpu: true };
  };

  const runCpuJob = async (job: unknown) => {
    cpuLive++;
    if (gpuLive > 0) overlapObserved = true;
    await sleep(JOB_MS);
    // Check for overlap while sleeping (both might still be in flight).
    if (gpuLive > 0) overlapObserved = true;
    cpuLive--;
    return { cpu: true };
  };

  const plan = {
    jobs: [
      { id: "g1", resource: "gpu" },
      { id: "g2", resource: "gpu" },
      { id: "c1", resource: "cpu" },
      { id: "c2", resource: "cpu" },
    ],
    capacity: { gpuSlots: 2, cpuSlots: 2 },
  };

  const { results, gpuPeak, cpuPeak } = await runOverlapped(plan, { runGpuJob, runCpuJob });

  assert.ok(overlapObserved, "GPU and CPU must have been in flight simultaneously (overlap not observed)");
  assert.ok(gpuPeak <= 2, `gpuPeak ${gpuPeak} must be ≤ 2`);
  assert.ok(cpuPeak <= 2, `cpuPeak ${cpuPeak} must be ≤ 2`);
  // 4 jobs total; undefined entries filtered out
  assert.equal(results.length, 4);
});

test("runOverlapped enforces gpuSlots as a hard cap", async () => {
  const { runJob: runGpuJob, getObservedPeak } = makeConcurrencyTracker(15);

  const plan = {
    jobs: Array.from({ length: 8 }, (_, i) => ({ id: `g${i}`, resource: "gpu" })),
    capacity: { gpuSlots: 3, cpuSlots: 0 },
  };

  const { gpuPeak } = await runOverlapped(plan, { runGpuJob });

  assert.ok(getObservedPeak() <= 3, `observed peak ${getObservedPeak()} must be ≤ 3`);
  assert.ok(gpuPeak <= 3, `gpuPeak ${gpuPeak} must be ≤ 3`);
});

// ---------------------------------------------------------------------------
// runIdleFill
// ---------------------------------------------------------------------------

test("runIdleFill loops until honest IDLE, never busywork", async () => {
  let callCount = 0;

  const runGpuJob = async () => ({ gpu: true });
  const runCpuJob = async () => ({ cpu: true });

  const workPlan = {
    jobs: [{ id: "g1", resource: "gpu" }, { id: "c1", resource: "cpu" }],
    capacity: { gpuSlots: 1, cpuSlots: 1 },
    idle: false,
  };

  const idlePlan = {
    idle: true,
    jobs: [],
    capacity: { gpuSlots: 1, cpuSlots: 1 },
  };

  const planRound = async () => {
    callCount++;
    if (callCount <= 2) return workPlan;
    return idlePlan;
  };

  const rounds = await runIdleFill({ planRound, runGpuJob, runCpuJob, maxRounds: 10 });

  // Exactly 2 work rounds and 1 idle round recorded.
  assert.equal(rounds.length, 3, `expected 3 rounds (2 work + 1 idle), got ${rounds.length}`);

  // First two rounds are work rounds.
  assert.equal(rounds[0].round, 1);
  assert.equal(rounds[0].idle, undefined);
  assert.equal(rounds[1].round, 2);
  assert.equal(rounds[1].idle, undefined);

  // Third round is the honest idle stop.
  assert.equal(rounds[2].round, 3);
  assert.equal(rounds[2].idle, true);
  assert.deepEqual(rounds[2].results, []);
});

test("runIdleFill stops on shouldStop guard", async () => {
  let workDone = false;

  const planRound = async () => ({
    jobs: [{ id: "g1", resource: "gpu" }],
    capacity: { gpuSlots: 1, cpuSlots: 0 },
    idle: false,
  });

  const runGpuJob = async () => { workDone = true; return {}; };

  const shouldStop = async () => ({ stop: true, reason: "thermal" });

  const rounds = await runIdleFill({ planRound, runGpuJob, shouldStop, maxRounds: 10 });

  assert.equal(rounds.length, 1);
  assert.equal(rounds[0].stopped, "thermal");
  assert.deepEqual(rounds[0].results, []);
  assert.equal(workDone, false, "no work must be done when shouldStop fires immediately");
});

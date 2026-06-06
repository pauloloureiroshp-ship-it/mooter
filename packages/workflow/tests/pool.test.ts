// pool suite (Phase C) — VRAM-based concurrency detection (injectable) and the
// bounded-concurrency runner.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AgentPool,
  detectOptimalConcurrency,
  DEFAULT_CONCURRENCY,
  MAX_CONCURRENCY,
} from "../src/pool.ts";

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

test("detectOptimalConcurrency: floors free VRAM / per-worker", () => {
  // free = 24000 - 4000 = 20000; / 5200 = 3.84 → 3
  const n = detectOptimalConcurrency({ getVram: () => ({ used_mb: 4000, total_mb: 24000 }) });
  assert.equal(n, 3);
});

test("detectOptimalConcurrency: caps at MAX_CONCURRENCY", () => {
  const n = detectOptimalConcurrency({ getVram: () => ({ used_mb: 0, total_mb: 100000 }) });
  assert.equal(n, MAX_CONCURRENCY);
});

test("detectOptimalConcurrency: M-series shared memory (used_mb = -1)", () => {
  // shared → treat total as available: 16384 / 5200 = 3.15 → 3
  const n = detectOptimalConcurrency({ getVram: () => ({ used_mb: -1, total_mb: 16384 }) });
  assert.equal(n, 3);
});

test("detectOptimalConcurrency: null VRAM → DEFAULT_CONCURRENCY", () => {
  assert.equal(detectOptimalConcurrency({ getVram: () => null }), DEFAULT_CONCURRENCY);
});

test("detectOptimalConcurrency: probe throwing → DEFAULT_CONCURRENCY (graceful)", () => {
  assert.equal(
    detectOptimalConcurrency({
      getVram: () => {
        throw new Error("nvidia-smi missing");
      },
    }),
    DEFAULT_CONCURRENCY,
  );
});

test("detectOptimalConcurrency: tiny VRAM never drops below 1", () => {
  const n = detectOptimalConcurrency({ getVram: () => ({ used_mb: 0, total_mb: 1000 }) });
  assert.equal(n, 1);
});

test("AgentPool: honours explicit concurrency and never exceeds it", async () => {
  const pool = new AgentPool({ concurrency: 2 });
  assert.equal(pool.concurrency, 2);
  let active = 0;
  let peak = 0;
  const task = () => async () => {
    active += 1;
    peak = Math.max(peak, active);
    await delay(20);
    active -= 1;
    return true;
  };
  const results = await Promise.all(Array.from({ length: 6 }, () => pool.run(task())));
  assert.equal(results.length, 6);
  assert.ok(peak <= 2, `peak ${peak} exceeded concurrency 2`);
  assert.equal(pool.completedCount, 6);
});

test("AgentPool: auto concurrency from injected VRAM probe", () => {
  const pool = new AgentPool({ getVram: () => ({ used_mb: 4000, total_mb: 24000 }) });
  assert.equal(pool.concurrency, 3);
});

test("AgentPool: invalid concurrency falls back to detection", () => {
  const pool = new AgentPool({ concurrency: 0, getVram: () => null });
  assert.equal(pool.concurrency, DEFAULT_CONCURRENCY);
});

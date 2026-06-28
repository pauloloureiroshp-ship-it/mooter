// allocator.test.ts — capacity math + knapsack + the hard guards.
import { test } from "node:test";
import assert from "node:assert";

import { computeCapacity, planAllocation, type AllocatorOptions } from "../src/allocator.ts";
import { makeJob } from "../src/job-catalogue.ts";
import type { GpuSlice, ModelPick, PendingJob } from "../src/types.ts";

// A deterministic injected selector so allocator tests never touch the router.
const fakeSelect = (): ModelPick => ({ model: "qwen3-30b", modelSource: "default", qualityScore: null, priceStatus: "free" });

function baseOpts(jobs: PendingJob[], extra: Partial<AllocatorOptions> = {}): AllocatorOptions {
  return { jobs, selectModel: fakeSelect, baseVramMb: 17000, kvPerSlotMb: 1000, marginPct: 0.85, comfortCap: 6, cpuCap: 4, ...extra };
}

const FULL_GPU: GpuSlice = { totalMb: 24000, freeMb: 24000, utilPct: 10, fitsMoos: 4 };

test("capacity: 85% margin + KV headroom over a resident base (never OOM)", () => {
  const cap = computeCapacity(FULL_GPU, baseOpts([]));
  // budget = floor(24000*0.85)=20400 ; used=0 ; effectiveBase=17000 ; KV=3400 ; /1000 = 3
  assert.equal(cap.vramBudgetMb, 20400);
  assert.equal(cap.kvHeadroomMb, 3400);
  assert.equal(cap.gpuSlots, 3);
  // Hard invariant: planned VRAM (base + slots*kvPerSlot) never crosses the 85% ceiling.
  assert.ok(cap.baseVramMb + cap.gpuSlots * 1000 <= cap.vramBudgetMb);
});

test("capacity: respects a base already resident (counts existing use once)", () => {
  const cap = computeCapacity({ totalMb: 24000, freeMb: 6000, utilPct: 50, fitsMoos: 1 }, baseOpts([]));
  // used=18000 ≥ base ⇒ effectiveBase=0 ; KV = 20400-18000 = 2400 ; /1000 = 2
  assert.equal(cap.gpuSlots, 2);
});

test("capacity: comfort cap clamps the slot count (thermals win)", () => {
  const cap = computeCapacity(FULL_GPU, baseOpts([], { comfortCap: 1 }));
  assert.equal(cap.gpuSlots, 1);
});

test("capacity: no GPU reading → 0 GPU slots + vramBudget n/d (never fabricate)", () => {
  const cap = computeCapacity(null, baseOpts([]));
  assert.equal(cap.gpuSlots, 0);
  assert.equal(cap.vramBudgetMb, null);
  assert.equal(cap.cpuSlots, 4); // CPU verification track still available
});

test("guard: asymmetry-unsafe kinds are hard-rejected (local never plays the piano)", () => {
  const piano = { ...makeJob("x", "run-tests"), kind: "architecture" as PendingJob["kind"] };
  const plan = planAllocation({ gpu: FULL_GPU }, baseOpts([piano]));
  assert.equal(plan.jobs.length, 0);
  assert.deepEqual(plan.rejected, [{ id: "x", reason: "not-asymmetry-safe" }]);
});

test("guard: no busywork — pending:false is dropped", () => {
  const job = makeJob("busy", "run-tests", { pending: false });
  const plan = planAllocation({ gpu: FULL_GPU }, baseOpts([job]));
  assert.equal(plan.jobs.length, 0);
  assert.equal(plan.rejected[0].reason, "no-pending-work");
  assert.ok(plan.idle);
  assert.match(plan.reason, /no real pending work/i);
});

test("knapsack: maximises human-minutes unblocked within slots", () => {
  // cpuCap=2 ; three CPU jobs of value 5,4,3 (weight 1 each) → picks 5 and 4.
  const jobs = [
    makeJob("a", "run-tests", { humanMinutes: 5 }),
    makeJob("b", "run-tests", { humanMinutes: 4 }),
    makeJob("c", "run-tests", { humanMinutes: 3 }),
  ];
  const plan = planAllocation({ gpu: FULL_GPU }, baseOpts(jobs, { cpuCap: 2 }));
  const ids = plan.jobs.map((j) => j.id).sort();
  assert.deepEqual(ids, ["a", "b"]);
  assert.equal(plan.estHumanMinutes, 9);
  assert.equal(plan.rejected.find((r) => r.id === "c")?.reason, "slot-capacity");
});

test("split pools: GPU vs CPU jobs are allocated against their own capacity", () => {
  const jobs = [
    makeJob("g1", "commit-msg"), // gpu
    makeJob("g2", "doc-gen"), // gpu
    makeJob("t1", "run-tests"), // cpu
  ];
  const plan = planAllocation({ gpu: FULL_GPU }, baseOpts(jobs, { comfortCap: 1, cpuCap: 4 }));
  const gpu = plan.jobs.filter((j) => j.resource === "gpu");
  const cpu = plan.jobs.filter((j) => j.resource === "cpu");
  assert.equal(gpu.length, 1); // only 1 GPU slot under comfortCap=1
  assert.equal(cpu.length, 1);
  // slot indices are 0-based within each pool
  assert.equal(gpu[0].slot, 0);
  assert.equal(cpu[0].slot, 0);
});

test("idle: real pending work but zero headroom → honest IDLE, jobs rejected no-headroom", () => {
  const jobs = [makeJob("g", "commit-msg")];
  // No GPU and cpu pool is empty (gpu job only) with gpuSlots 0.
  const plan = planAllocation({ gpu: null }, baseOpts(jobs, { cpuCap: 0 }));
  assert.ok(plan.idle);
  assert.equal(plan.rejected[0].reason, "no-headroom");
});

test("model pick is attached from the injected selector", () => {
  const plan = planAllocation({ gpu: FULL_GPU }, baseOpts([makeJob("t", "run-tests")]));
  assert.equal(plan.jobs[0].pick.priceStatus, "free");
  assert.equal(plan.jobs[0].pick.qualityScore, null);
});

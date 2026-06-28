// allocator.ts — the brain of Overclock Moo (Fase 1).
//
// Given the MissionControlSnapshot's GPU slice + a list of REAL pending jobs,
// decide how many concurrent moos the hardware can serve and which jobs maximise
// human-time-unblocked — without OOM, without busywork, asymmetry-safe only.
//
// MECHANISM (§1): we do NOT load N models. One resident base serves N concurrent
// jobs via continuous batching. So "fitsMoos" is reinterpreted here as batch
// SLOTS, bounded by the VRAM left for KV-cache after the base (never crossing the
// 85% ceiling) and by a configurable comfort cap (thermals/watt/noise). CPU
// verification moos run in their own pool (no VRAM).
//
// VALUE FUNCTION (§2): a 0/1 knapsack over slots maximising Σ humanMinutes — the
// star is human-time-unblocked. Quality is preserved structurally (asymmetry-safe
// + hard gates downstream), so it is NOT mixed into the value; the matrix only
// picks the model per job.
//
// GUARDS (hard): asymmetry-safe only · no busywork (pending===true) · never OOM
// (85% margin + KV headroom) · comfort cap · honest n/d when the GPU is unknown.

import { ASYMMETRY_SAFE_KINDS } from "./job-catalogue.ts";
import { DEFAULT_BASE_MODEL, DEFAULT_LOCAL_MODELS, defaultSelectModel, type SelectModel } from "./matrix-bridge.ts";
import type {
  AllocatedJob,
  AllocationPlan,
  Capacity,
  GpuSlice,
  OverclockSnapshot,
  PendingJob,
  RejectedJob,
  Resource,
} from "./types.ts";

export interface AllocatorOptions {
  /** Pending work offered to the planner. */
  jobs: PendingJob[];
  /** VRAM safety margin — we never plan past this fraction of total (never OOM). */
  marginPct?: number; // default 0.85
  /** Max concurrent GPU moos (thermals/watt/noise). */
  comfortCap?: number; // default 6
  /** Resident base-model footprint (MB). qwen3-coder:30b Q4 ≈ 17 GB. */
  baseVramMb?: number; // default 17000
  /** VRAM per concurrent KV-cache slot (MB). Conservative; tune per context len. */
  kvPerSlotMb?: number; // default 1024
  /** Deterministic-verification (CPU) worker pool size. */
  cpuCap?: number; // default 4
  /** Candidate local models for the matrix pick. */
  localModels?: readonly string[];
  /** Resident base the batching runtime serves. */
  baseModel?: string;
  /** Injectable model selector (defaults to the real read-only matrix bridge). */
  selectModel?: SelectModel;
}

const DEFAULTS = {
  marginPct: 0.85,
  comfortCap: 6,
  baseVramMb: 17000,
  kvPerSlotMb: 1024,
  cpuCap: 4,
};

/**
 * Derive concurrent-slot capacity from the GPU slice + guards.
 *
 * gpuSlots = min( floor(KVheadroom / kvPerSlot), comfortCap ), where
 *   KVheadroom = vramBudget − currentUse − (base not already covered by use),
 *   vramBudget = floor(totalMb × marginPct)          ← the 85% never-OOM ceiling.
 *
 * If the GPU is unknown (no slice / totalMb null), gpuSlots = 0 and vramBudget =
 * null (honest n/d) — the planner will only run the CPU verification track.
 */
export function computeCapacity(gpu: GpuSlice | null | undefined, opts: AllocatorOptions): Capacity {
  const marginPct = opts.marginPct ?? DEFAULTS.marginPct;
  const comfortCap = Math.max(0, opts.comfortCap ?? DEFAULTS.comfortCap);
  const baseVramMb = opts.baseVramMb ?? DEFAULTS.baseVramMb;
  const kvPerSlotMb = Math.max(1, opts.kvPerSlotMb ?? DEFAULTS.kvPerSlotMb);
  const cpuSlots = Math.max(0, opts.cpuCap ?? DEFAULTS.cpuCap);

  const total = gpu && typeof gpu.totalMb === "number" ? gpu.totalMb : null;
  if (total === null || total <= 0) {
    // No GPU reading → never fabricate capacity. CPU track can still run.
    return { gpuSlots: 0, cpuSlots, vramBudgetMb: null, kvHeadroomMb: null, comfortCap, baseVramMb };
  }

  const vramBudgetMb = Math.floor(total * marginPct);
  const free = gpu && typeof gpu.freeMb === "number" ? gpu.freeMb : null;
  const used = free !== null ? Math.max(0, total - free) : baseVramMb; // assume base resident if unknown
  // If current use already covers the base footprint, don't double-reserve it.
  const effectiveBase = used >= baseVramMb ? 0 : baseVramMb - used;
  const kvHeadroomMb = Math.max(0, vramBudgetMb - used - effectiveBase);
  const vramSlots = Math.floor(kvHeadroomMb / kvPerSlotMb);
  const gpuSlots = Math.max(0, Math.min(vramSlots, comfortCap));

  return { gpuSlots, cpuSlots, vramBudgetMb, kvHeadroomMb, comfortCap, baseVramMb };
}

/**
 * 0/1 knapsack: pick the subset of `items` (weight = kvWeight, value =
 * humanMinutes) with the highest total value that fits `capacity` slots.
 * Returns the chosen indices. Deterministic; integer weights only.
 */
function knapsack(items: PendingJob[], capacity: number): number[] {
  const n = items.length;
  if (n === 0 || capacity <= 0) return [];
  // dp[i][w] = best value using the first i items within capacity w (reconstructable).
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(capacity + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    const w = Math.max(1, Math.round(items[i - 1].kvWeight ?? 1));
    const v = Math.max(0, items[i - 1].humanMinutes);
    for (let c = 0; c <= capacity; c++) {
      dp[i][c] = dp[i - 1][c];
      if (w <= c) {
        const cand = dp[i - 1][c - w] + v;
        if (cand > dp[i][c]) dp[i][c] = cand;
      }
    }
  }
  // Reconstruct.
  const chosen: number[] = [];
  let c = capacity;
  for (let i = n; i >= 1; i--) {
    if (dp[i][c] !== dp[i - 1][c]) {
      chosen.push(i - 1);
      c -= Math.max(1, Math.round(items[i - 1].kvWeight ?? 1));
    }
  }
  return chosen.reverse();
}

/** Validate + split candidates per resource; collect rejections honestly. */
function triage(jobs: PendingJob[], rejected: RejectedJob[]): Record<Resource, PendingJob[]> {
  const pools: Record<Resource, PendingJob[]> = { gpu: [], cpu: [] };
  for (const j of jobs) {
    if (!ASYMMETRY_SAFE_KINDS.has(j.kind)) {
      rejected.push({ id: j.id, reason: "not-asymmetry-safe" });
      continue;
    }
    if (!j.pending) {
      rejected.push({ id: j.id, reason: "no-pending-work" }); // no busywork
      continue;
    }
    if (!(j.humanMinutes > 0)) {
      rejected.push({ id: j.id, reason: "no-value" });
      continue;
    }
    pools[j.resource].push(j);
  }
  return pools;
}

function allocatePool(
  pool: PendingJob[],
  slots: number,
  resource: Resource,
  selectModel: SelectModel,
  localModels: readonly string[],
  rejected: RejectedJob[],
): AllocatedJob[] {
  if (pool.length === 0) return [];
  if (slots <= 0) {
    for (const j of pool) rejected.push({ id: j.id, reason: "no-headroom" });
    return [];
  }
  const chosenIdx = new Set(knapsack(pool, slots));
  const out: AllocatedJob[] = [];
  let slot = 0;
  pool.forEach((j, i) => {
    if (chosenIdx.has(i)) {
      out.push({ ...j, pick: selectModel(j.category, localModels), slot: slot++ });
    } else {
      rejected.push({ id: j.id, reason: "slot-capacity" });
    }
  });
  return out;
}

/**
 * Plan the Overclock Moo batch.
 *
 * @param snapshot subset of the MissionControlSnapshot (needs `.gpu`).
 * @param opts     pending jobs + guard knobs (margin, comfort cap, base, …).
 */
export function planAllocation(snapshot: OverclockSnapshot | null | undefined, opts: AllocatorOptions): AllocationPlan {
  const selectModel = opts.selectModel ?? defaultSelectModel;
  const localModels = opts.localModels ?? DEFAULT_LOCAL_MODELS;
  const baseModel = opts.baseModel ?? DEFAULT_BASE_MODEL;
  const gpu = snapshot?.gpu ?? null;

  const capacity = computeCapacity(gpu, opts);
  const rejected: RejectedJob[] = [];
  const pools = triage(opts.jobs ?? [], rejected);

  const gpuJobs = allocatePool(pools.gpu, capacity.gpuSlots, "gpu", selectModel, localModels, rejected);
  const cpuJobs = allocatePool(pools.cpu, capacity.cpuSlots, "cpu", selectModel, localModels, rejected);
  const jobs = [...gpuJobs, ...cpuJobs];

  const estHumanMinutes = jobs.reduce((s, j) => s + j.humanMinutes, 0);
  const idle = jobs.length === 0;

  let reason: string;
  if (idle) {
    const hadCandidates = pools.gpu.length + pools.cpu.length > 0;
    if (!hadCandidates) {
      reason = "IDLE — no real pending work (no busywork invented).";
    } else if (capacity.gpuSlots === 0 && capacity.cpuSlots === 0) {
      reason = gpu && gpu.totalMb != null ? "IDLE — no slot headroom under the comfort cap." : "IDLE — GPU unknown (n/d) and no CPU pool.";
    } else {
      reason = "IDLE — pending work exists but no slot accepted it.";
    }
  } else {
    reason = `${jobs.length} moo(s): ${gpuJobs.length} on GPU (${capacity.gpuSlots} slot${capacity.gpuSlots === 1 ? "" : "s"}), ${cpuJobs.length} on CPU; base ${baseModel}; ~${estHumanMinutes.toFixed(1)} human-min unblocked (est, METR caveat).`;
  }

  return { capacity, baseModel, jobs, idle, rejected, estHumanMinutes, reason };
}

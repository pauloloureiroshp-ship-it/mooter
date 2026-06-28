// metrics.ts — the HONEST recovered-time contract (cockpit reads this).
//
// Mooter's brand is honest measurement. So this module keeps two buckets STRICTLY
// apart and never lets one leak into the other:
//
//   • MEASURED  — hard facts from this run: wall-clock seconds the moos worked,
//                 gate pass/fail, local tokens, $0 cost, GPU util before→after.
//   • ESTIMATED — human-equivalent minutes "recovered", a sum of documented
//                 per-job baselines, counted ONLY for jobs whose gate PASSED, and
//                 always shipped with the METR caveat. Never a stopwatch reading.
//
// Missing data is `null` (rendered "n/d"), never a fabricated number.
//
// Output: append-only JSONL at ~/.mooter/cache/overclock-metrics.jsonl
// (MOOTER_HOME-aware, same convention as gpu-monitor.js / mc-snapshot.js).

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { GateKind } from "./types.ts";

/** The honesty caveat that travels with every estimated time number. */
export const METR_CAVEAT =
  "Estimate of human-equivalent work unblocked, NOT a stopwatch measurement. " +
  "METR 2026: AI can slow experienced devs (−20%..+100% depending on context).";

export const NA = "n/d" as const;

/**
 * Secondary metric note: throughputX is never the headline.
 * RTX 4090 saturates single-stream on dense models → ~1× local.
 */
export const THROUGHPUT_NOTE =
  "secondary metric; ≈1× local on dense models (RTX 4090 saturates single-stream) — never the headline";

/** Per-job execution result the runner produces (all fields measured unless noted). */
export interface JobResult {
  id: string;
  kind: string;
  category: string;
  /** Model attributed from the matrix (specialization intent). */
  model: string;
  /** What actually ran in Fase 1: the single resident base via continuous batching. */
  runtimeBase: string;
  resource: "gpu" | "cpu";
  gate: GateKind;
  /** MEASURED — gate exit code 0. */
  gatePassed: boolean;
  /** MEASURED — wall-clock the moo worked. */
  wallSeconds: number;
  /** ESTIMATE — counted into recovered time ONLY when gatePassed (else 0). */
  humanMinutesEst: number;
  /** MEASURED — local tokens produced (null = n/d, e.g. pure CPU verification). */
  localTokens: number | null;
  /** MEASURED — local execution costs $0. */
  usd: 0;
  /** Honest skip reason (e.g. "ollama-unavailable") — counts toward neither bucket. */
  skipped?: string;
  /**
   * ESTIMATE (counterfactual) — what THIS job's local tokens would have cost on the
   * cheapest cloud tier (Haiku). Caller computes (tokens × price); metrics only sums.
   * null for CPU / no-token / skipped jobs. Never fabricated.
   */
  cloudUsdAvoidedEst?: number | null;
}

/** GPU util context for the run (measured; null = n/d). */
export interface GpuContext {
  utilBefore: number | null;
  utilAfter: number | null;
  /** GPU utilisation sampled DURING the run (saturation reached while reclaiming idle). */
  utilDuring: number | null;
  totalMb: number | null;
  vramBudgetMb: number | null;
  gpuSlots: number;
  cpuSlots: number;
}

/** One Overclock Moo run, ready to append + be read by the cockpit. */
export interface OverclockMetric {
  at: number;
  project: string | null;
  baseModel: string;
  gpu: GpuContext | null;
  results: JobResult[];
  measured: {
    jobsRun: number;
    gatePass: number;
    gateFail: number;
    skipped: number;
    gpuSecondsReclaimed: number; // Σ wallSeconds of GPU moos (idle GPU put to work)
    /** Alias for gpuSecondsReclaimed — §2.2 cockpit-contract name. Values are always equal. */
    gpuSecondsBusy: number;
    cpuSecondsWorked: number; // Σ wallSeconds of CPU verification moos
    localTokens: number | null;
    usd: 0;
    /**
     * Σ of per-job cloudUsdAvoidedEst (ESTIMATE — counterfactual, keyed to MEASURED tokens × real
     * published price supplied by caller). null when NO job carried a cloudUsdAvoidedEst value.
     * Stored under `measured` because it is derived from measured token counts, but labelled
     * "evitado/estimado" because it is a counterfactual (never spent, only avoided).
     */
    cloudUsdAvoided: number | null;
  };
  estimated: {
    humanMinutesRecovered: number; // Σ humanMinutesEst over PASSED jobs only
    caveat: string;
  };
  quality: {
    passRate: number | null; // gatePass / jobsRun (null when jobsRun=0 → n/d)
    regressions: number; // gate failures = regressions caught/blocked; target ~0
  };
  /** Secondary throughput metric — never the headline. */
  secondary: {
    /**
     * Tokens/sec throughput ratio vs cloud baseline. null in normal runs;
     * populated by the benchmark harness.
     */
    throughputX: number | null;
    note: string;
  };
}

/** Cache path, MOOTER_HOME-aware (defaults to ~/.mooter/cache). */
export function metricsPath(homeOverride?: string): string {
  const home = homeOverride || process.env.MOOTER_HOME || join(homedir(), ".mooter");
  return join(home, "cache", "overclock-metrics.jsonl");
}

/** Fold per-job results into the honest measured/estimated buckets. */
export function summarize(
  results: JobResult[],
  ctx: {
    at: number;
    project: string | null;
    baseModel: string;
    gpu: GpuContext | null;
    /** Optional throughput ratio from the benchmark harness. null/undefined → n/d. */
    throughputX?: number | null;
  },
): OverclockMetric {
  let gatePass = 0;
  let gateFail = 0;
  let skipped = 0;
  let gpuSeconds = 0;
  let cpuSeconds = 0;
  let tokens = 0;
  let tokensSeen = false;
  let humanMin = 0;
  let cloudUsdSum = 0;
  let cloudUsdSeen = false;

  for (const r of results) {
    if (r.skipped) {
      skipped++;
      continue;
    }
    if (r.gatePassed) {
      gatePass++;
      humanMin += r.humanMinutesEst; // recovered time ONLY on a passing gate
    } else {
      gateFail++;
    }
    if (r.resource === "gpu") gpuSeconds += r.wallSeconds;
    else cpuSeconds += r.wallSeconds;
    if (typeof r.localTokens === "number") {
      tokens += r.localTokens;
      tokensSeen = true;
    }
    if (typeof r.cloudUsdAvoidedEst === "number") {
      cloudUsdSum += r.cloudUsdAvoidedEst;
      cloudUsdSeen = true;
    }
  }

  const jobsRun = gatePass + gateFail;
  const gpuSecondsBusy = round1(gpuSeconds); // alias — §2.2 cockpit-contract name
  return {
    at: ctx.at,
    project: ctx.project,
    baseModel: ctx.baseModel,
    gpu: ctx.gpu,
    results,
    measured: {
      jobsRun,
      gatePass,
      gateFail,
      skipped,
      gpuSecondsReclaimed: gpuSecondsBusy, // legacy name — same value
      gpuSecondsBusy,                       // §2.2 cockpit-contract name
      cpuSecondsWorked: round1(cpuSeconds),
      localTokens: tokensSeen ? tokens : null,
      usd: 0,
      cloudUsdAvoided: cloudUsdSeen ? round4(cloudUsdSum) : null,
    },
    estimated: {
      humanMinutesRecovered: round1(humanMin),
      caveat: METR_CAVEAT,
    },
    quality: {
      passRate: jobsRun > 0 ? round2(gatePass / jobsRun) : null,
      regressions: gateFail,
    },
    secondary: {
      throughputX: ctx.throughputX ?? null,
      note: THROUGHPUT_NOTE,
    },
  };
}

/** Append one run to the JSONL ledger (creates the cache dir if needed). */
export function appendMetric(metric: OverclockMetric, homeOverride?: string): string {
  const file = metricsPath(homeOverride);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(metric) + "\n", "utf8");
  return file;
}

/** Read the ledger back (for the cockpit / a roll-up). Missing file → []. */
export function readMetrics(homeOverride?: string): OverclockMetric[] {
  try {
    const raw = readFileSync(metricsPath(homeOverride), "utf8");
    return raw
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as OverclockMetric);
  } catch {
    return [];
  }
}

/** Honest one-line-per-fact summary for the runner stdout + the cockpit. */
export function honestSummaryLines(m: OverclockMetric): string[] {
  const nd = (v: number | null, suffix = "") => (v === null ? NA : `${v}${suffix}`);
  const util =
    m.gpu && m.gpu.utilBefore !== null
      ? `${m.gpu.utilBefore}%→${m.gpu.utilAfter === null ? NA : m.gpu.utilAfter + "%"}`
      : NA;

  // utilDuring for the idle-reclaim headline (null → n/d)
  const utilDuringStr =
    m.gpu && m.gpu.utilDuring !== null ? `${m.gpu.utilDuring}%` : NA;
  const utilBeforeStr =
    m.gpu && m.gpu.utilBefore !== null ? `${m.gpu.utilBefore}%` : NA;

  return [
    `measured · jobs ${m.measured.jobsRun} (pass ${m.measured.gatePass} / fail ${m.measured.gateFail}, skip ${m.measured.skipped})`,
    `measured · GPU reclaimed ${nd(m.measured.gpuSecondsReclaimed, "s")} · CPU ${nd(m.measured.cpuSecondsWorked, "s")} · util ${util} · tokens ${nd(m.measured.localTokens)} · cost $${m.measured.usd}`,
    `quality · pass-rate ${m.quality.passRate === null ? NA : Math.round(m.quality.passRate * 100) + "%"} · regressions ${m.quality.regressions} (target ~0)`,
    `estimated · time recovered ~${m.estimated.humanMinutesRecovered} human-min — ${METR_CAVEAT}`,
    // Phase 2 additions:
    `idle-reclaim · GPU util ${utilBeforeStr}→${utilDuringStr} · busy ${nd(m.measured.gpuSecondsBusy, "s")} · ~$${nd(m.measured.cloudUsdAvoided)} cloud avoided (est) · $0 local`,
    `secondary · throughput ${nd(m.secondary.throughputX, "×")} — ${m.secondary.note}`,
  ];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

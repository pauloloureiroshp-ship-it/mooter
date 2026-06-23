// niche-pipeline.ts — WN1: full pipeline runner for the coding-niche eval.
//
// WHAT THIS COVERS (vs the existing run.ts / lib.ts):
//   run.ts / lib.ts  → classify.js ONLY, all 50 general workflows.
//   niche-pipeline   → classify.js PLUS a niche-safety-floor pass, PLUS
//                      latency probing (p50/p99 across N repeats), measured on
//                      the sealed niche holdout (dataset/niche-holdout.json).
//
// Pipeline stages (all additive, classify.js untouched):
//   1. classify.js   (frozen, measured via execFileSync, timed per call)
//   2. niche-safety-floor (additive) → if category is HIGH_RISK class and
//      classify returned <T3, override to T3. Records whether the floor fired.
//
// The safety floor is the additive improvement under test. The eval measures
// baseline (classify-only) accuracy AND post-floor accuracy separately so
// a negative result (floor adds nothing) is reported honestly.
//
// Latency:
//   latencyForCase() runs the classifier N_LATENCY_REPS times on the same
//   prompt and returns the raw wall-clock samples (caller aggregates p50/p99).
//   This is NOT a microbenchmark — subprocess spawn overhead is included
//   intentionally, since that reflects real usage.

import { execFileSync } from "node:child_process";
import type { WorkflowEntry } from "./lib.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of classify.js invocations per prompt for latency probing. */
export const N_LATENCY_REPS = 12 as const;

/**
 * Categories that the niche-safety-floor enforces T3 on — they map to
 * HIGH_RISK patterns in the classify.js regime, but the floor gives a second
 * catch for any gap in the regex matching.
 * This is the ADDITIVE component under test in WN1.
 */
export const SAFETY_FLOOR_CATEGORIES = new Set([
  "security",
  "architecture",
  "pre-merge-review",
  "ci-config",
  "refactor-multi-file",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Raw output from one classify.js invocation. */
export interface RawClassifyResult {
  tier: string | null;
  confidence: number | undefined;
  risk_level: string | undefined;
  recommended_model: string | undefined;
  completed: boolean;
  /** Wall-clock ms for the execFileSync call. */
  latency_ms: number;
}

/** Full pipeline result for one niche-holdout entry. */
export interface NichePipelineResult {
  id: string;
  expected_tier: string;
  category: string;
  /** Tier from classify.js (stage 1). */
  classify_tier: string | null;
  classify_completed: boolean;
  classify_confidence: number | undefined;
  classify_latency_ms: number;
  /** Tier after the niche-safety-floor pass (stage 2). Equals classify_tier
   *  when the floor did not fire. */
  pipeline_tier: string | null;
  /** Whether the safety floor overrode the classify tier. */
  safety_floor_fired: boolean;
  /** Whether the pipeline_tier matches the expected_tier (overall correctness). */
  correct: boolean;
  /** Whether classify_tier alone (without the floor) was correct. */
  classify_correct: boolean;
}

/** p50 / p99 latency samples for one prompt, in ms. */
export interface LatencyProbe {
  id: string;
  samples_ms: number[];
  p50_ms: number;
  p99_ms: number;
}

/** Aggregate latency stats across all probed prompts. */
export interface LatencySummary {
  /** p50 across ALL samples from ALL probed prompts. */
  global_p50_ms: number;
  /** p99 across ALL samples from ALL probed prompts. */
  global_p99_ms: number;
  /** Fraction of INDIVIDUAL classify.js calls that completed in <50ms. */
  fraction_under_50ms: number;
  per_prompt: LatencyProbe[];
}

/** Full niche eval report. */
export interface NicheEvalReport {
  /** Path to the classifier binary used. */
  classifier_path: string;
  /** SHA-256 of the classifier (must match the frozen expected sha). */
  classifier_sha256: string;
  /** Path to the holdout dataset used. */
  dataset_path: string;
  total: number;
  /** Accuracy using only classify.js (stage 1, no floor). */
  classify_accuracy: number;
  classify_correct: number;
  /** Accuracy using the full pipeline (classify + safety floor). */
  pipeline_accuracy: number;
  pipeline_correct: number;
  /** Number of cases where the safety floor overrode the classify tier. */
  safety_floor_fires: number;
  /** Among floor-fires: how many overrides turned a wrong classify into a correct pipeline tier? */
  floor_positive_lifts: number;
  /** Among floor-fires: how many overrides turned a correct classify into a wrong pipeline tier? */
  floor_negative_flips: number;
  /** Per-category breakdown. */
  per_category: Record<
    string,
    {
      total: number;
      classify_correct: number;
      pipeline_correct: number;
      safety_floor_fires: number;
    }
  >;
  /** Per-tier breakdown (by expected_tier). */
  per_tier: Record<
    string,
    {
      total: number;
      classify_correct: number;
      pipeline_correct: number;
    }
  >;
  /** Latency stats for the classify.js stage. */
  latency: LatencySummary;
  /** Individual per-entry results. */
  entries: NichePipelineResult[];
}

// ---------------------------------------------------------------------------
// Stage 1: classify.js wrapper (timed, best-effort)
// ---------------------------------------------------------------------------

export function classifyOnceRaw(
  classifierPath: string,
  prompt: string,
): RawClassifyResult {
  const t0 = performance.now();
  try {
    const out = execFileSync(process.execPath, [classifierPath, prompt], {
      encoding: "utf8",
      timeout: 30_000,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, MOOTER_BENCH: "1" },
    });
    const latency_ms = performance.now() - t0;
    const jsonStart = out.indexOf("{");
    if (jsonStart < 0) {
      return { tier: null, confidence: undefined, risk_level: undefined, recommended_model: undefined, completed: false, latency_ms };
    }
    const parsed = JSON.parse(out.slice(jsonStart)) as Record<string, unknown>;
    const tier = typeof parsed.tier === "string" ? parsed.tier : null;
    return {
      tier,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : undefined,
      risk_level: typeof parsed.risk_level === "string" ? parsed.risk_level : undefined,
      recommended_model: typeof parsed.recommended_model === "string" ? parsed.recommended_model : undefined,
      completed: tier !== null,
      latency_ms,
    };
  } catch {
    const latency_ms = performance.now() - t0;
    return { tier: null, confidence: undefined, risk_level: undefined, recommended_model: undefined, completed: false, latency_ms };
  }
}

// ---------------------------------------------------------------------------
// Stage 2: niche-safety-floor (additive)
// ---------------------------------------------------------------------------

/**
 * Apply the niche coding safety floor.
 *
 * CONTRACT: ADDITIVE — never modifies classify.js, never touches the dataset
 * labels. Only fires when the dataset entry's category is in
 * SAFETY_FLOOR_CATEGORIES AND classify returned a tier below T3. This catches
 * any residual gap in the regex bank for coding-domain HIGH_RISK prompts.
 *
 * Returns { tier, fired } where:
 *   - tier   = T3 when the floor fires, else the original classify tier.
 *   - fired  = true when the floor overrode the classify tier.
 */
export function applyNicheSafetyFloor(
  classifyTier: string | null,
  category: string,
): { tier: string | null; fired: boolean } {
  if (!classifyTier) return { tier: classifyTier, fired: false };
  if (!SAFETY_FLOOR_CATEGORIES.has(category)) return { tier: classifyTier, fired: false };
  if (classifyTier === "T3") return { tier: classifyTier, fired: false };
  // The category is a HIGH_RISK class but classify returned something below T3.
  // Floor fires: override to T3.
  return { tier: "T3", fired: true };
}

// ---------------------------------------------------------------------------
// Latency probe (N reps per prompt)
// ---------------------------------------------------------------------------

/** percentile in 0-1, applied to a sorted array */
function pctile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.max(0, Math.ceil(sorted.length * p) - 1);
  return sorted[idx];
}

/**
 * Run classify.js N_LATENCY_REPS times on the same prompt and return
 * wall-clock samples + p50/p99. The first warmup call is excluded.
 */
export function latencyForCase(
  classifierPath: string,
  entry: WorkflowEntry,
): LatencyProbe {
  const samples_ms: number[] = [];
  for (let i = 0; i < N_LATENCY_REPS; i++) {
    const r = classifyOnceRaw(classifierPath, entry.prompt);
    // Skip the first call (warmup / cold JIT)
    if (i > 0) samples_ms.push(r.latency_ms);
  }
  const sorted = [...samples_ms].sort((a, b) => a - b);
  return {
    id: entry.id,
    samples_ms,
    p50_ms: Math.round(pctile(sorted, 0.5) * 100) / 100,
    p99_ms: Math.round(pctile(sorted, 0.99) * 100) / 100,
  };
}

/**
 * Aggregate per-prompt latency probes into a summary.
 */
export function aggregateLatency(probes: LatencyProbe[]): LatencySummary {
  const all: number[] = probes.flatMap((p) => p.samples_ms);
  const sorted = [...all].sort((a, b) => a - b);
  const under50 = sorted.filter((ms) => ms < 50).length;
  return {
    global_p50_ms: Math.round(pctile(sorted, 0.5) * 100) / 100,
    global_p99_ms: Math.round(pctile(sorted, 0.99) * 100) / 100,
    fraction_under_50ms: sorted.length > 0 ? Math.round((under50 / sorted.length) * 10_000) / 10_000 : 0,
    per_prompt: probes,
  };
}

// ---------------------------------------------------------------------------
// Full pipeline runner for one entry
// ---------------------------------------------------------------------------

export function runNichePipeline(
  classifierPath: string,
  entry: WorkflowEntry,
): NichePipelineResult {
  const raw = classifyOnceRaw(classifierPath, entry.prompt);
  const { tier: pipelineTier, fired } = applyNicheSafetyFloor(
    raw.tier,
    entry.category,
  );

  const classifyCorrect =
    raw.tier !== null && raw.tier === entry.expected_tier;
  const pipelineCorrect =
    pipelineTier !== null && pipelineTier === entry.expected_tier;

  return {
    id: entry.id,
    expected_tier: entry.expected_tier,
    category: entry.category,
    classify_tier: raw.tier,
    classify_completed: raw.completed,
    classify_confidence: raw.confidence,
    classify_latency_ms: Math.round(raw.latency_ms * 100) / 100,
    pipeline_tier: pipelineTier,
    safety_floor_fired: fired,
    correct: pipelineCorrect,
    classify_correct: classifyCorrect,
  };
}

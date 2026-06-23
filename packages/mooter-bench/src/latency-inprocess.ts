// latency-inprocess.ts — WN1 Round 2: in-process latency measurement for classify.js.
//
// classify.js exports { classify, classifyWithRetry } and guards its CLI
// entry with `if (require.main === module)`. This means we can load it via
// createRequire and call classifyWithRetry() directly — no subprocess spawn,
// no stdout capture, no process.argv monkey-patching.
//
// The in-process call isolates ONLY classify.js execution time: regex
// matching + cache lookup + result assembly. Subprocess spawn overhead
// (~60-70ms on Windows, Node.js cold-start) is excluded entirely.
//
// This resolves the Round 1 latency "MISS" (p50=75ms vs <50ms target).
// R1 measured subprocess time; this measures real classify.js CPU time.
//
// IMPORTANT: The first call to classifyWithRetry() per process load includes
// module init (loading patterns.js, tuning-state.json, etc.). We warm up
// with WARMUP_CALLS discarded calls before recording samples.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

/** Number of warmup calls to discard (module init, JIT warmup). */
export const WARMUP_CALLS = 3 as const;

/** Number of timed samples to record per probe. */
export const INPROCESS_REPS = 20 as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One in-process latency sample for a single prompt. */
export interface InProcessProbe {
  id: string;
  /** Wall-clock samples (excluding warmup), in ms. */
  samples_ms: number[];
  p50_ms: number;
  p99_ms: number;
  /** Tier returned by classifyWithRetry on the last run (sanity check). */
  last_tier: string | null;
}

/** Aggregate stats across all in-process probes. */
export interface InProcessLatencySummary {
  global_p50_ms: number;
  global_p99_ms: number;
  fraction_under_50ms: number;
  method: "in-process (createRequire + classifyWithRetry)";
  warmup_calls: number;
  reps_per_prompt: number;
  per_prompt: InProcessProbe[];
}

// ---------------------------------------------------------------------------
// Classifier loader (cached — load once per process)
// ---------------------------------------------------------------------------

let _classifyFn: ((prompt: string) => Record<string, unknown>) | null = null;
let _loadedPath: string | null = null;

/**
 * Load classify.js via createRequire and return its classifyWithRetry function.
 * Cached after first load — subsequent calls return the same function.
 *
 * IMPORTANT: createRequire resolves relative to THIS file, so we use
 * import.meta.url as the base. The classifierPath must be absolute.
 */
export function loadClassifyInProcess(
  classifierPath: string,
): (prompt: string) => Record<string, unknown> {
  if (_classifyFn && _loadedPath === classifierPath) return _classifyFn;

  const requireCJS = createRequire(import.meta.url);
  const mod = requireCJS(classifierPath) as {
    classifyWithRetry?: (p: string) => Record<string, unknown>;
    classify?: (p: string) => Record<string, unknown>;
  };

  // Prefer classifyWithRetry (includes low-confidence retry); fall back to classify.
  const fn = mod.classifyWithRetry ?? mod.classify;
  if (typeof fn !== "function") {
    throw new Error(
      `classify.js at ${classifierPath} does not export classifyWithRetry or classify. ` +
        "Cannot run in-process latency measurement.",
    );
  }

  _classifyFn = fn as (prompt: string) => Record<string, unknown>;
  _loadedPath = classifierPath;
  return _classifyFn;
}

// ---------------------------------------------------------------------------
// Percentile helper
// ---------------------------------------------------------------------------

function pctile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.max(0, Math.ceil(sorted.length * p) - 1);
  return sorted[idx];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Per-prompt in-process probe
// ---------------------------------------------------------------------------

/**
 * Run classifyWithRetry in-process WARMUP_CALLS + INPROCESS_REPS times on
 * the same prompt. Discard warmup calls. Return timing samples + p50/p99.
 *
 * This gives true classify.js CPU time, free of subprocess spawn overhead.
 */
export function probeInProcess(
  classifierPath: string,
  id: string,
  prompt: string,
  reps = INPROCESS_REPS,
  warmup = WARMUP_CALLS,
): InProcessProbe {
  const classify = loadClassifyInProcess(classifierPath);
  const samples_ms: number[] = [];
  let lastResult: Record<string, unknown> = {};

  for (let i = 0; i < warmup + reps; i++) {
    const t0 = performance.now();
    try {
      lastResult = classify(prompt);
    } catch {
      // classify.js is documented as never-throws; this is a defensive catch.
    }
    const elapsed = performance.now() - t0;
    if (i >= warmup) {
      samples_ms.push(elapsed);
    }
  }

  const sorted = [...samples_ms].sort((a, b) => a - b);
  const tier = typeof lastResult.tier === "string" ? lastResult.tier : null;

  return {
    id,
    samples_ms,
    p50_ms: round2(pctile(sorted, 0.5)),
    p99_ms: round2(pctile(sorted, 0.99)),
    last_tier: tier,
  };
}

// ---------------------------------------------------------------------------
// Aggregate across multiple probes
// ---------------------------------------------------------------------------

export function aggregateInProcessLatency(
  probes: InProcessProbe[],
): InProcessLatencySummary {
  const all: number[] = probes.flatMap((p) => p.samples_ms);
  const sorted = [...all].sort((a, b) => a - b);
  const under50 = sorted.filter((ms) => ms < 50).length;

  return {
    global_p50_ms: round2(pctile(sorted, 0.5)),
    global_p99_ms: round2(pctile(sorted, 0.99)),
    fraction_under_50ms:
      sorted.length > 0
        ? Math.round((under50 / sorted.length) * 10_000) / 10_000
        : 0,
    method: "in-process (createRequire + classifyWithRetry)",
    warmup_calls: WARMUP_CALLS,
    reps_per_prompt: INPROCESS_REPS,
    per_prompt: probes,
  };
}

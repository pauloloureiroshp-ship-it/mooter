// Wave 33 (B.1) — TurboQuant enable/disable state + benchmark gate.
//
// State lives in ~/.mooter/preferences.json (key `turboquant_enabled`), the same
// file every other statusline/effort pref uses. Env MOOTER_TURBOQUANT=1 forces it
// on for a session without persisting. The benchmark gate enforces honesty: if a
// real before/after VRAM measurement shows no meaningful cache reduction, we
// auto-opt-out rather than advertise a win that didn't happen.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const MIN_REDUCTION_PCT = 10; // below this, the gate opts out

function prefsPath(home: string): string {
  return join(home, ".mooter", "preferences.json");
}

function readPrefs(home: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(prefsPath(home), "utf8"));
  } catch {
    return {};
  }
}

function writePrefs(home: string, p: Record<string, unknown>): void {
  mkdirSync(join(home, ".mooter"), { recursive: true });
  writeFileSync(prefsPath(home), JSON.stringify(p, null, 2) + "\n");
}

/** True when TurboQuant is enabled (env override first, then preferences.json). */
export function isEnabled(home = homedir(), env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.MOOTER_TURBOQUANT === "1") return true;
  return readPrefs(home).turboquant_enabled === true;
}

/** Persist enable/disable. Merge-write so unrelated prefs are preserved. */
export function setEnabled(on: boolean, home = homedir()): void {
  const p = readPrefs(home);
  p.turboquant_enabled = on;
  writePrefs(home, p);
}

/** Opt-in line-3 status chip; null when disabled. */
export function statusChip(home = homedir(), env: NodeJS.ProcessEnv = process.env): string | null {
  return isEnabled(home, env) ? "🐢 TQ-3bit" : null;
}

export interface BenchmarkVerdict {
  /** true when both readings were present and positive. */
  measurable: boolean;
  reductionPct: number | null;
  /** true when the gate decided to opt out (no meaningful reduction). */
  shouldOptOut: boolean;
  note: string;
}

/**
 * Evaluate a before/after KV-cache VRAM measurement (MB). Honest: with no real
 * numbers we report unmeasured (NOT a fake win) and do NOT opt out — there's
 * nothing to judge yet. With numbers, a reduction below MIN_REDUCTION_PCT opts out.
 */
export function evaluateBenchmark(beforeMb: number | null, afterMb: number | null): BenchmarkVerdict {
  if (typeof beforeMb !== "number" || typeof afterMb !== "number" || beforeMb <= 0 || afterMb < 0) {
    return { measurable: false, reductionPct: null, shouldOptOut: false, note: "not benchmarked yet — run a real workload with TurboQuant enabled to measure." };
  }
  const reductionPct = ((beforeMb - afterMb) / beforeMb) * 100;
  if (reductionPct < MIN_REDUCTION_PCT) {
    return {
      measurable: true,
      reductionPct,
      shouldOptOut: true,
      note: `KV cache only ${reductionPct.toFixed(1)}% smaller (< ${MIN_REDUCTION_PCT}% gate) — auto opt-out, no measurable win on this model.`,
    };
  }
  return {
    measurable: true,
    reductionPct,
    shouldOptOut: false,
    note: `KV cache ${reductionPct.toFixed(1)}% smaller with 3-bit quantization.`,
  };
}

// Per-category best council + distillation hook.
//
// bestCouncilPerCategory: from the learning ledger, which seat-set gives the best value
// (highest verdict-change rate at the lowest cost) per task category. distillHook: when
// a category's historical change-rate is low with enough data, PREDICT the council won't
// change anything and SKIP it (distillation — NSED: small models can stand in for the
// council once it has stopped earning its cost). Honest: never skip without enough data.

import { MIN_DATAPOINTS } from "../../router/src/adaptive-learner.ts";
import type { CouncilOutcome } from "./pastor.ts";

export interface CategoryBest {
  category: string;
  seats: string[];
  changeRate: number;
  avgCostUsd: number;
  n: number;
}

function seatKey(seats: string[]): string {
  return [...seats].sort().join("+");
}

/** Best-value council seat-set per category: highest change-rate, then lowest cost. */
export function bestCouncilPerCategory(outcomes: CouncilOutcome[]): Map<string, CategoryBest> {
  const byCat = new Map<string, Map<string, CouncilOutcome[]>>();
  for (const o of outcomes) {
    const cat = byCat.get(o.category) ?? new Map<string, CouncilOutcome[]>();
    const key = seatKey(o.seats);
    cat.set(key, [...(cat.get(key) ?? []), o]);
    byCat.set(o.category, cat);
  }

  const result = new Map<string, CategoryBest>();
  for (const [category, sets] of byCat) {
    let best: CategoryBest | null = null;
    for (const [key, list] of sets) {
      const n = list.length;
      const changeRate = list.filter((o) => o.changedVerdict).length / n;
      const avgCostUsd = list.reduce((s, o) => s + o.costUsd, 0) / n;
      const cand: CategoryBest = { category, seats: key.split("+"), changeRate, avgCostUsd, n };
      if (
        !best ||
        cand.changeRate > best.changeRate ||
        (cand.changeRate === best.changeRate && cand.avgCostUsd < best.avgCostUsd) ||
        (cand.changeRate === best.changeRate && cand.avgCostUsd === best.avgCostUsd && cand.n > best.n)
      ) {
        best = cand;
      }
    }
    if (best) result.set(category, best);
  }
  return result;
}

export interface DistillConfig {
  minSamples?: number;
  /** Skip the council when the category's predicted change-rate is ≤ this. */
  skipBelow?: number;
}

export interface DistillDecision {
  skip: boolean;
  predictedChange: number;
  confidence: number;
  reason: string;
}

/**
 * Predict whether convening a council for `category` is worth it. When there is enough
 * history and the change-rate is low, predict "no change" and skip (distillation).
 * Never skips without enough data — honesty over savings.
 */
export function distillHook(
  category: string,
  outcomes: CouncilOutcome[],
  config: DistillConfig = {},
): DistillDecision {
  const minSamples = config.minSamples ?? MIN_DATAPOINTS;
  const skipBelow = config.skipBelow ?? 0.2;
  const sample = outcomes.filter((o) => o.category === category);
  const n = sample.length;

  if (n < minSamples) {
    return { skip: false, predictedChange: NaN, confidence: 0, reason: `insufficient data (${n}<${minSamples}) — run the council` };
  }

  const predictedChange = sample.filter((o) => o.changedVerdict).length / n;
  const confidence = Math.round((n / (n + minSamples)) * 1000) / 1000; // grows with samples
  if (predictedChange <= skipBelow) {
    return {
      skip: true,
      predictedChange: Math.round(predictedChange * 1000) / 1000,
      confidence,
      reason: `predicted change ${(predictedChange * 100).toFixed(0)}% ≤ ${(skipBelow * 100).toFixed(0)}% over ${n} runs → distill (skip council)`,
    };
  }
  return {
    skip: false,
    predictedChange: Math.round(predictedChange * 1000) / 1000,
    confidence,
    reason: `predicted change ${(predictedChange * 100).toFixed(0)}% > ${(skipBelow * 100).toFixed(0)}% → council still earns its cost`,
  };
}

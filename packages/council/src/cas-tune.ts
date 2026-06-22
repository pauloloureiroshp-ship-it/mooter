// CAS threshold auto-tune — the Pastor raises the bar where the council is redundant.
//
// Reuses the adaptive-learner constants (EWMA_ALPHA, MIN_DATAPOINTS) so the Council's
// learning matches the rest of Mooter. Signal: redundancy = "the council did NOT change
// the verdict". An EWMA over redundancy maps to the CAS threshold — high redundancy →
// high threshold → the council fires LESS over time (anti-overfire, the design's goal).

import { EWMA_ALPHA, MIN_DATAPOINTS } from "../../router/src/adaptive-learner.ts";
import type { CouncilOutcome } from "./pastor.ts";

export interface CasTuneConfig {
  alpha?: number;
  /** Floor / ceiling for the tuned threshold. */
  min?: number;
  max?: number;
  /** Neutral redundancy prior before enough data. */
  prior?: number;
}

export interface CasTuneResult {
  threshold: number;
  redundancyEwma: number;
  samples: number;
  note: string;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const round3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * Tune the CAS threshold from council outcomes. Higher redundancy (the council rarely
 * changes the verdict) → higher threshold → convene less. Below MIN_DATAPOINTS the
 * threshold stays neutral (no overfitting to a handful of runs).
 */
export function autoTuneCasThreshold(outcomes: CouncilOutcome[], config: CasTuneConfig = {}): CasTuneResult {
  const alpha = config.alpha ?? EWMA_ALPHA;
  const min = config.min ?? 0.4;
  const max = config.max ?? 0.9;
  const prior = config.prior ?? 0.5;

  if (outcomes.length < MIN_DATAPOINTS) {
    return {
      threshold: round3(clamp(min + prior * (max - min), min, max)),
      redundancyEwma: prior,
      samples: outcomes.length,
      note: `insufficient data (<${MIN_DATAPOINTS}) — neutral threshold`,
    };
  }

  let ewma = prior;
  for (const o of outcomes) {
    const redundant = o.changedVerdict ? 0 : 1;
    ewma = alpha * redundant + (1 - alpha) * ewma;
  }

  const threshold = clamp(min + ewma * (max - min), min, max);
  const note =
    ewma > 0.6
      ? "council often redundant → threshold raised (fire less)"
      : ewma < 0.4
        ? "council often adds value → threshold lowered (fire more)"
        : "balanced";

  return { threshold: round3(threshold), redundancyEwma: round3(ewma), samples: outcomes.length, note };
}

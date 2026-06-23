// Honest confidence calibration for the council (ADDITIVE — new in the pillar).
//
// WHY: the W2 confidence was (voteScore+1)/2 read straight off the peer-vote, which the
// seeded eval proved ANTI-correlated with correctness (confidence ≥0.6 → 69.2% accuracy
// vs <0.6 → 78.9% — the signal was inverted). A confidence number that goes UP as
// accuracy goes DOWN is worse than no number: it licenses the wrong ACT decisions.
//
// This module gives the small, low-variance, OVERFIT-RESISTANT primitives needed to
// calibrate honestly on a tiny dataset (32 verifiable items):
//   • smoothedRate  — Beta/Laplace-shrunk empirical rate (a bucket of n=2 must not claim
//                     100%); shrinks toward a prior base rate by `strength` pseudo-counts.
//   • isotonicPAVA  — monotone (non-decreasing) fit, the standard calibration map.
//   • expectedCalibrationError / brier — honest scoring of a probability vector.
//   • looCv         — leave-one-out CV so reported calibration is OUT-OF-FIT, never the
//                     in-sample number (the anti-overfit headline the charter demands).
//
// Nothing here calls a model or touches the frozen engine. Pure + deterministic.
//
// WIRING (so a future reader knows what is load-bearing): the SHIPPED runtime confidence
// (verdict.ts calibrateConfidence) uses the linear corroboration formula, NOT isotonic or
// smoothed rate. The primitives here are used by the OFFLINE fit/report scripts
// (calibration-fit.ts, r6-report.ts) — expectedCalibrationError/brier/looCv score the
// shipped confidence honestly out-of-fit; isotonicPAVA + smoothedRate back the candidate
// calibrators those scripts compare against. All are unit-tested and available for a
// future runtime calibrator, but only the linear formula is on the shipped path today.

export interface LabeledScore {
  /** Raw monotone-ish score to calibrate (higher = more confident). */
  score: number;
  /** Ground-truth outcome: 1 = correct, 0 = wrong. */
  label: 0 | 1;
}

/**
 * Beta/Laplace-shrunk success rate. With `strength` pseudo-observations pinned at `prior`,
 * a bucket of (successes, n) reports (successes + strength·prior) / (n + strength). This
 * stops a 2/2 bucket from claiming 1.0 and a 0/1 bucket from claiming 0.0 — exactly the
 * over-confident extremes a 32-item eval would otherwise produce.
 */
export function smoothedRate(successes: number, n: number, prior: number, strength = 2): number {
  return (successes + strength * prior) / (n + strength);
}

/**
 * Pool-Adjacent-Violators (PAVA) isotonic regression. Returns the monotone
 * non-decreasing step fit as breakpoints {x, y}: for a query score, the calibrated value
 * is the y of the last breakpoint with x ≤ score (clamped to the ends). Ties in x are
 * merged. O(n log n).
 */
export function isotonicPAVA(points: LabeledScore[]): { x: number; y: number }[] {
  if (points.length === 0) return [];
  const sorted = [...points].sort((a, b) => a.score - b.score);
  // blocks of {sumY, count, x (max score in block)}
  const blocks: { sumY: number; count: number; x: number }[] = [];
  for (const p of sorted) {
    blocks.push({ sumY: p.label, count: 1, x: p.score });
    // merge while the previous block's mean exceeds this one's (violates non-decreasing)
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1];
      const a = blocks[blocks.length - 2];
      if (a.sumY / a.count <= b.sumY / b.count) break;
      a.sumY += b.sumY; a.count += b.count; a.x = b.x;
      blocks.pop();
    }
  }
  return blocks.map((b) => ({ x: b.x, y: b.sumY / b.count }));
}

/** Evaluate an isotonic breakpoint fit at a score (step function, clamped). */
export function isotonicPredict(fit: { x: number; y: number }[], score: number): number {
  if (fit.length === 0) return 0.5;
  let y = fit[0].y;
  for (const bp of fit) { if (score >= bp.x) y = bp.y; else break; }
  return y;
}

/** Brier score (mean squared error of probabilistic predictions). Lower is better. */
export function brier(preds: number[], labels: number[]): number {
  if (preds.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < preds.length; i++) s += (preds[i] - labels[i]) ** 2;
  return s / preds.length;
}

/** Reliability bins for ECE: equal-width bins over [0,1] of predicted probability. */
export function reliabilityBins(
  preds: number[],
  labels: number[],
  nBins = 5,
): { lo: number; hi: number; n: number; conf: number; acc: number }[] {
  const bins = Array.from({ length: nBins }, (_, k) => ({
    lo: k / nBins, hi: (k + 1) / nBins, n: 0, confSum: 0, accSum: 0,
  }));
  for (let i = 0; i < preds.length; i++) {
    const p = Math.min(0.999999, Math.max(0, preds[i]));
    const k = Math.min(nBins - 1, Math.floor(p * nBins));
    bins[k].n++; bins[k].confSum += preds[i]; bins[k].accSum += labels[i];
  }
  return bins.map((b) => ({
    lo: b.lo, hi: b.hi, n: b.n,
    conf: b.n ? b.confSum / b.n : 0,
    acc: b.n ? b.accSum / b.n : 0,
  }));
}

/**
 * Expected Calibration Error — Σ (n_bin/N)·|acc_bin − conf_bin|. 0 = perfectly
 * calibrated. The headline honesty number for a confidence signal.
 */
export function expectedCalibrationError(preds: number[], labels: number[], nBins = 5): number {
  const N = preds.length;
  if (N === 0) return 0;
  return reliabilityBins(preds, labels, nBins).reduce(
    (e, b) => e + (b.n / N) * Math.abs(b.acc - b.conf),
    0,
  );
}

/**
 * Leave-one-out CV predictions: for each sample, fit on the OTHER n−1 and predict the
 * held-out one. Returns predictions aligned to `samples`. Use these (not in-sample) to
 * report ECE/Brier honestly on a tiny dataset.
 */
export function looCv<T>(
  samples: T[],
  fit: (train: T[]) => (s: T) => number,
): number[] {
  return samples.map((_, i) => {
    const train = samples.filter((__, j) => j !== i);
    const predict = fit(train);
    return predict(samples[i]);
  });
}

// Convergence voting across adversarial reviewers (Wave 30 Phase H).
//
// Confidence-weighted: each reviewer contributes its confidence mass to its
// verdict bucket. A claim is REJECTED when refute mass dominates past the
// threshold, CONFIRMED when confirm mass does, else UNCERTAIN. The asymmetry
// (refute wins ties) is intentional — adversarial review is biased to kill weak
// findings.

import type { ReviewResult, Verdict } from "./reviewer.ts";

export type Convergence = "CONFIRMED" | "REJECTED" | "UNCERTAIN";

export interface VoteResult {
  convergence: Convergence;
  confirmMass: number;
  refuteMass: number;
  uncertainMass: number;
  /** (confirmMass − refuteMass) / total, in [-1, 1]. */
  score: number;
  threshold: number;
  reviewers: ReviewResult[];
}

export interface VoteOptions {
  /** Fraction of decided mass needed to converge. Default 0.5. */
  threshold?: number;
}

function massByVerdict(results: ReviewResult[], v: Verdict): number {
  return results.filter((r) => r.verdict === v).reduce((s, r) => s + r.confidence, 0);
}

export function vote(results: ReviewResult[], opts: VoteOptions = {}): VoteResult {
  const threshold = opts.threshold ?? 0.5;
  const confirmMass = massByVerdict(results, "confirm");
  const refuteMass = massByVerdict(results, "refute");
  const uncertainMass = massByVerdict(results, "uncertain");
  const total = confirmMass + refuteMass + uncertainMass;
  const decided = confirmMass + refuteMass;

  let convergence: Convergence = "UNCERTAIN";
  if (decided > 0) {
    if (refuteMass >= confirmMass && refuteMass >= threshold * Math.max(total, 1e-9)) {
      convergence = "REJECTED";
    } else if (confirmMass > refuteMass && confirmMass >= threshold * Math.max(total, 1e-9)) {
      convergence = "CONFIRMED";
    }
  }
  const score = total > 0 ? (confirmMass - refuteMass) / total : 0;
  return { convergence, confirmMass, refuteMass, uncertainMass, score, threshold, reviewers: results };
}

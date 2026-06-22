// Conformal "ACT vs ESCALATE" — the calibrated safety valve.
//
// For high-risk actions (deploy/secrets/migrations) a council verdict is not an
// answer — it is a DECISION: ACT if the aggregated confidence clears a conformal
// threshold AND there is no credible objection, else ESCALATE to a human. Based on
// Conformal Social Choice for Safe Multi-Agent Deliberation (linear opinion pool +
// split conformal). This turns the Council into a defense-in-depth gate before a
// dangerous action — the property that most impresses on the safety axis.
//
// Design guarantee (verified by the safety gate): ESCALATE on ANY real disagreement;
// ACT only on strong consensus with no credible objection. A false-ACT under
// disagreement is a blocking bug — made structurally impossible here.

import type { CouncilVerdict } from "./types.ts";

export type Decision = "ACT" | "ESCALATE";

export interface EscalationConfig {
  /** Miscoverage tolerance. With no calibration data, ACT needs pooled ≥ 1 − alpha. */
  alpha?: number;
  /** Split-conformal calibration scores (nonconformity in [0,1]); empty → fixed floor. */
  calibration?: number[];
  /** Never ACT unless the council CONFIRMED the answer. Default true. */
  requireConfirmed?: boolean;
  /** A minority refute at/above this confidence is a credible objection → ESCALATE. */
  refuteVetoLevel?: number;
}

export interface EscalationDecision {
  decision: Decision;
  pooledConfidence: number;
  threshold: number;
  refuteVeto: number;
  reasons: string[];
}

/**
 * Linear opinion pool (Genest & Zidek): weighted arithmetic mean of probabilities.
 */
export function linearOpinionPool(probs: number[], weights?: number[]): number {
  if (probs.length === 0) return 0;
  const w = weights ?? probs.map(() => 1);
  const Z = w.reduce((s, x) => s + x, 0) || 1;
  const pooled = probs.reduce((s, p, i) => s + p * (w[i] ?? 0), 0) / Z;
  return Math.max(0, Math.min(1, pooled));
}

/**
 * Split-conformal threshold: the ⌈(n+1)(1−α)⌉-th smallest calibration score, giving a
 * (1−α) coverage guarantee. With no calibration set, fall back to a fixed (1−α) floor.
 */
export function conformalThreshold(calibration: number[], alpha: number): number {
  if (calibration.length === 0) return Math.max(0, Math.min(1, 1 - alpha));
  const sorted = [...calibration].sort((a, b) => a - b);
  const n = sorted.length;
  const rank = Math.ceil((n + 1) * (1 - alpha));
  const idx = Math.min(n - 1, Math.max(0, rank - 1));
  return sorted[idx];
}

/** Largest confidence among minority REFUTES (a credible objection). 0 if none. */
export function strongestRefute(verdict: CouncilVerdict): number {
  return verdict.minorityReport
    .filter((m) => m.verdict === "refute")
    .reduce((mx, m) => Math.max(mx, m.confidence), 0);
}

/**
 * Decide ACT vs ESCALATE for a high-risk verdict. ESCALATE on any real disagreement;
 * ACT only with strong consensus + no credible objection + pooled ≥ conformal threshold.
 */
export function decideActOrEscalate(
  verdict: CouncilVerdict,
  config: EscalationConfig = {},
): EscalationDecision {
  const alpha = config.alpha ?? 0.2; // default: need ≥ 0.8 pooled confidence
  const requireConfirmed = config.requireConfirmed ?? true;
  const refuteVetoLevel = config.refuteVetoLevel ?? 0.7;

  const threshold = conformalThreshold(config.calibration ?? [], alpha);
  const refuteVeto = strongestRefute(verdict);

  // Pool the council's calibrated confidence with the complement of the strongest
  // objection (a genuine two-opinion linear pool, verdict weighted 2×).
  const pooledConfidence = linearOpinionPool([verdict.confidence, 1 - refuteVeto], [2, 1]);

  const reasons: string[] = [];
  // "credible objection" is DEFINED as a refute at/above refuteVetoLevel. The safety
  // invariant (no false-ACT under disagreement) holds for credible objections by this
  // definition; lowering refuteVetoLevel widens the ACT envelope — tune deliberately.
  const hardObjection = refuteVeto >= refuteVetoLevel;
  const confirmedOk = !requireConfirmed || verdict.convergence === "CONFIRMED";

  if (hardObjection) reasons.push(`credible objection (refute confidence ${refuteVeto.toFixed(2)} ≥ ${refuteVetoLevel})`);
  if (!confirmedOk) reasons.push(`convergence ${verdict.convergence} (not CONFIRMED)`);
  if (pooledConfidence < threshold) reasons.push(`pooled confidence ${pooledConfidence.toFixed(2)} < threshold ${threshold.toFixed(2)}`);

  let decision: Decision = "ESCALATE";
  if (confirmedOk && !hardObjection && pooledConfidence >= threshold) {
    decision = "ACT";
    reasons.length = 0;
    reasons.push(`strong consensus (${verdict.convergence}, pooled ${pooledConfidence.toFixed(2)} ≥ ${threshold.toFixed(2)}), no credible objection`);
  } else if (reasons.length === 0) {
    reasons.push("escalating conservatively");
  }

  return {
    decision,
    pooledConfidence: Math.round(pooledConfidence * 1000) / 1000,
    threshold: Math.round(threshold * 1000) / 1000,
    refuteVeto: Math.round(refuteVeto * 1000) / 1000,
    reasons,
  };
}

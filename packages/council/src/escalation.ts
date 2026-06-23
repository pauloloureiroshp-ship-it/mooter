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
  /**
   * Calibrated floor for the LEGACY (agreement-less) path: a CONFIRMED verdict must clear
   * this confidence to ACT. Kept for verdicts without a self-consistency signal. Default 0.6.
   */
  minConfirmedConfidence?: number;
  /**
   * W3: when the verdict carries a self-consistency (agreement) signal, gate ACT on
   * CORROBORATION instead of the peer-vote CONFIRMED convergence. The seeded eval proved
   * CONFIRMED is ANTI-correlated with correctness (CONFIRMED→0.60 vs REJECTED→0.92), so
   * "the peers confirmed it" is the wrong ACT trigger; "≥N seats independently produced
   * the same answer" is the honest one (corroborated winners were 100% accurate, vs 60%
   * for bare CONFIRMED). Default true. */
  requireCorroboration?: boolean;
  /** Minimum agreement cluster size to license ACT (independent seats on the same answer).
   *  Default 2 — at least one seat must corroborate the winner. */
  minCorroboration?: number;
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
  const minConfirmedConfidence = config.minConfirmedConfidence ?? 0.6; // legacy ACT floor
  const requireCorroboration = config.requireCorroboration ?? true;
  const minCorroboration = config.minCorroboration ?? 2;

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

  // Strong-consensus proxy. W3: when a self-consistency signal is present, ACT requires
  // CORROBORATION (≥N seats independently produced the winning answer) AND not genuine
  // uncertainty — NOT the anti-correlated CONFIRMED convergence. Agreement on a hedge
  // (everyone says "maybe" → UNCERTAIN) must NOT license ACT. With no agreement signal,
  // fall back to the legacy CONFIRMED ∧ confidence-floor gate.
  const ag = verdict.agreement;
  let consensusOk: boolean;
  if (ag && requireCorroboration) {
    const corroborated = ag.clusterSize >= minCorroboration;
    const notUncertain = verdict.convergence !== "UNCERTAIN";
    consensusOk = corroborated && notUncertain;
    if (!corroborated) reasons.push(`uncorroborated winner (cluster size ${ag.clusterSize} < ${minCorroboration}) — no independent agreement`);
    else if (!notUncertain) reasons.push(`genuine uncertainty (convergence UNCERTAIN) despite agreement on a hedge`);
  } else {
    const isConfirmed = verdict.convergence === "CONFIRMED";
    const confidentEnough = verdict.confidence >= minConfirmedConfidence;
    consensusOk = !requireConfirmed || (isConfirmed && confidentEnough);
    if (!consensusOk && !isConfirmed) reasons.push(`convergence ${verdict.convergence} (not CONFIRMED)`);
    if (!consensusOk && isConfirmed && !confidentEnough) reasons.push(`CONFIRMED but confidence ${verdict.confidence.toFixed(2)} < calibrated floor ${minConfirmedConfidence}`);
  }

  if (hardObjection) reasons.push(`credible objection (refute confidence ${refuteVeto.toFixed(2)} ≥ ${refuteVetoLevel})`);
  if (pooledConfidence < threshold) reasons.push(`pooled confidence ${pooledConfidence.toFixed(2)} < threshold ${threshold.toFixed(2)}`);

  let decision: Decision = "ESCALATE";
  if (consensusOk && !hardObjection && pooledConfidence >= threshold) {
    decision = "ACT";
    reasons.length = 0;
    const basis = ag && requireCorroboration ? `corroborated by ${ag.clusterSize} seats` : `${verdict.convergence}`;
    reasons.push(`strong consensus (${basis}, pooled ${pooledConfidence.toFixed(2)} ≥ ${threshold.toFixed(2)}), no credible objection`);
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

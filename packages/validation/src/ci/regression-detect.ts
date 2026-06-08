// MLWR regression detector (Wave 30 Phase F).
//
// Compares a current benchmark's MLWR against a committed baseline. A tier
// "regresses" if its win-rate drops by more than `thresholdPp` percentage
// points. Overall regression (the merge-blocking signal) fires if the overall
// MLWR drops past the threshold OR any single tier does.

import { TIERS, type MlwrByTier } from "../types.ts";

export interface TierDelta {
  tier: string;
  basePct: number; // 0..100, one decimal
  curPct: number;
  deltaPp: number; // curPct - basePct
  regressed: boolean;
}

export interface RegressionResult {
  regressed: boolean;
  thresholdPp: number;
  overall: TierDelta;
  perTier: TierDelta[];
  worstTier: string | null;
}

function pct(fraction: number): number {
  if (!Number.isFinite(fraction)) return 0;
  return Math.round(Math.max(0, Math.min(1, fraction)) * 1000) / 10;
}

function delta(tier: string, base: number, cur: number, thresholdPp: number): TierDelta {
  const basePct = pct(base);
  const curPct = pct(cur);
  const deltaPp = Math.round((curPct - basePct) * 10) / 10;
  return { tier, basePct, curPct, deltaPp, regressed: deltaPp < -thresholdPp };
}

export function detectRegression(
  base: MlwrByTier,
  cur: MlwrByTier,
  thresholdPp = 5,
): RegressionResult {
  const perTier = TIERS.map((t) => delta(t, base[t], cur[t], thresholdPp));
  const overall = delta("overall", base.overall, cur.overall, thresholdPp);
  const worst = [...perTier].sort((a, b) => a.deltaPp - b.deltaPp)[0];
  const regressed = overall.regressed || perTier.some((t) => t.regressed);
  return {
    regressed,
    thresholdPp,
    overall,
    perTier,
    worstTier: regressed ? worst?.tier ?? "overall" : null,
  };
}

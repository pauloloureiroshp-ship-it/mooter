// MLWR — Mooter Locality Win Rate (Wave 30 Phase L).
//
// Per tier, the fraction of that tier's tasks where the LOCAL (routed) model met
// the objective quality bar. This is the cheap, judge-free MLWR. A judged
// variant (local vs always-cloud baseline) is available via judge.ts but costs
// cloud calls; the objective MLWR is the primary, reproducible metric.

import type { RunResult } from "./runner.ts";
import { type MlwrByTier, type Tier, TIERS } from "../types.ts";

export interface MlwrOptions {
  /** Treat exactly these model ids as the "local/routed" arm. Defaults to kind==="local". */
  localModelIds?: string[];
}

export interface MlwrReport {
  mlwr: MlwrByTier;
  perTier: Record<Tier, { pass: number; total: number }>;
  runs: number;
  localCostUsd: number;
  cloudCostUsd: number;
}

export function computeMlwr(results: RunResult[], opts: MlwrOptions = {}): MlwrReport {
  const isLocal = (r: RunResult): boolean =>
    opts.localModelIds ? opts.localModelIds.includes(r.model) : r.modelKind === "local";

  const local = results.filter(isLocal);
  const perTier: Record<Tier, { pass: number; total: number }> = {
    T0: { pass: 0, total: 0 },
    T1: { pass: 0, total: 0 },
    T2: { pass: 0, total: 0 },
    T3: { pass: 0, total: 0 },
  };
  for (const r of local) {
    perTier[r.tier].total++;
    if (r.pass) perTier[r.tier].pass++;
  }
  const rate = (t: Tier): number => (perTier[t].total ? perTier[t].pass / perTier[t].total : 0);
  let pass = 0;
  let total = 0;
  for (const t of TIERS) {
    pass += perTier[t].pass;
    total += perTier[t].total;
  }
  const mlwr: MlwrByTier = {
    T0: rate("T0"),
    T1: rate("T1"),
    T2: rate("T2"),
    T3: rate("T3"),
    overall: total ? pass / total : 0,
  };
  return {
    mlwr,
    perTier,
    runs: local.length,
    localCostUsd: local.reduce((s, r) => s + (r.costUsd || 0), 0),
    cloudCostUsd: results.filter((r) => !isLocal(r)).reduce((s, r) => s + (r.costUsd || 0), 0),
  };
}

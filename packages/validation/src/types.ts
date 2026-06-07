// Shared types for the validation layer (Wave 30).

export type Tier = "T0" | "T1" | "T2" | "T3";
export const TIERS: Tier[] = ["T0", "T1", "T2", "T3"];

/**
 * Mooter Locality Win Rate per tier — the fraction (0..1) of tasks in that tier
 * where the local-or-cheaper routed model met the quality bar against the
 * always-cloud baseline. `overall` is the corpus-weighted aggregate.
 */
export interface MlwrByTier {
  T0: number;
  T1: number;
  T2: number;
  T3: number;
  overall: number;
}

export interface BenchmarkSummary {
  mlwr: MlwrByTier;
  runs: number;
  generatedAt?: string;
  note?: string;
}

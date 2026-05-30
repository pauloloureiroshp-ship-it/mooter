// cost-calculator.ts — client-only methodology formula (IMPLEMENTATION_SPEC §6.4.1).
// No fetch, no backend. Pure function — updates LIVE on every input change.

export type Hardware = 'none' | '8gb' | '16gb' | '24gb_plus';

const OPUS_AVG_COST = 0.042; // per-prompt all-Opus baseline
const TIER_COSTS = { T0: 0, T1: 0.001, T2: 0.003, T3: 0.042 } as const;

const TIER_DISTRIBUTION_BY_GPU: Record<Hardware, [number, number, number, number]> = {
  none: [0, 0.5, 0.35, 0.15],
  '8gb': [0.35, 0.25, 0.25, 0.15],
  '16gb': [0.5, 0.22, 0.18, 0.1],
  '24gb_plus': [0.62, 0.18, 0.14, 0.06],
};

export interface SavingsInput {
  hardware: Hardware;
  promptsPerDay: number;
  pctCritical: number; // 0-100, share of T3-critical prompts (advisory)
}

export interface SavingsResult {
  baseline_monthly: number;
  with_mooter_monthly: number;
  saved_monthly: number;
  saved_pct: number;
  tier_distribution: { T0: number; T1: number; T2: number; T3: number };
}

export function calculateSavings(opts: SavingsInput): SavingsResult {
  const monthlyPrompts = opts.promptsPerDay * 30;
  const baseline = monthlyPrompts * OPUS_AVG_COST;
  const dist = TIER_DISTRIBUTION_BY_GPU[opts.hardware];
  const tiers = ['T0', 'T1', 'T2', 'T3'] as const;
  const withMooter = dist.reduce((sum, share, idx) => {
    return sum + monthlyPrompts * share * TIER_COSTS[tiers[idx]];
  }, 0);
  return {
    baseline_monthly: baseline,
    with_mooter_monthly: withMooter,
    saved_monthly: baseline - withMooter,
    saved_pct: baseline === 0 ? 0 : (1 - withMooter / baseline) * 100,
    tier_distribution: { T0: dist[0], T1: dist[1], T2: dist[2], T3: dist[3] },
  };
}

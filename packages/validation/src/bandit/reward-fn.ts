// Reward function for the L16.2 bandit (Wave 30 Phase G).
//
// Brief shape: reward ≈ outcome_accepted × (1 / cost_usd × latency_penalty).
// Normalised to [0,1] so it can drive a Beta-Bernoulli posterior update:
//
//   reward = accepted ? clamp(costEff · latencyFactor, 0, 1) : 0
//
//   costEff       = clamp(costRef / (cost + costFloor), 0, 1)   // free/local → 1
//   latencyFactor = clamp(1 - max(0, latency - budget) / budget, 0, 1)  // within budget → 1
//
// Deterministic: a pure function of (outcome, config). No clock, no randomness.

export interface Outcome {
  /** Did the user/test keep the routed result? A rejected outcome is a failure regardless of cost. */
  accepted: boolean;
  /** USD cost of the chosen arm for this task (0 for free local inference). */
  costUsd: number;
  /** Observed end-to-end latency in ms. */
  latencyMs: number;
}

export interface RewardConfig {
  /** Latency at/under which there is no penalty (ms). Default 8000. */
  latencyBudgetMs: number;
  /** Avoids div-by-zero for free local inference (USD). Default 1e-4. */
  costFloorUsd: number;
  /** Reference cost mapping to costEff≈1 at or below it (USD). Default 0.05. */
  costRefUsd: number;
}

export const DEFAULT_REWARD_CONFIG: RewardConfig = {
  latencyBudgetMs: 8000,
  costFloorUsd: 1e-4,
  costRefUsd: 0.05,
};

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function costEfficiency(costUsd: number, cfg: RewardConfig = DEFAULT_REWARD_CONFIG): number {
  const cost = Math.max(0, costUsd);
  return clamp01(cfg.costRefUsd / (cost + cfg.costFloorUsd));
}

export function latencyFactor(latencyMs: number, cfg: RewardConfig = DEFAULT_REWARD_CONFIG): number {
  const lat = Math.max(0, latencyMs);
  const over = Math.max(0, lat - cfg.latencyBudgetMs);
  return clamp01(1 - over / cfg.latencyBudgetMs);
}

export function reward(o: Outcome, cfg: RewardConfig = DEFAULT_REWARD_CONFIG): number {
  if (!o.accepted) return 0;
  return clamp01(costEfficiency(o.costUsd, cfg) * latencyFactor(o.latencyMs, cfg));
}

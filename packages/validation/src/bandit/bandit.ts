// Bandit orchestrator (Wave 30 Phase G) — ties store + Thompson sampler +
// doctrine guardrail + reward function into a routing-bias learner.
//
// Contract: `decide()` NEVER returns an arm below the classify tier. The
// guardrail filters candidates first, and a final clampTier assert defends the
// invariant even against a mis-specified arm set.

import { type Rng, mulberry32, chooseArm, type ArmSample, posteriorMean } from "./thompson-sampling.ts";
import {
  type PosteriorStore,
  type BanditContext,
  contextKey,
} from "./posterior-store.ts";
import {
  type TieredArm,
  type GuardrailInput,
  allowedArms,
  violatesDoctrine,
} from "./doctrine-guardrail.ts";
import { reward, type Outcome, type RewardConfig, DEFAULT_REWARD_CONFIG } from "./reward-fn.ts";
import type { Tier } from "../types.ts";

export interface DecideInput {
  context: BanditContext;
  classifyTier: Tier;
  highRisk?: boolean;
  arms: TieredArm[];
}

export interface Decision {
  arm: string;
  tier: Tier;
  samples: ArmSample[];
  allowed: string[];
  /** True when the guardrail narrowed the candidate set (high-risk or below-floor arms dropped). */
  guardrailApplied: boolean;
}

export class Bandit {
  private readonly store: PosteriorStore;
  private rng: Rng;
  private readonly rewardCfg: RewardConfig;

  constructor(store: PosteriorStore, opts: { rng?: Rng; seed?: number; rewardCfg?: RewardConfig } = {}) {
    this.store = store;
    this.rng = opts.rng ?? mulberry32(opts.seed ?? 0x9e3779b9);
    this.rewardCfg = opts.rewardCfg ?? DEFAULT_REWARD_CONFIG;
  }

  decide(input: DecideInput): Decision {
    const g: GuardrailInput = { classifyTier: input.classifyTier, highRisk: input.highRisk };
    const allowed = allowedArms(input.arms, g); // throws if no arm satisfies the floor
    const guardrailApplied = allowed.length !== input.arms.length;
    const ctxKey = contextKey(input.context);
    const posteriors = new Map(allowed.map((a) => [a.id, this.store.get(ctxKey, a.id)]));
    const { arm, samples } = chooseArm(
      allowed.map((a) => a.id),
      posteriors,
      this.rng,
    );
    const chosen = allowed.find((a) => a.id === arm)!;
    // hard invariant: never below the doctrine floor
    if (violatesDoctrine(chosen.tier, input.classifyTier)) {
      throw new Error(
        `bandit invariant violated: chose ${chosen.tier} below classify floor ${input.classifyTier}`,
      );
    }
    return { arm, tier: chosen.tier, samples, allowed: allowed.map((a) => a.id), guardrailApplied };
  }

  /** Record an outcome → reward → Beta update for the chosen arm. */
  observe(context: BanditContext, arm: string, outcome: Outcome): number {
    const r = reward(outcome, this.rewardCfg);
    // Beta update with fractional pseudo-counts: success mass r, failure mass (1-r).
    this.store.update(contextKey(context), arm, r, 1 - r);
    return r;
  }

  /** Posterior mean success per arm for a context (reporting only). */
  report(context: BanditContext, arms: string[]): Array<{ arm: string; mean: number; pulls: number }> {
    const ctxKey = contextKey(context);
    return arms.map((arm) => {
      const p = this.store.get(ctxKey, arm);
      return { arm, mean: posteriorMean(p), pulls: p.pulls };
    });
  }
}

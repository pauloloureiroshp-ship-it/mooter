// Thompson Sampling over Beta-Bernoulli arms (Wave 30 Phase G).
//
// Each arm carries a Beta(α, β) posterior over its "success probability". To
// choose, sample θ_arm ~ Beta(α_arm, β_arm) for every candidate and pick the
// argmax. Exploration is implicit in the posterior variance — uncertain arms
// occasionally sample high and get tried.
//
// RNG is injected so tests are deterministic (mulberry32). The Beta sampler is
// built from two Gamma(·,1) draws (Marsaglia–Tsang), valid for any α,β > 0.

export interface Rng {
  /** Uniform in [0,1). */
  next(): number;
}

export interface BetaPosterior {
  alpha: number;
  beta: number;
  pulls: number;
}

export function uniformPrior(): BetaPosterior {
  return { alpha: 1, beta: 1, pulls: 0 };
}

/** Deterministic, well-distributed 32-bit RNG. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

function standardNormal(rng: Rng): number {
  let u1 = rng.next();
  const u2 = rng.next();
  if (u1 < 1e-12) u1 = 1e-12;
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Sample from Gamma(shape k, scale 1), k > 0. Marsaglia–Tsang with boosting for k < 1. */
export function sampleGamma(k: number, rng: Rng): number {
  if (!(k > 0)) return 0;
  if (k < 1) {
    const u = Math.max(rng.next(), 1e-12);
    return sampleGamma(k + 1, rng) * Math.pow(u, 1 / k);
  }
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  // Bounded loop: in practice accepts in 1–2 iterations; cap defends determinism.
  for (let i = 0; i < 1000; i++) {
    let x: number;
    let v: number;
    do {
      x = standardNormal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng.next();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(Math.max(u, 1e-12)) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
  return d; // fallback (mean) — effectively never reached
}

/** Sample θ ~ Beta(α, β) via X/(X+Y), X~Gamma(α), Y~Gamma(β). Returns value in [0,1]. */
export function sampleBeta(alpha: number, beta: number, rng: Rng): number {
  const x = sampleGamma(Math.max(alpha, 1e-6), rng);
  const y = sampleGamma(Math.max(beta, 1e-6), rng);
  const s = x + y;
  if (s <= 0) return 0.5;
  return x / s;
}

export interface ArmSample {
  arm: string;
  theta: number;
}

/**
 * Thompson choice over `arms`. Posteriors default to the uniform prior for an
 * unseen arm. Returns the winner plus all samples (for observability/testing).
 * Ties broken by input order (stable).
 */
export function chooseArm(
  arms: string[],
  posteriors: Map<string, BetaPosterior>,
  rng: Rng,
): { arm: string; samples: ArmSample[] } {
  if (arms.length === 0) throw new Error("chooseArm: no arms");
  const samples: ArmSample[] = arms.map((arm) => {
    const p = posteriors.get(arm) ?? uniformPrior();
    return { arm, theta: sampleBeta(p.alpha, p.beta, rng) };
  });
  let best = samples[0];
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].theta > best.theta) best = samples[i];
  }
  return { arm: best.arm, samples };
}

/** Posterior mean success probability — used for reporting (not for choosing). */
export function posteriorMean(p: BetaPosterior): number {
  return p.alpha / (p.alpha + p.beta);
}

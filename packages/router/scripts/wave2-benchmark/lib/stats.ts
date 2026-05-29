/**
 * stats.ts — pure statistics helpers for wave1-benchmark.
 * No external deps. ESM. Deterministic when seed given.
 */

/** Arithmetic mean; returns 0 for empty array. */
export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** Sample standard deviation (denominator n-1). Returns 0 if length < 2. */
export function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

/**
 * Cohen's d for two independent samples, pooled SD.
 * Returns 0 if pooled_sd === 0 or either array length < 2.
 */
export function cohensD(a: number[], b: number[]): number {
  const na = a.length;
  const nb = b.length;
  if (na < 2 || nb < 2) return 0;
  const sa = stddev(a);
  const sb = stddev(b);
  const pooledVar = ((na - 1) * sa ** 2 + (nb - 1) * sb ** 2) / (na + nb - 2);
  const pooledSd = Math.sqrt(pooledVar);
  if (pooledSd === 0) return 0;
  return (mean(a) - mean(b)) / pooledSd;
}

/**
 * Cohen's d for paired data.
 * Caller passes per-pair differences (a_i - b_i).
 * Returns mean(diffs)/stddev(diffs). Returns 0 if stddev===0 or length < 2.
 */
export function pairedCohensD(diffs: number[]): number {
  if (diffs.length < 2) return 0;
  const sd = stddev(diffs);
  if (sd === 0) return 0;
  return mean(diffs) / sd;
}

/**
 * mulberry32 PRNG — returns a closure producing floats in [0, 1).
 * Deterministic given the same seed.
 */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return (): number => {
    t = (t + 0x6d2b79f5) >>> 0;
    let z = t;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    z = (z ^ (z >>> 14)) >>> 0;
    return z / 0x100000000;
  };
}

/**
 * Quantile via linear interpolation (numpy/R type-7 method).
 * q in [0, 1]. Array must be sorted ascending.
 */
export function quantile(sortedAsc: number[], q: number): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  if (n === 1) return sortedAsc[0];
  const h = (n - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.min(lo + 1, n - 1);
  return sortedAsc[lo] + (h - lo) * (sortedAsc[hi] - sortedAsc[lo]);
}

export interface CIResult {
  lower: number;
  upper: number;
  point: number;
  resamples: number;
}

/**
 * Percentile bootstrap CI for the mean of xs.
 * Reproducible via mulberry32(seed).
 */
export function bootstrapCI(
  xs: number[],
  opts?: { resamples?: number; alpha?: number; seed?: number }
): CIResult {
  const resamples = opts?.resamples ?? 1000;
  const alpha = opts?.alpha ?? 0.05;
  const seed = opts?.seed ?? 42;
  const rng = mulberry32(seed);
  const n = xs.length;
  const stats: number[] = [];
  for (let r = 0; r < resamples; r++) {
    let s = 0;
    for (let i = 0; i < n; i++) {
      s += xs[Math.floor(rng() * n)];
    }
    stats.push(s / n);
  }
  stats.sort((a, b) => a - b);
  return {
    lower: quantile(stats, alpha / 2),
    upper: quantile(stats, 1 - alpha / 2),
    point: mean(xs),
    resamples,
  };
}

/**
 * Bootstrap CI for difference of means: mean(a) - mean(b).
 * paired=true: resample indices, stat = mean(a[i]-b[i]).
 * paired=false (default): resample a and b independently.
 */
export function bootstrapDiffCI(
  a: number[],
  b: number[],
  opts?: { resamples?: number; alpha?: number; seed?: number; paired?: boolean }
): CIResult {
  const resamples = opts?.resamples ?? 1000;
  const alpha = opts?.alpha ?? 0.05;
  const seed = opts?.seed ?? 42;
  const paired = opts?.paired ?? false;
  const rng = mulberry32(seed);
  const stats: number[] = [];

  if (paired) {
    const n = a.length; // a.length === b.length assumed
    for (let r = 0; r < resamples; r++) {
      let s = 0;
      for (let i = 0; i < n; i++) {
        const idx = Math.floor(rng() * n);
        s += a[idx] - b[idx];
      }
      stats.push(s / n);
    }
  } else {
    const na = a.length;
    const nb = b.length;
    for (let r = 0; r < resamples; r++) {
      let sa = 0;
      for (let i = 0; i < na; i++) sa += a[Math.floor(rng() * na)];
      let sb = 0;
      for (let i = 0; i < nb; i++) sb += b[Math.floor(rng() * nb)];
      stats.push(sa / na - sb / nb);
    }
  }

  stats.sort((a, b) => a - b);
  const point = paired
    ? mean(a.map((v, i) => v - b[i]))
    : mean(a) - mean(b);

  return {
    lower: quantile(stats, alpha / 2),
    upper: quantile(stats, 1 - alpha / 2),
    point,
    resamples,
  };
}

// self-test (run: tsx lib/stats.ts is NOT expected; tests live elsewhere)

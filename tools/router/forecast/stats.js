#!/usr/bin/env node
// stats.js — the honest-statistics layer of the forecast.
//
// Four jobs, each an invariant the red-team turned into law:
//   • percentile()      — linear-interpolation empirical percentiles (P50/P90).
//   • buildSample()     — sliding window (DC-02) + CUSUM regime-break (DC-02) +
//                         cold-start gate (DC-04). Returns calibrating=true and
//                         NO percentiles below k events — never a bootstrap cone
//                         drawn on n<k.
//   • cusumBreak()      — detect a sustained mean-shift vs an early reference and
//                         return the change point, so the caller DISCARDS the old
//                         regime ("learns forever" must not sample stale history).
//   • bootstrapBand()   — the percentile's own confidence interval (DC-04/05:
//                         the "double band" shown while a class is still thin).
//
// Pure, deterministic (RNG injected), never throws on empty/degenerate input.

'use strict';

const DEFAULT_K = 8;        // cold-start floor: below this, no cone (DC-04).
const DEFAULT_WINDOW = 40;  // sliding window: only the last N of a class (DC-02).

function _num(arr) { return (Array.isArray(arr) ? arr : []).map(Number).filter((x) => Number.isFinite(x)); }
function mean(arr) { const a = _num(arr); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }
function std(arr, mu) {
  const a = _num(arr); if (a.length < 2) return 0;
  const m = (mu == null) ? mean(a) : mu;
  return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1));
}

// Empirical percentile with linear interpolation. p in [0,1]. Empty → null.
function percentile(values, p) {
  const a = _num(values).sort((x, y) => x - y);
  const n = a.length;
  if (n === 0) return null;
  if (n === 1) return a[0];
  const clamped = Math.min(1, Math.max(0, p));
  const idx = clamped * (n - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return a[lo];
  return a[lo] + (a[hi] - a[lo]) * (idx - lo);
}

function p50p90(values) {
  return { p50: percentile(values, 0.5), p90: percentile(values, 0.9) };
}

// CUSUM against an EARLY reference (not the global mean — the global mean is
// contaminated by the very shift we're hunting). Two-sided. Returns the change
// point (keep values.slice(changePoint)) or -1 when the tail matches the head.
//
// Two safeguards learned the hard way:
//  • break on the FIRST alarm and take its onset — otherwise every subsequent
//    high re-alarms and walks the change point to the last index (then minKeep
//    kills a legitimate break).
//  • a relative-magnitude guard: only a MATERIAL sustained shift (default ≥50%
//    change in mean) discards history. A gentle drift is noise, not a regime —
//    "learns forever" must not nuke the past on a 20%→25% wobble.
function cusumBreak(values, opts) {
  const o = opts || {};
  const k = o.k != null ? o.k : 0.5;   // slack, in reference-std units
  const h = o.h != null ? o.h : 5;     // decision interval, in reference-std units
  const minKeep = o.minKeep != null ? o.minKeep : 3;       // don't call a <3-pt tail a regime
  const minRelShift = o.minRelShift != null ? o.minRelShift : 0.5; // ≥50% mean change to matter
  const a = _num(values);
  const n = a.length;
  if (n < 6) return -1; // too short to distinguish a regime from noise

  const refLen = Math.max(3, Math.floor(n * 0.3));
  const ref = a.slice(0, refLen);
  const mu0 = mean(ref);
  const sd0 = std(ref) || Math.max(1, Math.abs(mu0) * 0.05);

  let sPos = 0, sNeg = 0, posStart = 0, negStart = 0;
  let change = -1;
  for (let i = 0; i < n; i++) {
    const z = (a[i] - mu0) / sd0;
    if (sPos === 0) posStart = i;
    if (sNeg === 0) negStart = i;
    sPos = Math.max(0, sPos + z - k);
    sNeg = Math.max(0, sNeg - z - k);
    if (sPos > h) { change = posStart; break; }
    if (sNeg > h) { change = negStart; break; }
  }
  if (change <= 0) return -1;
  if (n - change < minKeep) return -1; // retained regime too small → keep all
  // Only a material shift counts (guards against gentle drift false-positives).
  const before = mean(a.slice(0, change));
  const after = mean(a.slice(change));
  const rel = Math.abs(after - before) / Math.max(1e-9, Math.abs(before));
  if (rel < minRelShift) return -1;
  return change;
}

// Build the class sample: chronological values in → { values (post-window,
// post-break), n, calibrating, k, window, regimeBreakAt, discardedPreBreak }.
// `orderedValues` MUST be oldest→newest (regime logic depends on order).
function buildSample(orderedValues, opts) {
  const o = opts || {};
  const k = o.k != null ? o.k : DEFAULT_K;
  const window = o.window != null ? o.window : DEFAULT_WINDOW;
  const useCusum = o.cusum !== false;

  const all = _num(orderedValues);
  // 1) sliding window — only the last `window` of this class.
  let vals = all.length > window ? all.slice(all.length - window) : all.slice();
  // 2) regime break — discard the pre-break regime if a sustained shift is found.
  let regimeBreakAt = -1, discarded = 0;
  if (useCusum) {
    const cp = cusumBreak(vals);
    if (cp > 0) { regimeBreakAt = cp; discarded = cp; vals = vals.slice(cp); }
  }
  const n = vals.length;
  return {
    values: vals,
    n,
    k,
    window,
    calibrating: n < k,       // DC-04: below k → no cone upstream
    regimeBreakAt,
    discardedPreBreak: discarded,
  };
}

// Bootstrap CI of the p-th percentile (DC-04/05 double band). Deterministic:
// pass a seeded rng. Returns { mid, lo, hi } or null when empty.
function bootstrapBand(values, p, opts) {
  const o = opts || {};
  const B = o.iterations != null ? o.iterations : 400;
  const ci = o.ci != null ? o.ci : 0.8; // 80% band
  const rng = o.rng || Math.random;
  const a = _num(values);
  if (a.length === 0) return null;
  const mid = percentile(a, p);
  if (a.length < 2) return { mid, lo: mid, hi: mid };
  const ests = new Array(B);
  for (let b = 0; b < B; b++) {
    const sample = new Array(a.length);
    for (let i = 0; i < a.length; i++) sample[i] = a[Math.floor(rng() * a.length)];
    ests[b] = percentile(sample, p);
  }
  const loP = (1 - ci) / 2, hiP = 1 - loP;
  return { mid, lo: percentile(ests, loP), hi: percentile(ests, hiP) };
}

module.exports = {
  percentile, p50p90, mean, std, cusumBreak, buildSample, bootstrapBand,
  DEFAULT_K, DEFAULT_WINDOW,
};

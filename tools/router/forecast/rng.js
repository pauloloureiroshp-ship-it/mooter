#!/usr/bin/env node
// rng.js — a tiny seeded PRNG for the forecast Monte Carlo.
//
// WHY seeded (not Math.random): a forecast must be REPRODUCIBLE. The same
// ledger + the same roadmap + the same seed → byte-identical forecast.json.
// That is what lets the calibration ledger check "did the real fall in the P90
// we PUBLISHED" — a forecast you cannot reproduce cannot be held to account.
//
// mulberry32: 32-bit, fast, good enough distribution for bootstrap resampling.
// Pure, no deps, never throws.

'use strict';

// Returns a function () -> float in [0,1). Deterministic for a given seed.
function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Derive a stable 32-bit seed from an arbitrary string (e.g. a scope hash), so
// two different scopes get different — but reproducible — random streams.
function seedFromString(str) {
  let h = 2166136261 >>> 0;
  const s = String(str == null ? '' : str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Uniform integer in [0, n) from a rng draw. n<=0 → 0.
function randInt(rng, n) {
  if (!(n > 0)) return 0;
  return Math.floor(rng() * n);
}

// Draw one element uniformly (bootstrap resample). Empty → undefined.
function pick(rng, arr) {
  if (!Array.isArray(arr) || arr.length === 0) return undefined;
  return arr[randInt(rng, arr.length)];
}

module.exports = { mulberry32, seedFromString, randInt, pick };

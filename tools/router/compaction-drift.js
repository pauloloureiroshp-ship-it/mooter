'use strict';

// compaction-drift.js — Wave 64 Fase 2 (Stage-2 local embedding-drift detector).
//
// Runs ONLY in Stage-1's grey zone (ambiguous boundary). Keeps a running centroid
// of recent turn embeddings and fires a boundary when the current turn's cosine
// distance exceeds the SESSION's percentile threshold (p90 by default) — catching
// semantic pivots Stage 1 misses (same file, new goal). Opt-in + best-effort: the
// embedding call is bounded and degrades to "no signal" when Ollama is absent.
//
// Doctrine: the embedding math is PURE & deterministic (tested without Ollama). The
// only IO is `embedText` (best-effort, bounded). Percentile-by-session, not absolute
// (the measured lesson: the threshold dominates, not the method). NO-PROXY: a local
// signal, never a cloud call.

const { spawnSync } = require('child_process');
const path = require('path');

const DEFAULT_PCT = 0.9;       // p90 — fire above the session's 90th-percentile distance
const MIN_SAMPLES = 5;         // need a few distances before trusting the percentile
const MAX_DISTANCES = 50;      // rolling window of recent distances
const EMBED_TIMEOUT_MS = 2500;

function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }

/** Cosine distance in [0,2]; null on shape mismatch or a zero vector. Pure. */
function cosineDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return null;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return null;
  return 1 - clamp(dot / (Math.sqrt(na) * Math.sqrt(nb)), -1, 1);
}

/** Running-mean centroid update: c' = c + (vec - c)/(count+1). Pure. */
function updateCentroid(centroid, vec, count) {
  if (!Array.isArray(vec) || !vec.length) return centroid;
  if (!Array.isArray(centroid) || centroid.length !== vec.length) return vec.slice();
  const n = (Number(count) || 0) + 1;
  return centroid.map((c, i) => c + (vec[i] - c) / n);
}

/** Session percentile threshold over recent distances; null until MIN_SAMPLES. Pure. */
function percentileThreshold(distances, pct = DEFAULT_PCT) {
  const xs = (Array.isArray(distances) ? distances : [])
    .filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (xs.length < MIN_SAMPLES) return null;
  const idx = clamp(Number(pct), 0, 1) * (xs.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return xs[lo] + (xs[hi] - xs[lo]) * (idx - lo);
}

/** Best-effort Ollama embedding → number[] or null (degrades gracefully). */
function embedText(text, opts = {}) {
  const t = typeof text === 'string' ? text.slice(0, 2000) : '';
  if (t.length < 3) return null;
  try {
    const script = path.join(__dirname, 'ollama_embed_node.js');
    const env = Object.assign({}, process.env);
    if (opts.model) env.MOOTER_EMBED_MODEL = opts.model;
    const res = spawnSync(process.execPath, [script, t], {
      encoding: 'utf8', timeout: opts.timeout || EMBED_TIMEOUT_MS, env,
    });
    if (res.status === 0 && res.stdout) {
      const v = JSON.parse(res.stdout);
      if (Array.isArray(v) && v.length) return v;
    }
  } catch { /* best-effort */ }
  return null;
}

/**
 * Pure given an embedding. Compare to the running centroid, decide whether a drift
 * boundary fired (distance > session percentile), and return the UPDATED drift state.
 *   state = { centroid:number[], count:number, distances:number[] }
 *   → { fired, drift, threshold, state, reason }
 */
function stage2Drift(state, embedding, opts = {}) {
  const s = state && typeof state === 'object' ? state : {};
  const distances = Array.isArray(s.distances) ? s.distances.slice(-MAX_DISTANCES) : [];
  if (!Array.isArray(embedding) || !embedding.length) {
    return { fired: false, drift: null, threshold: null, state: s, reason: 'no_embedding' };
  }
  const centroid = Array.isArray(s.centroid) ? s.centroid : null;
  const count = Number(s.count) || 0;
  if (!centroid) {
    return { fired: false, drift: null, threshold: null,
      state: { centroid: embedding.slice(), count: 1, distances }, reason: 'seeded' };
  }
  const drift = cosineDistance(embedding, centroid);
  const threshold = percentileThreshold(distances, opts.percentile);
  const fired = drift != null && threshold != null && drift > threshold;
  const newDistances = drift != null ? distances.concat(drift).slice(-MAX_DISTANCES) : distances;
  return {
    fired,
    drift: drift != null ? Number(drift.toFixed(4)) : null,
    threshold: threshold != null ? Number(threshold.toFixed(4)) : null,
    state: { centroid: updateCentroid(centroid, embedding, count), count: count + 1, distances: newDistances },
    reason: fired ? 'drift_fired' : 'within_topic',
  };
}

module.exports = {
  cosineDistance, updateCentroid, percentileThreshold, embedText, stage2Drift,
  DEFAULT_PCT, MIN_SAMPLES, MAX_DISTANCES,
};

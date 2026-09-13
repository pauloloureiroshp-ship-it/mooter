'use strict';
/**
 * metrics.js — the per-edit cost/latency vector the brief mandates:
 *   n_turns, n_toolcalls, tokens, TTFT, tokens/s, cost per edit.
 *
 * For the deterministic $0 path these are mostly zero BY DESIGN and we report them as measured, not
 * assumed: tokens = 0, cost = 0, n_turns = 1 (one deterministic pass), n_toolcalls = the recorded
 * engine primitives. TTFT/latency are real wall-clock nanoseconds around the engine call. The same
 * vector shape is what a future cloud/agent path would fill in (non-zero tokens/cost), so the table
 * stays comparable "local vs cloud" — the cloud column is honestly empty until a judge is wired.
 */

function measure(fn) {
  const t0 = process.hrtime.bigint();
  const out = fn();
  const t1 = process.hrtime.bigint();
  const ms = Number(t1 - t0) / 1e6;
  return { out, ms };
}

function edit(m) {
  // m: { latencyMs, nToolcalls }
  return {
    n_turns: 1,
    n_toolcalls: m.nToolcalls,
    tokens: 0,           // $0 deterministic engine — no LLM tokens consumed
    ttft_ms: m.latencyMs, // single result → time-to-first-token == total latency
    latency_ms: m.latencyMs,
    tokens_per_s: null,  // N/A for a zero-token path
    cost_usd: 0,         // $0
    lane: 'local',       // vs 'cloud' once a judge/agent path is wired (out of Fase A)
  };
}

function aggregate(vectors) {
  const lat = vectors.map((v) => v.latency_ms).filter((n) => typeof n === 'number');
  const sorted = [...lat].sort((a, b) => a - b);
  const pct = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0);
  return {
    n: vectors.length,
    total_tokens: vectors.reduce((s, v) => s + (v.tokens || 0), 0),
    total_cost_usd: vectors.reduce((s, v) => s + (v.cost_usd || 0), 0),
    latency_ms_mean: lat.length ? lat.reduce((s, n) => s + n, 0) / lat.length : 0,
    latency_ms_p50: pct(0.5),
    latency_ms_p95: pct(0.95),
  };
}

module.exports = { measure, edit, aggregate };

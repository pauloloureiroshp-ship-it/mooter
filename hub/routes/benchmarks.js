// @ts-check
/**
 * routes/benchmarks.js — /v1/benchmarks (Wave 5 "Rankings-as-proof", A.16 v2).
 *
 * Serves a CURATED, data-only benchmark snapshot so clients can
 * `mooter benchmarks refresh --from-hub` without waiting for a CLI release.
 * GET only; read-only; no PII; additive (no migration).
 *
 * ── Option B (honest sourcing) ───────────────────────────────────────────────
 * We serve ONLY publicly-citable benchmark results (SWE-bench Verified, GPQA
 * Diamond, AIME, Terminal-Bench). We do NOT redistribute any proprietary index
 * (e.g. the Artificial Analysis aggregate) without a licence. Each cell carries
 * its `source` and `as_of`; a result that is cited but has no public numeric
 * score is served with `score: null` (qualitative) — never a fabricated number.
 *
 * The cells mirror the repo's data/benchmark-seed-2026.json public subset; the
 * value of serving them from the hub is that ONE hub update reaches every client
 * immediately (and a future daily/weekly cron can refresh prices + tok/s here).
 *
 *   GET /v1/benchmarks → 200 {
 *     generated_at, source,
 *     cells: [{ model, category, score|null, source, source_url, measured, as_of }],
 *     pricing?: [{ id, tier, input, output }]   // optional price passthrough
 *   }
 */

/** Curated, publicly-citable cells only (Option B). score:null = qualitative. */
export const BENCHMARK_SNAPSHOT = [
  { model: 'claude-opus-4-8', category: 'coding.backend', score: 0.886, source: 'SWE-bench Verified', source_url: '', measured: true, as_of: '2026-06' },
  { model: 'claude-opus-4-8', category: 'coding.refactor', score: 0.886, source: 'SWE-bench Verified (proxy)', source_url: '', measured: true, as_of: '2026-06', confidence: 'medium' },
  { model: 'claude-opus-4-8', category: 'coding.debug', score: 0.886, source: 'SWE-bench Verified (proxy)', source_url: '', measured: true, as_of: '2026-06', confidence: 'medium' },
  { model: 'claude-opus-4-7', category: 'coding.backend', score: 0.876, source: 'SWE-bench Verified', source_url: '', measured: true, as_of: '2026-06' },
  { model: 'gpt-5-3-codex', category: 'coding.backend', score: 0.85, source: 'SWE-bench Verified', source_url: '', measured: true, as_of: '2026-06' },
  { model: 'gpt-5-3-codex', category: 'coding.infra', score: 0.818, source: 'Terminal-Bench 2.0', source_url: '', measured: true, as_of: '2026-06' },
  { model: 'gpt-5', category: 'reasoning.math', score: 1.0, source: 'AIME 2026', source_url: '', measured: true, as_of: '2026-06' },
  { model: 'claude-fable-5', category: 'reasoning.science', score: 0.946, source: 'GPQA Diamond', source_url: '', measured: true, as_of: '2026-06' },
  // Cited-but-qualitative (public designation, no public numeric) → score: null.
  { model: 'claude-opus-4-6', category: 'writing.prose-en', score: null, source: 'Anthropic prose eval, qualitative', source_url: '', measured: true, as_of: '2026-06', confidence: 'low' },
  { model: 'gemini-3.1-pro', category: 'context.large', score: null, source: 'Google frontier context eval, qualitative', source_url: '', measured: true, as_of: '2026-06', confidence: 'low' },
];

/**
 * Build the benchmarks response body. Pure → unit-testable. `now` injectable.
 * @param {number} [now]
 */
export function buildBenchmarksBody(now) {
  return {
    generated_at: new Date(typeof now === 'number' ? now : 0).toISOString(),
    source: 'mooter-hub curated (public benchmarks only · Option B)',
    cells: BENCHMARK_SNAPSHOT,
  };
}

/**
 * GET /v1/benchmarks handler. Rejects non-GET with 405. Never touches the DB.
 * @param {Request} request
 * @param {any} _env
 * @returns {Promise<Response>}
 */
export async function handleBenchmarks(request, _env) {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'GET' },
    });
  }
  const body = buildBenchmarksBody(Date.now());
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
  });
}

// @ts-check
/**
 * routes/pricing.js — /v1/pricing (Wave 33 C.3).
 *
 * Serves the canonical cloud-model pricing snapshot so clients can `mooter
 * pricing-update` without waiting for a CLI release. GET only; read-only; no PII;
 * additive (no migration). A future daily cron can refresh this table from each
 * provider's public pricing page; until then it serves the canonical constants
 * (still an improvement: one hub update reaches every client immediately).
 *
 *   GET /v1/pricing → 200 { generated_at, source, models: [{ id, tier, input, output }] }
 */

/** Canonical $/1M-token pricing (mirrors tools/router/pricing.js cloud rungs). */
export const PRICING_SNAPSHOT = [
  { id: 'claude-opus-4-6', tier: 'T3', input: 5.0, output: 25.0 },
  { id: 'claude-sonnet-4-6', tier: 'T2', input: 3.0, output: 15.0 },
  { id: 'claude-haiku-4-5', tier: 'T1', input: 1.0, output: 5.0 },
  { id: 'gemini-2.5-pro', tier: 'T2', input: 1.25, output: 10.0 },
  { id: 'gemini-2.5-flash', tier: 'T1', input: 0.30, output: 2.50 },
  { id: 'gpt-4o', tier: 'T2', input: 2.50, output: 10.0 },
  { id: 'o4-mini', tier: 'T1', input: 1.10, output: 4.40 },
  { id: 'deepseek-v4', tier: 'T0', input: 0.30, output: 0.50 },
];

/**
 * Build the pricing response body. Pure → unit-testable. `now` injectable.
 * @param {number} [now]
 * @returns {{ generated_at: string, source: string, models: Array<{id:string,tier:string,input:number,output:number}> }}
 */
export function buildPricingBody(now) {
  return {
    generated_at: new Date(typeof now === 'number' ? now : 0).toISOString(),
    source: 'canonical',
    models: PRICING_SNAPSHOT,
  };
}

/**
 * GET /v1/pricing handler. Rejects non-GET with 405. Never touches the DB.
 * @param {Request} request
 * @param {any} _env
 * @returns {Promise<Response>}
 */
export async function handlePricing(request, _env) {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'GET' },
    });
  }
  const body = buildPricingBody(Date.now());
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
  });
}

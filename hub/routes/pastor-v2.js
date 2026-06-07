// @ts-check
/**
 * routes/pastor-v2.js — POST /v1/pastor-v2 (Wave 29, L16.1).
 *
 * Ingests multi-dimensional routing-decision telemetry into pastor_v2_decisions.
 * FEATURES ONLY — the Zod schema's privacy refine rejects any decision carrying
 * prompt/response content (second line of defence after the client allowlist).
 *
 * Body: { decisions: PastorV2Decision[] }  (1..100)
 * Returns 202 { accepted, rejected, rejection_reasons }.
 *
 * Additive: Pastor v1 (/v1/events → pastor_state) is untouched.
 */

import * as Sentry from '@sentry/cloudflare';
import { sanitizeJson } from '../lib/sanitize.js';
import { pastorV2DecisionsBatchSchema } from '../lib/schemas.js';
import { bindPastorV2Insert, batchInsertPastorV2, countRecentPastorV2ByDevice } from '../lib/db.js';
import { errorResponse, classifyException } from '../lib/errors.js';

export const RATE_LIMIT_PER_HOUR = 1000;

/**
 * Split a raw decisions array into valid rows + rejection reasons, using the
 * Zod schema per-item (so one bad row doesn't drop the batch). Pure → testable.
 * @param {unknown} decisions
 */
export function partitionDecisions(decisions) {
  const valid = [];
  const rejection_reasons = [];
  if (!Array.isArray(decisions)) return { valid, rejection_reasons: ['decisions must be an array'] };
  decisions.slice(0, 100).forEach((d, i) => {
    const parsed = pastorV2DecisionsBatchSchema.element.safeParse(d);
    if (parsed.success) valid.push(parsed.data);
    else rejection_reasons.push(`#${i}: ${parsed.error.issues.map((x) => x.message).join('; ')}`);
  });
  if (decisions.length > 100) rejection_reasons.push(`batch truncated at 100 (got ${decisions.length})`);
  return { valid, rejection_reasons };
}

export async function handlePastorV2(request, env) {
  if (request.method !== 'POST') {
    return errorResponse('method_not_allowed', 'method_not_allowed');
  }

  let body;
  try {
    body = sanitizeJson(await request.json());
  } catch {
    return errorResponse('invalid_json', 'bad_request', { message: 'Request body is not valid JSON' });
  }

  const decisions = body && body.decisions;
  const { valid, rejection_reasons } = partitionDecisions(decisions);

  if (valid.length === 0) {
    return errorResponse('no_valid_decisions', 'validation', {
      message: 'no valid decisions in payload',
      issues: rejection_reasons,
    });
  }

  // Per-device rate limit (fail-open on counter error).
  const deviceId = valid[0].device_id;
  try {
    const recent = await countRecentPastorV2ByDevice(env.DB, deviceId);
    if (recent >= RATE_LIMIT_PER_HOUR) {
      return errorResponse('rate_limited', 'rate_limited', { message: 'decision ingestion rate limit reached; retry later' });
    }
  } catch {
    /* fail-open */
  }

  const receivedAt = new Date().toISOString();
  const batch = valid.map((d) => bindPastorV2Insert(env.DB, d, receivedAt));
  try {
    await batchInsertPastorV2(env.DB, batch);
  } catch (e) {
    try { Sentry.captureException(e, { tags: { route: '/v1/pastor-v2', kind: 'db_batch_failed' } }); } catch { /* non-fatal */ }
    return errorResponse('db_error', classifyException(e), { message: e.message });
  }

  return new Response(JSON.stringify({
    accepted: valid.length,
    rejected: rejection_reasons.length,
    rejection_reasons,
  }), { status: 202, headers: { 'Content-Type': 'application/json' } });
}

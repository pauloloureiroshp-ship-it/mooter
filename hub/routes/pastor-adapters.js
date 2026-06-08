// @ts-check
/**
 * routes/pastor-adapters.js — POST /v1/pastor-adapters (Wave 31, Pastor v2).
 *
 * Ingests per-task LoRA adapter usage telemetry into pastor_adapters (opt-in,
 * anonymous). FEATURES ONLY — the Zod schema's privacy refine rejects any row
 * carrying prompt/response content (second line of defence after the client
 * allowlist). Upsert on adapter_id (one row per device+adapter).
 *
 * Body: { adapters: PastorAdapter[] }  (1..100)
 * Returns 202 { accepted, rejected, rejection_reasons }.
 *
 * Additive: Pastor v1 (/v1/events) and Pastor v2 (/v1/pastor-v2) are untouched.
 */

import * as Sentry from '@sentry/cloudflare';
import { sanitizeJson } from '../lib/sanitize.js';
import { pastorAdaptersBatchSchema } from '../lib/schemas.js';
import { bindPastorAdapterInsert, batchInsertPastorAdapters, countRecentPastorAdaptersByDevice } from '../lib/db.js';
import { errorResponse, classifyException } from '../lib/errors.js';

export const RATE_LIMIT_PER_HOUR = 2000;

/**
 * Split a raw adapters array into valid rows + rejection reasons, using the Zod
 * schema per-item (so one bad row doesn't drop the batch). Pure → testable.
 * @param {unknown} adapters
 */
export function partitionAdapters(adapters) {
  const valid = [];
  const rejection_reasons = [];
  if (!Array.isArray(adapters)) return { valid, rejection_reasons: ['adapters must be an array'] };
  adapters.slice(0, 100).forEach((a, i) => {
    const parsed = pastorAdaptersBatchSchema.element.safeParse(a);
    if (parsed.success) valid.push(parsed.data);
    else rejection_reasons.push(`#${i}: ${parsed.error.issues.map((x) => x.message).join('; ')}`);
  });
  if (adapters.length > 100) rejection_reasons.push(`batch truncated at 100 (got ${adapters.length})`);
  return { valid, rejection_reasons };
}

export async function handlePastorAdapters(request, env) {
  if (request.method !== 'POST') {
    return errorResponse('method_not_allowed', 'method_not_allowed');
  }

  let body;
  try {
    body = sanitizeJson(await request.json());
  } catch {
    return errorResponse('invalid_json', 'bad_request', { message: 'Request body is not valid JSON' });
  }

  const adapters = body && body.adapters;
  const { valid, rejection_reasons } = partitionAdapters(adapters);

  if (valid.length === 0) {
    return errorResponse('no_valid_adapters', 'validation', {
      message: 'no valid adapter rows in payload',
      issues: rejection_reasons,
    });
  }

  // Per-device rate limit (fail-open on counter error).
  const deviceId = valid[0].device_id;
  try {
    const recent = await countRecentPastorAdaptersByDevice(env.DB, deviceId);
    if (recent >= RATE_LIMIT_PER_HOUR) {
      return errorResponse('rate_limited', 'rate_limited', { message: 'adapter ingestion rate limit reached; retry later' });
    }
  } catch {
    /* fail-open */
  }

  const receivedAt = new Date().toISOString();
  const batch = valid.map((a) => bindPastorAdapterInsert(env.DB, a, receivedAt));
  try {
    await batchInsertPastorAdapters(env.DB, batch);
  } catch (e) {
    try { Sentry.captureException(e, { tags: { route: '/v1/pastor-adapters', kind: 'db_batch_failed' } }); } catch { /* non-fatal */ }
    return errorResponse('db_error', classifyException(e), { message: e.message });
  }

  return new Response(JSON.stringify({
    accepted: valid.length,
    rejected: rejection_reasons.length,
    rejection_reasons,
  }), { status: 202, headers: { 'Content-Type': 'application/json' } });
}

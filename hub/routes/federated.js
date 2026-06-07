// @ts-check
/**
 * routes/federated.js — /v1/federated (Wave 29, L9/L14/L15 skeleton).
 *
 * Wave 29 scope (foundation):
 *   POST { setup_profile } → upsert an opt-in, anonymous device_setup_profiles row.
 *   POST {} (or gradients) → 202, federated gradient aggregation deferred (Wave 31).
 *   GET                    → k-anonymity-gated cohort aggregate (suppressed < 50).
 *
 * Full federated routing pull + DP-SGD aggregation land in Waves 31/34. The
 * k-anonymity gate (≥ 50) is enforced here from day one so no small-cohort
 * aggregate is ever returned publicly.
 */

import * as Sentry from '@sentry/cloudflare';
import { sanitizeJson } from '../lib/sanitize.js';
import { deviceSetupProfileSchema } from '../lib/schemas.js';
import { upsertDeviceSetupProfile, getDeviceSetupCohort } from '../lib/db.js';
import { errorResponse, classifyException } from '../lib/errors.js';

/** Minimum cohort size before any aggregate is exposed publicly. */
export const K_ANONYMITY_MIN = 50;

/**
 * Apply the k-anonymity gate to a cohort aggregate. Pure → testable.
 * @param {{devices:number, by_hardware_class:Record<string,number>}} cohort
 * @param {number} [k]
 */
export function applyKAnonymity(cohort, k = K_ANONYMITY_MIN) {
  if (!cohort || cohort.devices < k) {
    return { cohort_size: cohort ? cohort.devices : 0, k_anonymity_min: k, suppressed: true, aggregate: null };
  }
  return { cohort_size: cohort.devices, k_anonymity_min: k, suppressed: false, aggregate: { by_hardware_class: cohort.by_hardware_class } };
}

export async function handleFederated(request, env) {
  if (request.method === 'GET') {
    let cohort;
    try {
      cohort = await getDeviceSetupCohort(env.DB);
    } catch (e) {
      try { Sentry.captureException(e, { tags: { route: '/v1/federated', kind: 'cohort_read_failed' } }); } catch { /* non-fatal */ }
      return errorResponse('db_error', classifyException(e), { message: e.message });
    }
    return new Response(JSON.stringify(applyKAnonymity(cohort)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (request.method !== 'POST') {
    return errorResponse('method_not_allowed', 'method_not_allowed');
  }

  let body;
  try {
    body = sanitizeJson(await request.json());
  } catch {
    return errorResponse('invalid_json', 'bad_request', { message: 'Request body is not valid JSON' });
  }

  // No setup_profile → federated gradient upload path: accepted, but aggregation
  // is a Wave 31 deliverable. Acknowledge without storing.
  if (!body || !body.setup_profile) {
    return new Response(JSON.stringify({
      accepted: true,
      stored: false,
      note: 'federated gradient aggregation (DP-SGD, ε=1.0) lands in Wave 31; nothing stored',
    }), { status: 202, headers: { 'Content-Type': 'application/json' } });
  }

  const parsed = deviceSetupProfileSchema.safeParse(body.setup_profile);
  if (!parsed.success) {
    return errorResponse('validation_failed', 'validation', {
      message: 'setup_profile failed validation',
      issues: parsed.error.issues.map((x) => x.message),
    });
  }

  try {
    await upsertDeviceSetupProfile(env.DB, parsed.data, new Date().toISOString());
  } catch (e) {
    try { Sentry.captureException(e, { tags: { route: '/v1/federated', kind: 'setup_upsert_failed' } }); } catch { /* non-fatal */ }
    return errorResponse('db_error', classifyException(e), { message: e.message });
  }

  return new Response(JSON.stringify({ accepted: true, stored: true }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' },
  });
}

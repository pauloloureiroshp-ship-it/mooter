/**
 * delta.js — POST /api/delta
 *
 * Receives an anonymized delta from a mooter instance, validates it,
 * computes trust_score, stores in D1, and triggers model detection.
 */

import * as Sentry from '@sentry/cloudflare';
import { computeTrustScore } from '../lib/trust.js';
import { processUnknownModels } from '../lib/model-detect.js';
import { uuid } from '../lib/anomaly.js';
import { sanitizeJson } from '../lib/sanitize.js';
import { deltaBodySchema } from '../lib/schemas.js';
import { insertDelta, countRecentDeltasByProfile } from '../lib/db.js';
import { errorResponse, classifyException } from '../lib/errors.js';

// Phase C.1 / F-1 — non-breaking ingestion rate limit. Caps deltas per
// profile_hash in a 60s window so a flood cannot poison community aggregates.
// Fail-open (a D1 hiccup never blocks legitimate pushes); no auth added, so
// existing installs (v0.9, Wave 8, current) keep working unchanged.
const DELTA_RATE_LIMIT = 30;
const DELTA_RATE_WINDOW_MS = 60000;

async function handleDelta(request, env) {
  if (request.method !== 'POST') {
    return errorResponse('method_not_allowed', 'method_not_allowed');
  }

  let body;
  try {
    body = sanitizeJson(await request.json());
  } catch {
    return errorResponse('invalid_json', 'bad_request', { message: 'Request body is not valid JSON' });
  }

  // Sprint 5.1 — Zod validation. Replaces the ad-hoc validate() function
  // with a single source of truth (hub/lib/schemas.js). Error responses
  // now include per-field issues so the caller knows exactly what failed.
  const parsed = deltaBodySchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({
      path: i.path.join('.') || '<root>',
      message: i.message,
    }));
    return errorResponse('validation_failed', 'validation', { issues });
  }
  body = parsed.data;

  // F-1 rate limit (fail-open). Only enforced when a profile_hash is present;
  // anonymous deltas without one are still accepted (non-breaking).
  if (body.profile_hash) {
    try {
      const recent = await countRecentDeltasByProfile(env.DB, body.profile_hash, DELTA_RATE_WINDOW_MS);
      if (recent >= DELTA_RATE_LIMIT) {
        return errorResponse('rate_limited', 'rate_limited', {
          message: `Too many deltas (max ${DELTA_RATE_LIMIT}/min)`,
        });
      }
    } catch { /* fail open — never block a legitimate push on a D1 hiccup */ }
  }

  const id = uuid();
  const now = new Date();
  const ttlDays = parseInt(env.DELTA_TTL_DAYS || '7', 10);
  const expiresAt = new Date(now.getTime() + ttlDays * 86400000).toISOString();

  const trustScore = computeTrustScore(body);

  const delta = {
    id,
    received_at: now.toISOString(),
    expires_at: expiresAt,
    hw_tier: body.hw_tier,
    sub_profile: body.sub_profile,
    lang: body.lang || 'en',
    session_count: body.session_count || null,
    prompt_count: body.prompt_count,
    tier_distribution: JSON.stringify(body.tier_distribution),
    keyword_signals: body.keyword_signals ? JSON.stringify(body.keyword_signals) : null,
    unknown_models: body.unknown_models ? JSON.stringify(body.unknown_models) : null,
    feedback_signals: body.feedback_signals ? JSON.stringify(body.feedback_signals) : null,
    delta_version: body.delta_version || '1',
    trust_score: trustScore,
    savings_usd: typeof body.savings_usd === 'number' ? body.savings_usd : null,
    profile_hash: body.profile_hash || null,
  };

  try {
    // Sprint 6 — service layer. SQL + binding live in hub/lib/db.js.
    await insertDelta(env.DB, delta);

    // Process unknown models (fire-and-forget — don't fail the request)
    try {
      await processUnknownModels(env.DB, delta);
    } catch { /* non-fatal */ }

    return new Response(JSON.stringify({
      ok: true,
      id: delta.id,
      trust_score: delta.trust_score,
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    // Sprint 8.3: forward D1 storage failures to Sentry with the delta
    // envelope (no PII — only counts + hash) for debugging trust_score
    // drift and schema regressions. No-op when DSN unset.
    try {
      Sentry.captureException(e, {
        tags: { route: '/api/delta', hw_tier: delta.hw_tier, sub_profile: delta.sub_profile },
        extra: { prompt_count: delta.prompt_count, trust_score: delta.trust_score },
      });
    } catch { /* non-fatal */ }
    return errorResponse('storage_error', classifyException(e), { message: e.message });
  }
}

export { handleDelta };

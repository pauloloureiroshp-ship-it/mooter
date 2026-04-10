/**
 * delta.js — POST /api/delta
 *
 * Receives an anonymized delta from a frugal instance, validates it,
 * computes trust_score, stores in D1, and triggers model detection.
 */

import { computeTrustScore } from '../lib/trust.js';
import { processUnknownModels } from '../lib/model-detect.js';
import { uuid } from '../lib/anomaly.js';

const VALID_HW_TIERS = new Set(['gpu-high', 'gpu-mid', 'gpu-low', 'apple-silicon', 'cpu-only']);
const VALID_SUB_PROFILES = new Set(['max', 'api-paid', 'api-free', 'none', 'unknown']);
const VALID_LANGS = new Set(['pt', 'en', 'other']);

function validate(body) {
  if (!body || typeof body !== 'object') return 'invalid body';
  if (!body.hw_tier || !VALID_HW_TIERS.has(body.hw_tier)) return 'invalid hw_tier';
  if (!body.sub_profile || !VALID_SUB_PROFILES.has(body.sub_profile)) return 'invalid sub_profile';
  if (!body.tier_distribution || typeof body.tier_distribution !== 'object') return 'missing tier_distribution';
  if (typeof body.prompt_count !== 'number' || body.prompt_count < 1) return 'invalid prompt_count';
  return null;
}

async function handleDelta(request, env) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400 });
  }

  const err = validate(body);
  if (err) {
    return new Response(JSON.stringify({ error: err }), { status: 422 });
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
    lang: VALID_LANGS.has(body.lang) ? body.lang : 'en',
    session_count: body.session_count || null,
    prompt_count: body.prompt_count,
    tier_distribution: JSON.stringify(body.tier_distribution),
    keyword_signals: body.keyword_signals ? JSON.stringify(body.keyword_signals) : null,
    unknown_models: body.unknown_models ? JSON.stringify(body.unknown_models) : null,
    feedback_signals: body.feedback_signals ? JSON.stringify(body.feedback_signals) : null,
    delta_version: body.delta_version || '1',
    trust_score: trustScore,
  };

  try {
    await env.DB.prepare(`
      INSERT INTO deltas (id, received_at, expires_at, hw_tier, sub_profile, lang,
        session_count, prompt_count, tier_distribution, keyword_signals,
        unknown_models, feedback_signals, delta_version, trust_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      delta.id, delta.received_at, delta.expires_at, delta.hw_tier,
      delta.sub_profile, delta.lang, delta.session_count, delta.prompt_count,
      delta.tier_distribution, delta.keyword_signals, delta.unknown_models,
      delta.feedback_signals, delta.delta_version, delta.trust_score
    ).run();

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
    return new Response(JSON.stringify({ error: 'storage error', detail: e.message }), { status: 500 });
  }
}

export { handleDelta };

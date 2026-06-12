// @ts-check
/**
 * admin_user_detail.js — GET /v1/admin/user/<hash>   (Wave 56, Endpoint D)
 *
 * Admin-only deep view of a SINGLE anonymous user, keyed exclusively by their
 * `user_id_hash` (the canonical 16-hex anonymous user key, SHA256(user_id)[:16],
 * added to `frugal_events` by migration 008 and used by the Wave 33.7
 * user-dashboard route). The 16-hex segment is parsed from the path by
 * `hub/worker.js` and passed in as `userHash`.
 *
 * ── Gate / audit / privacy contract (Wave 56 doctrine) ──
 *   1. adminAuthorized() Bearer gate (MOOTER_ADMIN_TOKEN, constant-time, reused
 *      from feedback.js) → 401 errorResponse('unauthorized','unauthorized').
 *   2. logAdminView() writes a tamper-evident audit row to `audit_admin_views`
 *      BEFORE any data is returned (best-effort; never blocks the response).
 *   3. PRIVACY ABSOLUTE: the response identifies the user ONLY by `user_id_hash`
 *      (16-hex). It NEVER contains a raw email, github handle/id, or raw
 *      user_id. None of those even exist on the tables queried here — the hub is
 *      anonymous-by-construction (migrations 008/016/010 store hashes only).
 *
 * ── Data sources (verified against hub/migrations/*.sql — only real columns) ──
 *   • frugal_events (002 + 006 + 008 + 019): user_id_hash, decided_tier,
 *     task_category, event_date, per_decision_savings_usd, actual_model_used,
 *     local_models_reason. NOTE: frugal_events has NO per-row token column and
 *     no per-row cost column keyed by user_id_hash, so `total_tokens` from the
 *     brief is reported as null (column absent — token/cost telemetry lives in
 *     pastor_v2_decisions, which is keyed by anonymous device_id, NOT
 *     user_id_hash, so it cannot be attributed to a user_id_hash here).
 *   • feedback (010): user_id_hash, content, topic, severity, mooter_version,
 *     hw_tier, received_at. Last 20 for this hash.
 *   • pastor_adapters (016): keyed by device_id (anonymous client id). There is
 *     NO column or join path from user_id_hash → device_id anywhere in the hub
 *     schema, so `lora_evolution` is honestly returned as [] (the user does not
 *     "map there"); see the JSDoc on the response shape.
 *
 * @typedef {object} AdminUserDetail
 * @property {'user_detail'} scope
 * @property {string} user_id_hash                    16-hex anonymous key (the ONLY identifier).
 * @property {object} profile
 * @property {string|null} profile.first_seen         MIN(event_date) (YYYY-MM-DD) or null.
 * @property {string|null} profile.last_active        MAX(event_date) (YYYY-MM-DD) or null.
 * @property {number} profile.prompt_count            COUNT(*) of frugal_events for this hash.
 * @property {number|null} profile.total_tokens       Always null — no per-user token column exists (see header).
 * @property {number} profile.total_saved_usd         SUM(per_decision_savings_usd), 2dp.
 * @property {Array<{tier:string,count:number,saved_usd:number}>} tier_breakdown   Per decided_tier.
 * @property {Array<{model:string,count:number,reasons:string[]}>} local_models    actual_model_used + distinct local_models_reason codes.
 * @property {Array<{day:string,count:number}>} quant_timeline                       Per-day event count, last 30d (alias of daily_prompts, kept for the quant view).
 * @property {Array<object>} lora_evolution                                          Always [] — pastor_adapters is device-keyed; no user_id_hash mapping in the hub.
 * @property {Array<{received_at:string,topic:string,severity:string,content:string,mooter_version:string|null,hw_tier:string|null}>} feedback_history  Last 20 for this hash.
 * @property {Array<{day:string,count:number}>} daily_prompts                        Per-day event count, last 30d.
 */

import * as Sentry from '@sentry/cloudflare';
import { errorResponse } from '../lib/errors.js';
import { adminAuthorized } from './feedback.js';
import { logAdminView, hashAdminIp } from '../lib/admin_audit.js';

const HASH_RE = /^[a-f0-9]{16}$/;
const ENDPOINT = '/v1/admin/user';

const J = (obj, status) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * Extract the raw Bearer token (without the "Bearer " prefix) so it can be fed
 * to logAdminView, which hashes it (the raw token is never stored).
 * @param {string} authHeader
 * @returns {string}
 */
function bearerToken(authHeader) {
  return typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
}

/**
 * GET /v1/admin/user/<hash> — single anonymous user, admin-only.
 *
 * `userHash` is the 16-hex segment already sliced out of the path by worker.js.
 *
 * @param {Request} request
 * @param {{ DB: import('@cloudflare/workers-types').D1Database } & Record<string, any>} env
 * @param {string} userHash
 * @returns {Promise<Response>}
 */
export async function adminUserDetail(request, env, userHash) {
  if (request.method !== 'GET') {
    return errorResponse('method_not_allowed', 'method_not_allowed');
  }

  // (1) Admin gate FIRST — Bearer MOOTER_ADMIN_TOKEN, constant-time (feedback.js).
  const authHeader = request.headers.get('Authorization') || '';
  if (!adminAuthorized(authHeader, env)) {
    return errorResponse('unauthorized', 'unauthorized');
  }

  // Validate the hash BEFORE auditing/querying — a malformed path is a client
  // bug (400), not a 404. Lowercase-normalize so 'AB..' is rejected explicitly
  // (HASH_RE is lowercase-only) rather than silently matched.
  const hash = String(userHash || '').toLowerCase();
  if (!HASH_RE.test(hash)) {
    return errorResponse('bad_request', 'bad_request', {
      message: 'user hash segment must be a 16-char lowercase hex string (SHA256(user_id)[:16])',
    });
  }

  try {
    // (2) Audit BEFORE returning data — best-effort, never blocks the response.
    await logAdminView(env, {
      endpoint: `${ENDPOINT}/${hash}`,
      targetUserHash: hash,
      adminToken: bearerToken(authHeader),
      ipHash: await hashAdminIp(request),
    });

    // (3) Query D1 — all reads parameterized on user_id_hash. 30-day window for
    // the day-bucketed series uses event_date (YYYY-MM-DD) string comparison,
    // which is lexicographically correct for that format.
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [profileRow, tierRows, modelRows, dailyRows, feedbackRows] = await Promise.all([
      env.DB.prepare(`SELECT
            MIN(event_date)                  AS first_seen,
            MAX(event_date)                  AS last_active,
            COUNT(*)                         AS prompt_count,
            SUM(per_decision_savings_usd)    AS total_saved_usd
          FROM frugal_events
          WHERE user_id_hash = ?`)
        .bind(hash).first(),

      env.DB.prepare(`SELECT
            decided_tier                     AS tier,
            COUNT(*)                         AS count,
            SUM(per_decision_savings_usd)    AS saved_usd
          FROM frugal_events
          WHERE user_id_hash = ?
          GROUP BY decided_tier
          ORDER BY count DESC`)
        .bind(hash).all(),

      // Local models used + their fallback reason codes. Group by the model;
      // collect the distinct local_models_reason values seen for it.
      env.DB.prepare(`SELECT
            actual_model_used                AS model,
            COUNT(*)                         AS count,
            local_models_reason              AS reason
          FROM frugal_events
          WHERE user_id_hash = ? AND actual_model_used IS NOT NULL
          GROUP BY actual_model_used, local_models_reason
          ORDER BY count DESC`)
        .bind(hash).all(),

      env.DB.prepare(`SELECT
            event_date                       AS day,
            COUNT(*)                         AS count
          FROM frugal_events
          WHERE user_id_hash = ? AND event_date >= ?
          GROUP BY event_date
          ORDER BY day ASC`)
        .bind(hash, since30).all(),

      env.DB.prepare(`SELECT
            received_at, topic, severity, content, mooter_version, hw_tier
          FROM feedback
          WHERE user_id_hash = ?
          ORDER BY received_at DESC
          LIMIT 20`)
        .bind(hash).all(),
    ]);

    const promptCount = Number(profileRow?.prompt_count || 0);

    // 404 when the hash has no footprint anywhere we can attribute to it.
    // 'not_found' → 404 (confirmed present in hub/lib/errors.js CATEGORIES).
    const feedbackCount = (feedbackRows?.results || []).length;
    if (promptCount === 0 && feedbackCount === 0) {
      return errorResponse('not_found', 'not_found', {
        message: 'no activity for this user hash',
      });
    }

    // Fold (model, reason) rows into one entry per model with a reasons[] list.
    /** @type {Map<string, {model:string, count:number, reasons:Set<string>}>} */
    const modelMap = new Map();
    for (const r of (modelRows?.results || [])) {
      const model = String(r.model);
      let entry = modelMap.get(model);
      if (!entry) {
        entry = { model, count: 0, reasons: new Set() };
        modelMap.set(model, entry);
      }
      entry.count += Number(r.count || 0);
      if (r.reason) entry.reasons.add(String(r.reason));
    }
    const localModels = [...modelMap.values()].map((e) => ({
      model: e.model,
      count: e.count,
      reasons: [...e.reasons],
    }));

    const dailyPrompts = (dailyRows?.results || []).map((r) => ({
      day: String(r.day),
      count: Number(r.count || 0),
    }));

    /** @type {AdminUserDetail} */
    const payload = {
      scope: 'user_detail',
      user_id_hash: hash,
      profile: {
        first_seen: profileRow?.first_seen ?? null,
        last_active: profileRow?.last_active ?? null,
        prompt_count: promptCount,
        // No per-user token column exists on frugal_events (see file header).
        total_tokens: null,
        total_saved_usd: profileRow?.total_saved_usd ? +Number(profileRow.total_saved_usd).toFixed(2) : 0,
      },
      tier_breakdown: (tierRows?.results || []).map((r) => ({
        tier: String(r.tier),
        count: Number(r.count || 0),
        saved_usd: r.saved_usd ? +Number(r.saved_usd).toFixed(2) : 0,
      })),
      local_models: localModels,
      // The quant view groups the same per-day series; kept distinct from
      // daily_prompts in the shape so the panel can label them independently.
      quant_timeline: dailyPrompts,
      // pastor_adapters is keyed by anonymous device_id with no user_id_hash
      // join path in the hub schema → no user maps there. Honest empty list.
      lora_evolution: [],
      feedback_history: (feedbackRows?.results || []).map((r) => ({
        received_at: String(r.received_at),
        topic: String(r.topic),
        severity: String(r.severity),
        content: String(r.content),
        mooter_version: r.mooter_version ?? null,
        hw_tier: r.hw_tier ?? null,
      })),
      daily_prompts: dailyPrompts,
    };

    // Per-user admin data is private — never cache at the edge/CDN.
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    });
  } catch (e) {
    try {
      Sentry.captureException(e, { tags: { route: '/v1/admin/user', kind: 'aggregation_failed' } });
    } catch { /* non-fatal */ }
    return errorResponse('internal', 'internal');
  }
}

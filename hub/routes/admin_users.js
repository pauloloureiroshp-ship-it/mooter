// @ts-check
/**
 * admin_users.js — GET /v1/admin/users  (Wave 56 — Admin Panel Data Layer, Endpoint C)
 *
 * Paginated, per-user roll-up of `frugal_events`, keyed ONLY by the anonymous
 * 16-hex `user_id_hash` (SHA256(user_id)[:16], Wave 33.7 / migration 008). This
 * is the admin "Users" tab data source.
 *
 * PRIVACY MODEL (ABSOLUTE — Wave 33.7 + Wave 56 doctrine):
 *   Every user row contains `user_id_hash` (16-hex) and ONLY aggregate metrics.
 *   This endpoint NEVER returns a raw email, github handle/id, or raw user_id —
 *   the hub never stores those (anonymous-by-default, migration 008/018). The
 *   response is also `Cache-Control: private, no-store`.
 *
 * AUTH + AUDIT (mandatory order, Wave 56 admin contract):
 *   1. adminAuthorized() Bearer gate (MOOTER_ADMIN_TOKEN, constant-time) → 401 on fail.
 *   2. logAdminView() writes a tamper-evident audit row BEFORE any data is returned.
 *   3. query D1.
 *   4. return JSON via the local J() helper.
 *   The whole body is wrapped in try/catch → errorResponse('internal','internal').
 *
 * SCHEMA NOTES (verified against hub/migrations/*.sql, Day-0 recon):
 *   - frugal_events has NO token column. The brief asks for `total_tokens (sum)`,
 *     but no such column exists in the live schema (002 + 006 + 008 + 019). We
 *     therefore return `total_tokens: 0` for every row and surface the limitation
 *     in the response via `notes.total_tokens`. Referencing a non-existent column
 *     would make the query throw.
 *   - "saved_usd" maps to the real column `per_decision_savings_usd` (migration 006).
 *   - first_seen/last_active use `created_at` (full ISO timestamp), not the
 *     date-only `event_date`, for ordering precision.
 *   - The `feedback` table (010_feedback.sql) HAS a `user_id_hash` column, so the
 *     per-user feedback_count is a correlated sub-select on it.
 */

import { adminAuthorized } from './feedback.js';
import { logAdminView, hashAdminIp } from '../lib/admin_audit.js';
import { errorResponse } from '../lib/errors.js';

const J = (obj, status) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  });

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const DEFAULT_OFFSET = 0;

/**
 * Sort whitelist. Maps the public sort token → a SQL ORDER BY clause over the
 * aggregate aliases. ONLY these tokens are accepted; anything else → 422. The
 * clause text is a hard-coded constant per key (never interpolated user input),
 * so this is injection-safe.
 */
const SORT_WHITELIST = Object.freeze({
  last_active_desc: 'last_active DESC',
  last_active_asc: 'last_active ASC',
  prompts_desc: 'prompt_count DESC',
  savings_desc: 'total_saved_usd DESC',
  first_seen_asc: 'first_seen ASC',
});
const DEFAULT_SORT = 'last_active_desc';

/**
 * Clamp a parsed integer into [min, max], falling back to `dflt` when the raw
 * value is absent or not a finite integer.
 * @param {string | null} raw
 * @param {number} dflt
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clampInt(raw, dflt, min, max) {
  if (raw === null || raw === undefined || raw === '') return dflt;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}

/**
 * GET /v1/admin/users?limit=50&offset=0&sort=last_active_desc
 *
 * @param {Request} request
 * @param {{ DB: D1Database, MOOTER_ADMIN_TOKEN?: string, FRUGAL_ADMIN_TOKEN?: string }} env
 * @returns {Promise<Response>}
 */
export async function handleAdminUsers(request, env) {
  if (request.method !== 'GET') {
    return errorResponse('method_not_allowed', 'method_not_allowed');
  }

  // (1) Admin gate — Bearer MOOTER_ADMIN_TOKEN, constant-time (reused, not duplicated).
  const authHeader = request.headers.get('Authorization') || '';
  if (!adminAuthorized(authHeader, env)) {
    return errorResponse('unauthorized', 'unauthorized');
  }

  // Validate sort BEFORE the audit write so a malformed request is a pure 422
  // (no data viewed → nothing to audit). limit/offset are clamped, never rejected.
  const url = new URL(request.url);
  const sortToken = url.searchParams.get('sort') || DEFAULT_SORT;
  const orderBy = SORT_WHITELIST[sortToken];
  if (!orderBy) {
    return errorResponse('invalid_sort', 'validation', {
      message: `sort must be one of: ${Object.keys(SORT_WHITELIST).join(', ')}`,
    });
  }
  const limit = clampInt(url.searchParams.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = clampInt(url.searchParams.get('offset'), DEFAULT_OFFSET, 0, Number.MAX_SAFE_INTEGER);

  try {
    // (2) Audit BEFORE returning data. No single target user on a list view →
    // targetUserHash stays null. Best-effort (never blocks the response).
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    await logAdminView(env, {
      endpoint: '/v1/admin/users',
      targetUserHash: null,
      adminToken: bearer,
      ipHash: await hashAdminIp(request),
    });

    // (3) Query D1.
    // Total distinct anonymous users (for pagination). Only rows that carry a
    // user_id_hash count — fully-anonymous telemetry has none.
    const totalRow = await env.DB
      .prepare('SELECT COUNT(DISTINCT user_id_hash) AS total FROM frugal_events WHERE user_id_hash IS NOT NULL')
      .first();
    const total = (totalRow && Number(totalRow.total)) || 0;

    // Per-user aggregate. ORDER BY clause is a whitelisted constant (above).
    // feedback_count is a correlated sub-select on feedback.user_id_hash (the
    // feedback table DOES carry user_id_hash — 010_feedback.sql).
    const sql = `
      SELECT
        e.user_id_hash                                AS user_id_hash,
        MIN(e.created_at)                             AS first_seen,
        MAX(e.created_at)                             AS last_active,
        COUNT(*)                                      AS prompt_count,
        COALESCE(SUM(e.per_decision_savings_usd), 0)  AS total_saved_usd,
        COUNT(DISTINCT e.decided_tier)                AS distinct_tiers,
        GROUP_CONCAT(DISTINCT e.decided_tier)         AS tiers_used,
        (SELECT COUNT(*) FROM feedback f WHERE f.user_id_hash = e.user_id_hash) AS feedback_count
      FROM frugal_events e
      WHERE e.user_id_hash IS NOT NULL
      GROUP BY e.user_id_hash
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?`;

    const rowsRes = await env.DB.prepare(sql).bind(limit, offset).all();

    const users = (rowsRes && rowsRes.results ? rowsRes.results : []).map((r) => ({
      user_id_hash: r.user_id_hash,
      first_seen: r.first_seen || null,
      last_active: r.last_active || null,
      prompt_count: Number(r.prompt_count) || 0,
      // No token column exists in frugal_events — see SCHEMA NOTES. Always 0.
      total_tokens: 0,
      total_saved_usd: r.total_saved_usd != null ? +Number(r.total_saved_usd).toFixed(4) : 0,
      distinct_tiers: Number(r.distinct_tiers) || 0,
      tiers_used: r.tiers_used
        ? String(r.tiers_used).split(',').filter(Boolean).sort()
        : [],
      feedback_count: Number(r.feedback_count) || 0,
    }));

    // (4) Return JSON.
    return J(
      {
        users,
        limit,
        offset,
        total,
        sort: sortToken,
        notes: {
          total_tokens:
            'frugal_events has no token column in the live schema; total_tokens is always 0 (Wave 56 limitation).',
        },
      },
      200
    );
  } catch {
    // Any DB/crypto failure → opaque 500 (errors.js sanitises internal messages).
    return errorResponse('internal', 'internal');
  }
}

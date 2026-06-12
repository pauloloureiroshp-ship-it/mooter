// @ts-check
/**
 * admin_cohort.js — GET /v1/admin/cohort-metrics?period=30d  (Wave 56 — Endpoint E)
 *
 * Admin-only cohort engagement metrics computed live from `frugal_events`:
 * DAU / MAU / stickiness, 30-day retention, period totals, cohort size, plus
 * static industry benchmarks for stickiness context.
 *
 * AUTH & AUDIT (Wave 56 doctrine — same order for every /v1/admin/* route):
 *   1. adminAuthorized() Bearer gate (MOOTER_ADMIN_TOKEN, constant-time) → 401.
 *   2. logAdminView() writes the tamper-evident audit row BEFORE any data is
 *      returned (best-effort; an audit-write failure never blocks the response).
 *   3. Query D1.
 *   4. Return JSON via the local J() helper. Body wrapped in try/catch → 500.
 *
 * PRIVACY (ABSOLUTE): this endpoint is aggregate-only. It NEVER returns a raw
 * email, github handle/id, or raw user_id — not even a user_id_hash. The only
 * identity surface touched is the anonymous 16-hex `user_id_hash` column, used
 * solely inside COUNT(DISTINCT ...) aggregates; no hash leaves the worker.
 *
 * SCHEMA NOTES (verified Day-0 against live D1, see WAVE56_DAY0_RECON.md):
 *   - `frugal_events` has NO `ts`/`timestamp` column. The activity timestamp is
 *     `created_at` (TEXT, ISO-8601), so windows use datetime('now', '-N days')
 *     against `created_at` — the same idiom stats.js uses on `received_at`.
 *   - The anonymous user key is `user_id_hash` (16-hex); NULL on rows from
 *     CLIs that never logged in. Those rows are excluded from user counts (they
 *     are not attributable "users") but still count toward prompt/savings totals.
 *   - Savings live in `per_decision_savings_usd` (REAL, nullable).
 *   - There is NO token column anywhere in `frugal_events` (the hub stores the
 *     classification surface, never token counts, by privacy design). `tokens`
 *     is therefore reported as 0 — an HONEST "never measured", not a fabricated
 *     number. Each row is exactly one prompt, so prompts = COUNT(*).
 */

import { errorResponse } from '../lib/errors.js';
import { adminAuthorized } from './feedback.js';
import { logAdminView, hashAdminIp } from '../lib/admin_audit.js';

const ENDPOINT = '/v1/admin/cohort-metrics';

/** Allowed `period` values → window length in days. Default is 30d. */
const PERIODS = Object.freeze({ '7d': 7, '30d': 30 });

/** Static reference benchmarks for stickiness (DAU/MAU). NOT measured — labels
 * make clear these are external references, not computed from our data. */
const BENCHMARKS = Object.freeze({ saas_b2b_avg: 0.40, mooter_target: 0.20 });

/** JSON success helper (same shape as feedback.js / errors.js responses). */
const J = (obj, status) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

/** Safe ratio: a/b, guarded against div-by-zero / non-finite → 0. */
function ratio(a, b) {
  const n = Number(a);
  const d = Number(b);
  if (!d || !Number.isFinite(n) || !Number.isFinite(d)) return 0;
  const r = n / d;
  return Number.isFinite(r) ? +r.toFixed(4) : 0;
}

/**
 * GET /v1/admin/cohort-metrics?period=7d|30d
 * @param {Request} request
 * @param {{ DB: import('@cloudflare/workers-types').D1Database, MOOTER_ADMIN_TOKEN?: string, FRUGAL_ADMIN_TOKEN?: string }} env
 */
export async function handleAdminCohort(request, env) {
  if (request.method !== 'GET') {
    return errorResponse('method_not_allowed', 'method_not_allowed');
  }

  // (1) Admin gate — Bearer MOOTER_ADMIN_TOKEN (constant-time, reused from feedback.js).
  const authHeader = request.headers.get('Authorization') || '';
  if (!adminAuthorized(authHeader, env)) {
    return errorResponse('unauthorized', 'unauthorized');
  }

  // period whitelist: '7d' | '30d' only (default 30d); anything else → 422.
  const rawPeriod = new URL(request.url).searchParams.get('period');
  const period = rawPeriod == null ? '30d' : rawPeriod;
  if (!Object.prototype.hasOwnProperty.call(PERIODS, period)) {
    return errorResponse('invalid_period', 'validation', {
      message: "period must be one of: '7d', '30d'",
    });
  }
  const periodDays = PERIODS[period];

  try {
    // (2) Audit BEFORE returning data. No specific target user → null.
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    await logAdminView(env, {
      endpoint: ENDPOINT,
      targetUserHash: null,
      adminToken: bearer,
      ipHash: await hashAdminIp(request),
    });

    // (3) Query D1. created_at is the activity timestamp (ISO-8601 TEXT).
    //
    // - DAU: distinct linked users active in the last 24h.
    // - MAU: distinct linked users active in the last 30d (always 30d by
    //   definition, independent of the report `period`).
    // - retention_30d: of the users active 30-60d ago (the prior cohort), the
    //   fraction that are ALSO active in the last 30d. Guarded div-by-zero → 0.
    // - period totals: prompts (COUNT(*)) and saved_usd over the chosen window;
    //   tokens is not stored (→ 0, honest).
    // - cohort_size: distinct linked users in the chosen window.
    const [dauRow, mauRow, retPriorRow, retReturnedRow, totalsRow, cohortRow] =
      await Promise.all([
        env.DB.prepare(
          `SELECT COUNT(DISTINCT user_id_hash) AS n FROM frugal_events
             WHERE user_id_hash IS NOT NULL
               AND created_at > datetime('now', '-1 day')`
        ).first(),
        env.DB.prepare(
          `SELECT COUNT(DISTINCT user_id_hash) AS n FROM frugal_events
             WHERE user_id_hash IS NOT NULL
               AND created_at > datetime('now', '-30 days')`
        ).first(),
        // Prior cohort: users active 30-60d ago.
        env.DB.prepare(
          `SELECT COUNT(DISTINCT user_id_hash) AS n FROM frugal_events
             WHERE user_id_hash IS NOT NULL
               AND created_at <= datetime('now', '-30 days')
               AND created_at >  datetime('now', '-60 days')`
        ).first(),
        // Retained: in the prior (30-60d) cohort AND active again in the last 30d.
        env.DB.prepare(
          `SELECT COUNT(DISTINCT user_id_hash) AS n FROM frugal_events
             WHERE user_id_hash IS NOT NULL
               AND created_at > datetime('now', '-30 days')
               AND user_id_hash IN (
                 SELECT DISTINCT user_id_hash FROM frugal_events
                   WHERE user_id_hash IS NOT NULL
                     AND created_at <= datetime('now', '-30 days')
                     AND created_at >  datetime('now', '-60 days')
               )`
        ).first(),
        // Period totals: prompts + saved_usd over the selected window.
        env.DB.prepare(
          `SELECT COUNT(*) AS prompts,
                  SUM(COALESCE(per_decision_savings_usd, 0)) AS saved_usd
             FROM frugal_events
             WHERE created_at > datetime('now', '-${periodDays} days')`
        ).first(),
        // Cohort size: distinct linked users in the selected window.
        env.DB.prepare(
          `SELECT COUNT(DISTINCT user_id_hash) AS n FROM frugal_events
             WHERE user_id_hash IS NOT NULL
               AND created_at > datetime('now', '-${periodDays} days')`
        ).first(),
      ]);

    const dau = Number(dauRow?.n || 0);
    const mau = Number(mauRow?.n || 0);

    // (4) Shape the response. tokens=0 (no column → honest), retention as a
    // ratio of the prior cohort that returned, benchmarks labelled as reference.
    return J(
      {
        period,
        dau,
        mau,
        stickiness: ratio(dau, mau), // DAU/MAU, 0 when mau == 0
        retention_30d: ratio(retReturnedRow?.n, retPriorRow?.n),
        totals: {
          prompts: Number(totalsRow?.prompts || 0),
          tokens: 0, // not stored in frugal_events — honest "never measured"
          saved_usd: +Number(totalsRow?.saved_usd || 0).toFixed(2),
        },
        cohort_size: Number(cohortRow?.n || 0),
        benchmarks: BENCHMARKS,
      },
      200
    );
  } catch {
    return errorResponse('internal', 'internal');
  }
}

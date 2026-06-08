/**
 * user-dashboard.js — GET /v1/user/dashboard?user_hash=<16hex>  (Wave 33.7)
 *
 * Per-user dashboard aggregation. Closes the "My usage" gap that
 * landing/app/api/dashboard/aggregates/route.ts declared deferred (Phase B.1b).
 *
 * PRIVACY MODEL (consistent with migration 008, anonymous-by-default):
 *   The hub NEVER sees a raw Supabase user_id or a JWT. The landing app
 *   validates the user's session, computes user_hash = SHA256(user_id)[:16],
 *   and forwards ONLY that opaque 16-hex hash here. The hash is stable per user
 *   but cannot be reversed into an email/identity. This route reads the
 *   `user_id_hash` column that migration 008 added to frugal_events.
 *
 * RLS-by-construction: a caller can only ever read the cohort matching the hash
 * they present. User A presenting their own hash cannot enumerate user B's rows
 * (no listing endpoint; the hash is the only key and is non-guessable).
 */

import * as Sentry from '@sentry/cloudflare';
import { errorResponse, classifyException } from '../lib/errors.js';

const HASH_RE = /^[0-9a-f]{16}$/;

export async function handleUserDashboard(request, env) {
  if (request.method !== 'GET') {
    return errorResponse('method_not_allowed', 'method_not_allowed');
  }

  const url = new URL(request.url);
  const userHash = (url.searchParams.get('user_hash') || '').toLowerCase();

  // Reject anything that isn't a 16-char lowercase hex hash. Defends against
  // SQL injection (we still parameterize) and accidental raw-id leakage.
  if (!HASH_RE.test(userHash)) {
    // 'validation' → 422 (see hub/lib/errors.js CATEGORY map). An unknown
    // category key falls through to internal/500, so use the exact key.
    return errorResponse('invalid_user_hash', 'validation', {
      message: 'user_hash must be a 16-char hex string (SHA256(user_id)[:16])',
    });
  }

  try {
    const [totalRow, tierRows, savingsRow, categoryRows, lastRow, devicesRow] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) as cnt FROM frugal_events WHERE user_id_hash = ?')
        .bind(userHash).first(),
      env.DB.prepare('SELECT decided_tier, COUNT(*) as cnt FROM frugal_events WHERE user_id_hash = ? GROUP BY decided_tier')
        .bind(userHash).all(),
      env.DB.prepare(`SELECT
          SUM(per_decision_savings_usd) as total_savings,
          AVG(per_decision_savings_usd) as avg_savings
        FROM frugal_events
        WHERE user_id_hash = ? AND per_decision_savings_usd IS NOT NULL`)
        .bind(userHash).first(),
      env.DB.prepare('SELECT task_category, COUNT(*) as cnt FROM frugal_events WHERE user_id_hash = ? GROUP BY task_category ORDER BY cnt DESC LIMIT 8')
        .bind(userHash).all(),
      env.DB.prepare('SELECT MAX(event_date) as last_active FROM frugal_events WHERE user_id_hash = ?')
        .bind(userHash).first(),
      env.DB.prepare('SELECT COUNT(DISTINCT device_id) as devices, MAX(received_at) as last_seen FROM device_heartbeats WHERE user_id_hash = ?')
        .bind(userHash).first().catch(() => null),
    ]);

    const total = totalRow?.cnt || 0;

    // Honest empty state — the caller renders "Run `mooter sync` to populate"
    // rather than fabricating numbers. frugal_events stays NULL-user until the
    // CLI is logged in and syncs (Wave 33.7 consent path).
    if (total === 0) {
      return new Response(JSON.stringify({ scope: 'user', source: 'empty', total_calls: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
      });
    }

    const tierDist = {};
    for (const r of (tierRows?.results || [])) {
      tierDist[r.decided_tier] = total > 0 ? +(r.cnt / total).toFixed(3) : 0;
    }

    const stats = {
      scope: 'user',
      source: 'live',
      total_calls: total,
      saved_usd: savingsRow?.total_savings ? +savingsRow.total_savings.toFixed(2) : 0,
      saved_avg_per_call_usd: savingsRow?.avg_savings ? +savingsRow.avg_savings.toFixed(4) : 0,
      tier_distribution: tierDist,
      top_categories: (categoryRows?.results || []).map(r => ({
        category: r.task_category,
        count: r.cnt,
      })),
      devices_active: devicesRow?.devices || 0,
      last_active_at: lastRow?.last_active || devicesRow?.last_seen || null,
      last_updated: new Date().toISOString(),
    };

    return new Response(JSON.stringify(stats), {
      status: 200,
      // Per-user data is private — never cache at the edge/CDN.
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    });
  } catch (e) {
    try {
      Sentry.captureException(e, { tags: { route: '/v1/user/dashboard', kind: 'aggregation_failed' } });
    } catch { /* non-fatal */ }
    return errorResponse('aggregation_failed', classifyException(e), { message: e.message });
  }
}

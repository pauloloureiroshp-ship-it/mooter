/**
 * events.js — POST /submit-events + GET /aggregate-stats
 *
 * Sprint 3: event ingestion with schema validation, rate limiting,
 * bearer auth, and aggregated stats endpoint.
 *
 * Sprint 8.3: Sentry captureException added to catch blocks that would
 * otherwise return a 500 without leaving a trace.
 */

import * as Sentry from '@sentry/cloudflare';
import { sanitizeJson } from '../lib/sanitize.js';
import { eventSchema } from '../lib/schemas.js';
import { bindEventInsert, batchInsertEvents, countRecentEventsByInstance, getSyncAggregates } from '../lib/db.js';
import { errorResponse, classifyException } from '../lib/errors.js';

// Max events per instance per hour (5 batches of 100). Exposed for tests.
export const RATE_LIMIT_PER_HOUR = 500;

/**
 * Validate a single event against the Zod schema.
 * Returns null on success, or a compact reason string on failure —
 * format preserved for backwards compat with the handler's
 * rejection_reasons array that clients already parse.
 *
 * Sprint 5.1 — replaces the hand-rolled validateEvent() with a Zod
 * schema in hub/lib/schemas.js that's the single source of truth.
 * Privacy-field check is now a Zod `.refine()` on the schema itself.
 */
function validateEvent(evt) {
  const r = eventSchema.safeParse(evt);
  if (r.success) return null;
  const first = r.error.issues[0];
  const path = first.path.join('.') || '<root>';
  return `${path}: ${first.message}`;
}

// Sprint 6 — rate limiter now delegates to the service layer (lib/db.js)
// for the count query; this function retains the fail-open policy so a
// transient D1 hiccup never locks out legitimate submitters.
async function checkRateLimit(env, instanceId) {
  try {
    const cnt = await countRecentEventsByInstance(env.DB, instanceId);
    return cnt < RATE_LIMIT_PER_HOUR;
  } catch {
    // If rate limit check fails, allow (fail open)
    return true;
  }
}

export async function handleSubmitEvents(request, env) {
  if (request.method !== 'POST') {
    return errorResponse('method_not_allowed', 'method_not_allowed');
  }

  // Auth check
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ') || auth.slice(7) !== env.FRUGAL_SUBMIT_TOKEN) {
    return errorResponse('unauthorized', 'unauthorized');
  }

  let events;
  try {
    events = sanitizeJson(await request.json());
  } catch {
    return errorResponse('invalid_json', 'bad_request', { message: 'Request body is not valid JSON' });
  }

  if (!Array.isArray(events) || events.length === 0) {
    return errorResponse('empty_batch', 'bad_request', { message: 'Request body must be a non-empty array of events' });
  }
  if (events.length > 100) {
    return errorResponse('batch_too_large', 'bad_request', {
      message: `Max 100 events per batch; got ${events.length}`,
      issues: [{ field: 'batch_size', limit: 100, actual: events.length }],
    });
  }

  // Rate limit by first event's instance_id
  const instanceId = events[0]?.instance_id;
  if (instanceId) {
    const allowed = await checkRateLimit(env, instanceId);
    if (!allowed) {
      return errorResponse('rate_limited', 'rate_limited', {
        message: 'Per-instance hourly rate limit exceeded; retry after 1h',
      });
    }
  }

  let accepted = 0;
  const rejectionReasons = [];

  // Sprint 6 — service layer. Prepared-statement + bind moved to
  // hub/lib/db.js (bindEventInsert). Route keeps only the per-event
  // validation + rejection accounting.
  const batch = [];
  for (const evt of events) {
    const err = validateEvent(evt);
    if (err) {
      rejectionReasons.push(err);
      continue;
    }
    batch.push(bindEventInsert(env.DB, evt));
    accepted++;
  }

  if (batch.length > 0) {
    try {
      await batchInsertEvents(env.DB, batch);
    } catch (e) {
      try {
        Sentry.captureException(e, {
          tags: { route: '/submit-events', kind: 'db_batch_failed' },
          extra: { batch_size: batch.length, accepted_before_fail: accepted },
        });
      } catch { /* non-fatal */ }
      return errorResponse('db_error', classifyException(e), { message: e.message });
    }
  }

  return new Response(JSON.stringify({
    accepted,
    rejected: rejectionReasons.length,
    rejection_reasons: rejectionReasons,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

export async function handleAggregateStats(request, env) {
  if (request.method !== 'GET') {
    return errorResponse('method_not_allowed', 'method_not_allowed');
  }

  try {
    // Live aggregation from frugal_events (fine for < 50k rows)
    const [totalRow, instancesRow, tierRows, avgConfRow, categoryRows, hwRows, qualityRow, savingsRow] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) as cnt FROM frugal_events').first(),
      env.DB.prepare('SELECT COUNT(DISTINCT instance_id) as cnt FROM frugal_events').first(),
      env.DB.prepare('SELECT decided_tier, COUNT(*) as cnt FROM frugal_events GROUP BY decided_tier').all(),
      env.DB.prepare('SELECT AVG(confidence) as avg_conf FROM frugal_events').first(),
      env.DB.prepare('SELECT task_category, COUNT(*) as cnt FROM frugal_events GROUP BY task_category ORDER BY cnt DESC LIMIT 10').all(),
      env.DB.prepare('SELECT hardware_tier, COUNT(*) as cnt FROM frugal_events GROUP BY hardware_tier').all(),
      // Retraining foundation: quality + outcome stats
      env.DB.prepare(`SELECT
        COUNT(CASE WHEN outcome_score IS NOT NULL THEN 1 END) as labeled,
        COUNT(CASE WHEN outcome_score >= 0.3 THEN 1 END) as positive,
        COUNT(CASE WHEN outcome_score <= -0.3 THEN 1 END) as negative,
        AVG(outcome_score) as avg_outcome,
        AVG(prompt_complexity_score) as avg_complexity
      FROM frugal_events`).first(),
      env.DB.prepare(`SELECT
        SUM(per_decision_savings_usd) as total_savings,
        AVG(per_decision_savings_usd) as avg_savings
      FROM frugal_events WHERE per_decision_savings_usd IS NOT NULL`).first(),
    ]);

    // Wave 26 — merge the aggregate sync windows (POST /v1/events) into the
    // community totals so the dashboard shows real numbers once devices sync.
    // frugal_events (per-decision) was never populated in prod; sync_events is
    // the live path. Fail-safe: if the table is absent (older test DB), the
    // catch keeps frugal-only behaviour.
    let sync = { clients: 0, counts: { T0: 0, T1: 0, T2: 0, T3: 0 }, total: 0, last_updated: null };
    try { sync = await getSyncAggregates(env.DB); } catch { /* frugal-only */ }

    const frugalTotal = totalRow?.cnt || 0;
    const total = frugalTotal + sync.total;
    // Combined per-tier counts (frugal decided_tier rows + sync window counts).
    const tierCounts = { ...sync.counts };
    for (const r of (tierRows?.results || [])) {
      tierCounts[r.decided_tier] = (tierCounts[r.decided_tier] || 0) + r.cnt;
    }
    const tierDist = {};
    for (const [tier, cnt] of Object.entries(tierCounts)) {
      tierDist[tier] = total > 0 ? +(cnt / total).toFixed(3) : 0;
    }
    const hwDist = {};
    for (const r of (hwRows?.results || [])) {
      hwDist[r.hardware_tier] = total > 0 ? +(r.cnt / total).toFixed(3) : 0;
    }

    const stats = {
      total_events: total,
      unique_instances: (instancesRow?.cnt || 0) + sync.clients,
      tier_distribution: tierDist,
      avg_confidence: avgConfRow?.avg_conf ? +avgConfRow.avg_conf.toFixed(3) : 0,
      top_categories: (categoryRows?.results || []).map(r => ({
        category: r.task_category,
        count: r.cnt,
      })),
      hardware_distribution: hwDist,
      // Retraining foundation: quality signals
      quality: {
        labeled_decisions: qualityRow?.labeled || 0,
        positive_outcomes: qualityRow?.positive || 0,
        negative_outcomes: qualityRow?.negative || 0,
        avg_outcome_score: qualityRow?.avg_outcome ? +qualityRow.avg_outcome.toFixed(3) : null,
        avg_complexity: qualityRow?.avg_complexity ? +qualityRow.avg_complexity.toFixed(3) : null,
      },
      savings: {
        total_usd: savingsRow?.total_savings ? +savingsRow.total_savings.toFixed(2) : 0,
        avg_per_decision_usd: savingsRow?.avg_savings ? +savingsRow.avg_savings.toFixed(4) : 0,
      },
      last_updated: new Date().toISOString(),
      data_window_days: 7,
    };

    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
    });
  } catch (e) {
    try {
      Sentry.captureException(e, {
        tags: { route: '/aggregate-stats', kind: 'aggregation_failed' },
      });
    } catch { /* non-fatal */ }
    return errorResponse('aggregation_failed', classifyException(e), { message: e.message });
  }
}

/**
 * events.js — POST /submit-events + GET /aggregate-stats
 *
 * Sprint 3: event ingestion with schema validation, rate limiting,
 * bearer auth, and aggregated stats endpoint.
 */

const VALID_TIERS = new Set(['T0', 'T0-code', 'T0-math', 'T1', 'T2', 'T3']);
const VALID_BUCKETS = new Set(['0-50', '50-100', '100-200', '200-500', '500+']);
const ID_RE = /^[a-z0-9\-]{1,50}$/;
const INSTANCE_RE = /^[a-f0-9]{8}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PRIVACY_FIELDS = new Set(['prompt_text', 'prompt_raw', 'file_path', 'stack_trace']);

function validateEvent(evt) {
  if (!evt || typeof evt !== 'object') return 'not_object';
  // Privacy: reject if any banned field is present
  for (const f of PRIVACY_FIELDS) {
    if (f in evt) return `privacy_violation: ${f}`;
  }
  if (!evt.id || typeof evt.id !== 'string' || !ID_RE.test(evt.id)) return 'invalid_id';
  if (!evt.instance_id || !INSTANCE_RE.test(evt.instance_id)) return 'invalid_instance_id';
  if (!evt.decided_tier || !VALID_TIERS.has(evt.decided_tier)) return `invalid_tier: ${evt.decided_tier}`;
  if (typeof evt.confidence !== 'number' || evt.confidence < 0 || evt.confidence > 1) return 'invalid_confidence';
  if (!evt.prompt_len_bucket || !VALID_BUCKETS.has(evt.prompt_len_bucket)) return 'invalid_prompt_len_bucket';
  if (typeof evt.session_hour !== 'number' || evt.session_hour < 0 || evt.session_hour > 23) return 'invalid_session_hour';
  if (!evt.event_date || !DATE_RE.test(evt.event_date)) return 'missing_field: event_date';
  if (!evt.frugal_version) return 'missing_field: frugal_version';
  if (!evt.classifier_version) return 'missing_field: classifier_version';
  if (!evt.hardware_tier) return 'missing_field: hardware_tier';
  if (!evt.task_category) return 'missing_field: task_category';
  if (!evt.created_at) return 'missing_field: created_at';
  if (!evt.keyword_signals) return 'missing_field: keyword_signals';
  if (evt.has_file_refs === undefined || evt.has_file_refs === null) return 'missing_field: has_file_refs';
  if (evt.has_code_block === undefined || evt.has_code_block === null) return 'missing_field: has_code_block';
  return null;
}

async function checkRateLimit(env, instanceId) {
  const hourBucket = Math.floor(Date.now() / 3600000);
  try {
    // Count recent events from this instance in the last hour
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const row = await env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM frugal_events WHERE instance_id = ? AND created_at > ?'
    ).bind(instanceId, oneHourAgo).first();
    // Allow up to 500 events per instance per hour (5 batches of 100)
    return !row || row.cnt < 500;
  } catch {
    // If rate limit check fails, allow (fail open)
    return true;
  }
}

export async function handleSubmitEvents(request, env) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405 });
  }

  // Auth check
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ') || auth.slice(7) !== env.FRUGAL_SUBMIT_TOKEN) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  let events;
  try {
    events = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400 });
  }

  if (!Array.isArray(events) || events.length === 0) {
    return new Response(JSON.stringify({ error: 'empty array or not array' }), { status: 400 });
  }
  if (events.length > 100) {
    return new Response(JSON.stringify({
      accepted: 0, rejected: events.length,
      rejection_reasons: ['batch_too_large']
    }), { status: 400 });
  }

  // Rate limit by first event's instance_id
  const instanceId = events[0]?.instance_id;
  if (instanceId) {
    const allowed = await checkRateLimit(env, instanceId);
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'rate_limited', retry_after_seconds: 3600 }), { status: 429 });
    }
  }

  let accepted = 0;
  const rejectionReasons = [];

  const insertStmt = env.DB.prepare(`
    INSERT OR IGNORE INTO frugal_events (
      id, instance_id, frugal_version, classifier_version, hardware_tier, ab_variant,
      decided_tier, confidence, task_category, escalation_rule,
      prompt_len_bucket, has_file_refs, has_code_block, keyword_signals,
      actual_model_used, subagent_spawned, wall_clock_ms, inter_prompt_gap_ms,
      response_len_bucket, cascade_upgrade, retry_detected, ollama_warm, gpu_util_pct,
      explicit_rating, explicit_feedback_type,
      session_hour, event_date, created_at,
      algorithm_version, prompt_complexity_score, outcome_score, outcome_source, per_decision_savings_usd
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?
    )
  `);

  const batch = [];
  for (const evt of events) {
    const err = validateEvent(evt);
    if (err) {
      rejectionReasons.push(err);
      continue;
    }
    batch.push(insertStmt.bind(
      evt.id, evt.instance_id, evt.frugal_version, evt.classifier_version,
      evt.hardware_tier, evt.ab_variant || null,
      evt.decided_tier, evt.confidence, evt.task_category, evt.escalation_rule || null,
      evt.prompt_len_bucket, evt.has_file_refs ? 1 : 0, evt.has_code_block ? 1 : 0,
      evt.keyword_signals,
      evt.actual_model_used || null, evt.subagent_spawned || 0,
      evt.wall_clock_ms || null, evt.inter_prompt_gap_ms || null,
      evt.response_len_bucket || null, evt.cascade_upgrade || 0,
      evt.retry_detected || 0, evt.ollama_warm || null, evt.gpu_util_pct || null,
      evt.explicit_rating || null, evt.explicit_feedback_type || null,
      evt.session_hour, evt.event_date, evt.created_at,
      evt.algorithm_version || null, evt.prompt_complexity_score || null,
      evt.outcome_score || null, evt.outcome_source || null,
      evt.per_decision_savings_usd || null
    ));
    accepted++;
  }

  if (batch.length > 0) {
    try {
      await env.DB.batch(batch);
    } catch (e) {
      return new Response(JSON.stringify({
        error: 'db_error', detail: e.message,
        accepted: 0, rejected: events.length
      }), { status: 500 });
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
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405 });
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

    const total = totalRow?.cnt || 0;
    const tierDist = {};
    for (const r of (tierRows?.results || [])) {
      tierDist[r.decided_tier] = total > 0 ? +(r.cnt / total).toFixed(3) : 0;
    }
    const hwDist = {};
    for (const r of (hwRows?.results || [])) {
      hwDist[r.hardware_tier] = total > 0 ? +(r.cnt / total).toFixed(3) : 0;
    }

    const stats = {
      total_events: total,
      unique_instances: instancesRow?.cnt || 0,
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
    return new Response(JSON.stringify({ error: 'aggregation_failed', detail: e.message }), {
      status: 500,
    });
  }
}

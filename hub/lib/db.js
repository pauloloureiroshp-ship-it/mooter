// @ts-check
/**
 * hub/lib/db.js — D1 service layer for the Mooter hub.
 *
 * CCA Criterion #6 (Service Layer). Before this module every route
 * reached into env.DB.prepare().bind().run() directly, mixing SQL with
 * request-parsing logic and making it painful to change the storage
 * backend, add a per-domain cache, or swap D1 for SQLite locally.
 *
 * The service layer centralises:
 *   - SQL strings (single source of truth — schema changes in one place)
 *   - INSERT parameter binding (no more 15-positional-arg `.bind(...)`
 *     calls scattered across routes)
 *   - Rate-limiting lookups
 *
 * Read-only endpoints (stats, models, version) stay on direct env.DB
 * access for now — they're queries against public aggregates and don't
 * carry privacy risk. Sprint 6.1 can migrate them when there's a real
 * caching need.
 *
 * All functions are async and assume `env.DB` is a Cloudflare D1 binding
 * (D1Database). Callers handle the Sentry.captureException wrapping.
 */

// ── Deltas ─────────────────────────────────────────────────────────────

const INSERT_DELTA_SQL = `
  INSERT INTO deltas (id, received_at, expires_at, hw_tier, sub_profile, lang,
    session_count, prompt_count, tier_distribution, keyword_signals,
    unknown_models, feedback_signals, delta_version, trust_score,
    savings_usd, profile_hash)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

/**
 * Insert a validated + trust-scored delta into the deltas table.
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {Record<string, any>} delta
 */
export async function insertDelta(db, delta) {
  return db.prepare(INSERT_DELTA_SQL).bind(
    delta.id, delta.received_at, delta.expires_at, delta.hw_tier,
    delta.sub_profile, delta.lang, delta.session_count, delta.prompt_count,
    delta.tier_distribution, delta.keyword_signals, delta.unknown_models,
    delta.feedback_signals, delta.delta_version, delta.trust_score,
    delta.savings_usd, delta.profile_hash
  ).run();
}

// ── Device heartbeats ──────────────────────────────────────────────────

const INSERT_HEARTBEAT_SQL = `
  INSERT INTO device_heartbeats (
    id, device_id, event, setup_version, hw_tier, sub_profile,
    platform, node_version, claude_code_version, error,
    client_ts, received_at, user_id_hash
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

/**
 * Insert a device heartbeat. Caller is responsible for field capping
 * (so the inserted values never exceed their column widths).
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {Record<string, any>} hb
 */
export async function insertHeartbeat(db, hb) {
  return db.prepare(INSERT_HEARTBEAT_SQL).bind(
    hb.id, hb.device_id, hb.event, hb.setup_version,
    hb.hw_tier, hb.sub_profile, hb.platform, hb.node_version,
    hb.claude_code_version, hb.error, hb.client_ts, hb.received_at,
    hb.user_id_hash || null
  ).run();
}

// ── Frugal events (batch) ──────────────────────────────────────────────

const INSERT_EVENT_SQL = `
  INSERT OR IGNORE INTO frugal_events (
    id, instance_id, frugal_version, classifier_version, hardware_tier, ab_variant,
    decided_tier, confidence, task_category, escalation_rule,
    prompt_len_bucket, has_file_refs, has_code_block, keyword_signals,
    actual_model_used, subagent_spawned, wall_clock_ms, inter_prompt_gap_ms,
    response_len_bucket, cascade_upgrade, retry_detected, ollama_warm, gpu_util_pct,
    explicit_rating, explicit_feedback_type,
    session_hour, event_date, created_at,
    algorithm_version, prompt_complexity_score, outcome_score, outcome_source, per_decision_savings_usd,
    user_id_hash
  ) VALUES (
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?,
    ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?
  )
`;

/**
 * Bind a single event to the prepared INSERT statement. Returns a bound
 * D1PreparedStatement ready to be passed to env.DB.batch([...]).
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {Record<string, any>} e
 */
export function bindEventInsert(db, e) {
  return db.prepare(INSERT_EVENT_SQL).bind(
    e.id, e.instance_id, e.frugal_version, e.classifier_version,
    e.hardware_tier, e.ab_variant || null,
    e.decided_tier, e.confidence, e.task_category, e.escalation_rule || null,
    e.prompt_len_bucket, e.has_file_refs ? 1 : 0, e.has_code_block ? 1 : 0,
    e.keyword_signals,
    e.actual_model_used || null, e.subagent_spawned || 0,
    e.wall_clock_ms || null, e.inter_prompt_gap_ms || null,
    e.response_len_bucket || null, e.cascade_upgrade || 0,
    e.retry_detected || 0, e.ollama_warm || null, e.gpu_util_pct || null,
    e.explicit_rating || null, e.explicit_feedback_type || null,
    e.session_hour, e.event_date, e.created_at,
    e.algorithm_version || null, e.prompt_complexity_score || null,
    e.outcome_score || null, e.outcome_source || null,
    e.per_decision_savings_usd || null,
    e.user_id_hash || null
  );
}

/**
 * Execute a batch of prepared INSERT statements atomically.
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {Array<any>} batch
 */
export async function batchInsertEvents(db, batch) {
  if (batch.length === 0) return [];
  return db.batch(batch);
}

/**
 * Count recent events from an instance for rate limiting.
 * Returns a number (0 if empty) so callers can compare without null check.
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} instanceId
 * @param {number} [sinceMs=3600000] window size in ms (default 1h)
 */
export async function countRecentEventsByInstance(db, instanceId, sinceMs) {
  const window = typeof sinceMs === 'number' ? sinceMs : 3600000;
  const cutoff = new Date(Date.now() - window).toISOString();
  const row = /** @type {any} */ (
    await db.prepare(
      'SELECT COUNT(*) as cnt FROM frugal_events WHERE instance_id = ? AND created_at > ?'
    ).bind(instanceId, cutoff).first()
  );
  return row && typeof row.cnt === 'number' ? row.cnt : 0;
}

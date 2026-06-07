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

// Phase C.1 / F-1 — per-source ingestion rate limits for the previously
// unauthenticated /api/delta and /api/device-heartbeat endpoints. Mirrors
// countRecentEventsByInstance (D1 COUNT over a recent window). Callers keep
// the fail-open policy. NOTE: these key on client-supplied identifiers
// (profile_hash / device_id), so they stop naive floods but not an attacker
// rotating the key — robust per-IP limiting is tracked as F-1.2 (needs a KV
// namespace, which the hub does not yet bind).
export async function countRecentDeltasByProfile(db, profileHash, sinceMs) {
  const window = typeof sinceMs === 'number' ? sinceMs : 60000;
  const cutoff = new Date(Date.now() - window).toISOString();
  const row = /** @type {any} */ (
    await db.prepare(
      'SELECT COUNT(*) as cnt FROM deltas WHERE profile_hash = ? AND received_at > ?'
    ).bind(profileHash, cutoff).first()
  );
  return row && typeof row.cnt === 'number' ? row.cnt : 0;
}

export async function countRecentHeartbeatsByDevice(db, deviceId, sinceMs) {
  const window = typeof sinceMs === 'number' ? sinceMs : 60000;
  const cutoff = new Date(Date.now() - window).toISOString();
  const row = /** @type {any} */ (
    await db.prepare(
      'SELECT COUNT(*) as cnt FROM device_heartbeats WHERE device_id = ? AND received_at > ?'
    ).bind(deviceId, cutoff).first()
  );
  return row && typeof row.cnt === 'number' ? row.cnt : 0;
}

// ── Feedback (Wave 12 D1-2 — anonymous `mooter feedback`) ──────────────────

const INSERT_FEEDBACK_SQL = `
  INSERT INTO feedback (
    id, user_id_hash, content, topic, severity, mooter_version, hw_tier, ip_hash, received_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

/**
 * Insert a feedback row. Caller is responsible for content/PII validation.
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {Record<string, any>} fb
 */
export async function insertFeedback(db, fb) {
  return db.prepare(INSERT_FEEDBACK_SQL).bind(
    fb.id, fb.user_id_hash || null, fb.content, fb.topic, fb.severity,
    fb.mooter_version || null, fb.hw_tier || null, fb.ip_hash || null, fb.received_at
  ).run();
}

/** F-1-style rate-limit: count recent feedback rows by ip_hash. Fail-open at the caller. */
export async function countRecentFeedbackByIp(db, ipHash, sinceMs) {
  const window = typeof sinceMs === 'number' ? sinceMs : 60000;
  const cutoff = new Date(Date.now() - window).toISOString();
  const row = /** @type {any} */ (
    await db.prepare(
      'SELECT COUNT(*) as cnt FROM feedback WHERE ip_hash = ? AND received_at > ?'
    ).bind(ipHash, cutoff).first()
  );
  return row && typeof row.cnt === 'number' ? row.cnt : 0;
}

/** Admin read: most-recent feedback rows (no PII columns exist on the table). */
export async function listFeedback(db, limit) {
  const n = Math.min(Math.max(parseInt(String(limit ?? 200), 10) || 200, 1), 500);
  const res = /** @type {any} */ (
    await db.prepare(
      'SELECT id, user_id_hash, content, topic, severity, mooter_version, hw_tier, received_at FROM feedback ORDER BY received_at DESC LIMIT ?'
    ).bind(n).all()
  );
  return (res && res.results) || [];
}

// ── Sync windows (Wave 26 — POST /v1/events, aggregate windows) ─────────

const INSERT_SYNC_EVENT_SQL = `
  INSERT OR IGNORE INTO sync_events (
    event_id, client_id, schema_version, emitted_at_utc, window_start_utc, window_end_utc,
    t0, t1, t2, t3, avg_confidence, safety_applied, safety_total, pack_ids,
    os, gpu_class, ram_class, ollama_available, sig_value, received_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

/**
 * Flatten a validated MooterSyncEvent window into a bound INSERT statement.
 * INSERT OR IGNORE makes re-sync of the same event_id idempotent.
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {Record<string, any>} w
 * @param {string} receivedAt ISO timestamp
 */
export function bindSyncEventInsert(db, w, receivedAt) {
  const td = w.tier_distribution || {};
  const counts = td.counts || {};
  const sb = w.safety_boost_reasons || {};
  const pu = w.pack_usage || {};
  const hw = w.hardware_info || {};
  return db.prepare(INSERT_SYNC_EVENT_SQL).bind(
    w.event_id, w.client_id_pseudonymous, w.schema_version, w.emitted_at_utc,
    td.window_start_utc || null, td.window_end_utc || null,
    Number(counts.T0) || 0, Number(counts.T1) || 0, Number(counts.T2) || 0, Number(counts.T3) || 0,
    typeof td.avg_confidence === 'number' ? td.avg_confidence : null,
    typeof sb.applied === 'number' ? sb.applied : null,
    typeof sb.total_prompts === 'number' ? sb.total_prompts : null,
    Array.isArray(pu.pack_ids) ? JSON.stringify(pu.pack_ids) : null,
    hw.os || null, hw.gpu_class || null, hw.ram_class || null,
    hw.ollama_available === true ? 1 : (hw.ollama_available === false ? 0 : null),
    (w.signature && w.signature.value) || null,
    receivedAt
  );
}

/** Atomic batch insert of bound sync-window statements. */
export async function batchInsertSyncEvents(db, batch) {
  if (!batch.length) return;
  return db.batch(batch);
}

/** Rate-limit: count a client's sync windows in the recent window (fail-open at caller). */
export async function countRecentSyncByClient(db, clientId, sinceMs) {
  const window = typeof sinceMs === 'number' ? sinceMs : 3600000;
  const cutoff = new Date(Date.now() - window).toISOString();
  const row = /** @type {any} */ (
    await db.prepare(
      'SELECT COUNT(*) as cnt FROM sync_events WHERE client_id = ? AND received_at > ?'
    ).bind(clientId, cutoff).first()
  );
  return row && typeof row.cnt === 'number' ? row.cnt : 0;
}

/**
 * Community aggregate over sync windows, summed across all clients. Used by
 * /aggregate-stats to surface real numbers once devices sync. Returns zeros
 * when the table is empty.
 */
export async function getSyncAggregates(db) {
  const totals = /** @type {any} */ (
    await db.prepare(`SELECT
      COUNT(DISTINCT client_id) AS clients,
      SUM(t0) AS t0, SUM(t1) AS t1, SUM(t2) AS t2, SUM(t3) AS t3,
      MAX(received_at) AS last_updated
    FROM sync_events`).first()
  );
  const t0 = Number(totals?.t0) || 0, t1 = Number(totals?.t1) || 0,
        t2 = Number(totals?.t2) || 0, t3 = Number(totals?.t3) || 0;
  return {
    clients: Number(totals?.clients) || 0,
    counts: { T0: t0, T1: t1, T2: t2, T3: t3 },
    total: t0 + t1 + t2 + t3,
    last_updated: totals?.last_updated || null,
  };
}

// ── Pastor state (Wave 26 26.D — pull-based, no cron) ───────────────────

const UPSERT_PASTOR_SQL = `
  INSERT INTO pastor_state (client_id, total_decisions, t0_rate, t1_rate, t2_rate, t3_rate, ollama_available, hint, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(client_id) DO UPDATE SET
    total_decisions = excluded.total_decisions,
    t0_rate = excluded.t0_rate, t1_rate = excluded.t1_rate,
    t2_rate = excluded.t2_rate, t3_rate = excluded.t3_rate,
    ollama_available = excluded.ollama_available,
    hint = excluded.hint, updated_at = excluded.updated_at
`;

/** Read a client's current cumulative Pastor row (null if none yet). */
export async function getPastorState(db, clientId) {
  return /** @type {any} */ (
    await db.prepare('SELECT * FROM pastor_state WHERE client_id = ?').bind(clientId).first()
  );
}

/** Persist a recomputed Pastor row. */
export async function upsertPastorState(db, s) {
  return db.prepare(UPSERT_PASTOR_SQL).bind(
    s.client_id, s.total_decisions,
    s.t0_rate, s.t1_rate, s.t2_rate, s.t3_rate,
    s.ollama_available === true ? 1 : (s.ollama_available === false ? 0 : null),
    s.hint ? JSON.stringify(s.hint) : null,
    s.updated_at
  ).run();
}

// ── Pastor v2 decisions (Wave 29 29.I/29.K — multi-dimensional telemetry) ───

/** @param {any} x → 0/1/null */
function bool01OrNull(x) {
  if (x === true || x === 1) return 1;
  if (x === false || x === 0) return 0;
  return null;
}
const numOrNull = (/** @type {any} */ x) => (typeof x === 'number' ? x : null);

const INSERT_PASTOR_V2_SQL = `
  INSERT OR IGNORE INTO pastor_v2_decisions (
    decision_id, device_id, ts,
    prompt_class, prompt_tokens, prompt_complexity, prompt_language,
    context_tokens, context_freshness_hours, repo_size_files,
    hardware_class, has_lora_pastor, subscription_tier,
    packs_active, providers_active,
    tier_chosen, model_chosen, classify_confidence, pastor_hint_applied, workflow_engaged,
    outcome_status, outcome_dwell_ms, outcome_followup_count,
    tokens_in, tokens_out, cost_usd, latency_first_token_ms, latency_full_ms,
    doctrine_violations, received_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

/** Bind one validated decision row. INSERT OR IGNORE → idempotent on decision_id. */
export function bindPastorV2Insert(db, d, receivedAt) {
  return db.prepare(INSERT_PASTOR_V2_SQL).bind(
    d.decision_id, d.device_id, d.ts,
    d.prompt_class ?? null, numOrNull(d.prompt_tokens), numOrNull(d.prompt_complexity), d.prompt_language ?? null,
    numOrNull(d.context_tokens), numOrNull(d.context_freshness_hours), numOrNull(d.repo_size_files),
    d.hardware_class ?? null, bool01OrNull(d.has_lora_pastor), d.subscription_tier ?? null,
    d.packs_active ?? null, d.providers_active ?? null,
    d.tier_chosen ?? null, d.model_chosen ?? null, numOrNull(d.classify_confidence), bool01OrNull(d.pastor_hint_applied), bool01OrNull(d.workflow_engaged),
    d.outcome_status ?? null, numOrNull(d.outcome_dwell_ms), numOrNull(d.outcome_followup_count),
    numOrNull(d.tokens_in), numOrNull(d.tokens_out), numOrNull(d.cost_usd), numOrNull(d.latency_first_token_ms), numOrNull(d.latency_full_ms),
    typeof d.doctrine_violations === 'number' ? d.doctrine_violations : 0,
    receivedAt
  );
}

/** Atomic batch insert of bound decision statements. */
export async function batchInsertPastorV2(db, batch) {
  if (!batch.length) return;
  return db.batch(batch);
}

/** Rate-limit: count a device's decisions in the recent window (fail-open at caller). */
export async function countRecentPastorV2ByDevice(db, deviceId, sinceMs) {
  const window = typeof sinceMs === 'number' ? sinceMs : 3600000;
  const cutoff = new Date(Date.now() - window).toISOString();
  const row = /** @type {any} */ (
    await db.prepare(
      'SELECT COUNT(*) as cnt FROM pastor_v2_decisions WHERE device_id = ? AND received_at > ?'
    ).bind(deviceId, cutoff).first()
  );
  return row && typeof row.cnt === 'number' ? row.cnt : 0;
}

// ── Device setup profiles (Wave 29 29.K — federated cohort) ─────────────────

const UPSERT_DEVICE_SETUP_SQL = `
  INSERT INTO device_setup_profiles (
    device_id, hardware_class, vram_gb, has_npu, os_class, ollama_models_count, subscription_tier, last_updated, received_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(device_id) DO UPDATE SET
    hardware_class = excluded.hardware_class, vram_gb = excluded.vram_gb,
    has_npu = excluded.has_npu, os_class = excluded.os_class,
    ollama_models_count = excluded.ollama_models_count,
    subscription_tier = excluded.subscription_tier,
    last_updated = excluded.last_updated, received_at = excluded.received_at
`;

/** Upsert one device setup profile (opt-in, anonymous). */
export async function upsertDeviceSetupProfile(db, p, receivedAt) {
  return db.prepare(UPSERT_DEVICE_SETUP_SQL).bind(
    p.device_id, p.hardware_class ?? null, numOrNull(p.vram_gb), bool01OrNull(p.has_npu),
    p.os_class ?? null, numOrNull(p.ollama_models_count), p.subscription_tier ?? null,
    numOrNull(p.last_updated), receivedAt
  ).run();
}

/** Cohort aggregate for the federated route. Returns total + per-hardware_class counts. */
export async function getDeviceSetupCohort(db) {
  const total = /** @type {any} */ (
    await db.prepare('SELECT COUNT(DISTINCT device_id) AS devices FROM device_setup_profiles').first()
  );
  const rows = /** @type {any} */ (
    await db.prepare('SELECT hardware_class, COUNT(*) AS n FROM device_setup_profiles GROUP BY hardware_class').all()
  );
  const by_hardware_class = {};
  for (const r of (rows && rows.results) || []) by_hardware_class[r.hardware_class || 'unknown'] = Number(r.n) || 0;
  return { devices: Number(total?.devices) || 0, by_hardware_class };
}

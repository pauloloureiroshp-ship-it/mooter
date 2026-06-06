// @ts-check
/**
 * hub/lib/schemas.js — Zod schemas for Cloudflare Worker request bodies.
 *
 * CCA Criterion #2 (Runtime Validation). Before this module each route
 * had an ad-hoc `validate(body)` function that returned a string reason.
 * That worked but diverged between routes, missed several cross-field
 * invariants, and wasn't machine-readable for consumers.
 *
 * Zod schemas are the single source of truth; the ad-hoc validate()
 * functions delegate to these. Keep the tier / bucket / language
 * enumerations here so adding a new HW tier or sub_profile is a
 * one-line change consumed by every route.
 */

import { z } from 'zod';

// ── Enumerations (shared across routes) ────────────────────────────────

export const TierEnum = z.enum(['T0', 'T0-code', 'T0-math', 'T1', 'T2', 'T3']);
export const HwTierEnum = z.enum([
  'gpu-high', 'gpu-mid', 'gpu-low', 'apple-silicon', 'cpu-only', 'unknown',
]);
export const SubProfileEnum = z.enum([
  'max', 'api-paid', 'api-free', 'none', 'unknown', 'claude_max',
]);
export const LangEnum = z.enum(['pt', 'en', 'other']);
export const LenBucketEnum = z.enum(['0-50', '50-100', '100-200', '200-500', '500+']);
export const HeartbeatEventEnum = z.enum([
  'install_start', 'install_ok', 'install_fail', 'alive',
]);

// ── POST /api/delta ────────────────────────────────────────────────────

export const deltaBodySchema = z.object({
  hw_tier: HwTierEnum.exclude(['unknown']),
  sub_profile: SubProfileEnum,
  tier_distribution: z.record(z.string(), z.number()),
  prompt_count: z.number().int().min(1),
  lang: LangEnum.optional(),
  session_count: z.number().int().nonnegative().optional(),
  keyword_signals: z.array(z.string()).optional(),
  unknown_models: z.array(z.string()).optional(),
  feedback_signals: z.record(z.string(), z.unknown()).optional(),
  delta_version: z.string().max(16).optional(),
  savings_usd: z.number().finite().optional(),
  profile_hash: z.string().max(128).optional(),
}).passthrough(); // allow-list via handler; extra fields still pass but get ignored.

// ── POST /api/device-heartbeat ─────────────────────────────────────────

// Stable 16-hex-char hash of the Supabase user_id. Optional: anonymous
// installs send no hash. Migration 008 added the matching column.
const USER_ID_HASH_RE = /^[a-f0-9]{16}$/;

export const heartbeatBodySchema = z.object({
  device_id: z.string().min(1).max(256),
  event: HeartbeatEventEnum,
  setup_version: z.string().max(256).optional(),
  hw_tier: HwTierEnum.optional(),
  sub_profile: SubProfileEnum.optional(),
  platform: z.string().max(256).optional(),
  node_version: z.string().max(256).optional(),
  claude_code_version: z.string().max(256).optional(),
  error: z.string().max(2048).optional(),
  ts: z.string().datetime({ offset: true }).optional(),
  user_id_hash: z.string().regex(USER_ID_HASH_RE).nullable().optional(),
}).passthrough();

// ── POST /submit-events ────────────────────────────────────────────────

const ID_RE = /^[a-z0-9\-]{1,50}$/;
const INSTANCE_RE = /^[a-f0-9]{8}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Privacy contract: these keys are stripped server-side and their
// presence causes the event to be rejected. See events.js validateEvent.
const PRIVACY_FIELDS = ['prompt_text', 'prompt_raw', 'file_path', 'stack_trace'];

export const eventSchema = z.object({
  id: z.string().regex(ID_RE, 'id must match [a-z0-9-]{1,50}'),
  instance_id: z.string().regex(INSTANCE_RE, 'instance_id must be 8 hex chars'),
  frugal_version: z.string().min(1),
  classifier_version: z.string().min(1),
  hardware_tier: z.string().min(1),
  decided_tier: TierEnum,
  confidence: z.number().min(0).max(1),
  task_category: z.string().min(1),
  prompt_len_bucket: LenBucketEnum,
  has_file_refs: z.union([z.literal(0), z.literal(1), z.boolean()]),
  has_code_block: z.union([z.literal(0), z.literal(1), z.boolean()]),
  keyword_signals: z.string().min(1), // JSON-encoded array string
  session_hour: z.number().int().min(0).max(23),
  event_date: z.string().regex(DATE_RE, 'event_date must be YYYY-MM-DD'),
  created_at: z.string().min(1),
  // Optional fields — nullable because D1 INSERT accepts null.
  ab_variant: z.string().nullable().optional(),
  escalation_rule: z.string().nullable().optional(),
  actual_model_used: z.string().nullable().optional(),
  subagent_spawned: z.union([z.literal(0), z.literal(1)]).optional(),
  wall_clock_ms: z.number().nullable().optional(),
  inter_prompt_gap_ms: z.number().nullable().optional(),
  response_len_bucket: z.string().nullable().optional(),
  cascade_upgrade: z.union([z.literal(0), z.literal(1)]).nullable().optional(),
  retry_detected: z.union([z.literal(0), z.literal(1)]).nullable().optional(),
  ollama_warm: z.union([z.literal(0), z.literal(1)]).nullable().optional(),
  gpu_util_pct: z.number().nullable().optional(),
  explicit_rating: z.number().nullable().optional(),
  explicit_feedback_type: z.string().nullable().optional(),
  algorithm_version: z.string().nullable().optional(),
  prompt_complexity_score: z.number().nullable().optional(),
  outcome_score: z.number().nullable().optional(),
  outcome_source: z.string().nullable().optional(),
  per_decision_savings_usd: z.number().nullable().optional(),
  user_id_hash: z.string().regex(USER_ID_HASH_RE).nullable().optional(),
}).refine(
  (evt) => !PRIVACY_FIELDS.some((k) => k in evt),
  { message: `event must not contain any privacy field: ${PRIVACY_FIELDS.join(', ')}` }
);

// Array of events, up to the batch limit (handler still caps at 100 and
// returns 400 — duplicated here as a belt-and-braces cap).
export const eventsBatchSchema = z.array(eventSchema).min(1).max(100);

// ── POST /v1/events — aggregate sync windows (Wave 26, auth model α) ─────
//
// `mooter sync` emits MooterSyncEvent: ONE coarse 24h window, not per-decision
// rows. We validate only what we store; unknown future fields pass through but
// the privacy refine still rejects any window carrying prompt/code text.

const CLIENT_ID_RE = /^[a-f0-9]{8,128}$/;

const SYNC_PRIVACY_FIELDS = ['prompt_content', 'prompt', 'prompt_text', 'prompt_raw', 'file_path', 'stack_trace'];

const tierCountsSchema = z.object({
  T0: z.number().int().min(0),
  T1: z.number().int().min(0),
  T2: z.number().int().min(0),
  T3: z.number().int().min(0),
}).partial().passthrough();

export const syncWindowSchema = z.object({
  schema_version: z.number().int().min(1),
  event_id: z.string().min(1).max(128),
  client_id_pseudonymous: z.string().regex(CLIENT_ID_RE, 'client_id_pseudonymous must be 8-128 hex chars'),
  emitted_at_utc: z.string().min(1),
  signature: z.object({
    algo: z.string().optional(),
    value: z.string().optional(),
    signed_payload_hash: z.string().optional(),
  }).passthrough().optional(),
  tier_distribution: z.object({
    window_start_utc: z.string().optional(),
    window_end_utc: z.string().optional(),
    counts: tierCountsSchema.optional(),
    avg_confidence: z.number().optional(),
  }).passthrough().optional(),
  safety_boost_reasons: z.object({
    applied: z.number().int().min(0).optional(),
    total_prompts: z.number().int().min(0).optional(),
    reasons: z.record(z.number()).optional(),
  }).passthrough().optional(),
  pack_usage: z.object({
    pack_ids: z.array(z.string()).optional(),
    counts: z.record(z.number()).optional(),
  }).passthrough().optional(),
  hardware_info: z.object({
    os: z.string().optional(),
    gpu_class: z.string().optional(),
    ram_class: z.string().optional(),
    ollama_available: z.boolean().optional(),
  }).passthrough().optional(),
}).passthrough().refine(
  (w) => !SYNC_PRIVACY_FIELDS.some((k) => k in w),
  { message: `sync window must not contain any privacy field: ${SYNC_PRIVACY_FIELDS.join(', ')}` }
);

export const syncWindowsBatchSchema = z.array(syncWindowSchema).min(1).max(100);

// ── Export schema set for test harness use ─────────────────────────────

export const schemas = {
  delta: deltaBodySchema,
  heartbeat: heartbeatBodySchema,
  event: eventSchema,
  eventsBatch: eventsBatchSchema,
  syncWindow: syncWindowSchema,
  syncWindowsBatch: syncWindowsBatchSchema,
};

// mooter_event.ts — canonical MooterEvent schema (Pastor Wave 2 Day 4).
//
// Source of truth for every consumer of event JSONL files (writer, hub upload
// — Wave 3 D4, frontend dashboards — Wave 4). DO NOT diverge from this shape
// downstream; mirror it instead (e.g. landing/lib/mooter-event.ts).
//
// Privacy & integrity invariants (enforced by tests, do not relax):
//   - prompt_hash is sha256 truncated to 16 hex chars. NEVER store raw prompt
//     text in the event.
//   - cost_micros is INTEGER microUSD. Floating-point USD drifts; integers do
//     not. Convert at the boundary: Math.round(usd * 1e6).
//   - Execution + quality fields are nullable so a write at hook time (Day 4)
//     is valid even before the post-LLM call wire (Day 6) fills them in.
//
// Schema is versioned (SCHEMA_VERSION). Bump on breaking change; consumers
// must reject events with an unrecognised major.

import { randomFillSync } from "node:crypto";

/** Bump on breaking change to the field set. */
export const SCHEMA_VERSION = "1.0.0";

export type Tier = "T0" | "T1" | "T2" | "T3";

export type Provider =
  | "anthropic"
  | "ollama"
  | "bedrock"
  | "openai"
  | "google"
  | "grok";

export type ThumbRating = "up" | "down" | "shrug";

export interface RatingCommentAnon {
  length: number;
  sentiment: "pos" | "neu" | "neg";
}

export interface JudgeScores {
  correctness: number;
  completeness: number;
  relevance: number;
  actionability: number;
  hallucination: number;
}

export interface MooterEvent {
  // ── Envelope ──────────────────────────────────────────────────────────────
  event_id: string; // UUIDv7
  event_type: "prod" | "bench";
  timestamp_utc: string; // ISO 8601, ms precision
  user_id_anon: string; // sha256(hw_fingerprint + local_salt)
  session_id: string; // UUIDv7
  pastor_version: string; // semver from package.json
  pricing_version: string; // semver from pricing.js export
  env_hash: string; // sha256(os + node + ollama_version + models_pulled)
  schema_version: string; // SCHEMA_VERSION at write time

  // ── Routing decisions (axis 1 + axis 2 + axis 3 placeholder) ──────────────
  prompt_hash: string; // sha256 truncated to 16 hex chars — never plaintext
  prompt_tokens_est: number;
  axis1_tier_recommended: Tier;
  axis1_confidence: number; // [0, 1]
  axis2_pack_id: string | null;
  axis2_confidence: number; // [0, 1]
  axis3_adapter_id: string | null; // Wave 5 placeholder
  axis3_adapter_version: string | null;
  model_floor_applied: Tier;
  model_ceiling_applied: Tier;
  escalation_triggered: boolean;
  escalation_reason: string | null;

  // ── Execution (filled by post-LLM call wire in Wave 2 Day 6) ──────────────
  model_actual: string | null;
  provider: Provider | null;
  tokens_in: number | null;
  tokens_out: number | null;
  tokens_cache_hit: number | null;
  cost_micros: number | null; // INTEGER microUSD — no float drift
  latency_ms_total: number | null;
  latency_ms_ttft: number | null;
  latency_ms_per_tok: number | null;
  error_type: string | null;
  retries: number | null;

  // ── Implicit quality signals (nível 1, captured by next-turn detection) ──
  user_continued: boolean | null;
  user_edited_output: boolean | null;
  user_aborted: boolean | null;
  session_outcome: "commit" | "abort" | "unknown" | null;

  // ── Explicit feedback (nível 2, Wave 3 D1 slash command /rate) ────────────
  rating_thumb: ThumbRating | null;
  rating_comment_anon: RatingCommentAnon | null;

  // ── Bench-only fields (event_type = "bench") ──────────────────────────────
  judge_model?: string;
  judge_scores?: JudgeScores;
  judge_rationale?: string;
  judge_blind?: boolean;
}

export interface EnvelopeInput {
  event_type: "prod" | "bench";
  user_id_anon: string;
  session_id: string;
  pastor_version: string;
  pricing_version: string;
  env_hash: string;
}

export type Envelope = Pick<
  MooterEvent,
  | "event_id"
  | "event_type"
  | "timestamp_utc"
  | "user_id_anon"
  | "session_id"
  | "pastor_version"
  | "pricing_version"
  | "env_hash"
  | "schema_version"
>;

/**
 * UUIDv7 — 48-bit ms timestamp prefix + 74 bits random + version + variant.
 * Lexicographically sortable by creation time, which is exactly what we want
 * for session ordering and disk layout.
 *
 *   field         bits    source
 *   unix_ts_ms    48      Date.now()
 *   ver           4       0b0111
 *   rand_a        12      random
 *   var           2       0b10
 *   rand_b        62      random
 */
export function generateUUIDv7(): string {
  const ts = Date.now();
  const tsHex = ts.toString(16).padStart(12, "0");

  const rand = new Uint8Array(10);
  randomFillSync(rand);

  // Force version (7) and RFC 4122 variant (10xx) bits.
  rand[0] = (rand[0]! & 0x0f) | 0x70;
  rand[2] = (rand[2]! & 0x3f) | 0x80;

  const hex = (b: number): string => b.toString(16).padStart(2, "0");
  const randHex = Array.from(rand, hex).join("");

  return (
    `${tsHex.slice(0, 8)}-` +
    `${tsHex.slice(8, 12)}-` +
    `${randHex.slice(0, 4)}-` +
    `${randHex.slice(4, 8)}-` +
    `${randHex.slice(8, 20)}`
  );
}

/** Parse the 48-bit ms timestamp prefix back out of a UUIDv7. */
export function decodeUUIDv7Timestamp(uuid: string): number {
  const compact = uuid.replace(/-/g, "");
  return parseInt(compact.slice(0, 12), 16);
}

/** Build the envelope half of a MooterEvent. */
export function makeEnvelope(input: EnvelopeInput): Envelope {
  return {
    event_id: generateUUIDv7(),
    event_type: input.event_type,
    timestamp_utc: new Date().toISOString(),
    user_id_anon: input.user_id_anon,
    session_id: input.session_id,
    pastor_version: input.pastor_version,
    pricing_version: input.pricing_version,
    env_hash: input.env_hash,
    schema_version: SCHEMA_VERSION,
  };
}

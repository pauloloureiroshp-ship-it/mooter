// mooter-event.ts — canonical Wave 2 D4 event schema (IMPLEMENTATION_SPEC §11).
// Type-only mirror for the future Phase D hub. Do not simplify — 31+ fields.

export type MooterEvent = {
  // Envelope
  event_id: string; // UUIDv7
  event_type: 'prod' | 'bench';
  timestamp_utc: string; // ISO8601
  user_id_anon: string; // sha256(hw_fingerprint + local_salt)
  session_id: string;
  pastor_version: string;
  pricing_version: string;
  env_hash: string;

  // Routing decisions
  prompt_hash: string; // sha256 truncated 16ch — NEVER plaintext
  prompt_tokens_est: number;
  axis1_tier_recommended: 'T0' | 'T1' | 'T2' | 'T3';
  axis1_confidence: number;
  axis2_pack_id: string | null;
  axis2_confidence: number;
  axis3_adapter_id: string | null;
  axis3_adapter_version: string | null;
  model_floor_applied: 'T0' | 'T1' | 'T2' | 'T3';
  model_ceiling_applied: 'T0' | 'T1' | 'T2' | 'T3';
  escalation_triggered: boolean;
  escalation_reason: string | null;

  // Execution
  model_actual: string;
  provider: 'anthropic' | 'ollama' | 'bedrock' | 'openai' | 'google' | 'grok';
  tokens_in: number;
  tokens_out: number;
  tokens_cache_hit: number;
  cost_micros: number; // INTEGER microUSD — no float drift
  latency_ms_total: number;
  latency_ms_ttft: number | null;
  latency_ms_per_tok: number | null;
  error_type: string | null;
  retries: number;

  // Implicit quality (level 1)
  user_continued: boolean | null;
  user_edited_output: boolean | null;
  user_aborted: boolean | null;
  session_outcome: 'commit' | 'abort' | 'unknown' | null;

  // Explicit feedback (level 2)
  rating_thumb: '👍' | '👎' | '🤷' | null;
  rating_comment_anon: { length: number; sentiment: 'pos' | 'neu' | 'neg' } | null;

  // Bench-only
  judge_model?: string;
  judge_scores?: {
    correctness: number;
    completeness: number;
    relevance: number;
    actionability: number;
    hallucination: number;
  };
  judge_rationale?: string;
  judge_blind?: boolean;
};

export const STATUSLINE_FORMAT_LINES = [
  '🐮 mooter saved $X today (Y%)  ·  T{n} {model}  ·  pack: {pack}',
  '   {bar} N% 5h  ·  {bar} N% 7d  ·  ↺ {time}',
  '   ctx N%  ·  adapter: {id} ◌|●  ·  ${ppt}/turn  ·  alltime ${total}',
] as const;

export const TIER_COLORS_WEB = {
  T0: '#4CAF6A',
  T1: '#5A9BD4',
  T2: '#A88BD4', // purple on web
  T3: '#D46A5A',
} as const;

export const TIER_COLORS_TERMINAL = {
  T0: '#4CAF6A',
  T1: '#5A9BD4',
  T2: '#D4C090', // yellow in terminal
  T3: '#D46A5A',
} as const;

export type TierKey = keyof typeof TIER_COLORS_WEB;

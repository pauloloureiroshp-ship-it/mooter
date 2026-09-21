/**
 * Shared typedefs for the frugal router toolchain (CCA Sprint 1).
 *
 * These types describe the runtime shapes that classify.js / arbiter.js /
 * inject_context.js / backtest.js exchange with each other and with the
 * persisted log (`decisions.log`).
 *
 * Kept intentionally permissive — the router has evolved over many
 * versions and older log entries must still type-check against the union.
 */

// ---------- Arbiter ----------

export type Tier = 'T0' | 'T1' | 'T2' | 'T3';

export interface DecompositionSubtask {
  description: string;
  tier: Tier | string;
  rationale?: string;
}

export interface Decomposition {
  applicable: boolean;
  subtasks: DecompositionSubtask[];
}

export interface ArbiterDecision {
  tier: Tier;
  subagent: string;
  reasoning: string;
  decomposition?: Decomposition;
  cached?: boolean;
  latency_ms?: number;
}

export interface ArbiterCacheEntry {
  ts: number;
  decision: ArbiterDecision;
}

export interface ArbiterCache {
  version: number;
  entries: Record<string, ArbiterCacheEntry>;
}

export interface ArbitrateOptions {
  _mockResponse?: string | null;
  _skipCache?: boolean;
}

// ---------- F2-shadow (MP3 · 2026-09-21): decisor tipado local, modo sombra ----------
// Todos os campos opcionais no que toca ao resto do router: nada aqui e lido por classify.js
// nem pela rota. Ver arbiter.js «F2-shadow».

export interface DecisorShadowResult {
  tier: Tier;
  probabilities: Record<Tier, number>;
  p_max: number;
  abstained: boolean;
  latency_ms: number;
  backend: 'ollama-logit';
  model: string;
  aux?: {
    p_needs_repo?: number;
    p_high_stakes?: number;
    e_complexity?: number;
    mass_on_letters_tier?: number;
  };
}

export interface DecisorShadowEvent {
  ts: string;
  ts_ms: number;
  event: 'decisor_shadow';
  outcome: 'ok' | 'timeout' | 'failed' | 'parse_failed' | 'refused_non_loopback' | string;
  session_id?: string | null;
  hook_ts_ms?: number | null;
  prompt_sha12: string;
  prompt_len: number;
  tier_regra?: Tier | string | null;
  confidence_regra?: number | null;
  task_category?: string | null;
  escalation_rule_regra?: string | null;
  tier_arbiter_haiku?: Tier | string | null;
  tier_D?: Tier | null;
  probs_D?: Record<Tier, number> | null;
  p_max_D?: number | null;
  abstained_D?: boolean | null;
  ms_D?: number | null;
  aux_D?: DecisorShadowResult['aux'] | null;
  agree_regra?: boolean | null;
  backend: 'ollama-logit';
  model: string;
}

export interface ShadowOptions {
  session_id?: string | null;
  _force?: boolean;
  _inline?: boolean;
  _logPath?: string;
  _mockResponses?: unknown[];
  _mockTimeout?: boolean;
}

// ---------- Classifier ----------

export interface ClassifierFeatures {
  has_code_block: boolean;
  has_file_refs: boolean;
  file_ref_count: number;
  lang_detected: string;
  has_error_trace: boolean;
  has_urgency_marker: boolean;
  has_quality_signal?: boolean;
  quality_intent?: boolean;
  high_risk_signals: string[];
  refuse_downgrade_reason?: string;
  fast_pattern_matched?: string | null;
  sensitive_pattern_matched?: string | null;
  [k: string]: unknown;
}

export interface ClassifyDecision {
  algorithm_version: string;
  prompt_complexity_score: number;
  has_code_block: boolean;
  has_file_refs: boolean;
  file_ref_count: number;
  lang_detected: string;
  has_error_trace: boolean;
  has_urgency_marker?: boolean;
  has_quality_signal?: boolean;
  quality_intent?: boolean;
  high_risk_signals?: string[];
  refuse_downgrade_reason?: string;
  tier: Tier | string;
  confidence?: number;
  reason?: string;
  category?: string;
  recommended_backend?: string;
  recommended_model?: string;
  suggested_subagent?: string;
  user_override?: UserOverride | null;
  features?: ClassifierFeatures;
  [k: string]: unknown;
}

export interface UserOverride {
  requested_model?: string;
  requested_tier?: Tier | string;
  honored: boolean;
  reason?: string;
  raw_match?: string;
  [k: string]: unknown;
}

export interface ClassifierTuning {
  complexity_bias?: number;
  sensitive_patterns?: Array<{ pattern: string; tier?: string; weight?: number }>;
  fast_patterns?: Array<{ pattern: string; tier?: string; weight?: number }>;
  [k: string]: unknown;
}

// ---------- Router decision log ----------

export interface DecisionLogEntry {
  ts: string;
  event?: string;
  prompt_preview?: string;
  prompt_len?: number;
  tier?: Tier | string;
  subagent?: string;
  decision?: ClassifyDecision | ArbiterDecision | Record<string, unknown>;
  outcome?: string;
  duration_ms?: number;
  reasoning?: string;
  est_cost_usd?: number;
  shadow_tier?: Tier | string;
  shadow_subagent?: string;
  judgment?: string;
  rating?: number | string;
  signals?: string[];
  [k: string]: unknown;
}

// ---------- Backtest ----------

export interface TuningSuggestion {
  frugal_version: string;
  classifier_version: string;
  generated_at: string;
  instance_id: string;
  hardware_tier: string;
  deltas: unknown[];
  promote_signals: unknown[];
  feedback_signals?: unknown;
  explicit_ratings?: unknown;
  shadow_judgments?: unknown;
  [k: string]: unknown;
}

export interface BacktestStats {
  total: number;
  byTier: Record<Tier, number>;
  naiveCost: number;
  actualCost: number;
  idealCost: number;
  additionalSavings: number;
  shortHighTier: number;
  lowConfHighTier: number;
  goodSignaturesProtected: number;
  feedbackSignals?: number;
  [k: string]: unknown;
}

// ---------- Injection / hook ----------

export interface RouterHint {
  tier: Tier | string;
  subagent?: string;
  confidence?: number;
  reason?: string;
  category?: string;
  recommended_backend?: string;
  recommended_model?: string;
  user_override?: UserOverride;
  arbiter?: { honored: boolean; source?: string };
  quality_intent?: boolean;
  decomposition?: Decomposition;
  [k: string]: unknown;
}

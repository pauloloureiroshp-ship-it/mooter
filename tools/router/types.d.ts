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

// types.ts — shared schema types for the Wave 1 Pastor benchmark (schema v1.0.0).
//
// Single source of truth for the row shape written to RAW_RESULTS.jsonl/.parquet
// and JUDGE_LOG.jsonl/.parquet. Mirrors BENCHMARK_DESIGN.md §8/§13 and
// MASTER_PROMPT.md §4-C (cost_micros integer, lineage block, event_id idempotency).

export const SCHEMA_VERSION = "1.0.0" as const;

export type Arm = "A" | "B" | "C";
export type Tier = "T0" | "T1" | "T2" | "T3";

/** Per-run provenance — identical across every row of a run (§13.2). */
export interface LineageBlock {
  run_id: string; // UUIDv7 (sortable, ms timestamp embedded)
  event_id: string; // {run_id}-{prompt_id}-{arm} — idempotency key
  schema_version: string;
  pastor_version: string; // git tag pinned
  commit_sha: string; // exact commit benched
  pricing_version: string; // pricing snapshot id
  ollama_version: string;
  anthropic_sdk_version: string;
  node_version: string;
  env_hash: string; // sha256(uname + node + npm), 16 hex
  user_id: string | null; // single-user benchmark → null
  session_id: string; // UUIDv7 of this run/session
}

/** One pre-registered prompt from prompts.jsonl (§5). */
export interface PromptSpec {
  id: string; // P001..P034
  block: string; // animation-web | code-audit | diagram-systems | AMBIGUOUS | GENERAL
  prompt: string;
  expected_pack: string;
  expected_tier_floor: Tier;
  correctness_check: CorrectnessCheck | null;
}

/** Deterministic correctness check spec attached to a prompt. */
export interface CorrectnessCheck {
  kind: "ts-compile" | "yaml-lint" | "mermaid-syntax" | "regex-present" | "json-valid";
  // For regex-present: a JS regex source the response must match (e.g. a CWE id).
  pattern?: string;
  // Human note describing what is being checked.
  note?: string;
}

/** Result of running a deterministic check against a response. */
export interface DeterministicResult {
  ran: boolean;
  passed: boolean | null; // null when not applicable / could not run
  kind: string | null;
  detail: string;
}

/** Judge's per-dimension scores (rubrics §4). */
export interface QualityScores {
  correctness: number; // {0, 0.5, 1.0}
  completeness: number; // int 1..5
  relevance: number; // int 1..5
  actionability: number; // int 1..5
  hallucination: number; // 0 | 1
}

/** Raw LLM invocation result returned by an arm. */
export interface ArmInvocation {
  model_used: string;
  tier_routed: Tier | null; // Pastor only; B/C carry their fixed tier
  pack_routed: string | null; // Pastor only
  pack_confidence: number | null; // Pastor only, 4dp
  latency_classifier_ms: number; // Pastor only; B/C → 0
  latency_llm_ms: number;
  latency_total_ms: number;
  tokens_input: number;
  tokens_output: number;
  response: string;
  status: "ok" | "failed";
  error: string | null;
  // Pastor diagnostics (for transparency / mis-routing analysis)
  system_prompt_used: string | null;
  skills_invoke: string[] | null;
}

/** A full RAW_RESULTS row (one (prompt, arm) pair). */
export interface BenchEvent {
  event_id: string; // {run_id}-{prompt_id}-{arm}
  schema_version: string;
  event_type: "bench";
  lineage: LineageBlock;
  prompt_id: string;
  arm: Arm;
  block: string;
  expected_pack: string;
  expected_tier_floor: Tier;
  model_used: string;
  tier_routed: Tier | null;
  pack_routed: string | null;
  pack_confidence: number | null;
  latency_classifier_ms: number;
  latency_llm_ms: number;
  latency_total_ms: number;
  tokens_input: number;
  tokens_output: number;
  tokens_total: number;
  cost_micros: number; // integer microUSD
  response: string;
  // Filled after judging (Phase E):
  judge_scores: QualityScores | null;
  quality_score: number | null; // normalized 0..1
  judge_run_id: string | null;
  judge_seed_position: number | null; // blind order position (1..3)
  pack_correct: boolean | null;
  tier_appropriate: boolean | null;
  would_higher_tier_help: boolean | null;
  deterministic: DeterministicResult | null;
  status: "ok" | "failed";
  error: string | null;
  timestamp: string; // ISO8601 UTC
}

/** One JUDGE_LOG row — a single judge call over the 3 blind outputs of a prompt. */
export interface JudgeLogRow {
  judge_event_id: string; // {run_id}-{prompt_id}-judge[-rN for repeats]
  schema_version: string;
  event_type: "judge";
  lineage: LineageBlock;
  prompt_id: string;
  judge_model: string;
  judge_run_id: string;
  is_repeat: boolean; // sanity-check repeat with a different seed
  seed: number;
  // position (1..3) → which arm sat there (the de-blinding map)
  position_to_arm: Record<string, Arm>;
  // raw scores keyed by position "1"/"2"/"3"
  scores_by_position: Record<string, QualityScores>;
  // length of each output by position (length-bias audit, §7)
  length_by_position: Record<string, number>;
  raw_judge_response: string;
  latency_ms: number;
  tokens_input: number;
  tokens_output: number;
  cost_micros: number;
  timestamp: string;
}

/** Composite quality score (§3.2 pre-registered weights). Range 0..1. */
export function compositeQuality(q: QualityScores): number {
  const correctness = q.correctness; // already 0..1
  const completeness = q.completeness / 5;
  const relevance = q.relevance / 5;
  const actionability = q.actionability / 5;
  const nonHallucination = 1 - q.hallucination; // 0|1
  return (
    correctness * 0.3 +
    completeness * 0.2 +
    relevance * 0.2 +
    actionability * 0.2 +
    nonHallucination * 0.1
  );
}

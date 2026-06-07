// L16.1 — Multi-dimensional decision telemetry (Wave 29 Phase 29.I, Paulo Vector C).
//
// Logs ONE structured row per routing decision. PRIVACY IS THE CONTRACT: only the
// allowlisted feature columns are ever persisted — never prompt content. Two
// guards enforce this:
//   1. assertNoPromptContent() throws if a caller passes a content-bearing key.
//   2. sanitizeRecord() projects onto the column allowlist, dropping anything else.
// Mirrors the hub `pastor_v2_decisions` schema (migration 013). Local JSONL now;
// the hub upload + bandit (L16.2) land in Wave 30.

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mooterPath, appendJsonl } from "../config.ts";

export interface DecisionRecord {
  decision_id: string;
  device_id: string;
  ts: number;
  // Prompt features (from classify.js) — class/metrics only, NEVER text
  prompt_class?: string; // 'T0' | 'T1' | 'T2' | 'T3'
  prompt_tokens?: number;
  prompt_complexity?: number; // 0-1
  prompt_language?: string; // 'en' | 'pt-pt' | 'pt-br' | 'code-only'
  // Context features
  context_tokens?: number;
  context_freshness_hours?: number;
  repo_size_files?: number;
  // Setup features
  hardware_class?: string;
  has_lora_pastor?: boolean;
  subscription_tier?: string;
  // Ecosystem features
  packs_active?: string; // comma-separated
  providers_active?: string;
  // Routing features
  tier_chosen?: string;
  model_chosen?: string;
  classify_confidence?: number;
  pastor_hint_applied?: boolean;
  workflow_engaged?: boolean;
  // Outcome features
  outcome_status?: string; // 'accepted' | 'edited' | 'retried' | 'abandoned' | 'unknown'
  outcome_dwell_ms?: number;
  outcome_followup_count?: number;
  // Cost features
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number;
  latency_first_token_ms?: number;
  latency_full_ms?: number;
  // Doctrine compliance
  doctrine_violations?: number;
}

export const DECISION_COLUMNS: ReadonlyArray<keyof DecisionRecord> = [
  "decision_id", "device_id", "ts",
  "prompt_class", "prompt_tokens", "prompt_complexity", "prompt_language",
  "context_tokens", "context_freshness_hours", "repo_size_files",
  "hardware_class", "has_lora_pastor", "subscription_tier",
  "packs_active", "providers_active",
  "tier_chosen", "model_chosen", "classify_confidence", "pastor_hint_applied", "workflow_engaged",
  "outcome_status", "outcome_dwell_ms", "outcome_followup_count",
  "tokens_in", "tokens_out", "cost_usd", "latency_first_token_ms", "latency_full_ms",
  "doctrine_violations",
];

// Keys that would carry prompt/response content — logging these is a hard error.
export const FORBIDDEN_KEYS = new Set([
  "prompt", "prompt_text", "prompt_content", "prompt_raw", "prompt_string",
  "full_prompt", "content", "text", "body", "raw", "message",
  "completion", "response", "response_text", "output_text", "messages",
]);

/** Throw if a record carries any content-bearing key. */
export function assertNoPromptContent(record: Record<string, unknown>): void {
  for (const key of Object.keys(record)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
      throw new Error(`privacy violation: decision telemetry must not include '${key}' (prompt/response content)`);
    }
  }
}

/** Project onto the column allowlist — drops any unknown keys defensively. */
export function sanitizeRecord(record: Record<string, unknown>): DecisionRecord {
  const out: Record<string, unknown> = {};
  for (const col of DECISION_COLUMNS) {
    if (record[col as string] !== undefined) out[col as string] = record[col as string];
  }
  return out as DecisionRecord;
}

export interface LogOptions {
  now?: number;
  id?: string;
}

function decisionsPath(): string {
  return mooterPath("quality", "decisions.jsonl");
}

/**
 * Validate, sanitise, complete (id/ts) and append a decision row. Returns the
 * persisted record. Throws on any forbidden content key.
 */
export function logDecision(record: Partial<DecisionRecord> & { device_id: string }, opts: LogOptions = {}): DecisionRecord {
  assertNoPromptContent(record as Record<string, unknown>);
  const sanitized = sanitizeRecord(record as Record<string, unknown>);
  const complete: DecisionRecord = {
    ...sanitized,
    device_id: record.device_id,
    decision_id: sanitized.decision_id ?? opts.id ?? randomUUID(),
    ts: sanitized.ts ?? opts.now ?? Date.now(),
  };
  appendJsonl(decisionsPath(), complete);
  return complete;
}

export function readDecisions(path = decisionsPath()): DecisionRecord[] {
  try {
    if (!existsSync(path)) return [];
    return readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => {
        try {
          return JSON.parse(l) as DecisionRecord;
        } catch {
          return null;
        }
      })
      .filter((r): r is DecisionRecord => r !== null);
  } catch {
    return [];
  }
}

export interface DecisionStats {
  total: number;
  by_tier: Record<string, number>;
  by_outcome: Record<string, number>;
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost_usd: number;
  doctrine_violations: number;
  avg_classify_confidence: number | null;
}

export function aggregateStats(records: DecisionRecord[]): DecisionStats {
  const stats: DecisionStats = {
    total: records.length,
    by_tier: {},
    by_outcome: {},
    total_tokens_in: 0,
    total_tokens_out: 0,
    total_cost_usd: 0,
    doctrine_violations: 0,
    avg_classify_confidence: null,
  };
  let confSum = 0;
  let confN = 0;
  for (const r of records) {
    if (r.tier_chosen) stats.by_tier[r.tier_chosen] = (stats.by_tier[r.tier_chosen] ?? 0) + 1;
    const oc = r.outcome_status ?? "unknown";
    stats.by_outcome[oc] = (stats.by_outcome[oc] ?? 0) + 1;
    stats.total_tokens_in += r.tokens_in ?? 0;
    stats.total_tokens_out += r.tokens_out ?? 0;
    stats.total_cost_usd += r.cost_usd ?? 0;
    stats.doctrine_violations += r.doctrine_violations ?? 0;
    if (typeof r.classify_confidence === "number") {
      confSum += r.classify_confidence;
      confN += 1;
    }
  }
  stats.avg_classify_confidence = confN > 0 ? Number((confSum / confN).toFixed(3)) : null;
  return stats;
}

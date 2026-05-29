// execution-fields.test.ts — Wave 2 Day 6 sub-feature 2 DoD.
// Run: cd packages/router && npm test   (tsx --test tests/*.test.ts)
//
// Covers applyExecutionFields (execution_fields.ts) + computeCostMicros (cost.ts):
//   - a successful response fills tokens/model/cost/latency correctly
//   - cost_micros is an INTEGER (no float drift), priced from the frozen snapshot
//   - latency is positive; per-tok derived only when output tokens exist
//   - an error response zeroes tokens/cost and populates error_type
//   - an unknown model → cost_micros 0, no throw
//   - the input draft is not mutated

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCostMicros, providerForModel, isLocalModel } from "../src/cost.ts";
import { applyExecutionFields } from "../src/execution_fields.ts";
import type { MooterEvent } from "../src/mooter_event.ts";

// A minimal routing-only draft (execution slots null), as Day 4 produces.
function draft(): MooterEvent {
  return {
    event_id: "0192f000-0000-7000-8000-000000000000",
    event_type: "prod",
    timestamp_utc: "2026-05-29T00:00:00.000Z",
    user_id_anon: "anon:deadbeefdeadbeef",
    session_id: "0192f000-0000-7000-8000-000000000001",
    pastor_version: "0.1.0",
    pricing_version: "pricing-snapshot-2026-05-27",
    env_hash: "abc123",
    schema_version: "1.0.0",
    prompt_hash: "0123456789abcdef",
    prompt_tokens_est: 10,
    axis1_tier_recommended: "T2",
    axis1_confidence: 0.8,
    axis2_pack_id: null,
    axis2_confidence: 0,
    axis3_adapter_id: null,
    axis3_adapter_version: null,
    model_floor_applied: "T0",
    model_ceiling_applied: "T3",
    escalation_triggered: false,
    escalation_reason: null,
    model_actual: null,
    provider: null,
    tokens_in: null,
    tokens_out: null,
    tokens_cache_hit: null,
    cost_micros: null,
    latency_ms_total: null,
    latency_ms_ttft: null,
    latency_ms_per_tok: null,
    error_type: null,
    retries: null,
    user_continued: null,
    user_edited_output: null,
    user_aborted: null,
    session_outcome: null,
    rating_thumb: null,
    rating_comment_anon: null,
  };
}

// ── computeCostMicros ───────────────────────────────────────────────────────

test("computeCostMicros: prices a known Anthropic model as an integer", () => {
  const c = computeCostMicros("claude-sonnet-4-6", 1000, 500);
  assert.ok(Number.isInteger(c), `cost must be integer microUSD, got ${c}`);
  assert.ok(c > 0, "a paid model with tokens must cost > 0");
  assert.equal(c % 1, 0);
});

test("computeCostMicros: strips a trailing -YYYYMMDD date suffix", () => {
  const dated = computeCostMicros("claude-haiku-4-5-20251001", 1000, 1000);
  const bare = computeCostMicros("claude-haiku-4-5", 1000, 1000);
  assert.equal(dated, bare);
});

test("computeCostMicros: local (Ollama) model costs 0", () => {
  assert.equal(computeCostMicros("qwen2.5-coder:7b", 100000, 100000), 0);
  assert.ok(isLocalModel("qwen2.5-coder:7b"));
});

test("computeCostMicros: unknown model returns 0 without throwing", () => {
  assert.doesNotThrow(() => computeCostMicros("gpt-fantasy-999", 1000, 1000));
  assert.equal(computeCostMicros("gpt-fantasy-999", 1000, 1000), 0);
});

test("computeCostMicros: negative tokens are clamped to 0", () => {
  assert.equal(computeCostMicros("claude-sonnet-4-6", -50, -50), 0);
});

test("providerForModel: claude → anthropic, ':tag' → ollama, else null", () => {
  assert.equal(providerForModel("claude-opus-4-7"), "anthropic");
  assert.equal(providerForModel("qwen3:30b"), "ollama");
  assert.equal(providerForModel("gpt-fantasy-999"), null);
});

// ── applyExecutionFields ──────────────────────────────────────────────────────

test("applyExecutionFields: success path fills tokens/model/cost/latency", () => {
  const e = applyExecutionFields(draft(), {
    model: "claude-sonnet-4-6",
    usage: { input_tokens: 1200, output_tokens: 800, cache_read_input_tokens: 300 },
    latency_ms_total: 2400,
    latency_ms_ttft: 350,
    retries: 0,
  });
  assert.equal(e.model_actual, "claude-sonnet-4-6");
  assert.equal(e.provider, "anthropic");
  assert.equal(e.tokens_in, 1200);
  assert.equal(e.tokens_out, 800);
  assert.equal(e.tokens_cache_hit, 300);
  assert.ok(Number.isInteger(e.cost_micros), "cost_micros must be integer");
  assert.ok((e.cost_micros ?? 0) > 0);
  assert.equal(e.latency_ms_total, 2400);
  assert.equal(e.latency_ms_ttft, 350);
  assert.equal(e.latency_ms_per_tok, 3); // round(2400 / 800)
  assert.equal(e.error_type, null);
});

test("applyExecutionFields: latency_ms_total is positive and <= wall clock", () => {
  const wall = 5000;
  const e = applyExecutionFields(draft(), {
    model: "claude-haiku-4-5",
    usage: { input_tokens: 10, output_tokens: 10 },
    latency_ms_total: wall,
  });
  assert.ok((e.latency_ms_total ?? -1) >= 0);
  assert.ok((e.latency_ms_total ?? Infinity) <= wall);
});

test("applyExecutionFields: per-tok latency is null when no output tokens", () => {
  const e = applyExecutionFields(draft(), {
    model: "claude-haiku-4-5",
    usage: { input_tokens: 10, output_tokens: 0 },
    latency_ms_total: 500,
  });
  assert.equal(e.latency_ms_per_tok, null);
});

test("applyExecutionFields: error response zeroes tokens/cost, sets error_type", () => {
  const e = applyExecutionFields(draft(), {
    model: "claude-opus-4-7",
    usage: { input_tokens: 999, output_tokens: 999 },
    latency_ms_total: 120,
    error: { type: "overloaded_error" },
    retries: 2,
  });
  assert.equal(e.error_type, "overloaded_error");
  assert.equal(e.tokens_in, 0);
  assert.equal(e.tokens_out, 0);
  assert.equal(e.cost_micros, 0);
  assert.equal(e.retries, 2);
});

test("applyExecutionFields: unknown model → cost_micros 0, no throw", () => {
  let e!: MooterEvent;
  assert.doesNotThrow(() => {
    e = applyExecutionFields(draft(), {
      model: "gpt-fantasy-999",
      usage: { input_tokens: 1000, output_tokens: 1000 },
      latency_ms_total: 800,
    });
  });
  assert.equal(e.cost_micros, 0);
  assert.equal(e.provider, null);
});

test("applyExecutionFields: does not mutate the input draft", () => {
  const d = draft();
  applyExecutionFields(d, {
    model: "claude-sonnet-4-6",
    usage: { input_tokens: 1, output_tokens: 1 },
    latency_ms_total: 1,
  });
  assert.equal(d.model_actual, null, "input draft must stay untouched");
  assert.equal(d.cost_micros, null);
});

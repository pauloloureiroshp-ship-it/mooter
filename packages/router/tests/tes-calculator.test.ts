// tes-calculator.test.ts — Wave 58 Token Efficiency Score DoD.
// Run: cd packages/router && npm test   (tsx --test tests/*.test.ts)
//
// Honesty-first contract (Doctrine V4 #5 — NO FABRICATION):
//   - priced model + real score → finite TES, status 'ok'
//   - pending-price model (null in snapshot) → tes null, status 'pending'
//   - unknown model (not in snapshot) → tes null, status 'pending'
//   - missing / out-of-range benchmark_score → tes null, status 'pending'
//   - free local model + real score → floored TES, status 'free'
//   - never throws; batch preserves order; formula matches the spec

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeTES,
  computeTESBatch,
  priceStatusForModel,
  OUTPUT_WEIGHT,
  FREE_COST_FLOOR_PER_1K,
} from "../src/tes-calculator.ts";

test("priced model + real score → finite TES with status 'ok'", () => {
  // claude-haiku-4-5 = $1/MTok in, $5/MTok out ⇒ $0.001/1k in, $0.005/1k out.
  const r = computeTES({ model: "claude-haiku-4-5", category: "coding.backend", benchmark_score: 0.6 });
  assert.equal(r.status, "ok");
  assert.equal(r.price_status, "priced");
  assert.equal(r.cost_per_1k_in, 0.001);
  assert.equal(r.cost_per_1k_out, 0.005);
  const expected = (0.6 * 100) / (0.001 + OUTPUT_WEIGHT * 0.005);
  assert.ok(Math.abs((r.tes as number) - expected) < 1e-3, `tes ${r.tes} ≈ ${expected}`);
});

test("formula uses the documented 0.3 output weight", () => {
  // sonnet $3/$15 ⇒ $0.003/1k in, $0.015/1k out.
  const r = computeTES({ model: "claude-sonnet-4-6", category: "reasoning.general", benchmark_score: 0.75 });
  const denom = 0.003 + 0.3 * 0.015; // = 0.0075
  const expected = (0.75 * 100) / denom; // = 10000
  assert.equal(r.status, "ok");
  assert.ok(Math.abs((r.tes as number) - expected) < 1, `tes ${r.tes} ≈ ${expected}`);
});

test("pending-price model → tes null, status 'pending' (no fabrication)", () => {
  // gpt-5 / opus-4-8 / gemini-3.1-pro / deepseek-v3.2 are seeded pending (null
  // prices) in the snapshot. claude-fable-5 USED to be on this list and was
  // removed on 2026-08-25: it got its real $10/$50 from the SSOT once the
  // opt-in-only exclusion moved into decide-agent.ts. Until then the missing
  // price was doing the job of the tier ladder, and that is exactly why it
  // could not stay missing. Its refusal is now asserted where it belongs,
  // in tests/decide-agent.test.ts.
  for (const model of ["gpt-5", "claude-opus-4-8", "gemini-3.1-pro", "deepseek-v3.2"]) {
    const r = computeTES({ model, category: "agents.coordinator", benchmark_score: 0.9 });
    assert.equal(r.tes, null, `${model} must not produce a fabricated TES`);
    assert.equal(r.status, "pending");
    assert.equal(r.price_status, "pending");
    assert.match(r.reason, /pending/i);
  }
});

test("unknown model (not in snapshot) → tes null, status 'pending'", () => {
  const r = computeTES({ model: "totally-made-up-model", category: "coding.frontend", benchmark_score: 0.5 });
  assert.equal(r.tes, null);
  assert.equal(r.status, "pending");
  assert.equal(r.price_status, "unknown");
});

test("missing benchmark_score → pending even when the model is priced", () => {
  for (const score of [null, undefined]) {
    const r = computeTES({ model: "claude-opus-4-7", category: "coding.security", benchmark_score: score });
    assert.equal(r.tes, null);
    assert.equal(r.status, "pending");
    assert.equal(r.benchmark_score, null);
  }
});

test("out-of-range benchmark_score → pending (refuse to fabricate)", () => {
  for (const score of [-0.1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const r = computeTES({ model: "claude-opus-4-7", category: "reasoning.math", benchmark_score: score });
    assert.equal(r.tes, null, `score ${score} must be rejected`);
    assert.equal(r.status, "pending");
  }
});

test("free local model + real score → floored TES, status 'free'", () => {
  // qwen3:30b is a local Ollama model (cost $0).
  const r = computeTES({ model: "qwen3:30b", category: "coding.refactor", benchmark_score: 0.5 });
  assert.equal(r.status, "free");
  assert.equal(r.price_status, "free");
  assert.equal(r.cost_per_1k_in, FREE_COST_FLOOR_PER_1K);
  const denom = FREE_COST_FLOOR_PER_1K + OUTPUT_WEIGHT * FREE_COST_FLOOR_PER_1K;
  const expected = (0.5 * 100) / denom;
  assert.ok(Math.abs((r.tes as number) - expected) < 1e-3);
  assert.match(r.reason, /free local model/i);
  assert.match(r.reason, /not a real price/i);
});

test("priceStatusForModel classifies the three regimes", () => {
  assert.equal(priceStatusForModel("claude-haiku-4-5"), "priced");
  assert.equal(priceStatusForModel("claude-opus-4-8"), "pending");
  assert.equal(priceStatusForModel("qwen3:30b"), "free");
  assert.equal(priceStatusForModel("no-such-model"), "unknown");
});

test("computeTESBatch preserves order and per-cell status", () => {
  const out = computeTESBatch([
    { model: "claude-haiku-4-5", category: "coding.test", benchmark_score: 0.6 },
    { model: "gpt-5", category: "coding.test", benchmark_score: 0.6 },
    { model: "qwen3:30b", category: "coding.test", benchmark_score: 0.6 },
  ]);
  assert.equal(out.length, 3);
  assert.equal(out[0].status, "ok");
  assert.equal(out[1].status, "pending");
  assert.equal(out[2].status, "free");
});

test("never throws on adversarial input", () => {
  assert.doesNotThrow(() => computeTES({ model: "", category: "", benchmark_score: 0 }));
  assert.doesNotThrow(() => computeTES({ model: ":", category: "context.audio", benchmark_score: 1 }));
});

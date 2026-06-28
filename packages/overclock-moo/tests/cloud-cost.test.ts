// cloud-cost.test.ts — cloudUsdAvoided: honest counterfactual pricing.
//
// Guards:
//   • Positive tokens at Haiku tier → a positive USD (never zero, never fabricated).
//   • (null, null) → null (n/d, not fabricated 0).
//   • A local model id passed as tier → null (never mis-price a local as cloud).
//   • (0, 0) → null (no tokens means no cloud cost to claim).
import { test } from "node:test";
import assert from "node:assert";

import { cloudUsdAvoided, CLOUD_AVOIDED_TIER } from "../src/matrix-bridge.ts";

test("cloudUsdAvoided: positive tokens at Haiku → a positive USD (conservative, never fabricated)", () => {
  // 1000 prompt + 500 eval tokens at Haiku price must yield a positive number.
  const result = cloudUsdAvoided(1000, 500);
  assert.ok(result !== null, "expected a number, got null (Haiku price missing from snapshot?)");
  assert.ok(typeof result === "number", `expected number, got ${typeof result}`);
  assert.ok(result > 0, `expected result > 0, got ${result}`);
  // Sanity ceiling: 1500 tokens at Haiku should be well under $0.01.
  assert.ok(result < 0.01, `result ${result} seems inflated for 1500 tokens at Haiku`);
});

test("cloudUsdAvoided: (null, null) → null (n/d, never fabricated 0)", () => {
  const result = cloudUsdAvoided(null, null);
  assert.strictEqual(result, null);
});

test("cloudUsdAvoided: (0, 0) → null (no tokens to price → no cloud cost to claim)", () => {
  // computeCostMicros returns 0 for zero tokens; we map !(micros > 0) → null.
  const result = cloudUsdAvoided(0, 0);
  assert.strictEqual(result, null);
});

test("cloudUsdAvoided: local model id as tier → null (never fabricate a cloud cost for a local model)", () => {
  // qwen3:30b is a local Ollama model; pricing it as a cloud tier would be wrong.
  const result = cloudUsdAvoided(1000, 500, "qwen3:30b");
  assert.strictEqual(result, null, "local model id as tier must return null");
});

test("cloudUsdAvoided: CLOUD_AVOIDED_TIER is 'claude-haiku-4-5' (cheapest → most conservative)", () => {
  // If this changes accidentally, savings claims would be inflated — guard it.
  assert.equal(CLOUD_AVOIDED_TIER, "claude-haiku-4-5");
});

test("cloudUsdAvoided: one-side null treated as 0 (not null) for the known side", () => {
  // (null, 500) → price (0 prompt, 500 eval) → positive if Haiku output price > 0.
  const resultEvalOnly = cloudUsdAvoided(null, 500);
  assert.ok(resultEvalOnly !== null, "(null, 500) should yield a number via 0 prompt fallback");
  assert.ok(typeof resultEvalOnly === "number" && resultEvalOnly > 0, "eval-only tokens should be positive");

  // (1000, null) → price (1000 prompt, 0 eval) → positive if Haiku input price > 0.
  const resultPromptOnly = cloudUsdAvoided(1000, null);
  assert.ok(resultPromptOnly !== null, "(1000, null) should yield a number via 0 eval fallback");
  assert.ok(typeof resultPromptOnly === "number" && resultPromptOnly > 0, "prompt-only tokens should be positive");
});

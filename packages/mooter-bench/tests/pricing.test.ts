import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ASSUMED_INPUT_TOKENS,
  ASSUMED_OUTPUT_TOKENS,
  costForTier,
  estimateSavings,
  type Prediction,
} from "../src/lib.ts";

function pred(id: string, tier: string | null, completed = true): Prediction {
  return { id, predicted_tier: tier, completed };
}

test("costForTier matches 2026-06 list prices with the assumed token profile", () => {
  // 2000 in + 600 out
  assert.equal(ASSUMED_INPUT_TOKENS, 2000);
  assert.equal(ASSUMED_OUTPUT_TOKENS, 600);
  assert.equal(costForTier("T0"), 0); // local = $0
  assert.equal(costForTier("T1"), (2000 * 1 + 600 * 5) / 1e6); // Haiku $1/$5  → $0.005
  assert.equal(costForTier("T2"), (2000 * 3 + 600 * 15) / 1e6); // Sonnet $3/$15 → $0.015
  assert.equal(costForTier("T3"), (2000 * 5 + 600 * 25) / 1e6); // Opus $5/$25  → $0.025
});

test("costForTier honors explicit token counts", () => {
  assert.equal(costForTier("T3", 1_000_000, 0), 5);
  assert.equal(costForTier("T3", 0, 1_000_000), 25);
  assert.equal(costForTier("T1", 1_000_000, 1_000_000), 6);
});

test("estimateSavings: all-T3 routing saves nothing", () => {
  const s = estimateSavings([pred("a", "T3"), pred("b", "T3")]);
  assert.equal(s.baseline_all_t3_usd, 0.05);
  assert.equal(s.routed_usd, 0.05);
  assert.equal(s.saved_usd, 0);
  assert.equal(s.saved_pct, 0);
});

test("estimateSavings: all-T0 routing saves 100%", () => {
  const s = estimateSavings([pred("a", "T0"), pred("b", "T0"), pred("c", "T0")]);
  assert.equal(s.routed_usd, 0);
  assert.equal(s.saved_pct, 100);
});

test("estimateSavings: mixed routing computes the weighted saving", () => {
  // T0 + T1 + T3 → routed = 0 + 0.005 + 0.025 = 0.03; baseline = 0.075
  const s = estimateSavings([pred("a", "T0"), pred("b", "T1"), pred("c", "T3")]);
  assert.equal(s.baseline_all_t3_usd, 0.075);
  assert.equal(s.routed_usd, 0.03);
  assert.equal(s.saved_usd, 0.045);
  assert.equal(s.saved_pct, 60);
});

test("estimateSavings: invalid decisions are costed as T3 (conservative)", () => {
  const s = estimateSavings([pred("a", "T0"), pred("b", null, false)]);
  assert.equal(s.invalid_costed_as_t3, 1);
  assert.equal(s.routed_usd, 0.025); // failed one billed at T3
  assert.equal(s.saved_pct, 50);
});

// cache-aware-cost.test.ts — Wave 60 Block A.
// Run: cd packages/router && npm test   (tsx --test tests/*.test.ts)
//
// Boundary under test: a PURE switching-cost wrapper. It must reuse cost.ts's
// frozen snapshot (never re-implement pricing), be zero when there is nothing to
// lose, scale with the prefix, and never mutate the decide-agent result.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  switchingCostUsd,
  breaksCache,
  annotateSwitchingCost,
  CACHE_READ_MULT,
  CACHE_WRITE_MULT,
  type SessionCacheContext,
} from "../src/cache-aware-cost.ts";
import { computeCostMicros } from "../src/cost.ts";
import type { DecideAgentResult } from "../src/decide-agent.ts";

const OPUS = "claude-opus-4-7"; // priced in the snapshot (5/25)
const HAIKU = "claude-haiku-4-5";
// A model that is GENUINELY pending — the assertion below is about refusing to
// fabricate a price, so the fixture only has to be unpriced, not any specific id.
// Was claude-opus-4-6 until 2026-08-25, when that model was filled from
// tools/router/pricing.js (its "no in-repo source" note had been false since
// 2026-04-16). opus-4-8 has no in-repo price source, so it carries the case now.
const PENDING = "claude-opus-4-8"; // input_per_mtok: null (pricing pending)
const LOCAL = "qwen3:30b";

/** Re-derive the base input price (USD/token) the same way the module does, so
 *  the exact-value test validates integration without hardcoding the snapshot. */
function inputPricePerToken(model: string): number {
  return computeCostMicros(model, 1_000_000, 0) / 1e6 / 1_000_000;
}

describe("switchingCostUsd — zero when nothing to lose", () => {
  const ctx: SessionCacheContext = { established_model: HAIKU, prefix_tokens: 10_000 };

  test("local candidate → 0 (Ollama is free, no cloud cache billing)", () => {
    assert.equal(switchingCostUsd(LOCAL, ctx), 0);
  });
  test("no established model (first turn) → 0", () => {
    assert.equal(switchingCostUsd(OPUS, { established_model: null, prefix_tokens: 10_000 }), 0);
  });
  test("established model was local → 0 (no cloud cache existed)", () => {
    assert.equal(switchingCostUsd(OPUS, { established_model: LOCAL, prefix_tokens: 10_000 }), 0);
  });
  test("candidate === established model → 0 (cache stays warm)", () => {
    assert.equal(switchingCostUsd(OPUS, { established_model: OPUS, prefix_tokens: 10_000 }), 0);
  });
  test("empty / missing prefix → 0", () => {
    assert.equal(switchingCostUsd(OPUS, { established_model: HAIKU, prefix_tokens: 0 }), 0);
    assert.equal(switchingCostUsd(OPUS, { established_model: HAIKU }), 0);
  });
  test("null candidate → 0", () => {
    assert.equal(switchingCostUsd(null, ctx), 0);
  });
  test("pending-price candidate → 0 (no fabrication without a real price)", () => {
    assert.equal(switchingCostUsd(PENDING, { established_model: HAIKU, prefix_tokens: 10_000 }), 0);
  });
});

describe("switchingCostUsd — charged when the model changes mid-session", () => {
  test("switching cloud models with a warm prefix → > 0", () => {
    const cost = switchingCostUsd(OPUS, { established_model: HAIKU, prefix_tokens: 10_000 });
    assert.ok(cost > 0, "abandoning the warm cache has a cost");
  });

  test("exact value = prefix × inputPrice(candidate) × (WRITE − READ)", () => {
    const prefix = 10_000;
    const expected = prefix * inputPricePerToken(OPUS) * (CACHE_WRITE_MULT - CACHE_READ_MULT);
    const got = switchingCostUsd(OPUS, { established_model: HAIKU, prefix_tokens: prefix });
    assert.ok(Math.abs(got - expected) < 1e-9, `got ${got}, expected ${expected}`);
  });

  test("scales linearly with the prefix size", () => {
    const a = switchingCostUsd(OPUS, { established_model: HAIKU, prefix_tokens: 5_000 });
    const b = switchingCostUsd(OPUS, { established_model: HAIKU, prefix_tokens: 10_000 });
    assert.ok(Math.abs(b - 2 * a) < 1e-9, "doubling the prefix doubles the cost");
  });

  test("a pricier model costs more to switch into (same prefix)", () => {
    const toOpus = switchingCostUsd(OPUS, { established_model: HAIKU, prefix_tokens: 10_000 });
    const toHaiku = switchingCostUsd(HAIKU, { established_model: OPUS, prefix_tokens: 10_000 });
    assert.ok(toOpus > toHaiku, "switching into the more expensive model costs more");
  });
});

describe("breaksCache mirrors a positive switching cost", () => {
  test("true when switching cloud models, false when staying / local", () => {
    assert.equal(breaksCache(OPUS, { established_model: HAIKU, prefix_tokens: 10_000 }), true);
    assert.equal(breaksCache(OPUS, { established_model: OPUS, prefix_tokens: 10_000 }), false);
    assert.equal(breaksCache(LOCAL, { established_model: HAIKU, prefix_tokens: 10_000 }), false);
  });
});

describe("annotateSwitchingCost — pure annotation of a decide-agent result", () => {
  const base: DecideAgentResult = {
    chosen_model: OPUS,
    reason: "test",
    tes: 1.0,
    alternatives: [
      { model: HAIKU, score: 0.8, tes: 2.0, cost: 0.0025, why_not: "lower TES" },
      { model: LOCAL, score: 0.7, tes: null, cost: 0, why_not: "lower score" },
    ],
    cited_source: "test",
    coverage_note: "test",
  };
  const ctx: SessionCacheContext = { established_model: HAIKU, prefix_tokens: 10_000 };

  test("annotates chosen + every alternative", () => {
    const out = annotateSwitchingCost(base, ctx);
    assert.ok(out.chosen_switching.switching_cost_usd > 0, "chosen OPUS breaks the HAIKU cache");
    assert.equal(out.chosen_switching.breaks_cache, true);
    const haiku = out.alternatives.find((a) => a.model === HAIKU)!;
    assert.equal(haiku.switching_cost_usd, 0, "staying on HAIKU keeps the cache warm");
    const local = out.alternatives.find((a) => a.model === LOCAL)!;
    assert.equal(local.switching_cost_usd, 0, "local has no cloud cache cost");
  });

  test("does not mutate the input result", () => {
    const snapshot = JSON.stringify(base);
    annotateSwitchingCost(base, ctx);
    assert.equal(JSON.stringify(base), snapshot, "input untouched");
    assert.equal((base as Record<string, unknown>).chosen_switching, undefined);
  });
});

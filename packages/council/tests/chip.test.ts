import { test } from "node:test";
import assert from "node:assert/strict";
import { renderCouncilChip, allOpusBaselineUsd, OPUS_PER_CALL_EST } from "../src/chip.ts";
import type { CouncilVerdict } from "../src/types.ts";

function v(partial: Partial<CouncilVerdict>): CouncilVerdict {
  return {
    recommendation: "r",
    confidence: 0.8,
    consensus: [],
    dissent: [],
    uniqueFindings: [],
    minorityReport: [],
    seats: ["a", "b"],
    judge: null,
    rounds: 1,
    costUsd: 0,
    latencyMs: 1200,
    modelCalls: 9,
    convergence: "CONFIRMED",
    voteScore: 0.9,
    coverageNote: "all-local",
    ...partial,
  };
}

test("chip: all-local council shows $0.00 and saved ~100%", () => {
  const s = renderCouncilChip(v({ costUsd: 0, modelCalls: 9, latencyMs: 1200 }));
  assert.equal(s, "🏛 council 1.2s · $0.00 · saved ~100%");
});

test("chip: paid council shows partial savings", () => {
  const baseline = 9 * OPUS_PER_CALL_EST; // 0.54
  const s = renderCouncilChip(v({ costUsd: baseline / 2, modelCalls: 9 }));
  assert.match(s, /saved ~50%/);
});

test("chip: zero modelCalls → no savings segment", () => {
  const s = renderCouncilChip(v({ modelCalls: 0, costUsd: 0 }));
  assert.ok(!/saved/.test(s));
});

test("allOpusBaselineUsd = modelCalls * per-call estimate", () => {
  assert.equal(allOpusBaselineUsd(v({ modelCalls: 10 }), 0.06), 0.6);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { bestCouncilPerCategory, distillHook } from "../src/distill.ts";
import type { CouncilOutcome } from "../src/pastor.ts";

function out(category: string, changedVerdict: boolean, seats: string[], costUsd = 0): CouncilOutcome {
  return { category, changedVerdict, decisive: true, stable: false, costUsd, seats };
}

test("bestCouncilPerCategory: picks the higher change-rate seat-set", () => {
  const outcomes = [
    out("coding.security", true, ["a", "b", "c"]),
    out("coding.security", true, ["a", "b", "c"]),
    out("coding.security", false, ["x", "y", "z"]),
    out("coding.security", false, ["x", "y", "z"]),
  ];
  const best = bestCouncilPerCategory(outcomes).get("coding.security")!;
  assert.deepEqual(best.seats.sort(), ["a", "b", "c"]);
  assert.equal(best.changeRate, 1);
});

test("bestCouncilPerCategory: ties on change-rate broken by lower cost", () => {
  const outcomes = [
    out("reasoning.math", true, ["a", "b"], 0.5),
    out("reasoning.math", true, ["c", "d"], 0.0),
  ];
  const best = bestCouncilPerCategory(outcomes).get("reasoning.math")!;
  assert.deepEqual(best.seats.sort(), ["c", "d"]); // free wins the tie
});

test("distillHook: low change-rate + enough data → skip (distill)", () => {
  const outcomes = Array.from({ length: 8 }, (_, i) => out("writing.prose-en", i === 0, ["a", "b", "c"]));
  const d = distillHook("writing.prose-en", outcomes);
  assert.equal(d.skip, true);
  assert.ok(d.predictedChange <= 0.2);
  assert.match(d.reason, /distill/);
});

test("distillHook: high change-rate → keep convening", () => {
  const outcomes = Array.from({ length: 8 }, () => out("coding.debug", true, ["a", "b", "c"]));
  const d = distillHook("coding.debug", outcomes);
  assert.equal(d.skip, false);
  assert.ok(d.predictedChange > 0.2);
});

test("distillHook: insufficient data → never skip (honesty over savings)", () => {
  const outcomes = [out("coding.infra", false, ["a", "b", "c"])];
  const d = distillHook("coding.infra", outcomes);
  assert.equal(d.skip, false);
  assert.match(d.reason, /insufficient data/);
});

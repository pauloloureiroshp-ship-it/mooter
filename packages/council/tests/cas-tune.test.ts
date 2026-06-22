import { test } from "node:test";
import assert from "node:assert/strict";
import { autoTuneCasThreshold } from "../src/cas-tune.ts";
import type { CouncilOutcome } from "../src/pastor.ts";

function out(changedVerdict: boolean): CouncilOutcome {
  return { category: "coding.infra", changedVerdict, decisive: true, stable: false, costUsd: 0, seats: ["a", "b", "c"] };
}
const redundant = (n: number) => Array.from({ length: n }, () => out(false));
const valuable = (n: number) => Array.from({ length: n }, () => out(true));

test("auto-tune: below MIN_DATAPOINTS → neutral threshold", () => {
  const r = autoTuneCasThreshold(redundant(3));
  assert.match(r.note, /insufficient data/);
});

test("auto-tune: a redundant history RAISES the threshold (fire less)", () => {
  const r = autoTuneCasThreshold(redundant(20));
  assert.ok(r.threshold >= 0.8, `expected high threshold, got ${r.threshold}`);
  assert.match(r.note, /raised/);
});

test("auto-tune: a value-adding history LOWERS the threshold (fire more)", () => {
  const r = autoTuneCasThreshold(valuable(20));
  assert.ok(r.threshold <= 0.5, `expected low threshold, got ${r.threshold}`);
});

test("LEARNING GATE D: threshold rises as the council becomes redundant over time", () => {
  const early = autoTuneCasThreshold(valuable(10)); // council adds value early
  const later = autoTuneCasThreshold([...valuable(10), ...redundant(15)]); // then becomes redundant
  assert.ok(
    later.threshold > early.threshold,
    `threshold must rise when the council turns redundant: early=${early.threshold} later=${later.threshold}`,
  );
});

test("auto-tune: respects custom min/max bounds", () => {
  const r = autoTuneCasThreshold(redundant(30), { min: 0.5, max: 0.7 });
  assert.ok(r.threshold <= 0.7 && r.threshold >= 0.5);
});

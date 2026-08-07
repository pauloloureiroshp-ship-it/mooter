import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeCAS,
  detectTesTie,
  DEFAULT_CAS_THRESHOLD,
  HIGH_VARIANCE_CATEGORIES,
} from "../src/cas.ts";

test("CAS: no signals → does not convene, score 0", () => {
  const r = computeCAS({});
  assert.equal(r.score, 0);
  assert.equal(r.convene, false);
  assert.equal(r.threshold, DEFAULT_CAS_THRESHOLD);
});

test("CAS: high classifier confidence alone never convenes", () => {
  const r = computeCAS({ confidence: 0.95 });
  assert.equal(r.score, 0);
  assert.equal(r.convene, false);
});

test("CAS: explicit intent overrides everything → always convene, score 1", () => {
  const r = computeCAS({ explicit: true, confidence: 0.99 });
  assert.equal(r.score, 1);
  assert.equal(r.convene, true);
  assert.match(r.reasons[0], /explicit/);
});

test("CAS: high-risk floor alone reaches threshold (0.45 < 0.5 → no; needs a second signal)", () => {
  const onlyFloor = computeCAS({ highRiskFloor: true });
  assert.equal(onlyFloor.score, 0.45);
  assert.equal(onlyFloor.convene, false); // conservative: one signal is not enough

  const floorPlusLowConf = computeCAS({ highRiskFloor: true, confidence: 0.3 });
  assert.ok(floorPlusLowConf.score >= 0.5, `score ${floorPlusLowConf.score}`);
  assert.equal(floorPlusLowConf.convene, true);
});

test("CAS: very low confidence ramps toward full weight", () => {
  const pivotEdge = computeCAS({ confidence: 0.6 }); // == pivot → 0 contribution
  assert.equal(pivotEdge.score, 0);
  const zero = computeCAS({ confidence: 0 }); // full lowConfidence weight (0.5)
  assert.equal(zero.score, 0.5);
  assert.equal(zero.convene, true);
});

test("CAS: TES tie + high-variance category convenes", () => {
  const r = computeCAS({ tesTie: true, category: "coding.security" });
  assert.ok(HIGH_VARIANCE_CATEGORIES.has("coding.security"));
  assert.equal(r.score, Math.round((0.3 + 0.3) * 1000) / 1000);
  assert.equal(r.convene, true);
  assert.ok(r.reasons.some((x) => /TES tie/.test(x)));
  assert.ok(r.reasons.some((x) => /high-variance/.test(x)));
});

test("CAS: low-variance category does not add weight", () => {
  const r = computeCAS({ tesTie: true, category: "writing.prose-en" });
  assert.equal(r.score, 0.3);
  assert.equal(r.convene, false);
});

test("CAS: score is capped at 1", () => {
  const r = computeCAS({
    highRiskFloor: true,
    confidence: 0,
    tesTie: true,
    highVarianceCategory: true,
  });
  assert.equal(r.score, 1);
});

test("CAS: custom threshold is honored", () => {
  const r = computeCAS({ highRiskFloor: true }, { threshold: 0.4 });
  assert.equal(r.convene, true); // 0.45 >= 0.4
});

test("detectTesTie: null scores are never a tie (no fabrication)", () => {
  assert.equal(detectTesTie(null, 0.8), false);
  assert.equal(detectTesTie(0.8, null), false);
  assert.equal(detectTesTie(0.8, 0.79), true);
  assert.equal(detectTesTie(0.8, 0.7), false);
  assert.equal(detectTesTie(0.8, 0.75, 0.06), true);
});

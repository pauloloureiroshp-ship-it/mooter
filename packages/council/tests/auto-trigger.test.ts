import { test } from "node:test";
import assert from "node:assert/strict";
import { autoTrigger, casSignalsFromClassify, isExplicitCouncil } from "../src/auto-trigger.ts";

test("isExplicitCouncil detects @council / /moo-council / effort:beast", () => {
  assert.ok(isExplicitCouncil("please @council this"));
  assert.ok(isExplicitCouncil("/moo-council now"));
  assert.ok(isExplicitCouncil("effort: beast mode"));
  assert.ok(!isExplicitCouncil("just a normal prompt"));
  assert.ok(!isExplicitCouncil(undefined));
});

test("casSignalsFromClassify maps high risk → highRiskFloor", () => {
  const s = casSignalsFromClassify({ confidence: 0.9, tier: "T3", risk: "high", task_category: "coding.infra" });
  assert.equal(s.highRiskFloor, true);
  assert.equal(s.category, "coding.infra");
});

test("autoTrigger: high-risk floor auto-convenes regardless of score", () => {
  // high confidence + low-variance category would NOT convene on its own,
  // but a deploy/secrets/migration floor must auto-convene.
  const r = autoTrigger({ confidence: 0.95, tier: "T3", risk: "high", task_category: "coding.infra", prompt: "deploy to prod" });
  assert.equal(r.convene, true);
  assert.equal(r.autoConvened, true);
  assert.ok(r.reasons.some((x) => /auto-convene before dangerous action/.test(x)));
});

test("autoTrigger: safe prompt does not convene", () => {
  const r = autoTrigger({ confidence: 0.95, tier: "T0", risk: "low", task_category: "writing.prose-en" });
  assert.equal(r.convene, false);
  assert.equal(r.autoConvened, false);
});

test("autoTrigger: low confidence + high-variance category convenes by score (not auto)", () => {
  const r = autoTrigger({ confidence: 0.2, tier: "T2", risk: "medium", task_category: "coding.security" });
  assert.equal(r.convene, true);
  assert.equal(r.autoConvened, false, "convened by CAS score, not the high-risk auto-path");
});

test("autoTrigger: explicit @council convenes even when otherwise safe", () => {
  const r = autoTrigger({ confidence: 0.99, tier: "T0", risk: "low", task_category: "writing.prose-en", prompt: "@council should we ship?" });
  assert.equal(r.convene, true);
});

test("autoTrigger: highRiskAutoConvene=false falls back to CAS score for high risk", () => {
  const r = autoTrigger(
    // coding.frontend is NOT high-variance, so the floor (0.45) alone is below 0.5
    { confidence: 0.95, tier: "T3", risk: "high", task_category: "coding.frontend" },
    { highRiskAutoConvene: false },
  );
  // floor weight 0.45 alone < 0.5 threshold → no convene when auto disabled
  assert.equal(r.convene, false);
  assert.equal(r.autoConvened, false);
});

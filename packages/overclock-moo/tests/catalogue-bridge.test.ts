// catalogue-bridge.test.ts — asymmetry-safe registry + READ-ONLY matrix bridge.
import { test } from "node:test";
import assert from "node:assert";

import { ASYMMETRY_SAFE_KINDS, CATALOGUE, discoverPendingJobs, makeJob } from "../src/job-catalogue.ts";
import { DEFAULT_LOCAL_MODELS, defaultSelectModel } from "../src/matrix-bridge.ts";

test("every catalogue kind is asymmetry-safe (bricks/verification, never the piano)", () => {
  for (const kind of Object.keys(CATALOGUE)) {
    assert.ok(ASYMMETRY_SAFE_KINDS.has(kind as never), `${kind} must be asymmetry-safe`);
  }
  // The set is exactly the catalogue — no smuggling in unsafe kinds.
  assert.equal(ASYMMETRY_SAFE_KINDS.size, Object.keys(CATALOGUE).length);
});

test("CPU entries are deterministic verification (no LLM); GPU entries draft+gate", () => {
  assert.equal(CATALOGUE["run-tests"].resource, "cpu");
  assert.equal(CATALOGUE["run-tests"].needsLLM, false);
  assert.equal(CATALOGUE["commit-msg"].resource, "gpu");
  assert.equal(CATALOGUE["commit-msg"].needsLLM, true);
  // Every kind declares a deterministic gate (gates always — §3 guard).
  for (const e of Object.values(CATALOGUE)) {
    assert.ok(["test", "types", "lint", "compile", "exec"].includes(e.gate));
  }
});

test("makeJob fills defaults from the catalogue and defaults pending=true", () => {
  const j = makeJob("t", "run-tests");
  assert.equal(j.category, "coding.test");
  assert.equal(j.humanMinutes, 3);
  assert.equal(j.resource, "cpu");
  assert.equal(j.pending, true);
  assert.equal(makeJob("t2", "run-tests", { pending: false }).pending, false);
});

test("discoverPendingJobs returns an array (no invented work when no diff/git)", () => {
  const jobs = discoverPendingJobs("/definitely/not/a/repo/path");
  assert.ok(Array.isArray(jobs));
  assert.equal(jobs.length, 0); // no git there → no jobs (honest IDLE upstream)
});

// ── READ-ONLY matrix integration: proves the bridge to packages/router works ──
test("defaultSelectModel: local pick is FREE (tes-calculator) and never fabricates a score", () => {
  const pick = defaultSelectModel("coding.test", DEFAULT_LOCAL_MODELS);
  assert.ok(DEFAULT_LOCAL_MODELS.includes(pick.model as never));
  // Local models cost $0 — tes-calculator must label them "free" (the $0 proof).
  assert.equal(pick.priceStatus, "free");
  // Honest: a measured cell yields a number; an unmeasured (sparse) cell yields
  // null + modelSource "default" — but NEVER a made-up score.
  if (pick.modelSource === "matrix") {
    assert.equal(typeof pick.qualityScore, "number");
  } else {
    assert.equal(pick.qualityScore, null);
  }
});

test("defaultSelectModel: unknown category degrades to default, not a crash", () => {
  const pick = defaultSelectModel("totally.unknown.category", DEFAULT_LOCAL_MODELS);
  assert.equal(pick.modelSource, "default");
  assert.equal(pick.qualityScore, null);
});

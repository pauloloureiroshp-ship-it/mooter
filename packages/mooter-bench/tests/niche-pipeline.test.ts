// niche-pipeline.test.ts — Unit tests for WN1 niche pipeline additive components.
// Does NOT spawn classify.js (subprocess tests live in a separate integration suite).
// Tests the safety-floor logic, latency aggregation, and holdout dataset validity.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyNicheSafetyFloor,
  aggregateLatency,
  SAFETY_FLOOR_CATEGORIES,
  type LatencyProbe,
} from "../src/niche-pipeline.ts";
import { validateDataset } from "../src/lib.ts";

const PKG_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

// ---------------------------------------------------------------------------
// Safety floor unit tests
// ---------------------------------------------------------------------------

test("applyNicheSafetyFloor: non-safety category passes through unchanged", () => {
  const result = applyNicheSafetyFloor("T1", "trivial-edit");
  assert.equal(result.tier, "T1");
  assert.equal(result.fired, false);
});

test("applyNicheSafetyFloor: T3 input never fires (already at floor)", () => {
  for (const cat of SAFETY_FLOOR_CATEGORIES) {
    const result = applyNicheSafetyFloor("T3", cat);
    assert.equal(result.tier, "T3", `category ${cat} should not flip T3 to T3`);
    assert.equal(result.fired, false, `category ${cat} should not fire when already T3`);
  }
});

test("applyNicheSafetyFloor: null input passes through (classifier failed)", () => {
  const result = applyNicheSafetyFloor(null, "security");
  assert.equal(result.tier, null);
  assert.equal(result.fired, false);
});

test("applyNicheSafetyFloor: security category at T0 → T3, fired=true", () => {
  const result = applyNicheSafetyFloor("T0", "security");
  assert.equal(result.tier, "T3");
  assert.equal(result.fired, true);
});

test("applyNicheSafetyFloor: security category at T1 → T3, fired=true", () => {
  const result = applyNicheSafetyFloor("T1", "security");
  assert.equal(result.tier, "T3");
  assert.equal(result.fired, true);
});

test("applyNicheSafetyFloor: security category at T2 → T3, fired=true", () => {
  const result = applyNicheSafetyFloor("T2", "security");
  assert.equal(result.tier, "T3");
  assert.equal(result.fired, true);
});

test("applyNicheSafetyFloor: architecture at T1 → T3, fired=true", () => {
  const result = applyNicheSafetyFloor("T1", "architecture");
  assert.equal(result.tier, "T3");
  assert.equal(result.fired, true);
});

test("applyNicheSafetyFloor: pre-merge-review at T2 → T3, fired=true", () => {
  const result = applyNicheSafetyFloor("T2", "pre-merge-review");
  assert.equal(result.tier, "T3");
  assert.equal(result.fired, true);
});

test("applyNicheSafetyFloor: ci-config at T1 → T3, fired=true", () => {
  const result = applyNicheSafetyFloor("T1", "ci-config");
  assert.equal(result.tier, "T3");
  assert.equal(result.fired, true);
});

test("applyNicheSafetyFloor: refactor-multi-file at T2 → T3, fired=true", () => {
  const result = applyNicheSafetyFloor("T2", "refactor-multi-file");
  assert.equal(result.tier, "T3");
  assert.equal(result.fired, true);
});

test("applyNicheSafetyFloor: bug-investigation (not in safety set) → unchanged at T2", () => {
  const result = applyNicheSafetyFloor("T2", "bug-investigation");
  assert.equal(result.tier, "T2");
  assert.equal(result.fired, false);
});

test("applyNicheSafetyFloor: docs category → unchanged at T0", () => {
  const result = applyNicheSafetyFloor("T0", "docs");
  assert.equal(result.tier, "T0");
  assert.equal(result.fired, false);
});

// ---------------------------------------------------------------------------
// Latency aggregation unit tests
// ---------------------------------------------------------------------------

test("aggregateLatency: empty probes return zeros", () => {
  const summary = aggregateLatency([]);
  assert.equal(summary.global_p50_ms, 0);
  assert.equal(summary.global_p99_ms, 0);
  assert.equal(summary.fraction_under_50ms, 0);
  assert.deepEqual(summary.per_prompt, []);
});

test("aggregateLatency: single probe with known samples computes correct percentiles", () => {
  const probes: LatencyProbe[] = [
    { id: "test-1", samples_ms: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100], p50_ms: 55, p99_ms: 100 },
  ];
  const summary = aggregateLatency(probes);
  // p50 = 50th percentile of [10,20,30,40,50,60,70,80,90,100] sorted = ceil(10*0.5)-1 = 4 → 50
  assert.equal(summary.global_p50_ms, 50);
  // fraction under 50ms: 4 samples (10,20,30,40) out of 10 = 0.4
  assert.equal(summary.fraction_under_50ms, 0.4);
});

test("aggregateLatency: all-fast samples give fraction_under_50ms = 1.0", () => {
  const probes: LatencyProbe[] = [
    { id: "fast-1", samples_ms: [5, 8, 12, 15, 20], p50_ms: 12, p99_ms: 20 },
    { id: "fast-2", samples_ms: [3, 7, 9, 11, 18], p50_ms: 9, p99_ms: 18 },
  ];
  const summary = aggregateLatency(probes);
  assert.equal(summary.fraction_under_50ms, 1.0);
});

test("aggregateLatency: multi-probe merges all samples for global stats", () => {
  // Two probes: [10, 90] and [20, 80] → all = [10, 20, 80, 90]
  const probes: LatencyProbe[] = [
    { id: "p1", samples_ms: [10, 90], p50_ms: 50, p99_ms: 90 },
    { id: "p2", samples_ms: [20, 80], p50_ms: 50, p99_ms: 80 },
  ];
  const summary = aggregateLatency(probes);
  // sorted: [10, 20, 80, 90] — p50 = ceil(4*0.5)-1=1 → 20
  assert.equal(summary.global_p50_ms, 20);
  // p99 = ceil(4*0.99)-1=3 → 90
  assert.equal(summary.global_p99_ms, 90);
  // under 50ms: 10, 20 = 2/4 = 0.5
  assert.equal(summary.fraction_under_50ms, 0.5);
});

// ---------------------------------------------------------------------------
// Holdout dataset structural tests
// ---------------------------------------------------------------------------

test("niche-holdout.json: is valid JSON and passes validateDataset", () => {
  const datasetPath = join(PKG_DIR, "dataset", "niche-holdout.json");
  const raw = JSON.parse(readFileSync(datasetPath, "utf8")) as { workflows?: unknown; sealed?: boolean };
  assert.equal(raw.sealed, true, "holdout must be marked sealed:true");
  assert.doesNotThrow(() => validateDataset(raw.workflows), "validateDataset must pass");
});

test("niche-holdout.json: all expected_tier values are T0|T1|T2|T3", () => {
  const datasetPath = join(PKG_DIR, "dataset", "niche-holdout.json");
  const raw = JSON.parse(readFileSync(datasetPath, "utf8")) as { workflows: Array<{ expected_tier: string; id: string }> };
  for (const w of raw.workflows) {
    assert.ok(
      ["T0", "T1", "T2", "T3"].includes(w.expected_tier),
      `entry ${w.id}: unexpected tier "${w.expected_tier}"`,
    );
  }
});

test("niche-holdout.json: no prompt duplicates the general workflows.json", () => {
  const holdout = JSON.parse(
    readFileSync(join(PKG_DIR, "dataset", "niche-holdout.json"), "utf8"),
  ) as { workflows: Array<{ prompt: string }> };
  const general = JSON.parse(
    readFileSync(join(PKG_DIR, "dataset", "workflows.json"), "utf8"),
  ) as { workflows: Array<{ prompt: string }> };

  const generalPrompts = new Set(general.workflows.map((w) => w.prompt.trim().toLowerCase()));
  for (const w of holdout.workflows) {
    assert.ok(
      !generalPrompts.has(w.prompt.trim().toLowerCase()),
      `holdout prompt overlaps with general dataset: "${w.prompt.slice(0, 60)}…"`,
    );
  }
});

test("niche-holdout.json: T3 entries all use HIGH_RISK categories", () => {
  // Every T3 entry in the holdout must belong to a category that should hit T3.
  // This tests that the gold labels are self-consistent with our doctrine.
  const EXPECTED_T3_CATEGORIES = new Set([
    "security", "architecture", "pre-merge-review", "ci-config", "refactor-multi-file"
  ]);
  const datasetPath = join(PKG_DIR, "dataset", "niche-holdout.json");
  const raw = JSON.parse(readFileSync(datasetPath, "utf8")) as {
    workflows: Array<{ id: string; expected_tier: string; category: string }>
  };
  for (const w of raw.workflows) {
    if (w.expected_tier === "T3") {
      assert.ok(
        EXPECTED_T3_CATEGORIES.has(w.category),
        `T3 entry ${w.id} has category "${w.category}" which is not in the expected T3 category set`,
      );
    }
  }
});

test("niche-holdout.json: IDs are unique and follow the nh-NNN pattern", () => {
  const datasetPath = join(PKG_DIR, "dataset", "niche-holdout.json");
  const raw = JSON.parse(readFileSync(datasetPath, "utf8")) as {
    workflows: Array<{ id: string }>
  };
  const ids = new Set<string>();
  for (const w of raw.workflows) {
    assert.ok(/^nh-\d{3}$/.test(w.id), `id "${w.id}" does not match nh-NNN pattern`);
    assert.ok(!ids.has(w.id), `duplicate id "${w.id}"`);
    ids.add(w.id);
  }
});

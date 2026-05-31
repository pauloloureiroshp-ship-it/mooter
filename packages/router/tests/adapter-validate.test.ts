// Wave 5 D2 — adapter validation pipeline + benchmark metrics. tsx --test.

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildManifest, adapterIdFromContent, type AdapterManifestV1 } from "../src/adapter/adapter_manifest.ts";
import { validateAdapter, verifyManifestSignature, computeBenchmarkMetrics } from "../src/adapter/validate.ts";

const SECRET = "validate-secret";
function manifest(extra: Partial<AdapterManifestV1> = {}): AdapterManifestV1 {
  return buildManifest({
    schema_version: 1,
    adapter_id: adapterIdFromContent("gguf"),
    name: "diagram-v1",
    base_model: "qwen2.5:3b",
    adapter_type: "lora",
    quantization: "q4_k_m",
    source: "user-provided",
    installed_at_utc: "2026-05-31T18:00:00Z",
    file_path_pseudonymous: "path:abc",
    ...extra,
  }, SECRET);
}
const modelPresent = async () => true;
const modelAbsent = async () => false;

test("validateAdapter: valid + signature + model present → valid, no warnings", async () => {
  const v = await validateAdapter(manifest(), SECRET, modelPresent);
  assert.equal(v.valid, true, v.errors.join("; "));
  assert.equal(v.warnings.length, 0);
});

test("validateAdapter: missing base model → WARNING not error", async () => {
  const v = await validateAdapter(manifest(), SECRET, modelAbsent);
  assert.equal(v.valid, true, "missing model is a warning, still valid");
  assert.ok(v.warnings.some((w) => /not loaded in Ollama/.test(w)));
});

test("validateAdapter: wrong secret → signature error", async () => {
  const v = await validateAdapter(manifest(), "wrong", modelPresent);
  assert.equal(v.valid, false);
  assert.ok(v.errors.some((e) => /signature/.test(e)));
});

test("validateAdapter: performance without benchmark_run_id → error (D1 honesty rule)", async () => {
  const m = manifest({ performance: { benchmark_run_id: "", accuracy_delta: 0.9, inference_speed_factor: 1, measured_at_utc: "x" } });
  const v = await validateAdapter(m, SECRET, modelPresent);
  assert.equal(v.valid, false);
  assert.ok(v.errors.some((e) => /benchmark_run_id/.test(e)));
});

test("verifyManifestSignature: delegates to D1 verifyManifest (natural order)", () => {
  assert.equal(verifyManifestSignature(manifest(), SECRET), true);
  assert.equal(verifyManifestSignature(manifest(), "nope"), false);
});

test("computeBenchmarkMetrics: real accuracy deltas, no fabrication", () => {
  const rows = [
    { prompt: "a", expected: "T3", baseline: "T0", adapter: "T3" }, // baseline miss, adapter hit
    { prompt: "b", expected: "T2", baseline: "T2", adapter: "T2" }, // both hit
    { prompt: "c", expected: "T3", baseline: "T0", adapter: "T0" }, // both miss
  ];
  const m = computeBenchmarkMetrics(rows);
  assert.equal(m.n, 3);
  assert.ok(Math.abs(m.baseline_accuracy - 1 / 3) < 1e-9);
  assert.ok(Math.abs(m.adapter_accuracy - 2 / 3) < 1e-9);
  assert.equal(m.accuracy_delta, 0.333);
  assert.deepEqual(computeBenchmarkMetrics([]), { baseline_accuracy: 0, adapter_accuracy: 0, accuracy_delta: 0, n: 0 });
});

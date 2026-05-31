// Wave 5 D1 — mooter_adapter manifest v1. tsx --test.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildManifest, verifyManifest, validateManifest, adapterIdFromContent, pseudonymizePath,
  ADAPTER_SCHEMA_VERSION, type AdapterManifestV1,
} from "../src/adapter/adapter_manifest.ts";

const SECRET = "adapter-secret";
function base(): Omit<AdapterManifestV1, "signature"> {
  return {
    schema_version: ADAPTER_SCHEMA_VERSION,
    adapter_id: adapterIdFromContent("fake-gguf-bytes"),
    name: "diagram-systems-v1",
    domain: "diagram-systems",
    base_model: "qwen2.5:3b",
    adapter_type: "lora",
    quantization: "q4_k_m",
    source: "user-provided",
    installed_at_utc: "2026-05-31T18:00:00Z",
    file_path_pseudonymous: pseudonymizePath("/home/paulo/.mooter/adapters/x/adapter.gguf"),
  };
}

test("adapterIdFromContent: stable, truncated sha256", () => {
  const a = adapterIdFromContent("abc");
  assert.equal(a, adapterIdFromContent("abc"));
  assert.equal(a.length, 32);
  assert.notEqual(a, adapterIdFromContent("abd"));
});

test("pseudonymizePath: never leaks the raw path", () => {
  const p = pseudonymizePath("/home/paulo/secret/path/adapter.gguf");
  assert.ok(p.startsWith("path:"));
  assert.ok(!p.includes("/home/paulo"));
});

test("build + verify roundtrip; tamper detection", () => {
  const m = buildManifest(base(), SECRET);
  assert.equal(verifyManifest(m, SECRET), true);
  assert.equal(verifyManifest(m, "wrong"), false);
  assert.equal(verifyManifest({ ...m, name: "tampered" }, SECRET), false);
});

test("validate: clean manifest passes", () => {
  const v = validateManifest(buildManifest(base(), SECRET));
  assert.equal(v.valid, true, v.errors.join("; "));
});

test("validate: rejects invalid type / quant / source", () => {
  assert.ok(!validateManifest(buildManifest({ ...base(), adapter_type: "magic" as any }, SECRET)).valid);
  assert.ok(!validateManifest(buildManifest({ ...base(), quantization: "q2" as any }, SECRET)).valid);
});

test("honesty: performance present without benchmark_run_id is rejected", () => {
  const bad = buildManifest({ ...base(), performance: { benchmark_run_id: "", accuracy_delta: 0.5, inference_speed_factor: 1, measured_at_utc: "x" } }, SECRET);
  const v = validateManifest(bad);
  assert.equal(v.valid, false);
  assert.ok(v.errors.some((e) => /benchmark_run_id/.test(e)), "no unbenchmarked accuracy claims");
});

test("honesty: performance WITH benchmark_run_id is allowed", () => {
  const ok = buildManifest({ ...base(), performance: { benchmark_run_id: "bench-1", accuracy_delta: 0.05, inference_speed_factor: 0.98, measured_at_utc: "2026-05-31T18:00:00Z" } }, SECRET);
  assert.equal(validateManifest(ok).valid, true);
});

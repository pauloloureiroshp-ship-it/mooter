// Wave 24 24.F — `mooter env-detect`. node:test + tsx.
// Covers the pure hw_tier mapping and the command's two output modes. The live
// probe (nvidia-smi / system_profiler) is environment-dependent, so we assert
// on the deterministic tier-classification logic + the rendered shape.

import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyHwTier, runEnvDetect, probeEnv } from "../src/commands/env-detect.ts";

test("classifyHwTier: NVIDIA 24GB (RTX 4090) → gpu-high", () => {
  assert.equal(classifyHwTier("nvidia", 24564), "gpu-high");
  assert.equal(classifyHwTier("nvidia", 20480), "gpu-high");
});

test("classifyHwTier: NVIDIA mid/low VRAM boundaries", () => {
  assert.equal(classifyHwTier("nvidia", 12288), "gpu-mid");
  assert.equal(classifyHwTier("nvidia", 8192), "gpu-mid");
  assert.equal(classifyHwTier("nvidia", 6144), "gpu-low");
  assert.equal(classifyHwTier("nvidia", 4096), "gpu-low");
  assert.equal(classifyHwTier("nvidia", 2048), "cpu-only");
});

test("classifyHwTier: Apple Silicon → apple-silicon (never mislabelled as nvidia)", () => {
  assert.equal(classifyHwTier("apple", null), "apple-silicon");
  // A Windows RTX 4090 must NOT classify as apple-silicon (the C4 bug).
  assert.notEqual(classifyHwTier("nvidia", 24564), "apple-silicon");
});

test("classifyHwTier: cpu / amd vendors fall back to cpu-only", () => {
  assert.equal(classifyHwTier("cpu", null), "cpu-only");
  assert.equal(classifyHwTier("amd", null), "cpu-only");
});

test("runEnvDetect --json: parseable, required fields present", () => {
  const res = runEnvDetect({ json: true });
  assert.equal(res.exitCode, 0);
  const obj = JSON.parse(res.output);
  for (const k of ["os", "hw_tier", "gpu_vendor", "instance_id"]) {
    assert.ok(k in obj, `missing field: ${k}`);
  }
  // instance_id is an 8-hex per-machine id.
  assert.match(obj.instance_id, /^[a-f0-9]{8}$/);
  // hw_tier is one of the known tiers.
  assert.match(obj.hw_tier, /^(gpu-high|gpu-mid|gpu-low|apple-silicon|cpu-only)$/);
});

test("runEnvDetect text: shows hw_tier, both identifiers, and cross-machine note", () => {
  const out = runEnvDetect({}).output;
  assert.match(out, /hw_tier/);
  assert.match(out, /instance_id/);
  assert.match(out, /user_id_hash/);
  assert.match(out, /deduped by user_id_hash/);
  // probeEnv and the text command agree on the tier.
  assert.match(out, new RegExp(probeEnv().hw_tier));
});

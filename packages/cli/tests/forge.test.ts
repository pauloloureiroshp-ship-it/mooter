// Wave 5 D2 — `mooter forge` install + benchmark. node:test + tsx.
// No real Ollama: checkModel + classifyImpl are injected. Real fs on temp dirs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runForgeInstall, runForgeBenchmark } from "../src/commands/forge.ts";
import { verifyManifest } from "../../router/src/adapter/adapter_manifest.ts";

const SECRET = "forge-secret";
function home(): string {
  return mkdtempSync(join(tmpdir(), "mooter-forge-"));
}
function gguf(h: string, name = "adapter.gguf", bytes = "FAKE-GGUF-BYTES"): string {
  const p = join(h, name);
  writeFileSync(p, bytes);
  return p;
}

test("install: rejects non-.gguf files", async () => {
  const h = home();
  writeFileSync(join(h, "x.bin"), "x");
  const res = await runForgeInstall({ ggufPath: join(h, "x.bin"), name: "x", baseModel: "qwen2.5:3b", mooterHome: h, secret: SECRET, checkModel: async () => true });
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /Not a \.gguf/);
});

test("install: valid .gguf → signed manifest + adapter.gguf copied", async () => {
  const h = home();
  const res = await runForgeInstall({
    ggufPath: gguf(h, "diagram.q4_k_m.gguf"), name: "diagram-v1", baseModel: "qwen2.5:3b",
    type: "lora", domain: "diagram-systems", mooterHome: h, secret: SECRET, nowIso: "2026-05-31T18:00:00Z",
    checkModel: async () => true,
  });
  assert.equal(res.exitCode, 0, res.output);
  assert.match(res.output, /Installed adapter "diagram-v1"/);
  assert.match(res.output, /not measured yet/);
  // manifest written, signed, valid; adapter.gguf copied; quant auto-detected
  const dir = join(h, "adapters");
  const entries = readdirSync(dir);
  const manifest = JSON.parse(readFileSync(join(dir, entries[0], "manifest.json"), "utf8"));
  assert.equal(manifest.quantization, "q4_k_m");
  assert.equal(verifyManifest(manifest, SECRET), true, "manifest is validly signed");
  assert.ok(existsSync(join(dir, entries[0], "adapter.gguf")), "gguf copied");
});

test("install: base model absent → warning (still installs)", async () => {
  const h = home();
  const res = await runForgeInstall({ ggufPath: gguf(h), name: "x", baseModel: "missing:1b", mooterHome: h, secret: SECRET, checkModel: async () => false });
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /not loaded in Ollama/);
});

test("benchmark: golden + mocked classify → REAL metrics written to manifest", async () => {
  const h = home();
  await runForgeInstall({ ggufPath: gguf(h), name: "diagram-v1", baseModel: "qwen2.5:3b", mooterHome: h, secret: SECRET, checkModel: async () => true });
  const id = readdirSync(join(h, "adapters"))[0];
  // mock classify: baseline under-tiers (T0), adapter meets the floor (returns the floor)
  const classifyImpl = (_p: string, model: string) => (model === "diagram-v1" ? "T3" : "T0");
  const golden = [{ text: "design a sharding strategy", expected_min_tier: "T3" }, { text: "review x", expected_min_tier: "T2" }];
  const res = await runForgeBenchmark({ id, mooterHome: h, secret: SECRET, classifyImpl, goldenSet: golden, nowIso: "2026-05-31T19:00:00Z", checkModel: async () => true });
  assert.equal(res.exitCode, 0, res.output);
  assert.match(res.output, /Benchmark complete/);
  assert.match(res.output, /accuracy_delta:/);
  const manifest = JSON.parse(readFileSync(join(h, "adapters", id, "manifest.json"), "utf8"));
  assert.ok(manifest.performance, "performance written");
  assert.ok(manifest.performance.benchmark_run_id, "benchmark_run_id present (real run)");
  assert.equal(verifyManifest(manifest, SECRET), true, "re-signed after updating performance");
});

test("benchmark: inference_speed_factor is MEASURED (injected clock), not a hardcoded 1.0", async () => {
  const h = home();
  await runForgeInstall({ ggufPath: gguf(h), name: "v1", baseModel: "qwen2.5:3b", mooterHome: h, secret: SECRET, checkModel: async () => true });
  const id = readdirSync(join(h, "adapters"))[0];
  // clock: baseline call Δ10ms, adapter call Δ20ms → ratio 2.0
  let calls = 0;
  const ticks = [0, 10, 10, 30];
  const clock = () => ticks[Math.min(calls++, ticks.length - 1)];
  const res = await runForgeBenchmark({ id, mooterHome: h, secret: SECRET, classifyImpl: () => "T0", goldenSet: [{ text: "x", expected_min_tier: "T0" }], clock, nowIso: "2026-05-31T19:00:00Z" });
  assert.equal(res.exitCode, 0);
  const manifest = JSON.parse(readFileSync(join(h, "adapters", id, "manifest.json"), "utf8"));
  assert.equal(manifest.performance.inference_speed_factor, 2, "measured ratio (20ms/10ms), not a fabricated 1.0");
});

test("benchmark: adapter not found → exit 1", async () => {
  const res = await runForgeBenchmark({ id: "nope", mooterHome: home(), secret: SECRET, classifyImpl: () => "T0", goldenSet: [{ text: "x", expected_min_tier: "T0" }] });
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /not found/);
});

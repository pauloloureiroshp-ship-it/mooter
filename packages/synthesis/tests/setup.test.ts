import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildProfile,
  classifyOs,
  deriveSubscriptionTier,
  recommendForSetup,
  recommendationLines,
  explainSetup,
  type RawDetect,
} from "../src/index.ts";

function makeRaw(over: Partial<RawDetect> = {}): RawDetect {
  return {
    platform: "linux",
    arch: "x64",
    os_release: "",
    node_version: "v20.20.2",
    python_version: "Python 3.11.0",
    docker_version: null,
    ollama_version: "ollama version 0.5.2",
    ollama_models: ["qwen2.5-coder:7b", "qwen3:30b"],
    gpu: { vendor: "nvidia", name: "rtx 4090", vramMB: 24576, platform: "linux" },
    hw_tier: "gpu-high",
    vram: { used_mb: 2048, total_mb: 24576 },
    hardware_matcher: null,
    subscriptions: { anthropic: "max", openai: "none", codex_cli: "none", gemini: "none", ollama: "installed" },
    ...over,
  };
}

test("classifyOs handles wsl2/linux/darwin/windows", () => {
  assert.equal(classifyOs("linux", "Linux version 6.6 microsoft-standard-WSL2"), "wsl2");
  assert.equal(classifyOs("linux", "Linux version 6.6 generic"), "linux");
  assert.equal(classifyOs("darwin", ""), "darwin");
  assert.equal(classifyOs("win32", ""), "windows");
});

test("deriveSubscriptionTier maps plans correctly", () => {
  assert.equal(deriveSubscriptionTier({ anthropic: "max", openai: "none", codex_cli: "none", gemini: "none", ollama: "none" }), "claude-max");
  assert.equal(deriveSubscriptionTier({ anthropic: "pro", openai: "none", codex_cli: "none", gemini: "none", ollama: "none" }), "claude-pro");
  assert.equal(deriveSubscriptionTier({ anthropic: "none", openai: "api-paid", codex_cli: "none", gemini: "none", ollama: "none" }), "multi");
  assert.equal(deriveSubscriptionTier({ anthropic: "none", openai: "none", codex_cli: "none", gemini: "none", ollama: "installed" }), "none");
});

test("buildProfile (nvidia) derives class, tier, ≥20 datapoints", () => {
  const p = buildProfile(makeRaw(), "2026-06-07T00:00:00.000Z");
  assert.equal(p.hardware.hardware_class, "nvidia-rtx-4090");
  assert.equal(p.hardware.hw_tier, "gpu-high");
  assert.equal(p.hardware.has_npu, false);
  assert.equal(p.hardware.vram_total_gb, 24);
  assert.equal(p.subscriptions.subscription_tier, "claude-max");
  assert.equal(p.derived.can_run_local_llm, true);
  const datapoints =
    Object.keys(p.hardware).length + Object.keys(p.software).length + Object.keys(p.subscriptions).length + Object.keys(p.derived).length;
  assert.ok(datapoints >= 20, `expected ≥20 datapoints, got ${datapoints}`);
});

test("buildProfile (apple silicon) flags NPU + recommends qwen3:30b", () => {
  const p = buildProfile(
    makeRaw({ platform: "darwin", arch: "arm64", gpu: { vendor: "apple", name: "Apple M5", vramMB: null, platform: "darwin" }, hw_tier: "apple-silicon", vram: { used_mb: -1, total_mb: 49152 } }),
  );
  assert.equal(p.hardware.hardware_class, "apple-silicon");
  assert.equal(p.hardware.has_npu, true);
  assert.equal(p.derived.recommended_local_model, "qwen3:30b");
  assert.equal(p.hardware.vram_used_gb, null); // shared memory (-1)
});

test("recommendForSetup: apple → MLX; no models → pull (priority 1); none sub → caveman", () => {
  const apple = buildProfile(makeRaw({ platform: "darwin", arch: "arm64", gpu: { vendor: "apple", name: "Apple M5", vramMB: null, platform: "darwin" }, hw_tier: "apple-silicon" }));
  const recsA = recommendForSetup(apple);
  assert.ok(recsA.some((r) => r.id === "mlx-backend"));

  const noModels = buildProfile(makeRaw({ ollama_models: [], subscriptions: { anthropic: "none", openai: "none", codex_cli: "none", gemini: "none", ollama: "installed" } }));
  const recsN = recommendForSetup(noModels);
  const pull = recsN.find((r) => r.id === "pull-local-model");
  assert.ok(pull, "pull-local-model present");
  assert.equal(pull!.priority, 1);
  assert.ok(recsN.some((r) => r.id === "caveman-pack"));
});

test("explainSetup renders the profile + recommendations", () => {
  const p = buildProfile(makeRaw());
  const out = explainSetup(p, recommendationLines(recommendForSetup(p)));
  assert.ok(out.includes("Your Mooter Setup Profile"));
  assert.ok(out.includes("nvidia-rtx-4090"));
  assert.ok(out.includes("Subscriptions: claude-max"));
});

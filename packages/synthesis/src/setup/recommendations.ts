// L14 A.3 — Setup Recommendations engine (`mooter setup recommend`).
//
// Rule-based, profile-only recommendations (deterministic, no catalog needed).
// Catalog-ranked, per-item recommendations live in L15 (ecosystem/recommend.ts),
// reachable via `mooter ecosystem recommend`. This keeps Setup self-contained.

import type { SetupProfile } from "./detect.ts";

export interface Recommendation {
  id: string;
  kind: "rule";
  priority: 1 | 2 | 3; // 1 = highest
  message: string;
  reason: string;
  command?: string;
}

export function recommendForSetup(profile: SetupProfile): Recommendation[] {
  const recs: Recommendation[] = [];
  const h = profile.hardware;
  const s = profile.software;
  const sub = profile.subscriptions.subscription_tier;

  // Local-runtime readiness (highest value).
  if (!s.ollama_version) {
    recs.push({
      id: "install-ollama",
      kind: "rule",
      priority: 1,
      message: "Install Ollama to unlock FREE local workers",
      reason: "no Ollama runtime detected",
      command: "https://ollama.com/download",
    });
  } else if (s.ollama_models_count === 0) {
    recs.push({
      id: "pull-local-model",
      kind: "rule",
      priority: 1,
      message: `Pull a local model (${profile.derived.recommended_local_model ?? "qwen2.5-coder:7b"})`,
      reason: "Ollama installed but no models pulled",
      command: `ollama pull ${profile.derived.recommended_local_model ?? "qwen2.5-coder:7b"}`,
    });
  }

  // Hardware-class specific.
  if (h.hardware_class === "apple-silicon") {
    recs.push({
      id: "mlx-backend",
      kind: "rule",
      priority: 2,
      message: "Try the MLX backend on Apple Silicon (~15% faster vs Ollama)",
      reason: "Apple Silicon detected",
    });
  }
  if (h.has_npu && h.hardware_class !== "apple-silicon") {
    recs.push({
      id: "snapdragon-npu",
      kind: "rule",
      priority: 2,
      message: "Offload to the NPU with the snapdragon-nopu pack",
      reason: "NPU detected",
      command: "mooter pack install snapdragon-nopu",
    });
  }
  if (h.hw_tier === "gpu-high") {
    recs.push({
      id: "turboquant-watch",
      kind: "rule",
      priority: 3,
      message: "Watch for TurboQuant + llama.cpp for higher local concurrency",
      reason: "high-end GPU has headroom",
    });
  }

  // Token-saving (subscription-aware).
  if (sub === "claude-pro" || sub === "none") {
    recs.push({
      id: "caveman-pack",
      kind: "rule",
      priority: 2,
      message: "Enable the Caveman pack (~8% out-token savings on terse prompts)",
      reason: sub === "none" ? "no paid subscription — every token counts" : "finite Pro budget",
      command: "mooter pack install caveman",
    });
  }

  // Personalisation foundation.
  if (profile.derived.can_run_local_llm && s.ollama_models_count > 0) {
    recs.push({
      id: "pastor-lora",
      kind: "rule",
      priority: 3,
      message: "Register the Pastor LoRA adapter (Wave 31 hot-swap ready)",
      reason: "capable local runtime with models present",
      command: "mooter lora list",
    });
  }

  return recs.sort((a, b) => a.priority - b.priority);
}

/** Format recommendations as ✓/⚠ lines for `mooter setup show`. */
export function recommendationLines(recs: Recommendation[], limit = 5): string[] {
  return recs.slice(0, limit).map((r) => {
    const glyph = r.priority === 1 ? "⚠" : "✓";
    return `${glyph} ${r.message}` + (r.command ? `  (${r.command})` : "");
  });
}

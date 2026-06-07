// L14 A.2 — Setup Explainer (`mooter setup show`).
//
// Pure pretty-printer: turns a SetupProfile into the human-readable, explained
// profile from the vision doc. Recommendations (computed elsewhere) are passed
// in so this stays dependency-free and deterministic.

import type { SetupProfile } from "./detect.ts";

function vramLabel(p: SetupProfile): string {
  const { vram_total_gb, vram_used_gb } = p.hardware;
  if (vram_total_gb == null) return "VRAM n/a";
  if (vram_used_gb == null) return `${vram_total_gb}GB shared`;
  return `${vram_used_gb}/${vram_total_gb}GB VRAM`;
}

function hardwareNote(p: SetupProfile): string {
  if (p.hardware.hardware_class === "apple-silicon") return "→ Excellent for local LLMs. Mooter can run qwen3:30b smoothly via Metal/MLX.";
  if (p.hardware.hw_tier === "gpu-high") return "→ High-end GPU. Strong local inference; consider larger quantised models.";
  if (p.hardware.hw_tier === "gpu-mid") return "→ Mid GPU. 7B–12B models run well locally.";
  if (p.hardware.hw_tier === "gpu-low") return "→ Entry GPU. Stick to 3B–7B local models.";
  return "→ No discrete GPU detected. Local LLMs limited; Mooter leans on cloud + caching.";
}

function subscriptionNote(p: SetupProfile): string {
  switch (p.subscriptions.subscription_tier) {
    case "claude-max":
      return "→ Marginal cost ≈ $0 for Claude. Mooter biases for frontier + cache. (Claude Code is first-party exempt; 3rd-party tools count against Max.)";
    case "claude-pro":
      return "→ Claude Pro budget is finite. Mooter routes more to local + cheaper tiers to preserve it.";
    case "multi":
      return "→ Multiple paid providers detected. Mooter can arbitrage across them by task type.";
    default:
      return "→ No paid subscription detected. Mooter maximises FREE local + careful tier use.";
  }
}

export function explainSetup(profile: SetupProfile, recommendations: string[] = []): string {
  const h = profile.hardware;
  const s = profile.software;
  const lines: string[] = [
    "🐮 Your Mooter Setup Profile",
    "─────────────────────────────",
    `Hardware: ${h.hardware_class} (${h.gpu_name}, ${vramLabel(profile)}, NPU ${h.has_npu ? "yes" : "no"}, ${h.os_class})`,
    hardwareNote(profile),
    "",
    `Software: Node ${s.node_version}` + (s.ollama_version ? `, Ollama ${s.ollama_version}` : ", Ollama not installed") + (s.python_version ? `, ${s.python_version}` : ""),
    s.ollama_models_count > 0
      ? `→ Local models: ${s.ollama_models.join(", ")}.`
      : "→ No local models pulled yet. Run `ollama pull qwen2.5-coder:7b` to enable FREE local workers.",
    "",
    `Subscriptions: ${profile.subscriptions.subscription_tier} (anthropic=${profile.subscriptions.anthropic}, openai=${profile.subscriptions.openai}, gemini=${profile.subscriptions.gemini})`,
    subscriptionNote(profile),
  ];
  if (recommendations.length) {
    lines.push("", "Recommendations:");
    for (const r of recommendations) lines.push(r);
  }
  if (profile.derived.notes.length) {
    lines.push("", "Notes:");
    for (const n of profile.derived.notes) lines.push(`• ${n}`);
  }
  return lines.join("\n");
}

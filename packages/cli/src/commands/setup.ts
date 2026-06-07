// `mooter setup` — L14 Setup Intelligence (Wave 29, Paulo Vector A).
//
//   mooter setup detect [--json]      detect hardware/software/subs → setup_profile.json
//   mooter setup show [--json]        explained profile (auto-detects if none saved)
//   mooter setup recommend [--json]   per-setup recommendations
//
// Pure delegator to @mooter/synthesis.

import type { CmdResult } from "./trail.ts";
import {
  detectSetup,
  saveProfile,
  loadProfile,
  explainSetup,
  recommendForSetup,
  recommendationLines,
  type SetupProfile,
} from "../../../synthesis/src/index.ts";

export const SETUP_USAGE = `mooter setup — L14 Setup Intelligence

  mooter setup detect [--json]      detect hardware/software/subscriptions
  mooter setup show [--json]        explained profile (auto-detects if missing)
  mooter setup recommend [--json]   recommendations for your setup`;

async function ensureProfile(): Promise<SetupProfile> {
  const existing = loadProfile();
  if (existing) return existing;
  const fresh = await detectSetup();
  saveProfile(fresh);
  return fresh;
}

export async function runSetup(args: string[]): Promise<CmdResult> {
  const [sub] = args;
  const json = args.includes("--json");

  if (!sub || sub === "help" || sub === "--help" || sub === "-h") {
    return { exitCode: 0, output: SETUP_USAGE };
  }

  if (sub === "detect") {
    const profile = await detectSetup();
    saveProfile(profile);
    if (json) return { exitCode: 0, output: JSON.stringify(profile, null, 2) };
    const h = profile.hardware;
    const lines = [
      "🐮 Setup detected → ~/.mooter/setup_profile.json",
      "─────────────────────────────",
      `hardware:      ${h.hardware_class} (${h.gpu_name}, tier ${h.hw_tier}, NPU ${h.has_npu ? "yes" : "no"})`,
      `os:            ${h.os_class} (${h.platform}/${h.cpu_arch})`,
      `node:          ${profile.software.node_version}`,
      `ollama:        ${profile.software.ollama_version ?? "not installed"} · ${profile.software.ollama_models_count} model(s)`,
      `subscription:  ${profile.subscriptions.subscription_tier}`,
      `local LLM:     ${profile.derived.can_run_local_llm ? "yes" : "limited"}${profile.derived.recommended_local_model ? ` → ${profile.derived.recommended_local_model}` : ""}`,
    ];
    return { exitCode: 0, output: lines.join("\n") };
  }

  if (sub === "show") {
    const profile = await ensureProfile();
    if (json) return { exitCode: 0, output: JSON.stringify(profile, null, 2) };
    const recs = recommendationLines(recommendForSetup(profile), 5);
    return { exitCode: 0, output: explainSetup(profile, recs) };
  }

  if (sub === "recommend") {
    const profile = await ensureProfile();
    const recs = recommendForSetup(profile);
    if (json) return { exitCode: 0, output: JSON.stringify(recs, null, 2) };
    const lines = ["🐮 Recommendations for your setup", "─────────────────────────────"];
    if (!recs.length) lines.push("(nothing to recommend — your setup looks well-tuned)");
    for (const r of recs) {
      lines.push(`${r.priority === 1 ? "⚠" : "✓"} ${r.message}`);
      lines.push(`   why: ${r.reason}${r.command ? ` · ${r.command}` : ""}`);
    }
    return { exitCode: 0, output: lines.join("\n") };
  }

  return { exitCode: 1, output: `mooter setup: unknown subcommand '${sub}'\n\n${SETUP_USAGE}` };
}

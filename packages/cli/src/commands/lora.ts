// `mooter lora` — L13 LoRA hot-swap foundation (Wave 29, infra only).
//
//   mooter lora list            list registered adapters
//   mooter lora show <name>     adapter details
//   mooter lora load <name>     validate-and-report a manual load (no swap in W29)
//
// Auto hot-swap lands in Wave 31. Pure delegator to @mooter/synthesis.

import type { CmdResult } from "./trail.ts";
import { listAdapters, getAdapter, loadAdapter, AUTO_SWAP_ENABLED } from "../../../synthesis/src/index.ts";

export const LORA_USAGE = `mooter lora — L13 LoRA hot-swap foundation (Wave 29, infra only)

  mooter lora list            list registered adapters
  mooter lora show <name>     adapter details
  mooter lora load <name>     validate a manual load (auto hot-swap is Wave 31)`;

export function runLora(args: string[]): CmdResult {
  const [sub, arg] = args;

  if (!sub || sub === "help" || sub === "--help" || sub === "-h") {
    return { exitCode: 0, output: LORA_USAGE };
  }

  if (sub === "list") {
    const json = args.includes("--json");
    const adapters = listAdapters();
    if (json) return { exitCode: 0, output: JSON.stringify({ auto_swap: AUTO_SWAP_ENABLED, adapters }, null, 2) };
    const lines = ["🐮 LoRA adapters (L13 · auto-swap " + (AUTO_SWAP_ENABLED ? "ON" : "OFF, Wave 31") + ")", "─────────────────────────────"];
    if (!adapters.length) lines.push("(none registered)");
    for (const a of adapters) {
      lines.push(`${a.name}  [${a.base_model}]  tags: ${a.task_tags.join(",") || "—"}  trained: ${a.trained_on}  ready: W${a.wave_ready}`);
    }
    return { exitCode: 0, output: lines.join("\n") };
  }

  if (sub === "show") {
    if (!arg) return { exitCode: 1, output: "usage: mooter lora show <name>" };
    const a = getAdapter(arg);
    if (!a) return { exitCode: 1, output: `mooter lora: no adapter named '${arg}'` };
    if (args.includes("--json")) return { exitCode: 0, output: JSON.stringify(a, null, 2) };
    const lines = [
      `🐮 ${a.name}`,
      "─────────────────────────────",
      `base model:   ${a.base_model}`,
      `task tags:    ${a.task_tags.join(", ") || "—"}`,
      `trained on:   ${a.trained_on}`,
      `path:         ${a.path || "(not materialised)"}`,
      `wave ready:   ${a.wave_ready}`,
      `registered:   ${a.registered_at}`,
      a.description ? `\n${a.description}` : "",
    ].filter(Boolean);
    return { exitCode: 0, output: lines.join("\n") };
  }

  if (sub === "load") {
    if (!arg) return { exitCode: 1, output: "usage: mooter lora load <name>" };
    const r = loadAdapter(arg);
    if (args.includes("--json")) return { exitCode: 0, output: JSON.stringify(r, null, 2) };
    const glyph = r.reason === "ready" ? "✓" : r.reason === "deferred" ? "◐" : "✗";
    // Exit 0 for a clean validation (ready/deferred), 1 for real problems.
    const exitCode = r.reason === "ready" || r.reason === "deferred" ? 0 : 1;
    return { exitCode, output: `${glyph} ${r.adapter}: ${r.reason}\n  ${r.detail}` };
  }

  return { exitCode: 1, output: `mooter lora: unknown subcommand '${sub}'\n\n${LORA_USAGE}` };
}

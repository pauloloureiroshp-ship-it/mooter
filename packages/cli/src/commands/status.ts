// `mooter status [--didactic]` — Wave 32 (Phase NEW2/NEW1): a one-shot snapshot
// of the Mooter's state for the chat surface (the slash command /moo-status).
//
// Built entirely from REAL local data (effort mode + Pastor summary + adapter
// registry). No invented numbers; `--didactic` adds plain-language explanation.

import { getEffort } from "../../../effort/src/index.ts";
import { summarizePastor, listTaskAdapters } from "../../../synthesis/src/index.ts";

export interface CmdResult {
  exitCode: number;
  output: string;
}

export function runStatus(args: string[]): CmdResult {
  const didactic = args.includes("--didactic");
  const json = args.includes("--json");

  const effort = getEffort();
  const pastor = summarizePastor();
  const adapters = listTaskAdapters().length;

  if (json) {
    return { exitCode: 0, output: JSON.stringify({ effort, pastor, adapters }, null, 2) };
  }

  if (didactic) {
    const lines = [
      `🐮 Mooter status (didactic)`,
      ``,
      `Effort mode: ${effort.mode}.`,
      `  ${effort.mode === "ultramoo"
        ? "Maximum frugality — compression, local-first routing, and auto-workflows are all on."
        : effort.mode === "high"
          ? "High — prompts are compressed before they reach the cloud."
          : effort.mode === "low"
            ? "Low — no extra savings machinery; the router still routes."
            : "Default — Pastor routing hints active, soft local preference."}`,
      ``,
      `Routing brain: Pastor v2 with ${adapters} per-task adapters registered.`,
      `  Active adapter: ${pastor.active_type ?? "none"}${pastor.active_adapter ? ` (${pastor.active_adapter})` : ""}.`,
      `  ${pastor.total_routes} routing decisions recorded so far.`,
      ``,
      `↳ See the full picture: \`mooter dashboard\`. Change effort: \`mooter effort set <mode>\`.`,
    ];
    return { exitCode: 0, output: lines.join("\n") };
  }

  // compact
  return {
    exitCode: 0,
    output: [
      `🐮 effort ${effort.mode} · Pastor ${adapters} adapters · ${pastor.total_routes} routes`,
      `   active: ${pastor.active_type ?? "none"} · dashboard: mooter dashboard`,
    ].join("\n"),
  };
}

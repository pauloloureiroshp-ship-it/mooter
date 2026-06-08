// `mooter effort` — Wave 32 (Phase NEW2): session-wide effort mode.
//
//   mooter effort                  show current mode + active sub-systems
//   mooter effort show [--json]
//   mooter effort set <low|default|high|ultramoo>
//   mooter effort reset            back to default
//
// Persists to ~/.mooter/effort.json (flat flags so non-TS consumers read them).
// ultramoo flips 8 sub-systems but never overrides classify.js tier floors —
// "Doctrine wins ultramoo".

import {
  getEffort,
  setEffort,
  resetEffort,
  configForMode,
  isEffortMode,
  MODE_NAMES,
  type EffortConfig,
} from "../../../effort/src/index.ts";

export interface CmdResult {
  exitCode: number;
  output: string;
}

function renderConfig(cfg: EffortConfig): string {
  const yn = (b: boolean) => (b ? "on " : "off");
  return [
    `🐮 effort: ${cfg.mode}`,
    `  LLMLingua compression ... ${yn(cfg.llmlingua)}`,
    `  Caveman prose ........... ${yn(cfg.caveman)}`,
    `  LORAUTER routing ........ ${yn(cfg.lorauter)}`,
    `  Multi-LoRA (vLLM) ....... ${yn(cfg.multiLora)}`,
    `  Workflow auto-trigger ... ${cfg.workflowAutoThreshold === null ? "off" : `> ${cfg.workflowAutoThreshold} tok`}`,
    `  Cost cap ................ workflow $${cfg.costCap.workflowUsd} · session $${cfg.costCap.sessionUsd}`,
    `  Bandit local bias ....... ${cfg.banditLocalBias}`,
    `  Statusline 🐄 chip ...... ${yn(cfg.statuslineUltramooChip)}`,
    cfg.mode === "ultramoo"
      ? `  ↳ all 8 sub-systems engaged. classify.js tier floors still apply.`
      : `  ↳ set 'ultramoo' for maximum frugality (mooter effort set ultramoo).`,
  ].join("\n");
}

export function runEffort(args: string[]): CmdResult {
  const [sub, value] = args;
  const json = args.includes("--json");

  if (!sub || sub === "show") {
    const cfg = getEffort();
    return json ? { exitCode: 0, output: JSON.stringify(cfg, null, 2) } : { exitCode: 0, output: renderConfig(cfg) };
  }

  if (sub === "set") {
    if (!value || !isEffortMode(value)) {
      return { exitCode: 1, output: `usage: mooter effort set <${MODE_NAMES.join("|")}>` };
    }
    const cfg = setEffort(value);
    return json ? { exitCode: 0, output: JSON.stringify(cfg, null, 2) } : { exitCode: 0, output: renderConfig(cfg) };
  }

  if (sub === "reset") {
    const cfg = resetEffort();
    return { exitCode: 0, output: json ? JSON.stringify(cfg, null, 2) : renderConfig(cfg) };
  }

  return { exitCode: 1, output: `mooter effort: unknown subcommand '${sub}'\n\nusage: mooter effort [show|set <mode>|reset]` };
}

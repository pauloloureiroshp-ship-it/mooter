// `mooter monitor` (Wave 33 L11 / B.4) — opt-in provider arbitrage monitor.
//
//   mooter monitor providers       poll public status pages once + update state
//   mooter monitor status          show current health + advisory bias
//   mooter monitor enable|disable  toggle the monitor
//
// PRIVACY: only public status pages are polled — never an inference endpoint,
// never a prompt. The output is ADVISORY (within-tier model preference). The tier
// classify.js assigns is NEVER changed (doctrine: tier floor always wins).

import {
  pollAll,
  recordPoll,
  setEnabled,
  isActive,
  readState,
  suggestBias,
} from "../../../arbitrage-monitor/src/index.ts";

export interface CmdResult {
  exitCode: number;
  output: string;
}

export async function runMonitor(args: string[], deps: { fetchImpl?: typeof fetch } = {}): Promise<CmdResult> {
  const sub = args[0];

  if (sub === "enable") {
    setEnabled(true);
    return { exitCode: 0, output: "✓ Arbitrage monitor enabled (opt-in). Run `mooter monitor providers` to poll." };
  }
  if (sub === "disable") {
    setEnabled(false);
    return { exitCode: 0, output: "✓ Arbitrage monitor disabled." };
  }

  if (sub === "providers") {
    if (!isActive()) return { exitCode: 1, output: "arbitrage monitor is disabled — run `mooter monitor enable` first." };
    const results = await pollAll({ fetchImpl: deps.fetchImpl });
    recordPoll(results);
    const bias = suggestBias();
    const lines = [
      "🐮 Mooter · provider status (public pages only):",
      ...results.map((r) => `  ${r.id.padEnd(10)} ${r.health}${r.description ? ` — ${r.description}` : ""}`),
      `  advisory: ${bias.note}`,
    ];
    return { exitCode: 0, output: lines.join("\n") };
  }

  if (sub === "status") {
    const s = readState();
    if (!s.enabled) return { exitCode: 0, output: "arbitrage monitor: disabled" };
    const bias = suggestBias();
    const lines = [
      "🐮 Mooter · arbitrage monitor: enabled",
      ...Object.entries(s.providers).map(([id, ps]) => `  ${id.padEnd(10)} ${ps.health}`),
      `  advisory: ${bias.note}`,
    ];
    return { exitCode: 0, output: lines.join("\n") };
  }

  return { exitCode: 1, output: "usage: mooter monitor [providers|status|enable|disable]" };
}

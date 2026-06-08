// `mooter minimax-m3` (Wave 33 B.3) — watch for + install MiniMax M3 weights.
//
//   mooter minimax-m3 check       poll HuggingFace for the GGUF weights
//   mooter minimax-m3 status      show local state (available / installed)
//   mooter minimax-m3 install [--run]  install once available (Ollama)
//
// Weights are not public as of 2026-06-08 (expected ~June 10-11). `check` is
// rate-safe; nothing downloads until weights exist AND the user opts in.

import {
  checkAvailability,
  readState,
  writeState,
  pickRepo,
  install,
  type MinimaxState,
} from "../../../minimax-watcher/src/index.ts";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";

export interface CmdResult {
  exitCode: number;
  output: string;
}

function fmtState(s: MinimaxState): string {
  return [
    "🐮 Mooter · MiniMax M3",
    `  available: ${s.available ? `yes (${s.repo})` : "not yet (expected ~June 10-11, 2026)"}`,
    `  installed: ${s.installed ? "yes (ollama model 'minimax-m3')" : "no"}`,
  ].join("\n");
}

export async function runMinimax(args: string[], deps: { fetchImpl?: typeof fetch } = {}): Promise<CmdResult> {
  const sub = args[0] ?? "status";

  if (sub === "status") {
    return { exitCode: 0, output: fmtState(readState()) };
  }

  if (sub === "check") {
    const r = await checkAvailability({ fetchImpl: deps.fetchImpl });
    if (r.ok && r.available) {
      writeState({ available: true, repo: pickRepo(r.repos), checkedAt: Date.now() });
    } else if (r.ok) {
      writeState({ available: false, checkedAt: Date.now() });
    }
    return { exitCode: r.ok ? 0 : 1, output: `🐮 ${r.note}` };
  }

  if (sub === "install") {
    const run = args.includes("--run");
    const r = install(homedir(), {
      run,
      exec: (cmd) => { spawnSync("bash", ["-lc", cmd], { stdio: "inherit" }); },
    });
    const planText = r.plan.ready ? `Plan:\n${r.plan.steps.map((s) => `  $ ${s}`).join("\n")}\n${r.plan.note}` : "";
    return { exitCode: r.plan.ready ? 0 : 1, output: `${r.message}${planText ? "\n" + planText : ""}` };
  }

  return { exitCode: 1, output: "usage: mooter minimax-m3 [check|status|install [--run]]" };
}

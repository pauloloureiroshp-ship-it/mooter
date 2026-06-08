// `mooter turboquant` (Wave 33 B.1) — manage the opt-in TurboQuant 3-bit KV cache.
//
//   mooter turboquant status            show state + prereqs
//   mooter turboquant build [--run]     build the AmesianX fork from source (CUDA+CMake)
//   mooter turboquant enable            turn on 3-bit KV cache (after building)
//   mooter turboquant disable           revert to stock llama.cpp/Ollama
//
// EXPERIMENTAL. Mainline llama.cpp rejected TurboQuant, so this is a build-from-
// source wrapper. Stock Ollama stays the default; this only changes the cache type.

import { spawnSync } from "node:child_process";
import {
  build,
  detectPrereqs,
  cacheFlags,
  isEnabled,
  setEnabled,
  type ProbeFns,
} from "../../../turboquant-backend/src/index.ts";

export interface CmdResult {
  exitCode: number;
  output: string;
}

const REAL_PROBE: ProbeFns = {
  hasCommand: (cmd) => {
    try {
      return spawnSync(cmd, ["--version"], { stdio: "ignore", timeout: 3000 }).status === 0;
    } catch {
      return false;
    }
  },
  hasNvidiaGpu: () => {
    try {
      return spawnSync("nvidia-smi", ["-L"], { stdio: "ignore", timeout: 3000 }).status === 0;
    } catch {
      return false;
    }
  },
};

export function runTurboquant(args: string[], deps: { probe?: ProbeFns } = {}): CmdResult {
  const sub = args[0] ?? "status";
  const probe = deps.probe ?? REAL_PROBE;

  if (sub === "status") {
    const on = isEnabled();
    const pr = detectPrereqs(probe);
    const lines = [
      "🐮 Mooter · TurboQuant (3-bit KV cache · EXPERIMENTAL)",
      `  state:    ${on ? "enabled 🐢 TQ-3bit" : "disabled (stock llama.cpp/Ollama)"}`,
      `  prereqs:  ${pr.missing.length === 0 ? "OK (GPU + CUDA + CMake + git)" : "missing: " + pr.missing.join(", ")}`,
      `  enable flags: llama-server ${cacheFlags().join(" ")}`,
    ];
    return { exitCode: 0, output: lines.join("\n") };
  }

  if (sub === "build") {
    const run = args.includes("--run");
    const r = build(probe, { run, exec: (cmd) => { spawnSync("bash", ["-lc", cmd], { stdio: "inherit" }); } });
    const planText = r.plan.ready
      ? `Plan:\n${r.plan.steps.map((s) => `  $ ${s}`).join("\n")}`
      : `prereqs MISSING: ${r.plan.prereqs.missing.join(", ")}`;
    return { exitCode: r.plan.ready ? 0 : 1, output: `${r.message}\n${planText}` };
  }

  if (sub === "enable") {
    setEnabled(true);
    return { exitCode: 0, output: `✓ TurboQuant enabled (🐢 TQ-3bit). Launch llama-server with: ${cacheFlags().join(" ")}` };
  }

  if (sub === "disable") {
    setEnabled(false);
    return { exitCode: 0, output: "✓ TurboQuant disabled — back to stock llama.cpp/Ollama." };
  }

  return { exitCode: 1, output: "usage: mooter turboquant [status|build [--run]|enable|disable]" };
}

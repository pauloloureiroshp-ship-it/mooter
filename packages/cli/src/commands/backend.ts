// `mooter backend` — Wave 32 (Phase H/I): manage the optional vLLM backend.
//
//   mooter backend status              show active backend (Ollama default · vLLM optional)
//   mooter backend install vllm [--run]  detect prereqs + install vLLM in .venv-vllm
//   mooter backend uninstall vllm      remove the venv + disable vLLM
//
// Ollama is ALWAYS the default. vLLM is opt-in and only used when installed AND
// reachable; otherwise everything falls back to Ollama (doctrine #9).

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { detectPrereqs, install, chooseBackend, type ProbeFns, VENV_PATH } from "../../../vllm-backend/src/index.ts";

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

function prefsPath(): string {
  return join(homedir(), ".mooter", "preferences.json");
}
function readPrefs(): Record<string, unknown> {
  try { return JSON.parse(readFileSync(prefsPath(), "utf8")); } catch { return {}; }
}
function writePrefs(p: Record<string, unknown>): void {
  mkdirSync(join(homedir(), ".mooter"), { recursive: true });
  writeFileSync(prefsPath(), JSON.stringify(p, null, 2) + "\n");
}
function setVllmEnabled(on: boolean): void {
  const p = readPrefs();
  p.vllm_enabled = on;
  writePrefs(p);
}

export async function runBackend(args: string[], deps: { probe?: ProbeFns; fetchImpl?: typeof fetch } = {}): Promise<CmdResult> {
  const [sub, target] = args;
  const probe = deps.probe ?? REAL_PROBE;
  const run = args.includes("--run");

  if (!sub || sub === "status") {
    const optIn = readPrefs().vllm_enabled === true;
    const choice = await chooseBackend(optIn, { fetchImpl: deps.fetchImpl });
    const lines = [
      `🐮 Mooter backend`,
      `  default:  Ollama (always available, local-first)`,
      `  vLLM:     ${optIn ? "enabled" : "not enabled"}${optIn ? ` · ${choice.vllm?.up ? "up" : "down"}` : ""}`,
      `  active:   ${choice.backend} — ${choice.reason}`,
    ];
    return { exitCode: 0, output: lines.join("\n") };
  }

  if (sub === "install") {
    if (target !== "vllm") return { exitCode: 1, output: "usage: mooter backend install vllm [--run]" };
    const r = install(probe, { run, exec: (cmd) => { spawnSync("bash", ["-lc", cmd], { stdio: "inherit" }); } });
    if (r.installed) setVllmEnabled(true);
    const planText = r.plan.ready
      ? `prereqs OK (GPU ✓). Plan:\n${r.plan.steps.map((s) => `  $ ${s}`).join("\n")}`
      : `prereqs MISSING: ${r.plan.prereqs.missing.join(", ")}`;
    return { exitCode: r.plan.ready ? 0 : 1, output: `${r.message}\n${planText}` };
  }

  if (sub === "uninstall") {
    if (target !== "vllm") return { exitCode: 1, output: "usage: mooter backend uninstall vllm" };
    const venv = join(process.cwd(), VENV_PATH);
    let removed = false;
    if (existsSync(venv)) { try { rmSync(venv, { recursive: true, force: true }); removed = true; } catch { /* ignore */ } }
    setVllmEnabled(false);
    return { exitCode: 0, output: `vLLM disabled${removed ? ` and ${VENV_PATH} removed` : ""}. Back to Ollama-only.` };
  }

  return { exitCode: 1, output: `mooter backend: unknown subcommand '${sub}'\n\nmooter backend [status|install vllm|uninstall vllm]` };
}

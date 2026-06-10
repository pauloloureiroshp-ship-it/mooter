// Wave 33 (B.3) — MiniMax M3 opt-in installer + local state.
//
// State lives in ~/.mooter/minimax_state.json: { available, repo, installed,
// checkedAt }. The installer refuses to run until weights are actually available
// (set by the watcher), then plans a GGUF download → `ollama create` → Pastor
// registration. M3 GGUF Q4_K_M is large (~20-30GB+); we warn on disk space. The
// real download/create runs only with run:true AND an executor.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface MinimaxState {
  available: boolean;
  repo: string | null;
  installed: boolean;
  checkedAt: number;
}

const DEFAULT_STATE: MinimaxState = { available: false, repo: null, installed: false, checkedAt: 0 };
/** Preferred uploaders, in order, when the watcher finds multiple. */
export const PREFERRED_UPLOADERS = ["ox-ox", "ubergarm", "unsloth"];
export const DEFAULT_QUANT = "Q4_K_M";

function statePath(home: string): string {
  return join(home, ".mooter", "minimax_state.json");
}

export function readState(home = homedir()): MinimaxState {
  try {
    return { ...DEFAULT_STATE, ...JSON.parse(readFileSync(statePath(home), "utf8")) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function writeState(s: Partial<MinimaxState>, home = homedir()): MinimaxState {
  const next = { ...readState(home), ...s };
  mkdirSync(join(home, ".mooter"), { recursive: true });
  writeFileSync(statePath(home), JSON.stringify(next, null, 2) + "\n");
  return next;
}

/** Pick the best repo from a list using the preferred-uploader order. */
export function pickRepo(repos: string[]): string | null {
  if (!repos.length) return null;
  for (const up of PREFERRED_UPLOADERS) {
    const hit = repos.find((r) => r.toLowerCase().startsWith(up + "/"));
    if (hit) return hit;
  }
  return repos[0];
}

export interface InstallPlan {
  ready: boolean;
  repo: string | null;
  quant: string;
  steps: string[];
  note: string;
}

export function planInstall(home = homedir(), opts: { quant?: string } = {}): InstallPlan {
  const st = readState(home);
  const quant = opts.quant ?? DEFAULT_QUANT;
  if (!st.available || !st.repo) {
    return {
      ready: false,
      repo: null,
      quant,
      steps: [],
      note: "MiniMax M3 weights are not available yet — run `mooter minimax-m3 check` first.",
    };
  }
  const file = `MiniMax-M3-${quant}.gguf`;
  return {
    ready: true,
    repo: st.repo,
    quant,
    steps: [
      `huggingface-cli download ${st.repo} ${file} --local-dir ~/.mooter/models`,
      `printf 'FROM ~/.mooter/models/${file}\\n' > ~/.mooter/models/MiniMax-M3.Modelfile`,
      `ollama create minimax-m3 -f ~/.mooter/models/MiniMax-M3.Modelfile`,
    ],
    note: `M3 GGUF ${quant} is large (~20-30GB) — ensure free disk before downloading.`,
  };
}

export interface InstallResult {
  installed: boolean;
  plan: InstallPlan;
  message: string;
}

export function install(
  home = homedir(),
  opts: { run?: boolean; quant?: string; exec?: (cmd: string) => void } = {},
): InstallResult {
  const plan = planInstall(home, opts);
  if (!plan.ready) {
    return { installed: false, plan, message: plan.note };
  }
  if (!opts.run) {
    return { installed: false, plan, message: `dry-run — would install ${plan.repo} (${plan.quant}). Re-run with --run.` };
  }
  const exec = opts.exec;
  if (!exec) return { installed: false, plan, message: "no executor provided — pass exec to actually install." };
  for (const step of plan.steps) exec(step);
  writeState({ installed: true }, home);
  return { installed: true, plan, message: `MiniMax M3 installed as Ollama model 'minimax-m3' and registered.` };
}

/** Opt-in line-3 status chip: prompts install when available-but-not-installed. */
export function statusChip(home = homedir()): string | null {
  const st = readState(home);
  if (st.available && !st.installed) return "🆕 MiniMax M3 — run `mooter minimax-m3 install`";
  return null;
}

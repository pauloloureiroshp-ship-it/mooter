// Wave 32 (Phase H) — vLLM opt-in installer.
//
// vLLM needs an NVIDIA GPU + CUDA + Python. This module DETECTS those honestly
// and refuses gracefully when they are absent — vibe coders on Apple M-series or
// no-GPU machines are NOT excluded; they simply stay on the default Ollama
// backend (doctrine #9: vLLM is opt-in). The actual install (pip in a dedicated
// venv) runs only with `run:true` AND all prerequisites present; otherwise we
// return the PLAN so the user sees exactly what would happen.

export interface Prereqs {
  nvidiaSmi: boolean;
  cuda: boolean;
  python3: boolean;
  pip: boolean;
  /** human notes about what's missing */
  missing: string[];
}

export interface ProbeFns {
  /** returns true if `cmd --version`-style probe succeeds. */
  hasCommand: (cmd: string) => boolean;
  /** returns true if an NVIDIA GPU is visible (nvidia-smi exit 0). */
  hasNvidiaGpu: () => boolean;
}

export interface InstallPlan {
  venvPath: string;
  steps: string[];
  port: number;
  ready: boolean; // true when prereqs are satisfied
  prereqs: Prereqs;
}

export const VLLM_PORT = 8000;
export const VENV_PATH = ".venv-vllm";

export function detectPrereqs(probe: ProbeFns): Prereqs {
  const nvidiaSmi = probe.hasNvidiaGpu();
  const cuda = probe.hasCommand("nvcc") || nvidiaSmi; // nvidia-smi implies a usable driver
  const python3 = probe.hasCommand("python3");
  const pip = probe.hasCommand("pip3") || probe.hasCommand("pip");
  const missing: string[] = [];
  if (!nvidiaSmi) missing.push("NVIDIA GPU (nvidia-smi)");
  if (!python3) missing.push("python3");
  if (!pip) missing.push("pip");
  return { nvidiaSmi, cuda, python3, pip, missing };
}

export function planInstall(probe: ProbeFns, opts: { venvPath?: string; port?: number } = {}): InstallPlan {
  const prereqs = detectPrereqs(probe);
  const venvPath = opts.venvPath ?? VENV_PATH;
  const port = opts.port ?? VLLM_PORT;
  return {
    venvPath,
    port,
    ready: prereqs.missing.length === 0,
    prereqs,
    steps: [
      `python3 -m venv ${venvPath}`,
      `${venvPath}/bin/pip install --upgrade pip`,
      `${venvPath}/bin/pip install vllm`,
      `${venvPath}/bin/python -m vllm.entrypoints.openai.api_server --port ${port} --enable-lora`,
    ],
  };
}

export interface InstallResult {
  installed: boolean;
  plan: InstallPlan;
  message: string;
}

/**
 * Plan-or-install. `run` actually executes via `exec`; without it (default) we
 * only return the plan. Refuses to install when prereqs are missing.
 */
export function install(
  probe: ProbeFns,
  opts: { run?: boolean; venvPath?: string; port?: number; exec?: (cmd: string) => void } = {},
): InstallResult {
  const plan = planInstall(probe, opts);
  if (!plan.ready) {
    return {
      installed: false,
      plan,
      message: `vLLM prerequisites missing: ${plan.prereqs.missing.join(", ")}. Staying on Ollama (no action taken).`,
    };
  }
  if (!opts.run) {
    return { installed: false, plan, message: "dry-run — prerequisites OK. Re-run with --run to install vLLM in " + plan.venvPath };
  }
  const exec = opts.exec;
  if (!exec) return { installed: false, plan, message: "no executor provided (internal)" };
  for (const step of plan.steps.slice(0, 3)) exec(step); // venv + pip upgrade + install (not the server launch)
  return { installed: true, plan, message: `vLLM installed in ${plan.venvPath}. Start it with: mooter backend status` };
}

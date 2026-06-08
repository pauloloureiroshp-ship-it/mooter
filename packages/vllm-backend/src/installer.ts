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
  /** Wave 33 (B.2) — resolved EAGLE-3 plan (always present; .enabled gates it). */
  eagle3: Eagle3Plan;
}

export const VLLM_PORT = 8000;
export const VENV_PATH = ".venv-vllm";

// Wave 33 (B.2) — EAGLE-3 speculative decoding. vLLM supports a draft model that
// proposes tokens the target verifies in parallel (2–2.5× steady-state tokens/s).
// It costs ~10% extra VRAM for the draft weights, so we gate it on a headroom
// check and FALL BACK to plain vLLM when the GPU can't spare it (never block the
// install). No EAGLE-3 head ships for qwen2.5-coder yet, so the draft model is
// configurable and defaults to a published Qwen draft; an honest note is surfaced.
export const DEFAULT_EAGLE3_DRAFT = "yuhuili/EAGLE3-Qwen2.5-Coder-7B";
export const DEFAULT_SPECULATIVE_TOKENS = 5;
/** Fraction of total VRAM the draft model is assumed to need. */
export const EAGLE3_VRAM_HEADROOM = 0.1;

export interface Eagle3Options {
  /** Opt into EAGLE-3 speculative decoding. */
  eagle3?: boolean;
  /** Draft model id (HF). Defaults to a published Qwen-Coder EAGLE-3 head. */
  draftModel?: string;
  /** Tokens the draft proposes per step. */
  numSpeculativeTokens?: number;
  /** Total GPU memory in GB, when known — used for the headroom check. */
  gpuTotalGb?: number;
  /** GPU memory already in use in GB, when known. */
  gpuUsedGb?: number;
}

export interface Eagle3Plan {
  requested: boolean;
  /** true when EAGLE-3 will actually be enabled (requested AND headroom OK). */
  enabled: boolean;
  draftModel: string;
  numSpeculativeTokens: number;
  /** server-launch flags to append; empty when not enabled. */
  flags: string[];
  note: string;
}

/**
 * Resolve whether EAGLE-3 can be enabled given the requested options and the
 * known GPU memory. Pure: never throws, always returns a plan with an honest
 * note. When headroom is unknown we proceed optimistically (vLLM itself will
 * error at launch if memory is truly insufficient — we don't pretend to know).
 */
export function planEagle3(opts: Eagle3Options = {}): Eagle3Plan {
  const draftModel = opts.draftModel ?? DEFAULT_EAGLE3_DRAFT;
  const numSpeculativeTokens = opts.numSpeculativeTokens ?? DEFAULT_SPECULATIVE_TOKENS;
  if (!opts.eagle3) {
    return { requested: false, enabled: false, draftModel, numSpeculativeTokens, flags: [], note: "EAGLE-3 not requested." };
  }
  // Headroom check, only when we actually know the numbers.
  if (typeof opts.gpuTotalGb === "number" && typeof opts.gpuUsedGb === "number") {
    const free = opts.gpuTotalGb - opts.gpuUsedGb;
    const needed = opts.gpuTotalGb * EAGLE3_VRAM_HEADROOM;
    if (free < needed) {
      return {
        requested: true,
        enabled: false,
        draftModel,
        numSpeculativeTokens,
        flags: [],
        note: `EAGLE-3 needs ~${needed.toFixed(1)}GB free VRAM for the draft model; only ${free.toFixed(1)}GB free. Falling back to plain vLLM.`,
      };
    }
  }
  return {
    requested: true,
    enabled: true,
    draftModel,
    numSpeculativeTokens,
    flags: [`--speculative-model ${draftModel}`, `--num-speculative-tokens ${numSpeculativeTokens}`],
    note: `EAGLE-3 enabled with draft ${draftModel} (${numSpeculativeTokens} speculative tokens). Verify the draft exists for your base model; no EAGLE-3 head ships for qwen2.5-coder by default.`,
  };
}

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

export function planInstall(
  probe: ProbeFns,
  opts: { venvPath?: string; port?: number } & Eagle3Options = {},
): InstallPlan {
  const prereqs = detectPrereqs(probe);
  const venvPath = opts.venvPath ?? VENV_PATH;
  const port = opts.port ?? VLLM_PORT;
  const eagle3 = planEagle3(opts);
  const launch =
    `${venvPath}/bin/python -m vllm.entrypoints.openai.api_server --port ${port} --enable-lora` +
    (eagle3.enabled ? " " + eagle3.flags.join(" ") : "");
  return {
    venvPath,
    port,
    ready: prereqs.missing.length === 0,
    prereqs,
    eagle3,
    steps: [
      `python3 -m venv ${venvPath}`,
      `${venvPath}/bin/pip install --upgrade pip`,
      `${venvPath}/bin/pip install vllm`,
      launch,
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
  opts: { run?: boolean; venvPath?: string; port?: number; exec?: (cmd: string) => void } & Eagle3Options = {},
): InstallResult {
  const plan = planInstall(probe, opts);
  const eagleNote = plan.eagle3.requested ? ` ${plan.eagle3.note}` : "";
  if (!plan.ready) {
    return {
      installed: false,
      plan,
      message: `vLLM prerequisites missing: ${plan.prereqs.missing.join(", ")}. Staying on Ollama (no action taken).`,
    };
  }
  if (!opts.run) {
    return { installed: false, plan, message: "dry-run — prerequisites OK. Re-run with --run to install vLLM in " + plan.venvPath + eagleNote };
  }
  const exec = opts.exec;
  if (!exec) return { installed: false, plan, message: "no executor provided (internal)" };
  for (const step of plan.steps.slice(0, 3)) exec(step); // venv + pip upgrade + install (not the server launch)
  return { installed: true, plan, message: `vLLM installed in ${plan.venvPath}.${eagleNote} Start it with: mooter backend status` };
}

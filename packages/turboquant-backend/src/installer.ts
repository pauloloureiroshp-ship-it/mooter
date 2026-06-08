// Wave 33 (B.1) — TurboQuant opt-in build wrapper.
//
// TurboQuant (Google DeepMind, ICLR 2026, arXiv 2504.19874) is 3-bit KV-cache
// quantization giving 3.6–5.2× cache-memory reduction (model-dependent). Mainline
// llama.cpp REJECTED the PR (#21089, closed 2026-06-02), so the only path is a
// build-from-source of the AmesianX/TurboQuant fork. That needs CUDA 12.8 + CMake.
//
// This module DETECTS the toolchain honestly and refuses gracefully when it's
// absent — a user with no NVIDIA GPU / no CMake simply stays on stock
// llama.cpp/Ollama (doctrine #9: opt-in). The actual ~10-min build runs only with
// run:true AND prereqs present; otherwise we return the PLAN. Once built, the
// feature is two CLI flags on llama-server. EXPERIMENTAL.

export interface TqPrereqs {
  nvidiaSmi: boolean;
  cuda: boolean;
  cmake: boolean;
  git: boolean;
  missing: string[];
}

export interface ProbeFns {
  hasCommand: (cmd: string) => boolean;
  hasNvidiaGpu: () => boolean;
}

export const FORK_URL = "https://github.com/AmesianX/TurboQuant";
export const BUILD_DIR = ".turboquant-llama";
/** Valid KV cache types exposed by the fork (variant auto-resolves by head_dim). */
export const TQ_CACHE_TYPE = "tbq3";

export function detectPrereqs(probe: ProbeFns): TqPrereqs {
  const nvidiaSmi = probe.hasNvidiaGpu();
  const cuda = probe.hasCommand("nvcc") || nvidiaSmi;
  const cmake = probe.hasCommand("cmake");
  const git = probe.hasCommand("git");
  const missing: string[] = [];
  if (!nvidiaSmi) missing.push("NVIDIA GPU (nvidia-smi)");
  if (!cuda) missing.push("CUDA toolkit (nvcc)");
  if (!cmake) missing.push("CMake");
  if (!git) missing.push("git");
  return { nvidiaSmi, cuda, cmake, git, missing };
}

export interface BuildPlan {
  buildDir: string;
  steps: string[];
  ready: boolean;
  prereqs: TqPrereqs;
}

export function planBuild(probe: ProbeFns, opts: { buildDir?: string } = {}): BuildPlan {
  const prereqs = detectPrereqs(probe);
  const buildDir = opts.buildDir ?? BUILD_DIR;
  return {
    buildDir,
    ready: prereqs.missing.length === 0,
    prereqs,
    steps: [
      `git clone --depth 1 ${FORK_URL} ${buildDir}`,
      `cmake -S ${buildDir} -B ${buildDir}/build -DCMAKE_BUILD_TYPE=Release -DGGML_CUDA=ON`,
      `cmake --build ${buildDir}/build --config Release -j`,
    ],
  };
}

export interface BuildResult {
  built: boolean;
  plan: BuildPlan;
  message: string;
}

/**
 * Plan-or-build. `run` actually executes via `exec`; without it (default) we only
 * return the plan. Refuses to build when prereqs are missing (stays on stock
 * llama.cpp). The server launch is NOT run here — building yields the binary; the
 * user then points llama-server at it with the cache flags from cacheFlags().
 */
export function build(
  probe: ProbeFns,
  opts: { run?: boolean; buildDir?: string; exec?: (cmd: string) => void } = {},
): BuildResult {
  const plan = planBuild(probe, opts);
  if (!plan.ready) {
    return {
      built: false,
      plan,
      message: `TurboQuant prerequisites missing: ${plan.prereqs.missing.join(", ")}. Staying on stock llama.cpp/Ollama (no action taken).`,
    };
  }
  if (!opts.run) {
    return { built: false, plan, message: `dry-run — prerequisites OK. Re-run with --run to build the fork in ${plan.buildDir} (~10 min on an RTX 4090).` };
  }
  const exec = opts.exec;
  if (!exec) return { built: false, plan, message: "no executor provided — pass exec to actually build." };
  for (const step of plan.steps) exec(step);
  return { built: true, plan, message: `TurboQuant llama.cpp built in ${plan.buildDir}/build. Enable with: mooter turboquant enable` };
}

/** The llama-server flags that turn on 3-bit KV cache (k + v). */
export function cacheFlags(): string[] {
  return [`--cache-type-k ${TQ_CACHE_TYPE}`, `--cache-type-v ${TQ_CACHE_TYPE}`];
}

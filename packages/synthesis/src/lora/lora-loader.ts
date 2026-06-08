// L13 lora-loader — adapter load + hot-swap (Wave 31 Pastor v2).
//
// Two surfaces:
//   loadAdapter()    — validate-only, side-effect-free (Wave 29 contract, unchanged).
//                      Reports whether an adapter *could* load and why not.
//   hotSwapAdapter() — Wave 31: actually materialises the adapter into Ollama via
//                      `ollama create` (ADAPTER directive). Opt-in, latency-bounded,
//                      and degrades GRACEFULLY when Ollama lacks adapter support.
//
// Doctrine: a hot-swap only ever biases the model *inside* the tier classify.js
// already chose — it never changes the routing tier.

import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { getAdapter, isMaterialised, CURRENT_WAVE } from "./adapter-registry.ts";

export type LoadReason = "ready" | "not_found" | "ollama_unreachable" | "no_path" | "deferred" | "error";

export interface LoadResult {
  loaded: boolean; // loadAdapter never swaps → always false (use hotSwapAdapter to swap)
  adapter: string;
  reason: LoadReason;
  detail: string;
  wave_ready?: number;
}

type Spawn = (cmd: string, args: string[], opts: SpawnSyncOptions) => {
  status: number | null;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
};

export function ollamaReachable(spawn: Spawn = spawnSync): boolean {
  try {
    return spawn("ollama", ["--version"], { timeout: 4000 }).status === 0;
  } catch {
    return false;
  }
}

/**
 * Validate-and-report a manual adapter load. Never swaps.
 *   not_found          → no such adapter in the registry
 *   ollama_unreachable → the local Ollama daemon/binary isn't available
 *   no_path            → adapter registered but not materialised on disk
 *   deferred           → validated but wave_ready > current wave
 *   ready              → validated and ready to hot-swap (use hotSwapAdapter)
 */
export function loadAdapter(name: string, opts: { spawn?: Spawn } = {}): LoadResult {
  const adapter = getAdapter(name);
  if (!adapter) {
    return { loaded: false, adapter: name, reason: "not_found", detail: `no adapter named '${name}' in the registry` };
  }
  if (!ollamaReachable(opts.spawn)) {
    return {
      loaded: false,
      adapter: name,
      reason: "ollama_unreachable",
      detail: "Ollama is not reachable (daemon down or binary not in PATH); LoRA load needs a local Ollama backend",
      wave_ready: adapter.wave_ready,
    };
  }
  if (!isMaterialised(adapter)) {
    return {
      loaded: false,
      adapter: name,
      reason: "no_path",
      detail: adapter.path
        ? `adapter path '${adapter.path}' does not exist`
        : "adapter is registered but not materialised yet (no local files / not trained — run training first)",
      wave_ready: adapter.wave_ready,
    };
  }
  if (adapter.wave_ready > CURRENT_WAVE) {
    return {
      loaded: false,
      adapter: name,
      reason: "deferred",
      detail: `validated; this adapter targets Wave ${adapter.wave_ready} (current Wave ${CURRENT_WAVE}). Manual swap not performed.`,
      wave_ready: adapter.wave_ready,
    };
  }
  return {
    loaded: false,
    adapter: name,
    reason: "ready",
    detail: "validated and ready to hot-swap — call `hotSwapAdapter` (or `mooter lora load --swap`) to materialise it into Ollama",
    wave_ready: adapter.wave_ready,
  };
}

// ── Wave 31 hot-swap ─────────────────────────────────────────────────────────

export type SwapReason = LoadReason | "swapped" | "unsupported" | "not_opted_in";

export interface SwapResult {
  loaded: boolean;
  adapter: string;
  reason: SwapReason;
  detail: string;
  latency_ms?: number;
  model?: string; // the derived Ollama model tag, when swapped
}

export interface SwapOptions {
  spawn?: Spawn;
  /** Inject a clock for deterministic latency in tests. Default Date.now. */
  now?: () => number;
  /** Override the opt-in gate (defaults to the MOOTER_LORA_AUTOSWAP / prefs check). */
  force?: boolean;
  /** Soft latency budget; exceeding it is reported but not fatal. */
  latencyBudgetMs?: number;
}

/** Derived Ollama model tag for an adapter (e.g. "pastor-frontend" → "mooter-pastor-frontend"). */
export function swappedModelTag(name: string): string {
  return `mooter-${name}`.replace(/[^a-zA-Z0-9_.-]/g, "-");
}

/**
 * Hot-swap an adapter into Ollama via `ollama create <tag> --adapter <path>`.
 * Honest + graceful:
 *   - validates first (reuses loadAdapter); a non-ready adapter returns that reason.
 *   - if Ollama rejects the adapter directive (older build), returns reason
 *     "unsupported" with loaded:false — never throws, never corrupts state.
 *   - opt-in: pass force:true or set MOOTER_LORA_AUTOSWAP=1, else "not_opted_in".
 */
export function hotSwapAdapter(name: string, opts: SwapOptions = {}): SwapResult {
  const opted = opts.force === true || process.env.MOOTER_LORA_AUTOSWAP === "1";
  if (!opted) {
    return {
      loaded: false,
      adapter: name,
      reason: "not_opted_in",
      detail: "auto hot-swap is opt-in — set MOOTER_LORA_AUTOSWAP=1 or pass --swap to enable",
    };
  }

  const validation = loadAdapter(name, { spawn: opts.spawn });
  if (validation.reason !== "ready") {
    return { loaded: false, adapter: name, reason: validation.reason, detail: validation.detail, wave_ready: validation.wave_ready } as SwapResult;
  }

  const adapter = getAdapter(name)!;
  const spawn = opts.spawn ?? spawnSync;
  const clock = opts.now ?? Date.now;
  const tag = swappedModelTag(name);
  const budget = opts.latencyBudgetMs ?? 500;

  const t0 = clock();
  let res: { status: number | null; stderr?: string | Buffer };
  try {
    res = spawn("ollama", ["create", tag, "--adapter", adapter.path], { timeout: 60000 });
  } catch (e) {
    return { loaded: false, adapter: name, reason: "error", detail: `ollama create failed: ${(e as Error).message}` };
  }
  const latency = Math.max(0, clock() - t0);

  if (res.status === 0) {
    const overBudget = latency > budget ? ` (over ${budget}ms budget)` : "";
    return {
      loaded: true,
      adapter: name,
      reason: "swapped",
      detail: `hot-swapped '${name}' into Ollama as '${tag}'${overBudget}`,
      latency_ms: latency,
      model: tag,
    };
  }

  const stderr = res.stderr ? String(res.stderr) : "";
  const unsupported = /adapter|unknown flag|unrecognized|not supported/i.test(stderr);
  return {
    loaded: false,
    adapter: name,
    reason: unsupported ? "unsupported" : "error",
    detail: unsupported
      ? "this Ollama build does not support LoRA adapter loading — staying on the base model (no degradation)"
      : `ollama create exited ${res.status}: ${stderr.slice(0, 200)}`,
    latency_ms: latency,
  };
}

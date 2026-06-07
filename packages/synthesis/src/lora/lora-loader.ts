// L13 lora-loader — manual, validation-only load (Wave 29 foundation).
//
// In Wave 29 this does NOT perform a real hot-swap. It validates that an adapter
// could be loaded (exists, base model known, Ollama reachable, files present) and
// reports a structured reason. The actual `ollama create` / runtime swap is the
// Wave 31 deliverable. This keeps the foundation honest and side-effect-free.

import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { getAdapter, isMaterialised, CURRENT_WAVE } from "./adapter-registry.ts";

export type LoadReason = "ready" | "not_found" | "ollama_unreachable" | "no_path" | "deferred" | "error";

export interface LoadResult {
  loaded: boolean; // always false in Wave 29 (no hot-swap yet)
  adapter: string;
  reason: LoadReason;
  detail: string;
  wave_ready?: number;
}

type Spawn = (cmd: string, args: string[], opts: SpawnSyncOptions) => { status: number | null };

export function ollamaReachable(spawn: Spawn = spawnSync): boolean {
  try {
    return spawn("ollama", ["--version"], { timeout: 4000 }).status === 0;
  } catch {
    return false;
  }
}

/**
 * Validate-and-report a manual adapter load. Never swaps in Wave 29.
 *   not_found          → no such adapter in the registry
 *   ollama_unreachable → the local Ollama daemon/binary isn't available
 *   no_path            → adapter registered but not materialised on disk
 *   deferred           → validated but wave_ready > current wave (hot-swap is Wave 31)
 *   ready              → validated and could load now (engine still lands in Wave 31)
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
        : "adapter is registered but not materialised yet (no local files / not trained)",
      wave_ready: adapter.wave_ready,
    };
  }
  if (adapter.wave_ready > CURRENT_WAVE) {
    return {
      loaded: false,
      adapter: name,
      reason: "deferred",
      detail: `validated; auto hot-swap engine lands in Wave ${adapter.wave_ready} (LORAUTER). Manual swap not performed in Wave ${CURRENT_WAVE}.`,
      wave_ready: adapter.wave_ready,
    };
  }
  return {
    loaded: false,
    adapter: name,
    reason: "ready",
    detail: "validated and ready; the runtime hot-swap engine ships in Wave 31",
    wave_ready: adapter.wave_ready,
  };
}

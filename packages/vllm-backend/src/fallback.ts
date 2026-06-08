// Wave 32 (Phase H/I) — backend selection. vLLM when healthy, else Ollama. The
// default is ALWAYS Ollama unless vLLM is both opted-in and reachable, so a
// machine without vLLM degrades silently (doctrine #9).

import { health, type VllmHealth } from "./client.ts";

export type BackendKind = "vllm" | "ollama";

export interface BackendChoice {
  backend: BackendKind;
  reason: string;
  vllm?: VllmHealth;
}

/**
 * @param optIn  user enabled vLLM (`mooter backend install`/config). When false,
 *               always Ollama — we don't even probe.
 */
export async function chooseBackend(
  optIn: boolean,
  opts: { url?: string; fetchImpl?: typeof fetch } = {},
): Promise<BackendChoice> {
  if (!optIn) return { backend: "ollama", reason: "vLLM not enabled (default backend)" };
  const h = await health(opts);
  if (h.up) return { backend: "vllm", reason: `vLLM up (${h.models.length} model(s))`, vllm: h };
  return { backend: "ollama", reason: "vLLM enabled but unreachable — falling back to Ollama", vllm: h };
}

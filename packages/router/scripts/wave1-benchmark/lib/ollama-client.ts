// ollama-client.ts — Ollama HTTP wrapper (T0 tier of arm A).
//
// IMPORTANT (WSL2): Ollama runs on the Windows host, NOT localhost. We reach it
// via OLLAMA_HOST (default http://host.docker.internal:11434) over the HTTP API.
// The `ollama` CLI is NOT installed in this WSL env, so spawnSync('ollama') paths
// from the prod router will NOT work here — HTTP is the only viable transport.
//
// Same LlmResult shape as the Anthropic client. Token counts come from Ollama's
// prompt_eval_count (input) / eval_count (output). Cost is always $0 (local).

import type { LlmResult } from "./anthropic-client.ts";

export function ollamaHost(): string {
  return process.env.OLLAMA_HOST || "http://host.docker.internal:11434";
}

const BACKOFF_MS = [1000, 4000, 16000];
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface OllamaGenerateResponse {
  response?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

export interface OllamaCallOpts {
  model: string; // e.g. qwen3:30b
  user: string;
  system?: string;
  host?: string;
  timeoutMs?: number;
}

export async function callOllama(opts: OllamaCallOpts): Promise<LlmResult> {
  const host = opts.host ?? ollamaHost();
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const t0 = Date.now();
  let lastErr = "";

  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${host}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          model: opts.model,
          prompt: opts.user,
          ...(opts.system && opts.system.trim().length > 0 ? { system: opts.system } : {}),
          stream: false,
          options: { temperature: 0 },
        }),
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`ollama HTTP ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as OllamaGenerateResponse;
      return {
        text: data.response ?? "",
        tokens_input: data.prompt_eval_count ?? 0,
        tokens_output: data.eval_count ?? 0,
        latency_ms: Date.now() - t0,
        status: "ok",
        error: null,
      };
    } catch (err) {
      clearTimeout(timer);
      lastErr = err instanceof Error ? err.message : String(err);
      if (attempt < BACKOFF_MS.length) await sleep(BACKOFF_MS[attempt]);
    }
  }

  return {
    text: "",
    tokens_input: 0,
    tokens_output: 0,
    latency_ms: Date.now() - t0,
    status: "failed",
    error: `ollama ${opts.model} failed after ${BACKOFF_MS.length + 1} attempts: ${lastErr}`,
  };
}

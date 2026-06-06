// agent() API — Phase C (T2). Stub: signatures only.
//
// Runs a single subtask against a worker. Default backend is Ollama local
// (qwen2.5-coder:7b); `claude-api` is used only for the script writer (Opus)
// and synthesis. Reuses the host/model convention of tools/router/ollama_call.sh
// (honour OLLAMA_HOST; default localhost, but see Day 0 P3 for WSL).

import { notImplemented } from "./_stub.ts";

export type Backend = "ollama" | "claude-api";

export interface AgentRequest {
  /** e.g. "qwen2.5-coder:7b" (ollama) or "claude-opus-4-8" (claude-api) */
  model: string;
  prompt: string;
  /** Tool allow-list, reusing the CLI's existing readers (Read, Grep, Glob). */
  tools?: string[];
  max_tokens?: number;
  /** Inferred from model if omitted (claude-* → claude-api, else ollama). */
  backend?: Backend;
  /** Overrides OLLAMA_HOST for this call (Phase C). */
  host?: string;
}

export interface AgentResult {
  result: string;
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  cost_usd: number;
}

export async function agent(_req: AgentRequest): Promise<AgentResult> {
  return notImplemented("agent()", "C");
}

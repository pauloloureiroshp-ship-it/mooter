// agent() API — Phase C.
//
// Runs a single subtask against a worker. Default backend is Ollama local
// (qwen2.5-coder:7b); `claude-api` is reserved for the script writer (Opus) and
// synthesis. Host resolution follows the router convention (honour OLLAMA_HOST;
// default localhost — but in WSL Ollama lives on the Windows host, see Day 0 P3,
// so pass `host` or set OLLAMA_HOST). Cost is keyed on BACKEND: local = $0,
// cloud = canonical priceTurn(). Returns honest token/latency/cost accounting.

import { priceTurn } from "./pricing.ts";

export type Backend = "ollama" | "claude-api";

export interface AgentRequest {
  /** e.g. "qwen2.5-coder:7b" (ollama) or "claude-opus-4-8" (claude-api). */
  model: string;
  prompt: string;
  /** Optional system prompt. */
  system?: string;
  /** Tool allow-list. Accepted now; the tool-use loop lands with the runtime
   *  (Phase E). See tools.ts for the underlying Read/Grep/Glob implementations. */
  tools?: string[];
  max_tokens?: number;
  /** Inferred from model if omitted (claude/opus/sonnet/haiku → claude-api). */
  backend?: Backend;
  /** Base URL override — Ollama host or Claude base URL (used by tests/mocks). */
  host?: string;
  /** Sampling temperature. Default 0 (deterministic worker output). */
  temperature?: number;
  /** Per-call timeout. Default 120s. Ignored if `signal` is given. */
  timeoutMs?: number;
  /** Caller-supplied cancellation. */
  signal?: AbortSignal;
}

export interface AgentResult {
  result: string;
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  cost_usd: number;
  model: string;
  backend: Backend;
}

export class AgentError extends Error {
  readonly backend: Backend;
  readonly status?: number;
  constructor(message: string, backend: Backend, status?: number) {
    super(message);
    this.name = "AgentError";
    this.backend = backend;
    this.status = status;
  }
}

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_OLLAMA_HOST = "http://localhost:11434";
const DEFAULT_CLAUDE_BASE = "https://api.anthropic.com";

export function inferBackend(model: string): Backend {
  return /claude|opus|sonnet|haiku/i.test(model) ? "claude-api" : "ollama";
}

function estimateTokens(text: string): number {
  return Math.ceil((text || "").length / 4);
}

function asInt(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : undefined;
}

function callSignal(req: AgentRequest): AbortSignal {
  return req.signal ?? AbortSignal.timeout(req.timeoutMs ?? DEFAULT_TIMEOUT_MS);
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "<no body>";
  }
}

interface OllamaGenerateResponse {
  response?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

async function callOllama(req: AgentRequest): Promise<{ result: string; tokens_in: number; tokens_out: number }> {
  const host = (req.host ?? process.env.OLLAMA_HOST ?? DEFAULT_OLLAMA_HOST).replace(/\/+$/, "");
  const body = {
    model: req.model,
    prompt: req.prompt,
    ...(req.system ? { system: req.system } : {}),
    stream: false,
    options: {
      temperature: req.temperature ?? 0,
      ...(req.max_tokens ? { num_predict: req.max_tokens } : {}),
    },
  };
  let res: Response;
  try {
    res = await fetch(`${host}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: callSignal(req),
    });
  } catch (err) {
    throw new AgentError(`ollama request failed (${host}): ${(err as Error).message}`, "ollama");
  }
  if (!res.ok) throw new AgentError(`ollama ${res.status}: ${await safeText(res)}`, "ollama", res.status);
  const j = (await res.json()) as OllamaGenerateResponse;
  const result = String(j.response ?? "");
  return {
    result,
    tokens_in: asInt(j.prompt_eval_count) ?? estimateTokens((req.system ?? "") + req.prompt),
    tokens_out: asInt(j.eval_count) ?? estimateTokens(result),
  };
}

interface ClaudeMessagesResponse {
  content?: Array<{ type?: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

async function callClaude(req: AgentRequest): Promise<{ result: string; tokens_in: number; tokens_out: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey && !req.host) throw new AgentError("ANTHROPIC_API_KEY is not set", "claude-api", 401);
  const base = (req.host ?? process.env.ANTHROPIC_BASE_URL ?? DEFAULT_CLAUDE_BASE).replace(/\/+$/, "");
  const body = {
    model: req.model,
    max_tokens: req.max_tokens ?? 1024,
    ...(req.system ? { system: req.system } : {}),
    messages: [{ role: "user", content: req.prompt }],
  };
  let res: Response;
  try {
    res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: callSignal(req),
    });
  } catch (err) {
    throw new AgentError(`claude request failed (${base}): ${(err as Error).message}`, "claude-api");
  }
  if (!res.ok) throw new AgentError(`claude ${res.status}: ${await safeText(res)}`, "claude-api", res.status);
  const j = (await res.json()) as ClaudeMessagesResponse;
  const result = Array.isArray(j.content)
    ? j.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("")
    : "";
  return {
    result,
    tokens_in: asInt(j.usage?.input_tokens) ?? estimateTokens(req.prompt),
    tokens_out: asInt(j.usage?.output_tokens) ?? estimateTokens(result),
  };
}

/** Run one subtask. Throws AgentError on transport / HTTP failure. */
export async function agent(req: AgentRequest): Promise<AgentResult> {
  const backend = req.backend ?? inferBackend(req.model);
  const started = performance.now();
  const { result, tokens_in, tokens_out } =
    backend === "ollama" ? await callOllama(req) : await callClaude(req);
  const latency_ms = Math.round(performance.now() - started);
  // Local inference is free; only the cloud backend costs money.
  const cost_usd = backend === "ollama" ? 0 : priceTurn(req.model, tokens_in, tokens_out);
  return { result, tokens_in, tokens_out, latency_ms, cost_usd, model: req.model, backend };
}

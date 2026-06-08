// Wave 32 (Phase H) — vLLM HTTP client (OpenAI-compatible server on :8000).
// Health check + a thin completion wrapper. All network is injectable.

export const DEFAULT_VLLM_URL = process.env.VLLM_URL?.replace(/\/$/, "") || `http://localhost:8000`;

export interface VllmHealth {
  up: boolean;
  models: string[];
  url: string;
}

export async function health(opts: { url?: string; fetchImpl?: typeof fetch } = {}): Promise<VllmHealth> {
  const url = (opts.url ?? DEFAULT_VLLM_URL).replace(/\/$/, "");
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${url}/v1/models`, { signal: AbortSignal.timeout(1000) });
    if (!res.ok) return { up: false, models: [], url };
    const j = (await res.json()) as { data?: { id: string }[] };
    return { up: true, models: (j.data ?? []).map((m) => m.id), url };
  } catch {
    return { up: false, models: [], url };
  }
}

export interface CompletionRequest {
  prompt: string;
  model: string;
  /** vLLM LoRA module name to apply for this request (Multi-LoRA). */
  lora?: string;
  maxTokens?: number;
}

export interface CompletionResult {
  text: string;
  model: string;
  lora?: string;
}

/** POST /v1/completions with an optional LoRA module. Throws on non-200. */
export async function complete(req: CompletionRequest, opts: { url?: string; fetchImpl?: typeof fetch } = {}): Promise<CompletionResult> {
  const url = (opts.url ?? DEFAULT_VLLM_URL).replace(/\/$/, "");
  const doFetch = opts.fetchImpl ?? fetch;
  // vLLM serves a LoRA adapter as a "model" name when launched with --enable-lora
  // and the adapter registered; we pass it as the model to route the request.
  const model = req.lora ?? req.model;
  const res = await doFetch(`${url}/v1/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, prompt: req.prompt, max_tokens: req.maxTokens ?? 256 }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`vLLM ${res.status}`);
  const j = (await res.json()) as { choices?: { text?: string }[] };
  return { text: j.choices?.[0]?.text ?? "", model: req.model, lora: req.lora };
}

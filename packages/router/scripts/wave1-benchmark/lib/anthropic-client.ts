// anthropic-client.ts — thin Anthropic SDK wrapper with retry/backoff.
//
// Returns a uniform LlmResult (text + token usage + latency) so the arms and the
// judge share one call path. Retry policy per MASTER_PROMPT §E: 3 attempts,
// exponential backoff 1s/4s/16s, then surface a failed result (caller records it).

import Anthropic from "@anthropic-ai/sdk";

export interface LlmResult {
  text: string;
  tokens_input: number;
  tokens_output: number;
  latency_ms: number;
  status: "ok" | "failed";
  error: string | null;
}

export interface AnthropicCallOpts {
  model: string;
  user: string;
  system?: string; // omitted when empty → "bare" arm
  maxTokens?: number;
  temperature?: number;
}

const BACKOFF_MS = [1000, 4000, 16000];

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing from env");
  _client = new Anthropic({ apiKey });
  return _client;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function callAnthropic(opts: AnthropicCallOpts): Promise<LlmResult> {
  const maxTokens = opts.maxTokens ?? 4096;
  const t0 = Date.now();
  let lastErr = "";

  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    try {
      const msg = await client().messages.create({
        model: opts.model,
        max_tokens: maxTokens,
        temperature: opts.temperature ?? 0,
        ...(opts.system && opts.system.trim().length > 0 ? { system: opts.system } : {}),
        messages: [{ role: "user", content: opts.user }],
      });
      const text = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      return {
        text,
        tokens_input: msg.usage.input_tokens,
        tokens_output: msg.usage.output_tokens,
        latency_ms: Date.now() - t0,
        status: "ok",
        error: null,
      };
    } catch (err) {
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
    error: `anthropic ${opts.model} failed after ${BACKOFF_MS.length + 1} attempts: ${lastErr}`,
  };
}

// Model callers for the benchmark (Wave 30 Phase L).
//
// A ModelSpec wraps a real backend (local Ollama or Anthropic) behind a uniform
// `call(prompt) → {text, costUsd, latencyMs, error?}`. Callers never throw — a
// failed call returns an error field so the runner can degrade gracefully.

import type { Tier } from "../types.ts";

export interface CallOutcome {
  text: string;
  costUsd: number;
  latencyMs: number;
  error?: string;
}

export interface ModelSpec {
  id: string;
  tier: Tier;
  kind: "local" | "cloud";
  call: (prompt: string) => Promise<CallOutcome>;
}

// Approx Anthropic pricing (USD per 1M tokens) — used to estimate per-call cost.
const ANTHROPIC_PRICE: Record<string, { in: number; out: number }> = {
  "claude-haiku-4-5-20251001": { in: 1.0, out: 5.0 },
  "claude-sonnet-4-6": { in: 3.0, out: 15.0 },
  "claude-opus-4-8": { in: 15.0, out: 75.0 },
};

function now(): number {
  // process.hrtime is monotonic and available; Date.now would do but hrtime is safer.
  return Number(process.hrtime.bigint() / 1000000n);
}

export function makeOllamaModel(id: string, tier: Tier, opts: { host?: string; timeoutMs?: number } = {}): ModelSpec {
  const host = opts.host ?? "http://localhost:11434";
  const timeoutMs = opts.timeoutMs ?? 120000;
  return {
    id,
    tier,
    kind: "local",
    async call(prompt: string): Promise<CallOutcome> {
      const t0 = now();
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      try {
        const res = await fetch(`${host}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: id, prompt, stream: false, options: { temperature: 0.2 } }),
          signal: ac.signal,
        });
        if (!res.ok) return { text: "", costUsd: 0, latencyMs: now() - t0, error: `ollama HTTP ${res.status}` };
        const json = (await res.json()) as { response?: string };
        return { text: json.response ?? "", costUsd: 0, latencyMs: now() - t0 };
      } catch (e) {
        return { text: "", costUsd: 0, latencyMs: now() - t0, error: (e as Error).message };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export function makeAnthropicModel(
  id: string,
  tier: Tier,
  opts: { apiKey?: string; maxTokens?: number; timeoutMs?: number } = {},
): ModelSpec {
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
  const maxTokens = opts.maxTokens ?? 512;
  const timeoutMs = opts.timeoutMs ?? 60000;
  const price = ANTHROPIC_PRICE[id] ?? { in: 3.0, out: 15.0 };
  return {
    id,
    tier,
    kind: "cloud",
    async call(prompt: string): Promise<CallOutcome> {
      const t0 = now();
      if (!apiKey) return { text: "", costUsd: 0, latencyMs: 0, error: "no ANTHROPIC_API_KEY" };
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: id,
            max_tokens: maxTokens,
            messages: [{ role: "user", content: prompt }],
          }),
          signal: ac.signal,
        });
        if (!res.ok) {
          const body = await res.text();
          return { text: "", costUsd: 0, latencyMs: now() - t0, error: `anthropic HTTP ${res.status}: ${body.slice(0, 120)}` };
        }
        const json = (await res.json()) as {
          content?: Array<{ text?: string }>;
          usage?: { input_tokens?: number; output_tokens?: number };
        };
        const text = (json.content ?? []).map((c) => c.text ?? "").join("");
        const inTok = json.usage?.input_tokens ?? 0;
        const outTok = json.usage?.output_tokens ?? 0;
        const costUsd = (inTok * price.in + outTok * price.out) / 1_000_000;
        return { text, costUsd, latencyMs: now() - t0 };
      } catch (e) {
        return { text: "", costUsd: 0, latencyMs: now() - t0, error: (e as Error).message };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

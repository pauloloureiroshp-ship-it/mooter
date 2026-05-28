// embedding-perf.test.ts — Wave 2 Day 3 performance budget.
//
// Budgets (from the Day 3 brief):
//   - init: pre-compute seed embeddings for every pack ≤ 5s
//   - classify (per prompt, including embed + cosine + linear scan) p99 ≤ 80ms
//
// Skipped (not failed) when Ollama is unreachable so CI without Ollama still
// passes the suite. Local dev / RTX env must hit the budgets.

import { test } from "node:test";
import assert from "node:assert/strict";
import { EmbeddingStore } from "../src/embedding_store.ts";
import { OllamaClient, DEFAULT_OLLAMA_URL } from "../src/ollama_client.ts";

async function ollamaReachable(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`${DEFAULT_OLLAMA_URL}/api/tags`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

const PROBE_PROMPTS = [
  "preciso de uma animação no hero",
  "audita este endpoint para SQL injection",
  "desenha um diagrama de sequência",
  "configura edge functions no Vercel",
  "review the scroll-trigger animation for security",
  "modal com bounce subtil",
  "secret scan ao config",
  "diagrama entidade-relacionamento de um blog",
  "transição suave de cor no hover",
  "OAuth2 sequence diagram",
];

test("EmbeddingStore.init() finishes under 5s", { timeout: 15_000 }, async (t) => {
  if (!(await ollamaReachable())) return t.skip("Ollama unreachable");
  const store = new EmbeddingStore(new OllamaClient());
  const t0 = performance.now();
  await store.init();
  const elapsed = performance.now() - t0;
  assert.ok(store.isReady(), "store should be ready after init");
  assert.ok(
    elapsed < 5_000,
    `init took ${elapsed.toFixed(0)}ms (budget 5000ms)`,
  );
});

test(
  "EmbeddingStore.classify() p99 ≤ 80ms over 10 prompts",
  { timeout: 30_000 },
  async (t) => {
    if (!(await ollamaReachable())) return t.skip("Ollama unreachable");
    const store = new EmbeddingStore(new OllamaClient());
    await store.init();
    // Warm a couple of classifications before measuring so the JIT / first
    // socket are out of the measurement window.
    await store.classify("warmup");
    await store.classify("warmup 2");

    const latencies: number[] = [];
    for (const p of PROBE_PROMPTS) {
      const t0 = performance.now();
      const r = await store.classify(p);
      latencies.push(performance.now() - t0);
      assert.ok(r, `classify must return a result for "${p}"`);
    }
    latencies.sort((a, b) => a - b);
    const p99Idx = Math.min(latencies.length - 1, Math.floor(latencies.length * 0.99));
    const p99 = latencies[p99Idx];
    assert.ok(
      p99 <= 80,
      `p99 was ${p99.toFixed(0)}ms — budget 80ms. samples (sorted ms): ${latencies.map((l) => l.toFixed(0)).join(", ")}`,
    );
  },
);

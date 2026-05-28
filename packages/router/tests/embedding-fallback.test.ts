// embedding-fallback.test.ts — Wave 2 Day 3.
//
// The combined classifier must NEVER fail loudly when Ollama is unreachable.
// EmbeddingStore.classify() catches errors and returns null; the combined
// function then tags the result with source="regex_fallback" and returns the
// v1 (regex) classification untouched. This test simulates Ollama-down by
// pointing OllamaClient at a port that nobody is listening on.

import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyDomainCombined, loadPacks } from "../src/classify_domain.ts";
import { EmbeddingStore } from "../src/embedding_store.ts";
import { OllamaClient } from "../src/ollama_client.ts";

const PACKS = loadPacks();

// Port 1 is reserved by IANA and nothing answers there → instant connection
// refusal in most envs, never a real embedding response.
const DEAD_OLLAMA = "http://127.0.0.1:1";

test(
  "classifyDomainCombined: Ollama unreachable → regex_fallback, no throw",
  { timeout: 8_000 },
  async () => {
    const deadStore = new EmbeddingStore(new OllamaClient(DEAD_OLLAMA, 500));
    const result = await classifyDomainCombined(
      "preciso de uma animação scroll-trigger no hero",
      PACKS,
      deadStore,
    );
    assert.equal(result.source, "regex_fallback");
    // v1 picked the right pack on its own — the fallback must preserve that.
    assert.equal(result.pack_id, "animation-web");
    assert.ok(result.confidence > 0, "v1 confidence must propagate");
    assert.equal(result.embedding_similarity, undefined);
  },
);

test(
  "classifyDomainCombined: Ollama dead AND v1 GENERAL → returns GENERAL untouched",
  { timeout: 8_000 },
  async () => {
    const deadStore = new EmbeddingStore(new OllamaClient(DEAD_OLLAMA, 500));
    const result = await classifyDomainCombined(
      "configura edge functions no Vercel para fazer redirects por geolocalização",
      PACKS,
      deadStore,
    );
    assert.equal(result.source, "regex_fallback");
    assert.equal(result.pack_id, "GENERAL");
    assert.equal(result.embedding_similarity, undefined);
  },
);

test(
  "EmbeddingStore.classify: dead Ollama → null (not throw)",
  { timeout: 8_000 },
  async () => {
    const deadStore = new EmbeddingStore(new OllamaClient(DEAD_OLLAMA, 500));
    const r = await deadStore.classify("anything");
    assert.equal(r, null);
    assert.equal(deadStore.isReady(), false);
  },
);

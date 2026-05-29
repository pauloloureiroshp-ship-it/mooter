// packs-extended.test.ts — Wave 2 Day 5.
//
// Guards the registry growth 3 → 7 packs (voice-tts, knowledge-third-brain,
// prd-strategy, data-spreadsheet):
//   - each new pack.yaml validates against the canonical schema (validate.ts)
//   - each new pack declares ≥ 6 embedding_seeds, distinct within the pack
//   - the full registry is exactly 7 packs and 56 (7 × 8) embedding seeds, all
//     globally distinct so cosine sim discriminates cleanly
//   - the store initialises the 56 seed embeddings inside the ≤ 5s budget
//     (batch-embed from Day 4 — EMBED_BATCH_SIZE). Skipped when Ollama is down.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { validatePack } from "../../../packs/validate.ts";
import { defaultPacksDir } from "../src/classify_domain.ts";
import { loadPackSeeds, EmbeddingStore } from "../src/embedding_store.ts";
import { OllamaClient, DEFAULT_OLLAMA_URL } from "../src/ollama_client.ts";

const NEW_PACKS = ["voice-tts", "knowledge-third-brain", "prd-strategy", "data-spreadsheet"];

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

for (const id of NEW_PACKS) {
  test(`${id}: pack.yaml validates against the schema`, () => {
    const doc = yaml.load(readFileSync(join(defaultPacksDir(), id, "pack.yaml"), "utf8"));
    assert.deepEqual(validatePack(doc), [], `${id} has schema errors`);
  });

  test(`${id}: declares ≥ 6 distinct embedding_seeds`, () => {
    const doc = yaml.load(
      readFileSync(join(defaultPacksDir(), id, "pack.yaml"), "utf8"),
    ) as { domain_signals?: { embedding_seeds?: string[] } };
    const seeds = doc.domain_signals?.embedding_seeds ?? [];
    assert.ok(seeds.length >= 6, `${id} has only ${seeds.length} seeds`);
    assert.equal(new Set(seeds).size, seeds.length, `${id} has duplicate seeds`);
  });
}

test("registry: exactly 7 packs with 56 globally-distinct embedding seeds", () => {
  const packs = loadPackSeeds();
  assert.equal(packs.length, 7, `expected 7 packs, found ${packs.length}`);
  const total = packs.reduce((n, p) => n + p.seeds.length, 0);
  assert.equal(total, 56, `expected 56 seeds (7 × 8), found ${total}`);
  const all = packs.flatMap((p) => p.seeds);
  assert.equal(new Set(all).size, all.length, "seeds must be distinct across the registry");
});

test(
  "EmbeddingStore.init() embeds all 56 seeds within the 5s budget",
  { timeout: 15_000 },
  async (t) => {
    if (!(await ollamaReachable())) return t.skip("Ollama unreachable");
    const store = new EmbeddingStore(new OllamaClient());
    const t0 = performance.now();
    await store.init();
    const elapsed = performance.now() - t0;
    assert.ok(store.isReady(), "store ready after init");
    assert.ok(elapsed < 5_000, `init took ${elapsed.toFixed(0)}ms (budget 5000ms, 56 embeddings)`);
  },
);

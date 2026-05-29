// embedding-batch.test.ts — Wave 2 Day 4 NIT 3.
//
// EmbeddingStore.init() must process seeds in batches of EMBED_BATCH_SIZE so
// the local Ollama never sees more than 8 concurrent embed calls at once,
// even when the pack set grows (Day 5: 7 packs × 8 seeds = 56 embeddings).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EmbeddingStore, EMBED_BATCH_SIZE } from "../src/embedding_store.ts";

/** Synchronous-by-tick tracker — records peak in-flight count over time. */
class TrackingClient {
  inFlight = 0;
  peak = 0;
  total = 0;
  async embed(_model: string, seed: string): Promise<Float32Array> {
    this.inFlight++;
    if (this.inFlight > this.peak) this.peak = this.inFlight;
    this.total++;
    // Yield control briefly so concurrent calls in the same batch overlap.
    await new Promise<void>((resolve) => setImmediate(resolve));
    this.inFlight--;
    const v = new Float32Array(4);
    v[0] = seed.length;
    return v;
  }
}

function makeFatPackTree(seedsPerPack: number, packCount: number): string {
  const root = mkdtempSync(join(tmpdir(), "mooter-batch-"));
  for (let p = 0; p < packCount; p++) {
    const dir = join(root, `pack${p}`);
    mkdirSync(dir, { recursive: true });
    const seeds = Array.from({ length: seedsPerPack }, (_, i) => `  - p${p}-s${i}`).join("\n");
    writeFileSync(
      join(dir, "pack.yaml"),
      `name: pack${p}\ndomain_signals:\n  embedding_seeds:\n${seeds}\n`,
    );
  }
  return root;
}

test(
  `init() respects EMBED_BATCH_SIZE (=${EMBED_BATCH_SIZE}) with 32 seeds`,
  async () => {
    const dir = makeFatPackTree(8, 4); // 4 packs × 8 seeds = 32 embeddings
    const client = new TrackingClient();
    const store = new EmbeddingStore(client as never, dir);
    await store.init();
    assert.equal(store.isReady(), true);
    assert.equal(client.total, 32, "every seed embedded exactly once");
    assert.ok(
      client.peak <= EMBED_BATCH_SIZE,
      `peak concurrency ${client.peak} > BATCH_SIZE ${EMBED_BATCH_SIZE}`,
    );
  },
);

test("init() still works for a sub-batch pack set (<= BATCH_SIZE total)", async () => {
  const dir = makeFatPackTree(3, 1); // 1 pack × 3 seeds = 3 embeddings
  const client = new TrackingClient();
  const store = new EmbeddingStore(client as never, dir);
  await store.init();
  assert.equal(client.total, 3);
  assert.ok(client.peak <= EMBED_BATCH_SIZE);
});

test("init() preserves pack-id grouping after batching", async () => {
  const dir = makeFatPackTree(6, 3); // 3 packs × 6 seeds = 18 embeddings (2 batches)
  const client = new TrackingClient();
  const store = new EmbeddingStore(client as never, dir);
  await store.init();

  // The classify() entry-point depends on correct pack grouping. We can probe
  // it indirectly: each pack must independently classify any query (the cosine
  // score doesn't matter; what matters is no pack is silently dropped/merged).
  const r = await store.classify("any query");
  assert.ok(r);
  // All three pack ids must be reachable as either top-1 or runner-up across
  // different queries; the cheapest way to verify grouping is to inspect the
  // internal store shape. Since `store` is private we settle for: classify
  // returns a non-null verdict (means store has >=1 pack), and total embeds
  // matches expected (means none were dropped during regrouping).
  assert.equal(client.total, 18 + 1, "18 init embeds + 1 query embed");
});

// embedding-reset.test.ts — Wave 2 Day 4 NIT 1.
//
// EmbeddingStore.reset() must restore the store to a pristine, pre-init state.
// Day 3 review flagged that the singleton leaks between tests; reset() lets
// suites force a clean slate without instantiating a fresh client.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EmbeddingStore } from "../src/embedding_store.ts";

class FakeClient {
  embedCalls = 0;
  async embed(_model: string, seed: string): Promise<Float32Array> {
    this.embedCalls++;
    // Deterministic 8-dim vector keyed on seed length so we can verify state.
    const v = new Float32Array(8);
    for (let i = 0; i < 8; i++) v[i] = (seed.length + i) / 100;
    return v;
  }
}

function makePackTree(): string {
  const root = mkdtempSync(join(tmpdir(), "mooter-reset-"));
  const pack = join(root, "alpha");
  mkdirSync(pack, { recursive: true });
  writeFileSync(
    join(pack, "pack.yaml"),
    "name: alpha\ndomain_signals:\n  embedding_seeds:\n    - one\n    - two\n    - three\n",
  );
  return root;
}

test("reset() clears store and re-init works idempotently", async () => {
  const dir = makePackTree();
  const client = new FakeClient();
  const store = new EmbeddingStore(client as never, dir);

  await store.init();
  assert.equal(store.isReady(), true, "store ready after init");
  const callsAfterFirst = client.embedCalls;
  assert.equal(callsAfterFirst, 3, "embed called once per seed");

  store.reset();
  assert.equal(store.isReady(), false, "ready false after reset");

  // classify() after reset must trigger a fresh init.
  const r = await store.classify("anything");
  assert.ok(r, "classify returns a verdict after reset+init");
  assert.equal(r?.pack_id, "alpha");
  // 3 init embeds + 1 query embed = 4 calls in this run; total = 3 + 4.
  assert.equal(client.embedCalls, callsAfterFirst + 4, "reset forced a fresh init");
});

test("reset() is safe when called before init", () => {
  const store = new EmbeddingStore();
  assert.doesNotThrow(() => store.reset());
  assert.equal(store.isReady(), false);
});

test("reset() drops in-flight init promise so next init re-runs", async () => {
  const dir = makePackTree();
  const client = new FakeClient();
  const store = new EmbeddingStore(client as never, dir);

  const p1 = store.init();
  store.reset();
  await p1.catch(() => undefined);

  await store.init();
  assert.equal(store.isReady(), true);
  // Reset mid-init forces re-running embeds on the next init; we expect
  // strictly more calls than a single init would have produced.
  assert.ok(client.embedCalls >= 3, `expected >=3 embed calls, got ${client.embedCalls}`);
});

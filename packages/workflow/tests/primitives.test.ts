// primitives suite (Phase D) — parallel / vote / converge / checkpoint / log,
// plus the Phase D gate e2e (parallel → vote → checkpoint).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parallel,
  vote,
  converge,
  checkpoint,
  log,
  setSink,
  createMemorySink,
} from "../src/primitives.ts";

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── parallel ────────────────────────────────────────────────────────────────

test("parallel preserves input order despite concurrency", async () => {
  const out = await parallel([1, 2, 3, 4, 5], async (n) => {
    await delay(n % 2 ? 10 : 1); // jitter so completion order != input order
    return n * 2;
  });
  assert.deepEqual(out, [2, 4, 6, 8, 10]);
});

test("parallel respects the concurrency cap", async () => {
  let active = 0;
  let peak = 0;
  await parallel(
    [0, 1, 2, 3, 4, 5],
    async () => {
      active += 1;
      peak = Math.max(peak, active);
      await delay(15);
      active -= 1;
    },
    { concurrency: 2 },
  );
  assert.ok(peak <= 2, `peak ${peak} exceeded concurrency 2`);
});

test("parallel rejects on first task error", async () => {
  await assert.rejects(
    parallel([1, 2, 3], async (n) => {
      if (n === 2) throw new Error("boom");
      return n;
    }),
    /boom/,
  );
});

test("parallel([]) → []", async () => {
  assert.deepEqual(await parallel([], async (x) => x), []);
});

// ── vote ──────────────────────────────────────────────────────────────────

test("vote returns the survivors voteFn keeps", async () => {
  const survivors = await vote([1, 2, 3, 4], async (c) => c.filter((x) => x % 2 === 0));
  assert.deepEqual(survivors, [2, 4]);
});

test("vote([]) short-circuits to [] without calling voteFn", async () => {
  let called = false;
  const out = await vote([], async (c) => {
    called = true;
    return c;
  });
  assert.deepEqual(out, []);
  assert.equal(called, false);
});

// ── converge ────────────────────────────────────────────────────────────────

test("converge stops at fixpoint (same reference returned)", async () => {
  let calls = 0;
  const out = await converge(
    [1],
    async (r) => {
      calls += 1;
      return r < 3 ? r + 1 : r; // primitive: r===r once stable
    },
    10,
  );
  assert.deepEqual(out, [3]);
  assert.equal(calls, 3); // 1→2, 2→3, 3→3(detect)
});

test("converge drops items when refineFn returns null", async () => {
  const out = await converge([1, 2, 3], async (r) => (r === 2 ? null : r), 5);
  assert.deepEqual(out, [1, 3]);
});

test("converge honours maxIterations when never reaching fixpoint", async () => {
  const out = await converge([0], async (r) => r + 1, 3); // always changes
  assert.deepEqual(out, [3]);
});

// ── checkpoint / log (ambient sink) ───────────────────────────────────────────

test("checkpoint writes to the installed sink", async () => {
  const sink = createMemorySink();
  setSink(sink);
  await checkpoint("phase-1", { found: 7 });
  assert.equal(sink.checkpoints.length, 1);
  assert.equal(sink.checkpoints[0].name, "phase-1");
  assert.deepEqual(sink.checkpoints[0].data, { found: 7 });
  assert.ok(sink.checkpoints[0].ts > 0);
});

test("log writes to the installed sink", async () => {
  const sink = createMemorySink();
  setSink(sink);
  await log("scanning", { files: 34 });
  assert.equal(sink.logs.length, 1);
  assert.equal(sink.logs[0].message, "scanning");
  assert.deepEqual(sink.logs[0].metadata, { files: 34 });
});

// ── Phase D gate: parallel → vote → checkpoint ────────────────────────────────

test("GATE e2e: parallel → vote → checkpoint", async () => {
  const sink = createMemorySink();
  setSink(sink);

  const doubled = await parallel([1, 2, 3, 4, 5], async (n) => n * 2); // [2,4,6,8,10]
  const survivors = await vote(doubled, async (c) => c.filter((x) => x > 4)); // [6,8,10]
  await checkpoint("survivors", survivors);

  assert.deepEqual(doubled, [2, 4, 6, 8, 10]);
  assert.deepEqual(survivors, [6, 8, 10]);
  assert.equal(sink.checkpoints.length, 1);
  assert.equal(sink.checkpoints[0].name, "survivors");
  assert.deepEqual(sink.checkpoints[0].data, [6, 8, 10]);
});

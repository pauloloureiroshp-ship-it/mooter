// Wave 33 (C.3) — `mooter pricing-update`: pull + cache + graceful fallback.
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

import { runPricingUpdate, readCache } from "../src/commands/pricing.ts";

const BODY = {
  generated_at: "1970-01-01T00:00:00.000Z",
  source: "canonical",
  models: [{ id: "claude-opus-4-6", tier: "T3", input: 5, output: 25 }],
};

function fakeFetch(body: unknown, ok = true): typeof fetch {
  return (async () => ({ ok, status: ok ? 200 : 500, json: async () => body })) as unknown as typeof fetch;
}

test("pricing-update writes the cache from the hub response", async () => {
  const home = mkdtempSync(tmpdir() + "/mooter-pr-");
  const r = await runPricingUpdate([], { home, fetchImpl: fakeFetch(BODY), now: 123 });
  assert.strictEqual(r.exitCode, 0);
  const c = readCache(home)!;
  assert.strictEqual(c.models.length, 1);
  assert.strictEqual(c.pulled_at, 123);
});

test("pricing-update keeps the existing cache on a hub error", async () => {
  const home = mkdtempSync(tmpdir() + "/mooter-pr2-");
  await runPricingUpdate([], { home, fetchImpl: fakeFetch(BODY) }); // seed
  const r = await runPricingUpdate([], { home, fetchImpl: fakeFetch(null, false) });
  assert.strictEqual(r.exitCode, 1);
  assert.match(r.output, /kept existing cache/);
  assert.strictEqual(readCache(home)!.models.length, 1, "good cache preserved");
});

test("pricing-update --show prints the cache", async () => {
  const home = mkdtempSync(tmpdir() + "/mooter-pr3-");
  await runPricingUpdate([], { home, fetchImpl: fakeFetch(BODY) });
  const r = await runPricingUpdate(["--show"], { home });
  assert.strictEqual(r.exitCode, 0);
  assert.match(r.output, /claude-opus-4-6/);
});

test("pricing-update never throws on a network failure", async () => {
  const home = mkdtempSync(tmpdir() + "/mooter-pr4-");
  const r = await runPricingUpdate([], { home, fetchImpl: (async () => { throw new Error("offline"); }) as unknown as typeof fetch });
  assert.strictEqual(r.exitCode, 1);
  assert.match(r.output, /kept existing cache/);
});

test("pricing-update --dry-run previews without writing the cache", async () => {
  const home = mkdtempSync(tmpdir() + "/mooter-pr5-");
  const r = await runPricingUpdate(["--dry-run"], { home, fetchImpl: fakeFetch(BODY) });
  assert.strictEqual(r.exitCode, 0);
  assert.match(r.output, /dry-run/);
  assert.match(r.output, /would cache 1 models/);
  assert.strictEqual(readCache(home), null, "dry-run must not write a cache file");
});

test("pricing-update --dry-run degrades (exit 0) and never crashes when the hub is down", async () => {
  const home = mkdtempSync(tmpdir() + "/mooter-pr6-");
  const r = await runPricingUpdate(["--dry-run"], { home, fetchImpl: (async () => { throw new Error("offline"); }) as unknown as typeof fetch });
  assert.strictEqual(r.exitCode, 0, "dry-run degrades to success on a hub failure");
  assert.match(r.output, /dry-run/);
  assert.strictEqual(readCache(home), null, "still no cache written");
});

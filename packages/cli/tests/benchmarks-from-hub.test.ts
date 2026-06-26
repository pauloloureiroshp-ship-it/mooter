// Wave 5 — `mooter benchmarks refresh --from-hub`: data-only, fail-safe network
// refresh of the curated benchmark overrides. Mirrors pricing-update's contract:
// a good cache is NEVER corrupted by a network/shape failure.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runBenchmarks } from "../src/commands/cost-perf.ts";
import { benchmarkOverridesPath } from "../../router/src/benchmark-fetcher.ts";

const HUB_BODY = {
  generated_at: "2026-06-20T00:00:00.000Z",
  source: "mooter-hub curated (public benchmarks only · Option B)",
  cells: [
    { model: "claude-opus-4-7", category: "coding.backend", score: 0.876, source: "SWE-bench Verified", source_url: "", measured: true, as_of: "2026-06" },
    // a deliberately bogus score to prove normalisation refuses to fabricate:
    { model: "gpt-5", category: "reasoning.math", score: 9.9, source: "AIME 2026", source_url: "", measured: true, as_of: "2026-06" },
    // missing model → must be dropped, not crash:
    { category: "coding.test", score: 0.5, source: "x", measured: true },
  ],
};

function fakeFetch(body: unknown, ok = true, status = 200): typeof fetch {
  return (async () => ({ ok, status, json: async () => body })) as unknown as typeof fetch;
}

test("from-hub: writes overrides in the loader's shape; refuses to fabricate a numeric score", async () => {
  const home = mkdtempSync(join(tmpdir(), "mooter-bh-"));
  const res = await runBenchmarks(["refresh", "--from-hub", "--json"], { home, fetchImpl: fakeFetch(HUB_BODY) });
  assert.equal(res.exitCode, 0);
  const path = benchmarkOverridesPath(home);
  assert.ok(existsSync(path), "overrides file written");
  const written = JSON.parse(readFileSync(path, "utf8"));
  // bogus-score cell kept but score collapsed to null (qualitative); missing-model dropped.
  const math = written.cells.find((c: any) => c.model === "gpt-5" && c.category === "reasoning.math");
  assert.ok(math, "gpt-5 cell present");
  assert.equal(math.score, null, "out-of-range 9.9 became null — never fabricated");
  const backend = written.cells.find((c: any) => c.model === "claude-opus-4-7");
  assert.equal(backend.score, 0.876, "valid score passed through verbatim");
  assert.ok(!written.cells.some((c: any) => c.model === undefined), "model-less cell dropped");
});

test("from-hub: hub error (500) keeps the existing overrides — honest, no corruption", async () => {
  const home = mkdtempSync(join(tmpdir(), "mooter-bh2-"));
  // seed a good overrides file first
  await runBenchmarks(["refresh", "--from-hub"], { home, fetchImpl: fakeFetch(HUB_BODY) });
  const before = readFileSync(benchmarkOverridesPath(home), "utf8");
  const res = await runBenchmarks(["refresh", "--from-hub"], { home, fetchImpl: fakeFetch(null, false, 500) });
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /kept existing overrides/);
  const after = readFileSync(benchmarkOverridesPath(home), "utf8");
  assert.equal(after, before, "good overrides preserved byte-for-byte");
});

test("from-hub: network throw never crashes — returns honest CmdResult", async () => {
  const home = mkdtempSync(join(tmpdir(), "mooter-bh3-"));
  const res = await runBenchmarks(["refresh", "--from-hub"], {
    home,
    fetchImpl: (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch,
  });
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /kept existing overrides/);
});

test("from-hub: unexpected shape (no cells array) keeps cache, reports honestly", async () => {
  const home = mkdtempSync(join(tmpdir(), "mooter-bh4-"));
  const res = await runBenchmarks(["refresh", "--from-hub"], { home, fetchImpl: fakeFetch({ nope: true }) });
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /unexpected shape/);
});

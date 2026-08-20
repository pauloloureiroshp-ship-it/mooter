// Wave 32 (Phase G) — quant/vector status commands with an injected Ollama API.
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runQuant, runVector } from "../src/commands/quant-vector.ts";

const TAGS = {
  models: [
    { name: "qwen3:30b", size: 18_600_000_000, details: { quantization_level: "Q4_K_M", parameter_size: "30.5B", family: "qwen3" } },
    { name: "nomic-embed-text:latest", size: 300_000_000, details: { quantization_level: "F16", parameter_size: "137M", family: "nomic-bert" } },
    { name: "qwen2.5:3b", size: 1_900_000_000, details: { quantization_level: "Q4_K_M", parameter_size: "3.1B", family: "qwen2" } },
  ],
};

function fakeFetch(ok = true): typeof fetch {
  return (async () => (ok ? new Response(JSON.stringify(TAGS), { status: 200 }) : new Response("", { status: 503 }))) as any;
}

function withHome<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env.HOME;
  process.env.HOME = mkdtempSync(join(tmpdir(), "mooter-qv-"));
  process.env.MOOTER_HOME = join(process.env.HOME, ".mooter");
  return fn().finally(() => { if (prev === undefined) delete process.env.HOME; else process.env.HOME = prev; });
}

test("quant status lists generation models, excludes embed, writes snapshot", async () => {
  await withHome(async () => {
    const r = await runQuant([], { fetchImpl: fakeFetch() });
    assert.strictEqual(r.exitCode, 0);
    assert.match(r.output, /qwen3:30b\s+Q4_K_M/);
    assert.match(r.output, /qwen2.5:3b/);
    assert.ok(!/nomic-embed/.test(r.output), "embed excluded from quant");
    const snap = JSON.parse(readFileSync(join(process.env.HOME!, ".mooter", "cache", "quant-snapshot.json"), "utf8"));
    assert.strictEqual(snap.models[0].quant, "Q4_K_M");
  });
});

test("quant status --json is machine-readable, no invented tok/s", async () => {
  await withHome(async () => {
    const r = await runQuant(["--json"], { fetchImpl: fakeFetch() });
    const j = JSON.parse(r.output);
    assert.ok(Array.isArray(j.models));
    assert.ok(!("tokps" in j.models[0]) && !("tok_s" in j.models[0]), "no fabricated throughput");
  });
});

test("vector status shows embed model with known dims", async () => {
  await withHome(async () => {
    const r = await runVector([], { fetchImpl: fakeFetch() });
    assert.strictEqual(r.exitCode, 0);
    assert.match(r.output, /nomic-embed-text/);
    assert.match(r.output, /768d/);
    assert.ok(existsSync(join(process.env.HOME!, ".mooter", "cache", "vector-snapshot.json")));
  });
});

test("ollama unreachable → honest error, exit 1", async () => {
  await withHome(async () => {
    const r = await runQuant([], { fetchImpl: fakeFetch(false) });
    assert.strictEqual(r.exitCode, 1);
    assert.match(r.output, /not reachable/);
  });
});

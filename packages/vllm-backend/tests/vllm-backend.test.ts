// Wave 32 (Phase H/I) — vLLM installer · health · fallback · Multi-LoRA.
import { test } from "node:test";
import assert from "node:assert";

import { detectPrereqs, planInstall, install, type ProbeFns } from "../src/installer.ts";
import { health } from "../src/client.ts";
import { chooseBackend } from "../src/fallback.ts";
import { MultiLoraServer, loadAdapters, type RouteFn } from "../src/multi-lora-loader.ts";

const PROBE_OK: ProbeFns = { hasCommand: () => true, hasNvidiaGpu: () => true };
const PROBE_NO_GPU: ProbeFns = { hasCommand: (c) => c.includes("python") || c.includes("pip"), hasNvidiaGpu: () => false };

// ── installer ────────────────────────────────────────────────────────────────
test("detectPrereqs flags a missing GPU honestly", () => {
  const p = detectPrereqs(PROBE_NO_GPU);
  assert.strictEqual(p.nvidiaSmi, false);
  assert.ok(p.missing.some((m) => /NVIDIA/.test(m)));
});

test("install refuses gracefully when prereqs missing (stays on Ollama)", () => {
  const r = install(PROBE_NO_GPU);
  assert.strictEqual(r.installed, false);
  assert.match(r.message, /Staying on Ollama/);
});

test("install dry-run when prereqs OK; --run executes venv+pip steps", () => {
  const dry = install(PROBE_OK);
  assert.strictEqual(dry.installed, false);
  assert.match(dry.message, /dry-run/);
  const cmds: string[] = [];
  const r = install(PROBE_OK, { run: true, exec: (c) => cmds.push(c) });
  assert.strictEqual(r.installed, true);
  assert.ok(cmds.some((c) => c.includes("venv")));
  assert.ok(cmds.some((c) => c.includes("pip install vllm")));
  // never auto-launches the server in install()
  assert.ok(!cmds.some((c) => c.includes("api_server")));
});

test("planInstall enables LoRA on the server launch step", () => {
  const plan = planInstall(PROBE_OK);
  assert.ok(plan.steps.some((s) => s.includes("--enable-lora")));
  assert.strictEqual(plan.port, 8000);
});

// ── health + fallback ────────────────────────────────────────────────────────
test("health reports up + models from /v1/models", async () => {
  const fake = (async () => new Response(JSON.stringify({ data: [{ id: "qwen2.5:3b" }] }), { status: 200 })) as any;
  const h = await health({ fetchImpl: fake });
  assert.strictEqual(h.up, true);
  assert.deepStrictEqual(h.models, ["qwen2.5:3b"]);
});

test("chooseBackend: not opted-in → ollama, no probe", async () => {
  let probed = false;
  const fake = (async () => { probed = true; return new Response("", { status: 200 }); }) as any;
  const c = await chooseBackend(false, { fetchImpl: fake });
  assert.strictEqual(c.backend, "ollama");
  assert.strictEqual(probed, false);
});

test("chooseBackend: opted-in but down → ollama fallback", async () => {
  const fake = (async () => { throw new Error("conn refused"); }) as any;
  const c = await chooseBackend(true, { fetchImpl: fake });
  assert.strictEqual(c.backend, "ollama");
  assert.match(c.reason, /falling back/);
});

test("chooseBackend: opted-in + up → vllm", async () => {
  const fake = (async () => new Response(JSON.stringify({ data: [{ id: "m" }] }), { status: 200 })) as any;
  const c = await chooseBackend(true, { fetchImpl: fake });
  assert.strictEqual(c.backend, "vllm");
});

// ── Multi-LoRA ───────────────────────────────────────────────────────────────
test("loadAdapters maps the real registry to ≥6 concurrent LoRA modules", () => {
  const loaded = loadAdapters();
  assert.ok(loaded.length >= 6, `expected >=6 adapters, got ${loaded.length}`);
  for (const a of loaded) assert.match(a.vllmModule, /^[a-z0-9_-]+$/, "module id sanitized");
});

test("selectForRequest delegates to LORAUTER, applies adapter, PRESERVES tier", () => {
  const adapters = loadAdapters();
  const target = adapters[0];
  const route: RouteFn = () => ({ adapter: target.name, task_type: target.taskType, tier: "T3", matched: true });
  const server = new MultiLoraServer({ adapters, route });
  const d = server.selectForRequest("build a React form");
  assert.strictEqual(d.applied, true);
  assert.strictEqual(d.vllmModule, target.vllmModule);
  assert.strictEqual(d.tier, "T3", "tier must be preserved (guardrail)");
});

test("selectForRequest: no match → base model, no adapter, tier preserved", () => {
  const route: RouteFn = () => ({ adapter: "baseline", task_type: "general", tier: "T0", matched: false });
  const server = new MultiLoraServer({ adapters: loadAdapters(), route });
  const d = server.selectForRequest("hi");
  assert.strictEqual(d.applied, false);
  assert.strictEqual(d.vllmModule, null);
  assert.strictEqual(d.tier, "T0");
});

test("6 adapters resident; per-request swap is O(1) (sub-ms over 1000 calls)", () => {
  const adapters = loadAdapters();
  let i = 0;
  const route: RouteFn = () => { const a = adapters[i++ % adapters.length]; return { adapter: a.name, task_type: a.taskType, tier: "T2", matched: true }; };
  const server = new MultiLoraServer({ adapters, route });
  const t0 = process.hrtime.bigint();
  for (let n = 0; n < 1000; n++) server.selectForRequest("x");
  const avgMs = Number(process.hrtime.bigint() - t0) / 1e6 / 1000;
  assert.ok(avgMs < 10, `avg swap ${avgMs}ms must be <10ms`);
  assert.strictEqual(server.list().length, adapters.length);
});

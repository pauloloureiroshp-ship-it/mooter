// runtime suite (Phase E, CRITICAL 🔒) — isolated-vm sandbox.
// Gate: malicious scripts (process.exit, require('fs'), import, fetch) must fail;
// timeout + memory caps enforced; the mooter API bridges to injected host I/O.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript, RUNTIME_DEFAULTS, RuntimeError } from "../src/runtime.ts";
import type { AgentRequest, AgentResult } from "../src/agent.ts";

// A mock host agent so the runtime never touches the network.
function mockApi() {
  const calls: AgentRequest[] = [];
  const checkpoints: Array<{ name: string; data: unknown }> = [];
  const logs: string[] = [];
  return {
    calls,
    checkpoints,
    logs,
    api: {
      agent: async (req: AgentRequest): Promise<AgentResult> => {
        calls.push(req);
        return {
          result: `echo:${req.prompt}`,
          tokens_in: 3,
          tokens_out: 2,
          latency_ms: 1,
          cost_usd: 0,
          model: req.model,
          backend: "ollama" as const,
        };
      },
      checkpoint: async (name: string, data: unknown) => {
        checkpoints.push({ name, data });
      },
      log: async (message: string) => {
        logs.push(message);
      },
    },
  };
}

test("RUNTIME_DEFAULTS match the brief (4h timeout, 512MB)", () => {
  assert.equal(RUNTIME_DEFAULTS.timeoutMs, 4 * 60 * 60 * 1000);
  assert.equal(RUNTIME_DEFAULTS.memoryLimitMb, 512);
});

test("runs a benign script and returns its value", async () => {
  const out = await runScript("return 1 + 41;", { timeoutMs: 2000 });
  assert.equal(out, 42);
});

// ── Security gate ─────────────────────────────────────────────────────────────

test("GATE: process is not exposed (process.exit fails)", async () => {
  await assert.rejects(
    runScript("process.exit(1);", { timeoutMs: 2000 }),
    (e: unknown) => e instanceof RuntimeError && /process is not defined/.test((e as Error).message),
  );
});

test("GATE: require is not exposed (require('fs') fails)", async () => {
  await assert.rejects(
    runScript("const fs = require('fs'); return fs.readFileSync('/etc/passwd');", { timeoutMs: 2000 }),
    (e: unknown) => e instanceof RuntimeError && /require is not defined/.test((e as Error).message),
  );
});

test("GATE: dynamic import is blocked", async () => {
  await assert.rejects(
    runScript("const fs = await import('node:fs'); return Object.keys(fs);", { timeoutMs: 2000 }),
    (e: unknown) => e instanceof RuntimeError,
  );
});

test("GATE: no network (fetch is undefined)", async () => {
  await assert.rejects(
    runScript("return await fetch('http://example.com');", { timeoutMs: 2000 }),
    (e: unknown) => e instanceof RuntimeError && /fetch is not (defined|a function)/.test((e as Error).message),
  );
});

test("GATE: no child_process / global escape", async () => {
  await assert.rejects(
    runScript("return typeof globalThis.process + global;", { timeoutMs: 2000 }),
    (e: unknown) => e instanceof RuntimeError, // `global` is not defined
  );
});

test("GATE: infinite loop is killed by timeout", async () => {
  await assert.rejects(
    runScript("while (true) {}", { timeoutMs: 150 }),
    (e: unknown) => e instanceof RuntimeError && /timed out/i.test((e as Error).message),
  );
});

test("GATE: memory limit is enforced", async () => {
  await assert.rejects(
    // 64MB allocation inside a 16MB isolate
    runScript("const a = new Uint8Array(64 * 1024 * 1024); return a.length;", {
      timeoutMs: 5000,
      memoryLimitMb: 16,
    }),
    (e: unknown) => e instanceof RuntimeError,
  );
});

test("syntax error surfaces as RuntimeError", async () => {
  await assert.rejects(
    runScript("return (((;", { timeoutMs: 2000 }),
    (e: unknown) => e instanceof RuntimeError && /compile/.test((e as Error).message),
  );
});

// ── mooter API bridge ─────────────────────────────────────────────────────────

test("mooter.agent bridges to the host (injected mock)", async () => {
  const m = mockApi();
  const out = await runScript(
    `const r = await mooter.agent({ model: 'qwen2.5-coder:7b', prompt: 'ping' }); return r.result;`,
    { timeoutMs: 5000, api: m.api },
  );
  assert.equal(out, "echo:ping");
  assert.equal(m.calls.length, 1);
  assert.equal(m.calls[0].model, "qwen2.5-coder:7b");
});

test("in-isolate parallel + bare globals work over bridged agent", async () => {
  const m = mockApi();
  const out = await runScript(
    `const rs = await parallel([1,2,3], async (n) => {
       const r = await agent({ model: 'qwen2.5-coder:7b', prompt: 'p' + n });
       return r.result;
     });
     return rs;`,
    { timeoutMs: 5000, api: m.api },
  );
  assert.deepEqual(out, ["echo:p1", "echo:p2", "echo:p3"]);
  assert.equal(m.calls.length, 3);
});

test("INPUT global exposes host-provided read-only data", async () => {
  const out = await runScript(
    `return INPUT.files.map((f) => f.path);`,
    { timeoutMs: 2000, input: { files: [{ path: "a.ts" }, { path: "b.ts" }] } },
  );
  assert.deepEqual(out, ["a.ts", "b.ts"]);
});

test("INPUT defaults to null when no input is given", async () => {
  const out = await runScript("return INPUT;", { timeoutMs: 2000 });
  assert.equal(out, null);
});

test("e2e in-sandbox: parallel → vote → checkpoint (bridged)", async () => {
  const m = mockApi();
  const out = await runScript(
    `const doubled = await parallel([1,2,3,4,5], async (n) => n * 2);
     const survivors = await vote(doubled, async (c) => c.filter((x) => x > 4));
     await checkpoint('survivors', survivors);
     await log('done', { count: survivors.length });
     return survivors;`,
    { timeoutMs: 5000, api: m.api },
  );
  assert.deepEqual(out, [6, 8, 10]);
  assert.equal(m.checkpoints.length, 1);
  assert.equal(m.checkpoints[0].name, "survivors");
  assert.deepEqual(m.checkpoints[0].data, [6, 8, 10]);
  assert.deepEqual(m.logs, ["done"]);
});

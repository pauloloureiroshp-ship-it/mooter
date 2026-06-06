// agent() suite (Phase C) — backend inference, cost-by-backend, error paths,
// and the Phase C gate: 5 agents in parallel against a mock Ollama (always) and
// real Ollama (when reachable).
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { agent, inferBackend, AgentError } from "../src/agent.ts";
import { AgentPool } from "../src/pool.ts";
import { priceTurn } from "../src/pricing.ts";

function listen(server: http.Server): Promise<string> {
  return new Promise((res) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      res(`http://127.0.0.1:${port}`);
    });
  });
}
function close(server: http.Server): Promise<void> {
  return new Promise((res) => server.close(() => res()));
}

function mockOllama(opts: { delayMs?: number } = {}) {
  const state = { active: 0, peak: 0 };
  const server = http.createServer((req, resp) => {
    if (req.method === "POST" && req.url === "/api/generate") {
      state.active += 1;
      state.peak = Math.max(state.peak, state.active);
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const reqBody = JSON.parse(body || "{}");
        const finish = () => {
          state.active -= 1;
          resp.writeHead(200, { "content-type": "application/json" });
          resp.end(
            JSON.stringify({
              response: `echo:${reqBody.model}`,
              prompt_eval_count: 11,
              eval_count: 7,
              done: true,
            }),
          );
        };
        if (opts.delayMs) setTimeout(finish, opts.delayMs);
        else finish();
      });
    } else {
      resp.writeHead(404);
      resp.end();
    }
  });
  return { server, state };
}

async function probeOllama(): Promise<string | null> {
  const candidates = [
    process.env.OLLAMA_HOST,
    "http://localhost:11434",
    "http://172.25.48.1:11434", // WSL → Windows-host gateway (Day 0 P3)
  ].filter(Boolean) as string[];
  for (const host of candidates) {
    try {
      const r = await fetch(`${host.replace(/\/+$/, "")}/api/tags`, {
        signal: AbortSignal.timeout(1000),
      });
      if (r.ok) return host.replace(/\/+$/, "");
    } catch {
      /* try next */
    }
  }
  return null;
}

test("inferBackend: claude family → claude-api, else ollama", () => {
  assert.equal(inferBackend("claude-opus-4-8"), "claude-api");
  assert.equal(inferBackend("claude-haiku-4-5"), "claude-api");
  assert.equal(inferBackend("qwen2.5-coder:7b"), "ollama");
  assert.equal(inferBackend("deepseek-r1:7b"), "ollama");
});

test("ollama backend: result, token counts, cost = 0", async () => {
  const { server } = mockOllama();
  const host = await listen(server);
  try {
    const r = await agent({ model: "qwen2.5-coder:7b", prompt: "hi", host });
    assert.equal(r.backend, "ollama");
    assert.equal(r.result, "echo:qwen2.5-coder:7b");
    assert.equal(r.tokens_in, 11);
    assert.equal(r.tokens_out, 7);
    assert.equal(r.cost_usd, 0);
    assert.ok(r.latency_ms >= 0);
  } finally {
    await close(server);
  }
});

test("GATE: 5 agents in parallel (mock Ollama) all succeed, concurrency capped", async () => {
  const { server, state } = mockOllama({ delayMs: 25 });
  const host = await listen(server);
  try {
    const pool = new AgentPool({ concurrency: 2 });
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        pool.run(() => agent({ model: "qwen2.5-coder:7b", prompt: `task ${i}`, host })),
      ),
    );
    assert.equal(results.length, 5);
    assert.ok(results.every((r) => r.backend === "ollama" && r.cost_usd === 0));
    assert.ok(results.every((r) => r.result === "echo:qwen2.5-coder:7b"));
    assert.equal(pool.completedCount, 5);
    assert.ok(state.peak <= 2, `server saw peak ${state.peak} concurrent, expected <= 2`);
  } finally {
    await close(server);
  }
});

test("claude-api backend (mock): cost from canonical priceTurn", async () => {
  const server = http.createServer((req, resp) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      resp.writeHead(200, { "content-type": "application/json" });
      resp.end(
        JSON.stringify({
          content: [{ type: "text", text: "hello" }],
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      );
    });
  });
  const host = await listen(server);
  try {
    const r = await agent({ model: "claude-haiku-4-5", prompt: "hi", host, backend: "claude-api" });
    assert.equal(r.backend, "claude-api");
    assert.equal(r.result, "hello");
    assert.equal(r.tokens_in, 100);
    assert.equal(r.tokens_out, 50);
    assert.equal(r.cost_usd, priceTurn("claude-haiku-4-5", 100, 50));
    assert.ok(r.cost_usd > 0);
  } finally {
    await close(server);
  }
});

test("ollama HTTP error surfaces as AgentError with status", async () => {
  const server = http.createServer((_req, resp) => {
    resp.writeHead(500);
    resp.end("boom");
  });
  const host = await listen(server);
  try {
    await assert.rejects(
      agent({ model: "qwen2.5-coder:7b", prompt: "hi", host }),
      (e: unknown) => e instanceof AgentError && e.backend === "ollama" && e.status === 500,
    );
  } finally {
    await close(server);
  }
});

test("claude-api with no key and no host → AgentError(401)", async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    await assert.rejects(
      agent({ model: "claude-opus-4-8", prompt: "hi" }),
      (e: unknown) => e instanceof AgentError && e.status === 401,
    );
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  }
});

test("real Ollama (skipped if unreachable): 3 agents in parallel", async (t) => {
  const host = await probeOllama();
  if (!host) {
    t.skip("no reachable Ollama on localhost / OLLAMA_HOST / WSL gateway");
    return;
  }
  const pool = new AgentPool({ concurrency: 3 });
  const results = await Promise.all(
    Array.from({ length: 3 }, (_, i) =>
      pool.run(() =>
        agent({
          model: "qwen2.5-coder:7b",
          prompt: `Reply with the single word: ok (#${i})`,
          host,
          max_tokens: 16,
          timeoutMs: 60_000,
        }),
      ),
    ),
  );
  assert.equal(results.length, 3);
  for (const r of results) {
    assert.equal(r.backend, "ollama");
    assert.equal(r.cost_usd, 0);
    assert.ok(r.tokens_out > 0, "expected nonzero output tokens from real Ollama");
    assert.ok(typeof r.result === "string" && r.result.length > 0);
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleRequest, PROTOCOL_VERSION, SERVER_INFO, type JsonRpcRequest } from "../src/server.ts";
import { buildRegistry, TOOL_NAMES, type ToolContext } from "../src/tools.ts";
import { startWave } from "../../synthesis/src/state/central-state.ts";

const registry = buildRegistry();

function req(method: string, params?: unknown, id: number | null = 1): JsonRpcRequest {
  return { jsonrpc: "2.0", id, method, params: params as JsonRpcRequest["params"] };
}

function withTempHome<T>(fn: () => T | Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "mooter-mcp-"));
  const prev = process.env.MOOTER_HOME;
  process.env.MOOTER_HOME = dir;
  return (async () => {
    try {
      return await fn();
    } finally {
      if (prev === undefined) delete process.env.MOOTER_HOME;
      else process.env.MOOTER_HOME = prev;
      rmSync(dir, { recursive: true, force: true });
    }
  })();
}

test("initialize returns protocol version + serverInfo", async () => {
  const r = await handleRequest(req("initialize"), registry);
  assert.ok(r);
  const res = r!.result as { protocolVersion: string; serverInfo: { name: string } };
  assert.equal(res.protocolVersion, PROTOCOL_VERSION);
  assert.equal(res.serverInfo.name, SERVER_INFO.name);
});

test("notifications/initialized → no response", async () => {
  assert.equal(await handleRequest(req("notifications/initialized", {}, null), registry), null);
});

test("ping → empty result", async () => {
  const r = await handleRequest(req("ping"), registry);
  assert.deepEqual(r!.result, {});
});

test("tools/list returns all 6 tools with inputSchema", async () => {
  const r = await handleRequest(req("tools/list"), registry);
  const tools = (r!.result as { tools: Array<{ name: string; inputSchema: unknown }> }).tools;
  assert.equal(tools.length, 6);
  assert.deepEqual(tools.map((t) => t.name).sort(), [...TOOL_NAMES].sort());
  for (const t of tools) assert.ok(t.inputSchema);
});

test("tools/call mooter_status reports classify sha (intact in-repo)", async () => {
  await withTempHome(async () => {
    startWave({ number: 30, branch: "wave30", phases: [{ id: "A", title: "A" }] });
    const r = await handleRequest(req("tools/call", { name: "mooter_status", arguments: {} }), registry);
    const text = (r!.result as { content: Array<{ text: string }> }).content[0].text;
    const obj = JSON.parse(text);
    assert.equal(obj.activeWave, 30);
    assert.equal(obj.classifyShaOk, true);
  });
});

test("tools/call mooter_dogfood_log persists an entry", async () => {
  await withTempHome(async () => {
    const r = await handleRequest(
      req("tools/call", { name: "mooter_dogfood_log", arguments: { text: "mcp friction #test", severity: "high" } }),
      registry,
    );
    const text = (r!.result as { content: Array<{ text: string }> }).content[0].text;
    assert.match(text, /logged \[high\]/);
    assert.ok(existsSync(join(process.env.MOOTER_HOME!, "dogfood.jsonl")));
  });
});

test("tools/call mooter_workflow_create queues a request", async () => {
  await withTempHome(async () => {
    const r = await handleRequest(
      req("tools/call", { name: "mooter_workflow_create", arguments: { prompt: "audit the repo for dead code" } }),
      registry,
    );
    const obj = JSON.parse((r!.result as { content: Array<{ text: string }> }).content[0].text);
    assert.match(obj.id, /^wf_/);
    assert.equal(obj.status, "queued");
    assert.ok(existsSync(join(process.env.MOOTER_HOME!, "workflows", "requests.jsonl")));
  });
});

test("tools/call mooter_notion_write dry-run (no token) builds payload, no fetch", async () => {
  const r = await handleRequest(
    req("tools/call", { name: "mooter_notion_write", arguments: { title: "🐮 Wave 30 SHIPPED", body: "all phases" } }),
    registry,
    { dryRun: true } as ToolContext,
  );
  const obj = JSON.parse((r!.result as { content: Array<{ text: string }> }).content[0].text);
  assert.equal(obj.dryRun, true);
  assert.equal(obj.payload.properties.title[0].text.content, "🐮 Wave 30 SHIPPED");
});

test("tools/call mooter_notion_write with mock fetch + token returns url", async () => {
  let captured: { url: string; body: string } | null = null;
  const fetchImpl = (async (url: string, opts: { body: string }) => {
    captured = { url, body: opts.body };
    return { ok: true, json: async () => ({ url: "https://notion.so/abc", id: "abc123" }) } as unknown as Response;
  }) as unknown as typeof fetch;

  const r = await handleRequest(
    req("tools/call", { name: "mooter_notion_write", arguments: { title: "Wave 30" } }),
    registry,
    { fetchImpl, notionToken: "secret_tok" },
  );
  const obj = JSON.parse((r!.result as { content: Array<{ text: string }> }).content[0].text);
  assert.equal(obj.ok, true);
  assert.equal(obj.url, "https://notion.so/abc");
  assert.ok(captured);
  assert.match(captured!.url, /api\.notion\.com\/v1\/pages/);
});

test("tools/call unknown tool → -32602", async () => {
  const r = await handleRequest(req("tools/call", { name: "nope", arguments: {} }), registry);
  assert.equal(r!.error!.code, -32602);
});

test("unknown method with id → method not found", async () => {
  const r = await handleRequest(req("frobnicate"), registry);
  assert.equal(r!.error!.code, -32601);
});

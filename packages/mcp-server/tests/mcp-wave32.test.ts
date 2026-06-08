// Wave 32 — functional tests for the 4 new MCP tools. Isolates HOME (os.homedir()
// reads $HOME on POSIX) + MOOTER_HOME so nothing touches the real ~/.mooter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleRequest, type JsonRpcRequest } from "../src/server.ts";
import { buildRegistry } from "../src/tools.ts";

const registry = buildRegistry();
function req(method: string, params?: unknown): JsonRpcRequest {
  return { jsonrpc: "2.0", id: 1, method, params: params as JsonRpcRequest["params"] };
}
function call(name: string, args: Record<string, unknown> = {}) {
  return handleRequest(req("tools/call", { name, arguments: args }), registry);
}
async function text(r: Awaited<ReturnType<typeof handleRequest>>): Promise<string> {
  return (r!.result as { content: Array<{ text: string }> }).content[0].text;
}

function withHome<T>(fn: () => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "mooter-mcp32-"));
  mkdirSync(join(dir, ".mooter"), { recursive: true });
  const prevH = process.env.HOME, prevM = process.env.MOOTER_HOME;
  process.env.HOME = dir;
  process.env.MOOTER_HOME = join(dir, ".mooter");
  return fn().finally(() => {
    if (prevH === undefined) delete process.env.HOME; else process.env.HOME = prevH;
    if (prevM === undefined) delete process.env.MOOTER_HOME; else process.env.MOOTER_HOME = prevM;
  });
}

test("mooter_effort_set sets ultramoo and reports the 8 flags", async () => {
  await withHome(async () => {
    const obj = JSON.parse(await text(await call("mooter_effort_set", { mode: "ultramoo" })));
    assert.equal(obj.mode, "ultramoo");
    assert.equal(obj.llmlingua, true);
    assert.equal(obj.multiLora, true);
  });
});

test("mooter_ultramoo_toggle on/off flips effort", async () => {
  await withHome(async () => {
    assert.equal(JSON.parse(await text(await call("mooter_ultramoo_toggle", { on: true }))).mode, "ultramoo");
    assert.equal(JSON.parse(await text(await call("mooter_ultramoo_toggle", { on: false }))).mode, "default");
  });
});

test("mooter_workflow_watch sets + reads a control intent", async () => {
  await withHome(async () => {
    JSON.parse(await text(await call("mooter_workflow_watch", { run_id: "wf_x", control: "paused" })));
    const read = JSON.parse(await text(await call("mooter_workflow_watch", { run_id: "wf_x" })));
    assert.equal(read.run, "paused");
  });
});

test("mooter_data_export returns audited, clean JSON", async () => {
  await withHome(async () => {
    const out = await text(await call("mooter_data_export", {}));
    const obj = JSON.parse(out);
    assert.equal(obj.schema, "mooter-data-export/v1");
    assert.ok(!("error" in obj), "export must not be blocked");
  });
});

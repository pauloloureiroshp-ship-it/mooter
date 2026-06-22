import { test } from "node:test";
import assert from "node:assert/strict";
import { councilConveneTool } from "../src/mcp.ts";

test("council_convene: follows the McpTool shape", () => {
  assert.equal(councilConveneTool.name, "council_convene");
  assert.equal(councilConveneTool.inputSchema.type, "object");
  assert.ok(councilConveneTool.inputSchema.required?.includes("prompt"));
  assert.equal(typeof councilConveneTool.handler, "function");
  assert.ok("prompt" in councilConveneTool.inputSchema.properties);
});

test("council_convene: explain path is dry and returns CAS + composition", async () => {
  const out = await councilConveneTool.handler(
    { prompt: "should we add a write-through cache?", category: "coding.infra", explain: true },
    {} as any,
  );
  assert.match(out, /Mooter Council — explain/);
  assert.match(out, /CAS: CONVENE/);
  assert.match(out, /composition:/);
});

test("council_convene: missing prompt → usage (no crash)", async () => {
  const out = await councilConveneTool.handler({ explain: true }, {} as any);
  assert.match(out, /usage: mooter council/);
});

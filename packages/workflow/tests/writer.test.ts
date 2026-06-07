// Phase G — script writer: parse, validate, plan, and e2e (writer → runtime).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  writeWorkflow,
  parsePlan,
  extractJson,
  countAgentCalls,
  assertCompiles,
  WriterError,
  WRITER_SYSTEM_PROMPT,
} from "../src/writer.ts";
import { runScript } from "../src/runtime.ts";
import type { AgentRequest, AgentResult } from "../src/agent.ts";

// A small, runnable workflow the mock writer "generates".
const GEN_SCRIPT = [
  "const items = [1, 2, 3];",
  "const doubled = await parallel(items, async (n) => {",
  "  const r = await agent({ model: 'qwen2.5-coder:7b', prompt: 'double ' + n });",
  "  return r.result;",
  "});",
  "await checkpoint('doubled', doubled);",
  "const synth = await agent({ model: 'claude-opus-4-8', prompt: 'summarize' });",
  "return { doubled, synth: synth.result };",
].join("\n");

const GEN_REPLY = JSON.stringify({
  phases: [
    { title: "Map", detail: "double each", agentCount: 3, backend: "ollama" },
    { title: "Synthesize", agentCount: 1, backend: "claude-api", model: "claude-opus-4-8" },
  ],
  script: GEN_SCRIPT,
});

function mockWriterAgent(reply: string, cost = 0.0123) {
  const calls: AgentRequest[] = [];
  const fn = async (req: AgentRequest): Promise<AgentResult> => {
    calls.push(req);
    return {
      result: reply,
      tokens_in: 500,
      tokens_out: 300,
      latency_ms: 1,
      cost_usd: cost,
      model: req.model,
      backend: "claude-api",
    };
  };
  return { calls, fn };
}

test("WRITER_SYSTEM_PROMPT documents the sandbox API and cost doctrine", () => {
  for (const needle of ["agent(", "parallel(", "vote(", "converge(", "checkpoint(", "qwen2.5-coder:7b", "FORBIDDEN", "STRICT"]) {
    assert.ok(WRITER_SYSTEM_PROMPT.includes(needle), `system prompt should mention ${needle}`);
  }
});

test("writeWorkflow: one cloud call, parses plan, attaches writer cost", async () => {
  const m = mockWriterAgent(GEN_REPLY, 0.02);
  const plan = await writeWorkflow("audit src/ for unused exports", { agentFn: m.fn });

  assert.equal(m.calls.length, 1, "exactly one writer call");
  assert.equal(m.calls[0].backend, "claude-api");
  assert.equal(m.calls[0].system, WRITER_SYSTEM_PROMPT);

  assert.equal(plan.phases.length, 2);
  assert.equal(plan.agentsTotal, 4);
  assert.equal(plan.agentsLocal, 3);
  assert.equal(plan.agentsCloud, 1);
  assert.equal(plan.tokenEstimate, 4 * (1500 + 800));
  assert.ok(plan.estimatedCostUsd >= 0);
  assert.equal(plan.writerCostUsd, 0.02);
});

test("GATE e2e: the generated script runs in the sandbox (dry-run with mock host)", async () => {
  const m = mockWriterAgent(GEN_REPLY);
  const plan = await writeWorkflow("anything", { agentFn: m.fn });

  // Dry-run the generated script through the real sandbox with a mock host agent.
  const hostCalls: AgentRequest[] = [];
  const out = (await runScript(plan.script, {
    timeoutMs: 5000,
    api: {
      agent: async (req: AgentRequest): Promise<AgentResult> => {
        hostCalls.push(req);
        return { result: `echo:${req.prompt}`, tokens_in: 1, tokens_out: 1, latency_ms: 1, cost_usd: 0, model: req.model, backend: "ollama" };
      },
      checkpoint: async () => {},
      log: async () => {},
    },
  })) as { doubled: string[]; synth: string };

  assert.deepEqual(out.doubled, ["echo:double 1", "echo:double 2", "echo:double 3"]);
  assert.equal(out.synth, "echo:summarize");
  assert.equal(hostCalls.length, 4, "3 local map calls + 1 synthesis");
});

test("parsePlan tolerates a ```json fenced reply", () => {
  const fenced = "Here is the plan:\n```json\n" + GEN_REPLY + "\n```\nDone.";
  const plan = parsePlan(fenced);
  assert.equal(plan.agentsTotal, 4);
});

test("extractJson finds the object inside prose", () => {
  assert.equal(extractJson('blah {"a":1} blah'), '{"a":1}');
});

test("parsePlan rejects an empty script", () => {
  assert.throws(() => parsePlan(JSON.stringify({ phases: [{ title: "x", agentCount: 1 }], script: "" })), (e: unknown) => e instanceof WriterError);
});

test("parsePlan rejects a script with a syntax error", () => {
  const bad = JSON.stringify({ phases: [{ title: "x", agentCount: 1 }], script: "return (((;" });
  assert.throws(() => parsePlan(bad), (e: unknown) => e instanceof WriterError && /compile/.test((e as Error).message));
});

test("parsePlan rejects a reply with no JSON", () => {
  assert.throws(() => parsePlan("sorry, I cannot help"), (e: unknown) => e instanceof WriterError);
});

test("assertCompiles allows top-level await, rejects garbage", () => {
  assert.doesNotThrow(() => assertCompiles("const x = await agent({model:'m',prompt:'p'}); return x;"));
  assert.throws(() => assertCompiles("function ("), (e: unknown) => e instanceof WriterError);
});

test("countAgentCalls counts call sites", () => {
  assert.equal(countAgentCalls(GEN_SCRIPT), 2);
});

test("writeWorkflow rejects an empty prompt", async () => {
  await assert.rejects(writeWorkflow("   "), (e: unknown) => e instanceof WriterError);
});

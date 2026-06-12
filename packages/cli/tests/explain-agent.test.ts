// Wave 58 A.11 — `mooter explain agent`. node:test + tsx. Injectable engine
// (AgentEngine seam) so the test never touches the real matrix / pricing files.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseArgs,
  inferCategory,
  runExplainAgent,
  EXPLAIN_AGENT_USAGE,
  type AgentEngine,
} from "../src/commands/explain-agent.ts";

// ── Minimal stub engine ───────────────────────────────────────────────────────

const STUB_CATEGORIES = [
  "coding.frontend",
  "coding.backend",
  "coding.debug",
  "reasoning.general",
  "writing.prose-en",
  "agents.reviewer",
  "context.multimodal",
] as const;

function makeResult(overrides: Partial<ReturnType<AgentEngine["decideAgent"]>> = {}) {
  return {
    chosen_model: "claude-sonnet-4-6",
    reason: "highest TES among candidates (measured)",
    tes: 28.5,
    alternatives: [
      {
        model: "claude-haiku-4-5",
        score: 0.71,
        tes: 22.1,
        cost: 0.0015,
        why_not: "lower TES (22.1) than chosen claude-sonnet-4-6 (28.5)",
      },
    ],
    cited_source: "SWEbench-lite-2025Q1",
    coverage_note: "chosen model has a MEASURED score for coding.frontend",
    ...overrides,
  };
}

function stubEngine(resultOverride?: Partial<ReturnType<AgentEngine["decideAgent"]>>): AgentEngine {
  return {
    decideAgent: (_args) => makeResult(resultOverride),
    emojiForModel: (id: string) => {
      if (id.startsWith("claude")) return { emoji: "✨", label: "Claude", color: "amber" };
      if (id.startsWith("qwen")) return { emoji: "🦙", label: "Ollama", color: "tan" };
      return { emoji: "🤖", label: "Unknown", color: "gray" };
    },
    TASK_CATEGORIES: STUB_CATEGORIES,
  };
}

async function run(
  argv: string[],
  overrides?: Partial<ReturnType<AgentEngine["decideAgent"]>>,
) {
  return runExplainAgent(argv, async () => stubEngine(overrides));
}

// ── parseArgs ─────────────────────────────────────────────────────────────────

test("parseArgs: basic task", () => {
  const r = parseArgs(["fix a React bug"]);
  assert.ok(!("error" in r));
  if ("error" in r) return;
  assert.equal(r.task, "fix a React bug");
  assert.equal(r.forceModel, undefined);
  assert.equal(r.maxCost, undefined);
  assert.equal(r.preferLocal, false);
  assert.equal(r.json, false);
});

test("parseArgs: all flags", () => {
  const r = parseArgs(["coding.frontend", "--force-model", "qwen3-30b", "--max-cost", "0.005", "--prefer-local", "--json"]);
  assert.ok(!("error" in r));
  if ("error" in r) return;
  assert.equal(r.task, "coding.frontend");
  assert.equal(r.forceModel, "qwen3-30b");
  assert.equal(r.maxCost, 0.005);
  assert.equal(r.preferLocal, true);
  assert.equal(r.json, true);
});

test("parseArgs: multi-word task assembled from positional args", () => {
  const r = parseArgs(["write", "a", "test"]);
  assert.ok(!("error" in r));
  if ("error" in r) return;
  assert.equal(r.task, "write a test");
});

test("parseArgs: error on empty argv", () => {
  const r = parseArgs([]);
  assert.ok("error" in r);
});

test("parseArgs: error when --force-model has no value", () => {
  const r = parseArgs(["task", "--force-model"]);
  assert.ok("error" in r);
});

test("parseArgs: error on negative --max-cost", () => {
  const r = parseArgs(["task", "--max-cost", "-1"]);
  assert.ok("error" in r);
});

test("parseArgs: error on non-numeric --max-cost", () => {
  const r = parseArgs(["task", "--max-cost", "abc"]);
  assert.ok("error" in r);
});

// ── inferCategory ─────────────────────────────────────────────────────────────

test("inferCategory: exact category passthrough", () => {
  assert.equal(inferCategory("coding.frontend", STUB_CATEGORIES), "coding.frontend");
  assert.equal(inferCategory("agents.reviewer", STUB_CATEGORIES), "agents.reviewer");
});

test("inferCategory: natural-language → coding.frontend via 'react'", () => {
  assert.equal(inferCategory("fix a React bug", STUB_CATEGORIES), "coding.frontend");
});

test("inferCategory: natural-language → coding.debug via 'debug'", () => {
  assert.equal(inferCategory("debug this stack trace", STUB_CATEGORIES), "coding.debug");
});

test("inferCategory: unknown words fall back without throwing", () => {
  // No keywords match → fallback (coding.backend)
  const result = inferCategory("xyzzy completely unknown prompt", STUB_CATEGORIES);
  assert.ok(typeof result === "string" && result.length > 0, "returns a non-empty string");
});

// ── runExplainAgent: human-readable output ────────────────────────────────────

test("runExplainAgent: --help returns usage, exit 0", async () => {
  const r = await run(["--help"]);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /mooter explain agent/);
  assert.match(r.output, /--force-model/);
  assert.match(r.output, /--prefer-local/);
});

test("runExplainAgent: no args returns usage, exit 0", async () => {
  const r = await run([]);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /mooter explain agent/);
});

test("runExplainAgent: renders chosen model + emoji + reason", async () => {
  const r = await run(["coding.frontend"]);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /chosen model/);
  assert.match(r.output, /claude-sonnet-4-6/);
  assert.match(r.output, /✨/, "Claude emoji present");
  assert.match(r.output, /reason/);
  assert.match(r.output, /TES/);
});

test("runExplainAgent: renders cited source", async () => {
  const r = await run(["coding.frontend"]);
  assert.match(r.output, /SWEbench-lite-2025Q1/, "cites the real source");
});

test("runExplainAgent: renders coverage note", async () => {
  const r = await run(["coding.frontend"]);
  assert.match(r.output, /coverage note/i);
  assert.match(r.output, /MEASURED score/);
});

test("runExplainAgent: renders alternatives with why_not", async () => {
  const r = await run(["coding.frontend"]);
  assert.match(r.output, /alternatives considered/);
  assert.match(r.output, /claude-haiku-4-5/);
  assert.match(r.output, /why not/i);
  assert.match(r.output, /lower TES/);
});

test("runExplainAgent: natural-language task shows inferred category", async () => {
  const r = await run(["fix a React bug"]);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /inferred category/);
  assert.match(r.output, /coding\.frontend/);
});

test("runExplainAgent: exact category skips 'inferred' label", async () => {
  const r = await run(["coding.frontend"]);
  assert.match(r.output, /task category: coding\.frontend/);
  assert.ok(!/inferred category/.test(r.output), "should not say 'inferred' for exact match");
});

test("runExplainAgent: null chosen_model renders gracefully", async () => {
  const r = await run(["coding.frontend"], { chosen_model: null, tes: null, cited_source: null });
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /chosen model.*none/i);
});

test("runExplainAgent: null tes renders as ?", async () => {
  const r = await run(["coding.frontend"], { tes: null });
  assert.match(r.output, /TES.*\?/);
});

test("runExplainAgent: null cited_source renders as (none — heuristic pick)", async () => {
  const r = await run(["coding.frontend"], { cited_source: null });
  assert.match(r.output, /heuristic pick/);
});

// ── runExplainAgent: --json ───────────────────────────────────────────────────

test("runExplainAgent --json: emits valid JSON with all fields", async () => {
  const r = await run(["coding.frontend", "--json"]);
  assert.equal(r.exitCode, 0);
  let parsed: unknown;
  assert.doesNotThrow(() => { parsed = JSON.parse(r.output); }, "output is valid JSON");
  const obj = parsed as Record<string, unknown>;
  assert.ok("chosen_model" in obj, "has chosen_model");
  assert.ok("reason" in obj, "has reason");
  assert.ok("tes" in obj, "has tes");
  assert.ok("alternatives" in obj, "has alternatives");
  assert.ok("cited_source" in obj, "has cited_source");
  assert.ok("coverage_note" in obj, "has coverage_note");
  assert.ok("inferred_category" in obj, "has inferred_category");
  assert.ok("task_is_category" in obj, "has task_is_category");
});

test("runExplainAgent --json: task_is_category=true for exact category", async () => {
  const r = await run(["coding.frontend", "--json"]);
  const obj = JSON.parse(r.output) as Record<string, unknown>;
  assert.equal(obj.task_is_category, true);
});

test("runExplainAgent --json: task_is_category=false for natural-language", async () => {
  const r = await run(["fix a React bug", "--json"]);
  const obj = JSON.parse(r.output) as Record<string, unknown>;
  assert.equal(obj.task_is_category, false);
  assert.equal(obj.task, "fix a React bug");
  assert.equal(obj.inferred_category, "coding.frontend");
});

// ── NO FABRICATION guardrails ─────────────────────────────────────────────────

test("runExplainAgent: output contains no hyperbole", async () => {
  const r = await run(["coding.frontend"]);
  assert.ok(!/revolutionary|magic|AI-powered|best-in-class/i.test(r.output));
});

test("runExplainAgent: heuristic note is not suppressed", async () => {
  const r = await run(["coding.frontend"], {
    coverage_note: "no measured data for coding.frontend — selection uses the TIER HEURISTIC",
    cited_source: null,
  });
  assert.match(r.output, /TIER HEURISTIC|heuristic/i);
  assert.match(r.output, /heuristic pick/);
});

// ── Engine load failure ───────────────────────────────────────────────────────

test("runExplainAgent: engine load failure → exit 1 + actionable message", async () => {
  const r = await runExplainAgent(
    ["coding.frontend"],
    async () => { throw new Error("module not found: packages/router"); },
  );
  assert.equal(r.exitCode, 1);
  assert.match(r.output, /could not load the agent engine/);
  assert.match(r.output, /npm install/i);
});

// ── --prefer-local flag is passed through ────────────────────────────────────

test("runExplainAgent --prefer-local: passes flag to engine, renders normally", async () => {
  // Stub always returns the same result; we just verify the command runs without error.
  const calls: unknown[] = [];
  const recordingEngine: AgentEngine = {
    ...stubEngine(),
    decideAgent: (args) => {
      calls.push(args);
      return makeResult();
    },
  };
  const r = await runExplainAgent(
    ["coding.frontend", "--prefer-local"],
    async () => recordingEngine,
  );
  assert.equal(r.exitCode, 0);
  const call = calls[0] as { prefer_local?: boolean };
  assert.equal(call.prefer_local, true);
});

// ── --force-model flag is passed through ─────────────────────────────────────

test("runExplainAgent --force-model: passed to engine, renders forced note", async () => {
  const calls: unknown[] = [];
  const recordingEngine: AgentEngine = {
    ...stubEngine(),
    decideAgent: (args) => {
      calls.push(args);
      return makeResult({ reason: 'force_model="qwen3-30b" honoured — TES sort bypassed.' });
    },
  };
  const r = await runExplainAgent(
    ["coding.debug", "--force-model", "qwen3-30b"],
    async () => recordingEngine,
  );
  assert.equal(r.exitCode, 0);
  const call = calls[0] as { force_model?: string };
  assert.equal(call.force_model, "qwen3-30b");
  assert.match(r.output, /force_model.*honoured/i);
});

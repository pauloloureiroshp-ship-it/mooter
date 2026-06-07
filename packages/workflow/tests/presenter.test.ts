// Phase G — plan presenter: pure render + confirm decision mapping.
import { test } from "node:test";
import assert from "node:assert/strict";
import { presentPlan, renderPlan } from "../src/presenter.ts";
import type { PresentDecision } from "../src/presenter.ts";
import type { WorkflowPlan } from "../src/writer.ts";

const plan: WorkflowPlan = {
  script: "return 1;",
  phases: [
    { title: "Map", detail: "double each", agentCount: 3, backend: "ollama" },
    { title: "Synthesize", agentCount: 1, backend: "claude-api", model: "claude-opus-4-8" },
  ],
  agentsTotal: 4,
  agentsLocal: 3,
  agentsCloud: 1,
  tokenEstimate: 9200,
  estimatedCostUsd: 0.0123,
  writerCostUsd: 0.02,
};

test("renderPlan shows phases, the local/cloud split and costs", () => {
  const s = renderPlan(plan);
  assert.match(s, /Map/);
  assert.match(s, /Synthesize/);
  assert.match(s, /3 agents, local/);
  assert.match(s, /1 agent, cloud \(claude-opus-4-8\)/);
  assert.match(s, /4 total · 3 local \(free\) · 1 cloud/);
  assert.match(s, /writer: \$0\.02/);
});

test("autoAccept returns 'run' without prompting", async () => {
  let asked = false;
  const d = await presentPlan(plan, { autoAccept: true, out: () => {}, readLine: async () => { asked = true; return "n"; } });
  assert.equal(d, "run");
  assert.equal(asked, false, "must not prompt when auto-accepting");
});

test("decision mapping from the user's answer", async () => {
  const cases: Array<[string, PresentDecision]> = [
    ["y", "run"], ["yes", "run"], ["", "run"],
    ["v", "view"], ["view", "view"],
    ["e", "edit"], ["edit", "edit"],
    ["n", "cancel"], ["no", "cancel"], ["whatever", "cancel"],
  ];
  for (const [answer, expected] of cases) {
    const d = await presentPlan(plan, { out: () => {}, readLine: async () => answer });
    assert.equal(d, expected, `answer "${answer}" → ${expected}`);
  }
});

test("non-interactive (no reader, no TTY) falls back to the safe default", async () => {
  const d = await presentPlan(plan, { out: () => {} });
  assert.equal(d, "cancel", "never run a fresh workflow unattended");
});

test("non-interactive honours an explicit defaultDecision", async () => {
  const d = await presentPlan(plan, { out: () => {}, defaultDecision: "view" });
  assert.equal(d, "view");
});

test("renderPlan is printed to the out sink", async () => {
  let printed = "";
  await presentPlan(plan, { autoAccept: true, out: (t) => { printed += t; } });
  assert.match(printed, /Workflow plan/);
});

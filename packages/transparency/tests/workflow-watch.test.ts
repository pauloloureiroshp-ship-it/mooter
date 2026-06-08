// Wave 32 (Phase E) — workflow watch: control plane + Mission Control frame.
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readControl, setRunControl, setAgentControl, controlPath } from "../src/workflow-watch/control.ts";
import { buildWorkflowWatch } from "../src/workflow-watch/render.ts";

function tmpHome(): string {
  return mkdtempSync(join(tmpdir(), "mooter-wf-"));
}

test("control: default is running with no agents", () => {
  const home = tmpHome();
  const c = readControl("wf_none", home);
  assert.strictEqual(c.run, "running");
  assert.deepStrictEqual(c.agents, {});
});

test("control: setRunControl persists and round-trips", () => {
  const home = tmpHome();
  setRunControl("wf_1", "paused", { home, now: 100 });
  let c = readControl("wf_1", home);
  assert.strictEqual(c.run, "paused");
  setRunControl("wf_1", "kill", { home, now: 200 });
  c = readControl("wf_1", home);
  assert.strictEqual(c.run, "kill");
});

test("control: setAgentControl marks one agent kill, preserves run state", () => {
  const home = tmpHome();
  setRunControl("wf_2", "paused", { home, now: 1 });
  setAgentControl("wf_2", "verify:auth", "kill", { home, now: 2 });
  const c = readControl("wf_2", home);
  assert.strictEqual(c.run, "paused");
  assert.strictEqual(c.agents["verify:auth"], "kill");
});

test("control: path sanitizes run id (no traversal)", () => {
  const p = controlPath("../../etc/passwd", "/home/x");
  assert.ok(p.endsWith("etcpasswd.json"), p);
});

test("render: empty run shows honest placeholders", () => {
  const f = buildWorkflowWatch({
    runId: "wf_abcdef123456",
    status: "running",
    agents: [],
    control: { run: "running", agents: {}, ts: 0 },
  });
  assert.match(f, /Workflow Mission Control/);
  assert.match(f, /no agents recorded yet/);
  assert.match(f, /\[p\]ause/);
});

test("render: agents + savings + kill markers", () => {
  const f = buildWorkflowWatch({
    runId: "wf_run",
    status: "running",
    numTotal: 25,
    numLocal: 24,
    numCloud: 1,
    actualCostUsd: 0.0028,
    baselineCostUsd: 0.28,
    agents: [
      { label: "worker:1", backend: "ollama", model: "qwen3:30b", costUsd: 0, latencyMs: 1200 },
      { label: "synth", backend: "opus", model: "opus-4", costUsd: 0.0028, latencyMs: 3400 },
    ],
    control: { run: "paused", agents: { "worker:1": "kill" }, ts: 0 },
  });
  assert.match(f, /worker:1/);
  assert.match(f, /🏠/);
  assert.match(f, /saved 99% vs all-Opus/);
  assert.match(f, /run=paused/);
  assert.match(f, /1 agent\(s\) marked kill/);
  assert.match(f, /✗/, "killed agent shows ✗");
});

test("render: progress line only when running with a planned total", () => {
  const running = buildWorkflowWatch({
    runId: "wf_p", status: "running", numTotal: 10,
    agents: [{ label: "a" }, { label: "b" }],
    control: { run: "running", agents: {}, ts: 0 },
  });
  assert.match(running, /progress: 2\/10 agents \(20%\)/);

  const done = buildWorkflowWatch({
    runId: "wf_d", status: "completed", numTotal: 10,
    agents: [{ label: "a" }], control: { run: "running", agents: {}, ts: 0 },
  });
  assert.ok(!/progress:/.test(done), "no progress line when not running");
});

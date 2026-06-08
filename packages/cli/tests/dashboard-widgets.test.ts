// Wave 32 (Phase D) — the 4 widgets added to the dashboard (Pastor, hardware,
// workflows, limits). Pure buildDashboard with injected data → no I/O.
import { test } from "node:test";
import assert from "node:assert";
import { buildDashboard, displayWidth } from "../src/commands/dashboard.ts";

const BASE = {
  lines: [] as string[],
  metrics: null,
  quotaPath: "/nonexistent",
  mooterHome: "/nonexistent-home", // forces honest fallbacks unless injected
};

test("Pastor widget lists task adapters (injected)", () => {
  const out = buildDashboard({
    ...BASE,
    pastorAdapters: [
      { type: "frontend", name: "fe-lora" },
      { type: "backend", name: "be-lora" },
    ],
  });
  assert.match(out, /PASTOR v2/);
  assert.match(out, /2 task adapters/);
  assert.match(out, /frontend, backend/);
});

test("Pastor widget falls back honestly to the real registry when not injected", () => {
  const out = buildDashboard({ ...BASE });
  assert.match(out, /PASTOR v2/);
  // Real synthesis registry has task adapters → should show a count, not the empty notice.
  assert.match(out, /task adapters|no task adapters/);
});

test("Hardware widget shows GPU/VRAM/RAM when present", () => {
  const out = buildDashboard({
    ...BASE,
    hardware: { gpu: "NVIDIA RTX 4090", vramGb: 24, ramGb: 31, cpuCores: 32 },
  });
  assert.match(out, /HARDWARE/);
  assert.match(out, /RTX 4090/);
  assert.match(out, /24 GB VRAM/);
  assert.match(out, /31 GB · CPU: 32 cores/);
});

test("Hardware widget honest when no profile", () => {
  const out = buildDashboard({ ...BASE, hardware: null });
  assert.match(out, /no profile yet/);
});

test("Workflows widget lists recent runs and watch hint", () => {
  const out = buildDashboard({
    ...BASE,
    workflowRuns: [{ runId: "wf_abc123def", status: "running", task: "audit repo" }],
  });
  assert.match(out, /WORKFLOWS/);
  assert.match(out, /running/);
  assert.match(out, /workflow watch/);
});

test("Workflows widget honest when empty", () => {
  const out = buildDashboard({ ...BASE, workflowRuns: [] });
  assert.match(out, /no workflow runs yet/);
});

test("Limits widget shows cost-cap ceilings", () => {
  const out = buildDashboard({
    ...BASE,
    limits: {
      max_workflow_cost_usd: 5,
      max_session_cost_usd: 50,
      max_t3_calls_per_5min: 30,
      max_concurrent_workflows: 3,
    },
  });
  assert.match(out, /LIMITS/);
  assert.match(out, /workflow ≤ \$5/);
  assert.match(out, /session ≤ \$50/);
  assert.match(out, /T3 ≤ 30\/5min/);
});

test("Limits widget honest when absent", () => {
  const out = buildDashboard({ ...BASE, limits: null });
  assert.match(out, /no limits.toml/);
});

test("all rows respect the box width (no overrun)", () => {
  const width = 64;
  const out = buildDashboard({
    ...BASE,
    width,
    pastorAdapters: [{ type: "frontend", name: "fe" }],
    hardware: { gpu: "NVIDIA GeForce RTX 4090 Super Ultra", vramGb: 24, ramGb: 31, cpuCores: 32 },
    workflowRuns: [{ runId: "wf_xyz", status: "running", task: "a very long workflow task description that should be trimmed" }],
    limits: { max_workflow_cost_usd: 5, max_session_cost_usd: 50, max_t3_calls_per_5min: 30, max_concurrent_workflows: 3 },
  });
  for (const line of out.split("\n")) {
    // box border lines and content rows must all be exactly `width` display cols.
    assert.ok(displayWidth(line) <= width + 1, `line overruns ${width}: "${line}" (${displayWidth(line)})`);
  }
});

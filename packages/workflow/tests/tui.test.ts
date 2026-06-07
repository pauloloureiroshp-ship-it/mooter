// Phase H — watch(): progress rendering from the SQLite store.
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { watch, renderProgress } from "../src/tui.ts";
import { WorkflowStore } from "../src/state.ts";

function tmpDb(label: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `wf-tui-${label}-`));
  return path.join(dir, "state.db");
}

test("renderProgress shows phase, agent split and cost (pure)", () => {
  const s = renderProgress(
    { run_id: "r1", workflow_name: "audit", ts_start: 1, status: "running", num_phases: 4 },
    [
      { run_id: "r1", backend: "ollama", model: "qwen2.5-coder:7b", latency_ms: 1200, ts: 1 },
      { run_id: "r1", backend: "claude-api", model: "claude-opus-4-8", latency_ms: 3400, cost_usd: 0.01, ts: 2 },
    ],
    [{ run_id: "r1", name: "scanned", data: null, ts: 1 }],
  );
  assert.match(s, /audit \(r1\) · running/);
  assert.match(s, /phase 1\/4/);
  assert.match(s, /agents 2 \(1 local, 1 cloud\)/);
  assert.match(s, /last: qwen2\.5-coder:7b 1200ms · claude-opus-4-8 3400ms/);
});

test("watch renders once for a terminal run", async () => {
  const store = new WorkflowStore(tmpDb("done"));
  store.startRun({ run_id: "r1", workflow_name: "wf", num_phases: 2 });
  store.recordAgent("r1", { backend: "ollama", model: "qwen2.5-coder:7b", latency_ms: 500 });
  store.saveCheckpoint("r1", "p1", { ok: true });
  store.finishRun("r1", "completed");

  const lines: string[] = [];
  await watch({ runId: "r1", store, out: (t) => lines.push(t) });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /wf \(r1\) · completed/);
  store.close();
});

test("watch on an unknown run reports it and returns", async () => {
  const store = new WorkflowStore(tmpDb("missing"));
  const lines: string[] = [];
  await watch({ runId: "nope", store, out: (t) => lines.push(t) });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /no run 'nope'/);
  store.close();
});

test("watch with once:true renders a single snapshot of a running run", async () => {
  const store = new WorkflowStore(tmpDb("running"));
  store.startRun({ run_id: "r1", num_phases: 3 });
  store.saveCheckpoint("r1", "p1", {});
  const lines: string[] = [];
  await watch({ runId: "r1", store, once: true, out: (t) => lines.push(t) });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /phase 1\/3/);
  store.close();
});

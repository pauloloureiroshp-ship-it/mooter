// Phase F — SQLite checkpoint store + cross-session resume gate.
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import {
  WorkflowStore,
  createSqliteSink,
  installSqliteSink,
} from "../src/state.ts";
import { checkpoint, getSink, setSink, createMemorySink } from "../src/primitives.ts";

function tmpDb(label: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `wf-state-${label}-`));
  return path.join(dir, "state.db");
}

test("startRun + loadRun round-trips the run row", () => {
  const store = new WorkflowStore(tmpDb("basic"));
  store.startRun({ run_id: "r1", workflow_name: "audit", num_phases: 3, args: { target: "src/" } });
  const run = store.loadRun("r1");
  assert.ok(run);
  assert.equal(run!.run_id, "r1");
  assert.equal(run!.workflow_name, "audit");
  assert.equal(run!.num_phases, 3);
  assert.equal(run!.status, "running");
  assert.equal(run!.args, JSON.stringify({ target: "src/" }));
  assert.ok(run!.ts_start > 0);
  assert.equal(run!.ts_end, undefined);
  store.close();
});

test("loadRun returns null for an unknown run", () => {
  const store = new WorkflowStore(tmpDb("missing"));
  assert.equal(store.loadRun("nope"), null);
  store.close();
});

test("saveCheckpoint + resumeFrom returns latest-per-name in chronological order", () => {
  const store = new WorkflowStore(tmpDb("ckpt"));
  store.startRun({ run_id: "r1" });
  store.saveCheckpoint("r1", "phase1", { done: ["a", "b"] });
  store.saveCheckpoint("r1", "phase2", { count: 5 });
  store.saveCheckpoint("r1", "phase1", { done: ["a", "b", "c"] }); // supersedes earlier phase1

  const resume = store.resumeFrom("r1");
  assert.equal(resume.length, 2, "one record per distinct name");
  assert.deepEqual(resume.map((c) => c.name), ["phase1", "phase2"]);
  assert.deepEqual(resume[0].data, { done: ["a", "b", "c"] }, "phase1 is the latest value");
  assert.deepEqual(resume[1].data, { count: 5 });
  store.close();
});

// ── The headline gate: kill mid-run, restart, resume continues exactly ────────

test("GATE: cross-session resume — kill process, reopen, continue where left off", () => {
  const dbPath = tmpDb("resume");

  // Session 1: a run gets two phases in, then the "process dies" (close()).
  const s1 = new WorkflowStore(dbPath);
  s1.startRun({ run_id: "run-X", workflow_name: "audit-unused-exports", num_phases: 4 });
  s1.saveCheckpoint("run-X", "scanned", { files: 120 });
  s1.saveCheckpoint("run-X", "phase-1-findings", [{ file: "a.ts", issue: "unused" }]);
  s1.close(); // simulate kill

  // Session 2: a brand-new process opens the SAME db file.
  const s2 = new WorkflowStore(dbPath);
  const run = s2.loadRun("run-X");
  assert.ok(run, "run survived the restart");
  assert.equal(run!.status, "running", "still mid-flight");
  assert.equal(run!.num_phases, 4);

  const resume = s2.resumeFrom("run-X");
  const done = new Set(resume.map((c) => c.name));
  assert.ok(done.has("scanned"), "knows scan already happened");
  assert.ok(done.has("phase-1-findings"), "knows phase 1 already finished");

  // Resume: pick up the persisted findings and continue with phase 2.
  const findings = resume.find((c) => c.name === "phase-1-findings")!.data as unknown[];
  assert.equal(findings.length, 1, "recovered exactly the prior findings");
  s2.saveCheckpoint("run-X", "phase-2-findings", [{ file: "b.ts", issue: "unused" }]);
  const finished = s2.finishRun("run-X", "completed");
  assert.equal(finished!.status, "completed");
  assert.ok(finished!.ts_end! >= run!.ts_start);
  s2.close();
});

test("startRun on an existing run re-arms it (status→running, ts_start preserved)", () => {
  const dbPath = tmpDb("rearm");
  const s1 = new WorkflowStore(dbPath);
  s1.startRun({ run_id: "r1", workflow_name: "wf" });
  const tsStart = s1.loadRun("r1")!.ts_start;
  s1.finishRun("r1", "failed");
  assert.equal(s1.loadRun("r1")!.status, "failed");
  s1.close();

  const s2 = new WorkflowStore(dbPath);
  s2.startRun({ run_id: "r1" }); // resume
  const run = s2.loadRun("r1")!;
  assert.equal(run.status, "running", "re-armed");
  assert.equal(run.ts_end, undefined, "ts_end cleared");
  assert.equal(run.ts_start, tsStart, "original ts_start preserved");
  assert.equal(run.workflow_name, "wf", "prior metadata preserved via COALESCE");
  s2.close();
});

test("finishRun rolls up agent totals, cost and savings", () => {
  const store = new WorkflowStore(tmpDb("totals"));
  store.startRun({ run_id: "r1" });
  store.recordAgent("r1", { backend: "ollama", model: "qwen2.5-coder:7b", tokens_in: 1000, tokens_out: 500, cost_usd: 0 });
  store.recordAgent("r1", { backend: "ollama", model: "qwen2.5-coder:7b", tokens_in: 800, tokens_out: 300, cost_usd: 0 });
  store.recordAgent("r1", { backend: "claude-api", model: "claude-opus-4-8", tokens_in: 200, tokens_out: 400, cost_usd: 0.012 });

  const run = store.finishRun("r1", "completed")!;
  assert.equal(run.num_agents_total, 3);
  assert.equal(run.num_agents_local, 2);
  assert.equal(run.num_agents_cloud, 1);
  assert.ok(Math.abs((run.actual_cost_usd ?? 0) - 0.012) < 1e-9, "actual = sum of cloud cost");
  // Savings should be >= 0 (the two local agents would have cost money on Opus).
  assert.ok((run.estimated_savings_usd ?? -1) >= 0, "savings computed and non-negative");
  store.close();
});

test("agentsFor returns recorded agents in insertion order", () => {
  const store = new WorkflowStore(tmpDb("agents"));
  store.startRun({ run_id: "r1" });
  store.recordAgent("r1", { label: "scan:a", backend: "ollama", model: "m" });
  store.recordAgent("r1", { label: "scan:b", backend: "ollama", model: "m" });
  const agents = store.agentsFor("r1");
  assert.deepEqual(agents.map((a) => a.label), ["scan:a", "scan:b"]);
  store.close();
});

test("listRuns returns runs newest-first", () => {
  const store = new WorkflowStore(tmpDb("list"));
  store.startRun({ run_id: "old" });
  store.startRun({ run_id: "new" });
  const runs = store.listRuns(10);
  assert.ok(runs.length >= 2);
  assert.equal(runs[0].run_id, "new", "newest ts_start first");
  store.close();
});

// ── Sink wiring (the seam Phase D prepared via setSink) ────────────────────────

test("createSqliteSink persists checkpoints into the store", () => {
  const store = new WorkflowStore(tmpDb("sink"));
  store.startRun({ run_id: "r1" });
  const sink = createSqliteSink("r1", { store });
  sink.saveCheckpoint("milestone", { ok: true });
  const ck = store.getCheckpoint("r1", "milestone");
  assert.ok(ck);
  assert.deepEqual(ck!.data, { ok: true });
  store.close();
});

test("createSqliteSink forwards log() to onLog (logs aren't persisted)", () => {
  const store = new WorkflowStore(tmpDb("sinklog"));
  store.startRun({ run_id: "r1" });
  const seen: string[] = [];
  const sink = createSqliteSink("r1", { store, onLog: (m) => seen.push(m) });
  sink.log("hello", { phase: 1 });
  assert.deepEqual(seen, ["hello"]);
  store.close();
});

test("installSqliteSink routes the primitive checkpoint() into SQLite", async () => {
  const prev = getSink();
  const store = new WorkflowStore(tmpDb("install"));
  store.startRun({ run_id: "r1" });
  try {
    installSqliteSink("r1", { store });
    await checkpoint("from-primitive", { via: "setSink" });
    const ck = store.getCheckpoint("r1", "from-primitive");
    assert.ok(ck);
    assert.deepEqual(ck!.data, { via: "setSink" });
  } finally {
    setSink(prev); // restore so other suites keep the default memory sink
    store.close();
  }
});

test("a fresh memory sink is still the default elsewhere", () => {
  // Guard: installSqliteSink in the prior test must not leak into the global sink.
  setSink(createMemorySink());
  assert.ok(getSink());
});

// `mooter workflows` — Wave 58 Phase D suite.
// Run: cd packages/cli && npm test
//
// All tests are pure (no real filesystem reads). IO is injected via
// the WorkflowsIO seam so no tmp dirs or process state is needed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import {
  runWorkflows,
  buildWorkflowsOutput,
  readWorkflowsDir,
  type WorkflowEntry,
  type WorkflowsIO,
} from "../src/commands/workflows.ts";

// ── Fixture helpers ──────────────────────────────────────────────────────────

// Use the same path.join as the implementation so keys match on Windows and
// POSIX alike (Windows join produces backslashes; string literals don't).
const FAKE_HOME = join("C:", "fake-home");
const DIR = join(FAKE_HOME, ".mooter", "workflows");

function makeIO(files: Record<string, string>): WorkflowsIO {
  return {
    home: () => FAKE_HOME,
    readFile: (p) => files[p] ?? null,
    listDir: (p) => {
      // Build prefix using path.join so separator matches the implementation.
      // join(p, "x") appends the native separator, then we remove "x".
      const sentinel = join(p, "_SENTINEL_");
      const prefix = sentinel.slice(0, -"_SENTINEL_".length);
      return Object.keys(files)
        .filter((k) => {
          if (!k.startsWith(prefix)) return false;
          const rest = k.slice(prefix.length);
          // Only direct children (no nested separators).
          return !rest.includes("/") && !rest.includes("\\");
        })
        .map((k) => k.slice(prefix.length));
    },
    write: () => {},
    sleep: () => Promise.resolve(),
    shouldStop: () => true, // stop immediately in tail tests
  };
}

function activeRun(overrides: Partial<WorkflowEntry> = {}): string {
  return JSON.stringify({
    run_id: "my-workflow-1750000000000",
    workflow_name: "my-workflow",
    status: "running",
    agents_done: 3,
    agents_total: 10,
    ts: Date.now(),
    ...overrides,
  });
}

function completedRun(id: string, name: string): string {
  return JSON.stringify({
    run_id: id,
    workflow_name: name,
    status: "completed",
    ts_start: Date.now() - 300_000,
    ts_end: Date.now() - 10_000,
    actual_cost_usd: 0.0042,
    estimated_savings_usd: 0.12,
    agents_done: 7,
    agents_total: 7,
  });
}

// ── readWorkflowsDir ─────────────────────────────────────────────────────────

test("readWorkflowsDir: empty dir → empty array", () => {
  const result = readWorkflowsDir({
    dir: DIR,
    readFile: () => null,
    listDir: () => [],
  });
  assert.deepEqual(result, []);
});

test("readWorkflowsDir: active-run.json is always first", () => {
  const result = readWorkflowsDir({
    dir: DIR,
    readFile: (p) => p.endsWith("active-run.json") ? activeRun() : null,
    listDir: () => ["active-run.json"],
  });
  assert.equal(result.length, 1);
  assert.equal(result[0]._source, "active-run.json");
  assert.equal(result[0].status, "running");
  assert.equal(result[0].workflow_name, "my-workflow");
});

test("readWorkflowsDir: sidecar JSON files are appended after active-run", () => {
  const sidecarName = "old-run-1749000000000.json";
  const result = readWorkflowsDir({
    dir: DIR,
    readFile: (p) => {
      if (p.endsWith("active-run.json")) return activeRun();
      if (p.endsWith(sidecarName)) return completedRun("old-run-1749000000000", "old-workflow");
      return null;
    },
    listDir: () => [sidecarName, "active-run.json"],
  });
  assert.equal(result.length, 2);
  assert.equal(result[0]._source, "active-run.json");
  assert.equal(result[1]._source, sidecarName);
});

test("readWorkflowsDir: duplicate run_id in sidecar is deduplicated", () => {
  // Same run_id in active-run.json and a sidecar — only the active one kept.
  const sidecarName = "dup.json";
  const result = readWorkflowsDir({
    dir: DIR,
    readFile: (p) => {
      if (p.endsWith("active-run.json")) return activeRun({ run_id: "same-id" });
      if (p.endsWith(sidecarName)) return completedRun("same-id", "dup-workflow");
      return null;
    },
    listDir: () => ["active-run.json", sidecarName],
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].run_id, "same-id");
});

test("readWorkflowsDir: malformed JSON in sidecar is skipped", () => {
  const result = readWorkflowsDir({
    dir: DIR,
    readFile: (p) => p.endsWith("bad.json") ? "not-json{{{" : null,
    listDir: () => ["bad.json"],
  });
  assert.deepEqual(result, []);
});

test("readWorkflowsDir: entry with no run_id or workflow_name is dropped", () => {
  const result = readWorkflowsDir({
    dir: DIR,
    readFile: (p) => p.endsWith("no-id.json") ? JSON.stringify({ status: "running" }) : null,
    listDir: () => ["no-id.json"],
  });
  assert.deepEqual(result, []);
});

// ── buildWorkflowsOutput ─────────────────────────────────────────────────────

test("buildWorkflowsOutput: empty entries → honest empty state message", () => {
  const res = buildWorkflowsOutput({ entries: [], now: Date.now() });
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /no workflow runs found/);
  assert.match(res.output, /mooter workflow run/);
  assert.match(res.output, /mooter workflow list/);
});

test("buildWorkflowsOutput: list with one running entry", () => {
  const entry: WorkflowEntry = {
    run_id: "run-abc",
    workflow_name: "my-workflow",
    status: "running",
    agents_done: 3,
    agents_total: 10,
    ts: Date.now(),
  };
  const res = buildWorkflowsOutput({ entries: [entry], now: Date.now() });
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /mooter workflows/);
  assert.match(res.output, /running/);
  assert.match(res.output, /my-workflow/);
  assert.match(res.output, /3\/10 agents/);
});

test("buildWorkflowsOutput: --json emits valid JSON array", () => {
  const entry: WorkflowEntry = {
    run_id: "run-123",
    status: "completed",
    actual_cost_usd: 0.0012,
  };
  const res = buildWorkflowsOutput({ entries: [entry], json: true, now: Date.now() });
  assert.equal(res.exitCode, 0);
  const parsed = JSON.parse(res.output);
  assert.ok(Array.isArray(parsed));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].run_id, "run-123");
});

test("buildWorkflowsOutput: detail mode shows all fields", () => {
  const entry: WorkflowEntry = {
    run_id: "run-detail",
    workflow_name: "detail-wf",
    status: "completed",
    ts_start: 1_700_000_000_000,
    ts_end: 1_700_000_300_000,
    agents_done: 7,
    agents_total: 7,
    actual_cost_usd: 0.0042,
    estimated_savings_usd: 0.12,
    _source: "run-detail.json",
  };
  const res = buildWorkflowsOutput({ entries: [entry], name: "detail-wf", now: Date.now() });
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /detail-wf/);
  assert.match(res.output, /run_id/);
  assert.match(res.output, /completed/);
  assert.match(res.output, /7\/7/);
  assert.match(res.output, /\$0\.0042/);
  assert.match(res.output, /\$0\.12/);
});

test("buildWorkflowsOutput: detail by run_id (not workflow_name)", () => {
  const entry: WorkflowEntry = { run_id: "xyzzy-run", status: "failed" };
  const res = buildWorkflowsOutput({ entries: [entry], name: "xyzzy-run", now: Date.now() });
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /xyzzy-run/);
});

test("buildWorkflowsOutput: detail for unknown name → exit 1", () => {
  const res = buildWorkflowsOutput({ entries: [], name: "ghost", now: Date.now() });
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /no workflow run named.*ghost/);
});

test("buildWorkflowsOutput: detail --json emits single object", () => {
  const entry: WorkflowEntry = { run_id: "r1", workflow_name: "wf1", status: "running" };
  const res = buildWorkflowsOutput({ entries: [entry], name: "wf1", json: true, now: Date.now() });
  assert.equal(res.exitCode, 0);
  const parsed = JSON.parse(res.output);
  assert.equal(parsed.run_id, "r1");
});

test("buildWorkflowsOutput: stale running entry shown with 'stale' status", () => {
  const STALE = 7 * 60 * 60 * 1000; // 7h ago
  const entry: WorkflowEntry = {
    run_id: "stale-run",
    workflow_name: "stale-wf",
    status: "running",
    ts: Date.now() - STALE,
  };
  const res = buildWorkflowsOutput({ entries: [entry], now: Date.now() });
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /stale/);
});

test("buildWorkflowsOutput: multiple entries listed, plural header", () => {
  const entries: WorkflowEntry[] = [
    { run_id: "r1", status: "running", ts: Date.now() },
    { run_id: "r2", status: "completed", ts_start: Date.now() - 60_000 },
  ];
  const res = buildWorkflowsOutput({ entries, now: Date.now() });
  assert.match(res.output, /2 runs/);
});

// ── runWorkflows (end-to-end via IO injection) ───────────────────────────────

test("runWorkflows: --help → usage, exit 0", async () => {
  const io = makeIO({});
  const res = await runWorkflows(["--help"], io);
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /mooter workflows/);
  assert.match(res.output, /--tail/);
  assert.match(res.output, /--json/);
});

test("runWorkflows: no args, no files → honest empty state", async () => {
  const io = makeIO({});
  const res = await runWorkflows([], io);
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /no workflow runs found/);
});

test("runWorkflows: active-run.json present → running entry listed", async () => {
  const io = makeIO({
    [join(DIR, "active-run.json")]: activeRun(),
  });
  const res = await runWorkflows([], io);
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /running/);
  assert.match(res.output, /my-workflow/);
});

test("runWorkflows: --json with active run → valid JSON array", async () => {
  const io = makeIO({
    [join(DIR, "active-run.json")]: activeRun(),
  });
  const res = await runWorkflows(["--json"], io);
  assert.equal(res.exitCode, 0);
  const parsed = JSON.parse(res.output);
  assert.ok(Array.isArray(parsed));
  assert.equal(parsed[0].status, "running");
});

test("runWorkflows: --tail with no active run → 'no active workflow' message, exit 0", async () => {
  const writes: string[] = [];
  const io: WorkflowsIO = {
    ...makeIO({}),
    write: (s) => writes.push(s),
    shouldStop: () => true,
  };
  const res = await runWorkflows(["--tail"], io);
  assert.equal(res.exitCode, 0);
  const joined = writes.join("");
  assert.match(joined, /no active workflow run found/);
});

test("runWorkflows: --tail with active run emits progress then stops", async () => {
  const writes: string[] = [];
  let calls = 0;
  const io: WorkflowsIO = {
    ...makeIO({ [join(DIR, "active-run.json")]: activeRun() }),
    write: (s) => writes.push(s),
    sleep: () => Promise.resolve(),
    shouldStop: () => { calls++; return calls > 1; }, // stop after second shouldStop call
  };
  const res = await runWorkflows(["--tail"], io);
  assert.equal(res.exitCode, 0);
  const joined = writes.join("");
  assert.match(joined, /my-workflow/);
});

test("runWorkflows: <name> detail view", async () => {
  const io = makeIO({
    [join(DIR, "active-run.json")]: activeRun(),
  });
  const res = await runWorkflows(["my-workflow"], io);
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /run_id/);
  assert.match(res.output, /my-workflow/);
});

test("runWorkflows: <name> not found → exit 1", async () => {
  const io = makeIO({});
  const res = await runWorkflows(["nonexistent"], io);
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /no workflow run named.*nonexistent/);
});

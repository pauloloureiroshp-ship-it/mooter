// `mooter workflow` delegator suite (Wave 28 Phase B).
// Run: cd packages/cli && npm test
//
// These assertions lock the load-safe contract (no engine deps at import time):
// help / unknown-subcommand / argument-validation paths must all resolve WITHOUT
// lazy-importing @mooter/workflow (which pulls native deps). Real dispatch is
// exercised by the end-to-end demo, not here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { runWorkflow, WORKFLOW_USAGE } from "../src/commands/workflow.ts";

test("no args → usage, exit 0", async () => {
  const res = await runWorkflow([]);
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /mooter workflow/);
  assert.match(res.output, /create|run|watch/);
});

test("--help → usage, exit 0", async () => {
  const res = await runWorkflow(["--help"]);
  assert.equal(res.exitCode, 0);
  assert.equal(res.output, WORKFLOW_USAGE);
});

test("unknown subcommand → exit 1 + usage", async () => {
  const res = await runWorkflow(["frobnicate"]);
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /unknown subcommand 'frobnicate'/);
});

test("run without a name → exit 1 + usage (no engine import)", async () => {
  const res = await runWorkflow(["run"]);
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /a workflow name is required/);
});

test("watch without a run_id → exit 1 + usage (no engine import)", async () => {
  const res = await runWorkflow(["watch"]);
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /a run_id is required/);
});

test("resume without a run_id → exit 1 + usage (no engine import)", async () => {
  const res = await runWorkflow(["resume"]);
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /a run_id is required/);
});

test("stop reports the MVP semantics without importing the engine", async () => {
  const res = await runWorkflow(["stop", "r1"]);
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /synchronous|state\.db/);
});

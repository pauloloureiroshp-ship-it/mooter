// `mooter workflow` delegator suite (Wave 28 Phase B).
// Run: cd packages/cli && npm test
//
// Phase B is the skeleton: the command shows usage and reports the engine is
// being built. These assertions lock the load-safe contract (no engine deps at
// import time) and the help/unknown-subcommand behaviour.

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

test("known subcommand reports engine-under-construction (Phase B)", async () => {
  const res = await runWorkflow(["create", "audit src/"]);
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /being built|Phase C/);
});

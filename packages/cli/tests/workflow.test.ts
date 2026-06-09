// `mooter workflow` delegator suite (Wave 28 Phase B).
// Run: cd packages/cli && npm test
//
// These assertions lock the load-safe contract (no engine deps at import time):
// help / unknown-subcommand / argument-validation paths must all resolve WITHOUT
// lazy-importing @mooter/workflow (which pulls native deps). Real dispatch is
// exercised by the end-to-end demo, not here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { runWorkflow, WORKFLOW_USAGE, describeEngineError } from "../src/commands/workflow.ts";

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

// Wave 34.5 (Bug B) — engine-load failures map to precise, actionable messages.
test("describeEngineError: missing native dep names the dep + the build command", () => {
  const out = describeEngineError(new Error("Cannot find module 'isolated-vm'"));
  assert.match(out, /isolated-vm/);
  assert.match(out, /cd packages\/workflow && npm install/);
  assert.match(out, /C\+\+ toolchain|build-essential|xcode-select/);
});

test("describeEngineError: better-sqlite3 build failure is named specifically", () => {
  const out = describeEngineError(new Error("better-sqlite3 was compiled against a different Node.js version"));
  assert.match(out, /better-sqlite3/);
  assert.match(out, /npm install/);
});

test("describeEngineError: absent engine package → source-checkout guidance", () => {
  const e = Object.assign(new Error("Cannot find package '@mooter/workflow'"), { code: "ERR_MODULE_NOT_FOUND" });
  const out = describeEngineError(e);
  assert.match(out, /isn't included in this install/);
  assert.match(out, /git clone/);
});

test("describeEngineError: unknown failure surfaces the real message, no fake diagnosis", () => {
  const out = describeEngineError(new Error("EACCES: permission denied"));
  assert.match(out, /could not start/);
  assert.match(out, /EACCES: permission denied/);
});

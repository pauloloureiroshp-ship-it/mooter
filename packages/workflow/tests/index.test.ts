// Smoke: public entry surface (Wave 28 Phase B skeleton).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WORKFLOW_ENGINE_VERSION,
  PHASES,
  isEngineReady,
  NotImplementedError,
} from "../src/index.ts";

test("version is published", () => {
  assert.equal(WORKFLOW_ENGINE_VERSION, "0.1.0");
});

test("PHASES covers every engine module", () => {
  const keys = Object.keys(PHASES).sort();
  assert.deepEqual(keys, [
    "agent",
    "pool",
    "presenter",
    "primitives",
    "runtime",
    "state",
    "tui",
    "writer",
  ]);
});

test("Phase C modules (agent, pool) are done; later phases are not", () => {
  assert.equal(PHASES.agent.done, true);
  assert.equal(PHASES.pool.done, true);
  for (const k of ["primitives", "runtime", "state", "writer", "presenter", "tui"] as const) {
    assert.equal(PHASES[k].done, false, `${k} should still be a stub`);
  }
});

test("isEngineReady() is false while stubs remain", () => {
  assert.equal(isEngineReady(), false);
});

test("NotImplementedError is re-exported and carries its phase", () => {
  const e = new NotImplementedError("x()", "C");
  assert.equal(e.name, "NotImplementedError");
  assert.equal(e.phase, "C");
});

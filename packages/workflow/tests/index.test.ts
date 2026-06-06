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

test("PHASES covers every engine module and none are done yet", () => {
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
  assert.ok(Object.values(PHASES).every((m) => m.done === false));
});

test("isEngineReady() is false while stubs remain", () => {
  assert.equal(isEngineReady(), false);
});

test("NotImplementedError is re-exported and carries its phase", () => {
  const e = new NotImplementedError("x()", "C");
  assert.equal(e.name, "NotImplementedError");
  assert.equal(e.phase, "C");
});

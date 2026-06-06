// Smoke: pool stub (Phase C).
import { test } from "node:test";
import assert from "node:assert/strict";
import { AgentPool, detectOptimalConcurrency } from "../src/pool.ts";
import { NotImplementedError } from "../src/_stub.ts";

test("new AgentPool() throws NotImplementedError (Phase C)", () => {
  assert.throws(
    () => new AgentPool(),
    (e: unknown) => e instanceof NotImplementedError && e.phase === "C",
  );
});

test("detectOptimalConcurrency() throws NotImplementedError (Phase C)", () => {
  assert.throws(
    () => detectOptimalConcurrency(),
    (e: unknown) => e instanceof NotImplementedError && e.phase === "C",
  );
});

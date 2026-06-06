// Smoke: state store stubs (Phase F).
import { test } from "node:test";
import assert from "node:assert/strict";
import { saveCheckpoint, loadRun, resumeFrom } from "../src/state.ts";
import { NotImplementedError } from "../src/_stub.ts";

const isF = (e: unknown) => e instanceof NotImplementedError && e.phase === "F";

test("saveCheckpoint() throws (Phase F)", () => {
  assert.throws(() => saveCheckpoint("r1", "k", { a: 1 }), isF);
});

test("loadRun() throws (Phase F)", () => {
  assert.throws(() => loadRun("r1"), isF);
});

test("resumeFrom() throws (Phase F)", () => {
  assert.throws(() => resumeFrom("r1"), isF);
});

// Smoke: runtime stub (Phase E, critical).
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript, RUNTIME_DEFAULTS } from "../src/runtime.ts";
import { NotImplementedError } from "../src/_stub.ts";

test("RUNTIME_DEFAULTS match the brief (4h timeout, 512MB)", () => {
  assert.equal(RUNTIME_DEFAULTS.timeoutMs, 4 * 60 * 60 * 1000);
  assert.equal(RUNTIME_DEFAULTS.memoryLimitMb, 512);
});

test("runScript() rejects NotImplementedError (Phase E)", async () => {
  await assert.rejects(
    runScript("return 1"),
    (e: unknown) => e instanceof NotImplementedError && e.phase === "E",
  );
});

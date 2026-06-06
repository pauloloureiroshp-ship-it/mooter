// Smoke: tui stub (Phase H).
import { test } from "node:test";
import assert from "node:assert/strict";
import { watch } from "../src/tui.ts";
import { NotImplementedError } from "../src/_stub.ts";

test("watch() rejects NotImplementedError (Phase H)", async () => {
  await assert.rejects(
    watch({ runId: "r1" }),
    (e: unknown) => e instanceof NotImplementedError && e.phase === "H",
  );
});

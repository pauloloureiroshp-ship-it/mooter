// Smoke: writer stub (Phase G).
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeWorkflow } from "../src/writer.ts";
import { NotImplementedError } from "../src/_stub.ts";

test("writeWorkflow() rejects NotImplementedError (Phase G)", async () => {
  await assert.rejects(
    writeWorkflow("audit src/ for unused exports"),
    (e: unknown) => e instanceof NotImplementedError && e.phase === "G",
  );
});

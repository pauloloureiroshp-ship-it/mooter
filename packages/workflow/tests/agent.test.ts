// Smoke: agent() stub (Phase C).
import { test } from "node:test";
import assert from "node:assert/strict";
import { agent } from "../src/agent.ts";
import { NotImplementedError } from "../src/_stub.ts";

test("agent() rejects NotImplementedError (Phase C)", async () => {
  await assert.rejects(
    agent({ model: "qwen2.5-coder:7b", prompt: "hi" }),
    (e: unknown) => e instanceof NotImplementedError && e.phase === "C",
  );
});

// Smoke: primitives stubs (Phase D).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parallel, vote, converge, checkpoint, log } from "../src/primitives.ts";
import { NotImplementedError } from "../src/_stub.ts";

const isD = (e: unknown) => e instanceof NotImplementedError && e.phase === "D";

test("parallel() rejects (Phase D)", async () => {
  await assert.rejects(parallel([1], async (x) => x), isD);
});

test("vote() rejects (Phase D)", async () => {
  await assert.rejects(vote([1], async (c) => c), isD);
});

test("converge() rejects (Phase D)", async () => {
  await assert.rejects(converge([1], async (x) => x), isD);
});

test("checkpoint() rejects (Phase D)", async () => {
  await assert.rejects(checkpoint("k", { a: 1 }), isD);
});

test("log() rejects (Phase D)", async () => {
  await assert.rejects(log("hello"), isD);
});

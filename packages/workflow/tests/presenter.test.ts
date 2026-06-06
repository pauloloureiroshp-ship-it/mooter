// Smoke: presenter stub (Phase G).
import { test } from "node:test";
import assert from "node:assert/strict";
import { presentPlan } from "../src/presenter.ts";
import { NotImplementedError } from "../src/_stub.ts";
import type { WorkflowPlan } from "../src/writer.ts";

const emptyPlan: WorkflowPlan = {
  script: "",
  phases: [],
  agentsTotal: 0,
  agentsLocal: 0,
  agentsCloud: 0,
  tokenEstimate: 0,
  estimatedCostUsd: 0,
};

test("presentPlan() rejects NotImplementedError (Phase G)", async () => {
  await assert.rejects(
    presentPlan(emptyPlan, { autoAccept: true }),
    (e: unknown) => e instanceof NotImplementedError && e.phase === "G",
  );
});

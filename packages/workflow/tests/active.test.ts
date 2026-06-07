// Phase H — active-run pointer (statusline line 3 source).
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { updateActiveRun, clearActiveRun, readActiveRun, activePointerPath } from "../src/active.ts";

function withTmpPointer(label: string, fn: () => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `wf-active-${label}-`));
  const prev = process.env.MOOTER_WORKFLOW_ACTIVE;
  process.env.MOOTER_WORKFLOW_ACTIVE = path.join(dir, "active-run.json");
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.MOOTER_WORKFLOW_ACTIVE;
    else process.env.MOOTER_WORKFLOW_ACTIVE = prev;
  }
}

test("activePointerPath honours MOOTER_WORKFLOW_ACTIVE", () => {
  withTmpPointer("path", () => {
    assert.match(activePointerPath(), /active-run\.json$/);
  });
});

test("updateActiveRun writes a readable snapshot with a ts", () => {
  withTmpPointer("write", () => {
    updateActiveRun({ run_id: "r1", workflow_name: "audit", status: "running", phase: 2, num_phases: 4, agents_done: 12, agents_total: 50 });
    const snap = readActiveRun();
    assert.ok(snap);
    assert.equal(snap!.run_id, "r1");
    assert.equal(snap!.phase, 2);
    assert.equal(snap!.num_phases, 4);
    assert.equal(snap!.agents_total, 50);
    assert.ok(snap!.ts > 0, "ts auto-stamped");
  });
});

test("updateActiveRun respects an explicit ts", () => {
  withTmpPointer("ts", () => {
    updateActiveRun({ run_id: "r1", status: "running", ts: 12345 });
    assert.equal(readActiveRun()!.ts, 12345);
  });
});

test("clearActiveRun removes the pointer; readActiveRun then returns null", () => {
  withTmpPointer("clear", () => {
    updateActiveRun({ run_id: "r1", status: "running" });
    assert.ok(readActiveRun());
    clearActiveRun();
    assert.equal(readActiveRun(), null);
  });
});

test("readActiveRun returns null when there is no pointer", () => {
  withTmpPointer("none", () => {
    assert.equal(readActiveRun(), null);
  });
});

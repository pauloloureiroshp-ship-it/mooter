import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  startWave,
  setPhase,
  shipWave,
  summarize,
  loadState,
  emptyState,
  recordClassifySha,
  classifyShaOk,
  statePath,
  EXPECTED_CLASSIFY_SHA,
  STATE_VERSION,
} from "../src/state/central-state.ts";

function withTempHome<T>(fn: () => T): T {
  const dir = mkdtempSync(join(tmpdir(), "mooter-state-"));
  const prev = process.env.MOOTER_HOME;
  process.env.MOOTER_HOME = dir;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.MOOTER_HOME;
    else process.env.MOOTER_HOME = prev;
    rmSync(dir, { recursive: true, force: true });
  }
}

const T0 = new Date("2026-06-07T12:00:00.000Z");

test("loadState returns empty shape when no file", () => {
  withTempHome(() => {
    const s = loadState();
    assert.equal(s.version, STATE_VERSION);
    assert.equal(s.currentWave, null);
    assert.deepEqual(s.history, []);
  });
});

test("startWave seeds phases and marks first in_progress; persists to disk", () => {
  withTempHome(() => {
    startWave(
      { number: 30, branch: "wave30-mega", phases: [{ id: "A", title: "Recon" }, { id: "B", title: "Mission" }] },
      T0,
    );
    assert.ok(existsSync(statePath()));
    const sum = summarize();
    assert.equal(sum.active, true);
    assert.equal(sum.number, 30);
    assert.equal(sum.branch, "wave30-mega");
    assert.equal(sum.total, 2);
    assert.equal(sum.phase, "A");
    assert.equal(sum.phases[0].status, "in_progress");
    assert.equal(sum.phases[1].status, "todo");
  });
});

test("setPhase marks done and advances counts; current pointer moves on in_progress", () => {
  withTempHome(() => {
    startWave({ number: 30, branch: "w", phases: [{ id: "A", title: "A" }, { id: "B", title: "B" }] }, T0);
    setPhase("A", { status: "done", commit: "abc123" }, T0);
    let sum = summarize();
    assert.equal(sum.done, 1);
    assert.equal(sum.phases[0].commit, "abc123");
    setPhase("B", { status: "in_progress" }, T0);
    sum = summarize();
    assert.equal(sum.phase, "B");
  });
});

test("setPhase creates an unknown phase lazily", () => {
  withTempHome(() => {
    startWave({ number: 30, branch: "w", phases: [] }, T0);
    setPhase("Z", { status: "done" }, T0);
    const sum = summarize();
    assert.equal(sum.total, 1);
    assert.equal(sum.phases[0].id, "Z");
  });
});

test("setPhase throws without an active wave", () => {
  withTempHome(() => {
    assert.throws(() => setPhase("A", { status: "done" }), /no active wave/);
  });
});

test("shipWave moves current to history and clears currentWave", () => {
  withTempHome(() => {
    startWave({ number: 30, branch: "w", phases: [{ id: "A", title: "A" }] }, T0);
    setPhase("A", { status: "done" }, T0);
    shipWave({ tag: "v1.18.0-mega", mergeCommit: "deadbeef" }, T0);
    const s = loadState();
    assert.equal(s.currentWave, null);
    assert.equal(s.history.length, 1);
    assert.equal(s.history[0].tag, "v1.18.0-mega");
    assert.equal(s.history[0].mergeCommit, "deadbeef");
    assert.ok(s.history[0].shippedAt);
  });
});

test("shipWave throws when nothing active", () => {
  withTempHome(() => {
    assert.throws(() => shipWave(), /no active wave to ship/);
  });
});

test("startWave is idempotent on restart but preserves history", () => {
  withTempHome(() => {
    startWave({ number: 29, branch: "w29", phases: [{ id: "A", title: "A" }] }, T0);
    setPhase("A", { status: "done" }, T0);
    shipWave({ tag: "v1.17.0" }, T0);
    startWave({ number: 30, branch: "w30", phases: [{ id: "A", title: "A" }] }, T0);
    const sum = summarize();
    assert.equal(sum.number, 30);
    assert.equal(sum.historyCount, 1);
  });
});

test("classifyShaOk + recordClassifySha", () => {
  withTempHome(() => {
    assert.equal(classifyShaOk(EXPECTED_CLASSIFY_SHA), true);
    assert.equal(classifyShaOk("deadbeef"), false);
    recordClassifySha(EXPECTED_CLASSIFY_SHA, T0);
    assert.equal(loadState().classifySha, EXPECTED_CLASSIFY_SHA);
  });
});

test("persisted JSON is valid and pretty", () => {
  withTempHome(() => {
    startWave({ number: 30, branch: "w", phases: [{ id: "A", title: "A" }] }, T0);
    const raw = readFileSync(statePath(), "utf8");
    const parsed = JSON.parse(raw);
    assert.equal(parsed.version, STATE_VERSION);
    assert.ok(raw.includes("\n  ")); // pretty-printed
  });
});

test("emptyState is a fresh object each call", () => {
  const a = emptyState();
  const b = emptyState();
  assert.notEqual(a, b);
  a.history.push({} as never);
  assert.equal(b.history.length, 0);
});

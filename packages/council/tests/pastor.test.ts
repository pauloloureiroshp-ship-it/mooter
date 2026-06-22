import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  logCouncilOutcome,
  readLearningLedger,
  consensusBeatMembers,
  summarizeOutcomes,
  type CouncilOutcome,
} from "../src/pastor.ts";

function home(): string {
  return mkdtempSync(join(tmpdir(), "council-pastor-"));
}
function out(p: Partial<CouncilOutcome> = {}): CouncilOutcome {
  return { category: "coding.infra", changedVerdict: true, decisive: true, stable: false, costUsd: 0, seats: ["a", "b", "c"], ...p };
}

test("consensusBeatMembers: council right while a member was wrong → beat", () => {
  assert.equal(consensusBeatMembers(true, [true, false, true]), true);
  assert.equal(consensusBeatMembers(true, [true, true, true]), false); // everyone already right
  assert.equal(consensusBeatMembers(false, [true]), false);
  assert.equal(consensusBeatMembers(undefined, [true]), null);
  assert.equal(consensusBeatMembers(true, []), null);
});

test("logCouncilOutcome + readLearningLedger roundtrip (content-free, appends)", () => {
  const h = home();
  logCouncilOutcome(out({ category: "coding.security" }), { home: h });
  logCouncilOutcome(out({ category: "reasoning.math", changedVerdict: false }), { home: h });
  const led = readLearningLedger({ home: h });
  assert.equal(led.length, 2);
  assert.equal(led[0].category, "coding.security");
});

test("readLearningLedger: empty when absent", () => {
  assert.deepEqual(readLearningLedger({ home: home() }), []);
});

test("summarizeOutcomes: honest aggregates incl. redundancy + beatRate", () => {
  const s = summarizeOutcomes([
    out({ changedVerdict: true, consensusBeatMembers: true, costUsd: 0 }),
    out({ changedVerdict: false, decisive: false, consensusBeatMembers: false, costUsd: 0.1 }),
    out({ changedVerdict: true, costUsd: 0.2 }), // no ground truth
  ]);
  assert.equal(s.n, 3);
  assert.equal(Math.round(s.changeRate * 100) / 100, 0.67);
  assert.equal(Math.round(s.redundancyRate * 100) / 100, 0.33);
  assert.equal(s.beatRate, 0.5); // 1 of 2 with ground truth beat
});

test("summarizeOutcomes: empty is zeros, beatRate null", () => {
  const s = summarizeOutcomes([]);
  assert.equal(s.n, 0);
  assert.equal(s.beatRate, null);
});

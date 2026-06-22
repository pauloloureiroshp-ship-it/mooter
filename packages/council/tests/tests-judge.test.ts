import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeByTests, lengthNeutralPick } from "../src/tests-judge.ts";
import type { MemberBuild } from "../src/builder.ts";
import type { ModelSpec } from "../src/types.ts";

function build(id: string, passed: boolean, diffLines: number, diff = `diff-of-${id}`): MemberBuild {
  return { seatId: id, branch: `council/${id}`, worktreeDir: "", applied: true, passed, diffLines, diff, testOutput: "" };
}
function judgeReturning(text: string, capture?: (p: string) => void): ModelSpec {
  return {
    id: "claude-opus-4-8",
    tier: "T3",
    kind: "cloud",
    async call(p: string) {
      capture?.(p);
      return { text, costUsd: 0, latencyMs: 0 };
    },
  };
}

test("judge: nothing passes → honest no winner", async () => {
  const r = await judgeByTests([build("a", false, 5), build("b", false, 3)]);
  assert.equal(r.winner, null);
  assert.match(r.note, /no implementation passed/);
});

test("judge: single passing build wins", async () => {
  const r = await judgeByTests([build("a", false, 5), build("b", true, 10)]);
  assert.equal(r.winner!.seatId, "b");
  assert.match(r.note, /single passing/);
});

test("judge: multiple passing, no LLM judge → length-neutral (fewest diff lines)", async () => {
  const r = await judgeByTests([build("big", true, 50), build("small", true, 8), build("mid", true, 20)]);
  assert.equal(r.winner!.seatId, "small");
  assert.match(r.note, /length-neutral/);
});

test("judge: lengthNeutralPick is stable by branch on ties", () => {
  const w = lengthNeutralPick([build("z", true, 10), build("a", true, 10)]);
  assert.equal(w.seatId, "a"); // council/a < council/z
});

test("judge: LLM tie-break picks the chosen candidate (anonymized + ordered)", async () => {
  let seen = "";
  const judge = judgeReturning("Reasoning... WINNER: A", (p) => (seen = p));
  const passing = [
    { ...build("seat-secret-one", true, 10), diff: "module.exports = (a, b) => a + b" },
    { ...build("seat-secret-two", true, 12), diff: "module.exports = (a, b) => b + a" },
  ];
  const r = await judgeByTests(passing, { llmJudge: judge, orderSeed: 0 });
  assert.equal(r.winner!.seatId, "seat-secret-one"); // orderSeed 0 → A = passing[0]
  assert.match(r.note, /LLM judge tie-break/);
  // anonymization: candidates are labelled, seat ids never leak to the judge
  assert.match(seen, /CANDIDATE A/);
  assert.ok(!/seat-secret-one|seat-secret-two/.test(seen), "seat ids must not leak to the judge");
  assert.match(seen, /length-neutral|Do NOT reward length/i);
});

test("judge: LLM judge garbage → falls back to length-neutral", async () => {
  const judge = judgeReturning("I cannot decide");
  const r = await judgeByTests([build("big", true, 40), build("small", true, 5)], { llmJudge: judge });
  assert.equal(r.winner!.seatId, "small");
  assert.match(r.note, /length-neutral/);
});

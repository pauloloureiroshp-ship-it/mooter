import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAnswer,
  seatCompetence,
  clusterAnswers,
  selectWinnerByAgreement,
} from "../src/agreement.ts";

// ── normalizeAnswer ──────────────────────────────────────────────────────────
test("normalizeAnswer: folds case, whitespace and surrounding punctuation", () => {
  assert.equal(normalizeAnswer("  Yes.  "), "yes");
  assert.equal(normalizeAnswer("**42**"), "42");
  assert.equal(normalizeAnswer("foo   bar\n baz"), "foo bar baz");
  assert.equal(normalizeAnswer('"green"'), "green");
});

test("normalizeAnswer: never merges two genuinely different answers", () => {
  assert.notEqual(normalizeAnswer("blue"), normalizeAnswer("green"));
  assert.notEqual(normalizeAnswer("42"), normalizeAnswer("17"));
});

// ── seatCompetence (external prior, ordinal) ─────────────────────────────────
test("seatCompetence: ordinal prior from model id, coder bonus, neutral unknown", () => {
  assert.equal(seatCompetence("qwen2.5-coder:14b"), 4); // ≥12 → 3, +coder → 4
  assert.equal(seatCompetence("qwen2.5-coder:7b"), 3); // ≥7 → 2, +coder → 3
  assert.equal(seatCompetence("qwen2.5:3b"), 1); // <7 → 1, no coder
  assert.equal(seatCompetence("qwen3:30b"), 4); // ≥30 → 4
  assert.equal(seatCompetence("mystery-model"), 2); // unknown → neutral 2
  assert.ok(seatCompetence("qwen2.5-coder:14b") > seatCompetence("qwen2.5-coder:7b"));
  assert.ok(seatCompetence("qwen2.5-coder:7b") > seatCompetence("qwen2.5:3b"));
});

// ── clusterAnswers ───────────────────────────────────────────────────────────
test("clusterAnswers: groups equal normalized answers and sums competence", () => {
  const cs = clusterAnswers([
    { seatId: "qwen2.5-coder:7b", text: "green" },
    { seatId: "qwen2.5:3b", text: "GREEN" },
    { seatId: "qwen2.5-coder:14b", text: "blue" },
  ]);
  assert.equal(cs.length, 2);
  const green = cs.find((c) => c.key === "green")!;
  assert.deepEqual(new Set(green.members), new Set(["qwen2.5-coder:7b", "qwen2.5:3b"]));
  assert.equal(green.weight, 3 + 1);
  assert.equal(green.size, 2);
});

// ── selectWinnerByAgreement ──────────────────────────────────────────────────
test("selectWinnerByAgreement: empty set → null (never fabricates a winner)", () => {
  assert.equal(selectWinnerByAgreement([]), null);
});

test("selectWinnerByAgreement: among DIFFERENT answers the most competent seat wins — brevity never picks a weaker seat (W2 regression fix)", () => {
  // The weakest seat is the most concise; under the old length-neutral tiebreak it would
  // have won (and it drove every W2 verifiable regression). Competence must win instead.
  const w = selectWinnerByAgreement([
    { seatId: "qwen2.5-coder:14b", text: "the answer is 42, after careful reasoning" },
    { seatId: "qwen2.5-coder:7b", text: "maybe 17" },
    { seatId: "qwen2.5:3b", text: "0" }, // shortest, weakest
  ]);
  assert.equal(w?.seatId, "qwen2.5-coder:14b");
  assert.equal(w?.clusterSize, 1);
});

test("selectWinnerByAgreement: a weak pair that only TIES the strong seat does NOT override it (W2 r02 case)", () => {
  // qwen 7b + 3b agree on the same WRONG answer (weight 3+1=4), tying the lone 14b
  // (weight 4). competence-first tiebreak keeps the strong seat — no fresh regression.
  const w = selectWinnerByAgreement([
    { seatId: "qwen2.5-coder:14b", text: "correct-but-lonely" },
    { seatId: "qwen2.5-coder:7b", text: "ganged-up-wrong" },
    { seatId: "qwen2.5:3b", text: "ganged-up-wrong" },
  ]);
  assert.equal(w?.seatId, "qwen2.5-coder:14b", "competence tiebreak beats the weak consensus");
});

test("selectWinnerByAgreement: a genuine consensus that STRICTLY outweighs the top seat wins", () => {
  // Two strong seats agree (4+3=7) and strictly outweigh the lone weak dissenter (1).
  const w = selectWinnerByAgreement([
    { seatId: "qwen2.5-coder:14b", text: "shared answer" },
    { seatId: "qwen2.5-coder:7b", text: "shared answer" },
    { seatId: "qwen2.5:3b", text: "lone dissent" },
  ]);
  assert.equal(w?.clusterSize, 2);
  assert.equal(w?.seatId, "qwen2.5-coder:14b", "within the winning cluster the strongest seat speaks");
});

test("selectWinnerByAgreement: length-neutrality applies ONLY within an equivalent cluster", () => {
  // Two equal-competence seats give the SAME normalized answer with different verbosity;
  // the shorter phrasing wins inside the cluster. Custom equal competence isolates length.
  const equalComp = () => 2;
  const w = selectWinnerByAgreement(
    [
      { seatId: "a", text: "Yes, absolutely, that is correct." },
      { seatId: "b", text: "yes" }, // same normalized stem? no — different words
    ],
    equalComp,
  );
  // "yes" vs "yes, absolutely, ..." normalize differently → two singletons, tie on weight
  // and competence → larger size both 1 → lexicographic seatId → "a".
  assert.equal(w?.seatId, "a");

  // Now genuinely-equivalent answers (normalize-equal), different raw length:
  const w2 = selectWinnerByAgreement(
    [
      { seatId: "a", text: "  GREEN.  " },
      { seatId: "b", text: "green" },
    ],
    equalComp,
  );
  assert.equal(w2?.clusterSize, 2, "both fall in one cluster");
  assert.equal(w2?.seatId, "b", "within the cluster the shorter phrasing wins (length-neutral)");
});

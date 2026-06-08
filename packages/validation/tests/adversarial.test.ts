import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildReviewPrompt,
  parseVerdict,
  review,
  type LlmCaller,
  type ReviewTarget,
  LENSES,
} from "../src/adversarial/reviewer.ts";
import { vote } from "../src/adversarial/voter.ts";
import { runAdversarialReview, survivors } from "../src/adversarial/primitives-bridge.ts";
import type { ReviewResult } from "../src/adversarial/reviewer.ts";

function rr(verdict: ReviewResult["verdict"], confidence: number, lens: ReviewResult["lens"] = "correctness"): ReviewResult {
  return { reviewer: `${lens}-r`, lens, verdict, confidence, rationale: "x" };
}

// ─── prompt + parsing ───────────────────────────────────────────────────────

test("buildReviewPrompt includes the claim, lens guidance, and the refute-default", () => {
  const p = buildReviewPrompt({ id: "1", claim: "the sky is green" }, "correctness");
  assert.match(p, /the sky is green/);
  assert.match(p, /REFUTE/);
  assert.match(p, /Default to "refute"/);
  assert.match(p, /VERDICT:/);
});

test("parseVerdict reads the strict format", () => {
  const r = parseVerdict("VERDICT: refute\nCONFIDENCE: 0.83\nRATIONALE: off-by-one in the loop");
  assert.equal(r.verdict, "refute");
  assert.equal(r.confidence, 0.83);
  assert.match(r.rationale, /off-by-one/);
});

test("parseVerdict keyword fallback + confidence default 0.5", () => {
  assert.equal(parseVerdict("I would refute this entirely.").verdict, "refute");
  assert.equal(parseVerdict("This is confirmed by the test.").verdict, "confirm");
  assert.equal(parseVerdict("no signal here").verdict, "uncertain");
  assert.equal(parseVerdict("refute").confidence, 0.5);
});

test("parseVerdict clamps out-of-range confidence", () => {
  assert.equal(parseVerdict("VERDICT: confirm\nCONFIDENCE: 9.9").confidence, 1);
});

// ─── review() with injected caller ──────────────────────────────────────────

test("review() returns a structured result from the caller", async () => {
  const call: LlmCaller = async () => "VERDICT: confirm\nCONFIDENCE: 0.7\nRATIONALE: matches the spec";
  const r = await review({ id: "t", claim: "x" }, "security", call);
  assert.equal(r.verdict, "confirm");
  assert.equal(r.confidence, 0.7);
  assert.equal(r.lens, "security");
});

test("review() abstains (uncertain, 0) when the caller throws", async () => {
  const call: LlmCaller = async () => {
    throw new Error("ollama down");
  };
  const r = await review({ id: "t", claim: "x" }, "repro", call);
  assert.equal(r.verdict, "uncertain");
  assert.equal(r.confidence, 0);
  assert.match(r.rationale, /ollama down/);
});

// ─── voting ─────────────────────────────────────────────────────────────────

test("vote: refute majority → REJECTED", () => {
  const v = vote([rr("refute", 0.9), rr("refute", 0.8), rr("confirm", 0.6)]);
  assert.equal(v.convergence, "REJECTED");
  assert.ok(v.score < 0);
});

test("vote: confirm majority → CONFIRMED", () => {
  const v = vote([rr("confirm", 0.9), rr("confirm", 0.8), rr("refute", 0.2)]);
  assert.equal(v.convergence, "CONFIRMED");
  assert.ok(v.score > 0);
});

test("vote: ties go to REJECTED (adversarial asymmetry)", () => {
  const v = vote([rr("refute", 0.6), rr("confirm", 0.6)]);
  assert.equal(v.convergence, "REJECTED");
});

test("vote: mostly uncertain → UNCERTAIN", () => {
  const v = vote([rr("uncertain", 0.5), rr("uncertain", 0.5), rr("confirm", 0.1)]);
  assert.equal(v.convergence, "UNCERTAIN");
});

// ─── bridge fan-out (mock caller) + workflow sink ───────────────────────────

test("runAdversarialReview fans out per (target,lens), logs to sink, votes per target", async () => {
  // Mock: claims containing WRONG get refuted, TRUE get confirmed.
  const call: LlmCaller = async (prompt) => {
    if (prompt.includes("WRONG")) return "VERDICT: refute\nCONFIDENCE: 0.9\nRATIONALE: bad";
    if (prompt.includes("TRUE")) return "VERDICT: confirm\nCONFIDENCE: 0.9\nRATIONALE: good";
    return "VERDICT: uncertain\nCONFIDENCE: 0.4\nRATIONALE: meh";
  };
  const targets: ReviewTarget[] = [
    { id: "good", claim: "this is TRUE and correct" },
    { id: "bad", claim: "this is WRONG and broken" },
  ];
  const { verdicts, sink } = await runAdversarialReview(targets, call, {
    lenses: ["correctness", "security", "repro"],
    concurrency: 3,
  });
  assert.equal(verdicts.length, 2);
  const good = verdicts.find((v) => v.target.id === "good")!;
  const bad = verdicts.find((v) => v.target.id === "bad")!;
  assert.equal(good.vote.convergence, "CONFIRMED");
  assert.equal(bad.vote.convergence, "REJECTED");
  // sink got a log per (target,lens) = 6 and a checkpoint per target = 2
  const mem = sink as unknown as { logs: unknown[]; checkpoints: unknown[] };
  assert.equal(mem.logs.length, 6);
  assert.equal(mem.checkpoints.length, 2);
  // survivors drops the rejected one
  assert.deepEqual(survivors(verdicts).map((v) => v.target.id), ["good"]);
});

test("LENSES enumerates the five review lenses", () => {
  assert.deepEqual(LENSES, ["correctness", "security", "completeness", "repro", "doctrine"]);
});

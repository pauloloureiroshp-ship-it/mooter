import { test } from "node:test";
import assert from "node:assert/strict";
import { synthesize, calibrateConfidence, minorityReport } from "../src/verdict.ts";
import type {
  Council,
  CouncilVerdict,
  DeliberationTrace,
  ModelSpec,
  ReviewResult,
  VoteResult,
  Convergence,
} from "../src/types.ts";

function fakeSeat(id: string, kind: "local" | "cloud" = "local"): ModelSpec {
  return { id, tier: "T0", kind, call: async () => ({ text: "", costUsd: 0, latencyMs: 0 }) };
}
function rr(reviewer: string, verdict: ReviewResult["verdict"], rationale: string, lens: ReviewResult["lens"] = "correctness", confidence = 0.8): ReviewResult {
  return { reviewer, lens, verdict, confidence, rationale };
}
function vr(convergence: Convergence, score: number, reviewers: ReviewResult[]): VoteResult {
  return { convergence, confirmMass: 0, refuteMass: 0, uncertainMass: 0, score, threshold: 0.5, reviewers };
}
function trace(partial: Partial<DeliberationTrace>): DeliberationTrace {
  return {
    prompt: "p",
    answers: [{ seatId: "a", kind: "local", text: "answer A", costUsd: 0, latencyMs: 10 }],
    candidates: [],
    winnerSeatId: "a",
    vote: vr("CONFIRMED", 0.8, []),
    reviews: [],
    rounds: 1,
    costUsd: 0,
    latencyMs: 10,
    modelCalls: 0,
    ...partial,
  };
}
const localCouncil: Council = { seats: [fakeSeat("a"), fakeSeat("b")], judge: null, note: "", estCostUsd: 0 };

test("calibrateConfidence: CONFIRMED high score → high confidence", () => {
  assert.ok(calibrateConfidence(trace({ vote: vr("CONFIRMED", 0.8, []) })) > 0.85);
});
test("calibrateConfidence: UNCERTAIN is capped at 0.5", () => {
  assert.ok(calibrateConfidence(trace({ vote: vr("UNCERTAIN", 0.9, []) })) <= 0.5);
});
test("calibrateConfidence: REJECTED is capped at 0.4", () => {
  assert.ok(calibrateConfidence(trace({ vote: vr("REJECTED", 0.9, []) })) <= 0.4);
});

test("minorityReport: only non-confirm reviews are preserved (with evidence)", () => {
  const reviews = [
    rr("r1", "confirm", "looks right"),
    rr("r2", "refute", "off-by-one in loop", "correctness"),
    rr("r3", "uncertain", "untested on windows", "repro"),
  ];
  const mr = minorityReport(reviews);
  assert.equal(mr.length, 2);
  assert.ok(mr.some((m) => m.verdict === "refute" && /off-by-one/.test(m.rationale)));
  assert.ok(mr.some((m) => m.verdict === "uncertain"));
});

test("synthesize: 4 sections populated + recommendation = winner text", () => {
  const reviews = [
    rr("r1", "confirm", "approach is sound", "correctness"),
    rr("r2", "refute", "misses the auth check", "security"),
    rr("r3", "uncertain", "perf unclear at scale", "completeness"),
  ];
  const v: CouncilVerdict = synthesize(
    trace({ reviews, vote: vr("UNCERTAIN", 0.2, reviews), answers: [{ seatId: "a", kind: "local", text: "use a worktree per member", costUsd: 0, latencyMs: 5 }] }),
    localCouncil,
  );
  assert.equal(v.recommendation, "use a worktree per member");
  assert.ok(v.consensus.some((c) => /approach is sound/.test(c)));
  assert.ok(v.dissent.some((d) => /auth check/.test(d)));
  assert.ok(v.uniqueFindings.length >= 1);
  assert.equal(v.minorityReport.length, 2);
  assert.equal(v.judge, null);
  assert.match(v.coverageNote, /deterministic synthesis/);
  assert.match(v.coverageNote, /all-local/);
  assert.equal(v.convergence, "UNCERTAIN");
});

test("synthesize: errored seats are surfaced honestly in coverageNote", () => {
  const v = synthesize(
    trace({
      answers: [
        { seatId: "a", kind: "local", text: "ok", costUsd: 0, latencyMs: 5 },
        { seatId: "b", kind: "local", text: "", costUsd: 0, latencyMs: 0, error: "ollama HTTP 500" },
      ],
    }),
    localCouncil,
  );
  assert.match(v.coverageNote, /1 seat\(s\) errored/);
});

test("synthesize: no answer → honest placeholder, never fabricated", () => {
  const v = synthesize(trace({ answers: [{ seatId: "a", kind: "local", text: "", costUsd: 0, latencyMs: 0 }], winnerSeatId: "a" }), localCouncil);
  assert.equal(v.recommendation, "(no answer produced)");
});

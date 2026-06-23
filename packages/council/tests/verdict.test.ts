import { test } from "node:test";
import assert from "node:assert/strict";
import {
  synthesize,
  calibrateConfidence,
  minorityReport,
  selectWinner,
  preferCandidate,
  COUNCIL_BASE_RELIABILITY,
  type WinnerCandidate,
} from "../src/verdict.ts";
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
    stable: false,
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

test("calibrateConfidence (agreement): a lone winner gets the base reliability, IGNORING the anti-correlated peer-vote", () => {
  // A REJECTED peer-vote no longer drags a corroboration-1 winner down to 0.4: the W3
  // finding is that peer-REJECTED winners are actually MORE accurate, so the vote is ignored.
  const c = calibrateConfidence(trace({
    vote: vr("REJECTED", -0.9, []),
    agreement: { clusterSize: 1, clusterWeight: 4, totalCandidates: 3 },
  }));
  assert.ok(Math.abs(c - COUNCIL_BASE_RELIABILITY) < 1e-9, `expected base reliability, got ${c}`);
});

test("calibrateConfidence (agreement): unanimous corroboration lifts to the ceiling, never 1.0", () => {
  const c = calibrateConfidence(trace({
    vote: vr("CONFIRMED", 0.9, []),
    agreement: { clusterSize: 3, clusterWeight: 8, totalCandidates: 3 },
  }));
  assert.ok(Math.abs(c - 0.95) < 1e-9, `expected ceiling 0.95, got ${c}`);
  assert.ok(c < 1, "never claims certainty");
});

test("calibrateConfidence (agreement): confidence is monotone non-decreasing in corroboration", () => {
  const mk = (size: number) => calibrateConfidence(trace({
    vote: vr("UNCERTAIN", 0, []),
    agreement: { clusterSize: size, clusterWeight: size, totalCandidates: 3 },
  }));
  assert.ok(mk(1) <= mk(2));
  assert.ok(mk(2) <= mk(3));
  assert.ok(mk(1) < mk(3), "more agreement → strictly more confidence");
});

test("calibrateConfidence (agreement): config overrides base and ceiling for other rosters", () => {
  const c = calibrateConfidence(
    trace({ agreement: { clusterSize: 1, clusterWeight: 1, totalCandidates: 3 } }),
    { baseReliability: 0.5, ceiling: 0.9 },
  );
  assert.equal(c, 0.5);
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

// ──────────────────── length-neutral winner selection (W2) ────────────────────
function cand(seatId: string, convergence: Convergence, score: number, length: number): WinnerCandidate {
  return { seatId, vote: vr(convergence, score, []), length };
}

test("preferCandidate: correctness dominates — higher convergence rank wins regardless of length", () => {
  const confirmedLong = cand("a", "CONFIRMED", 0.8, 9999);
  const uncertainShort = cand("b", "UNCERTAIN", 0.9, 1);
  assert.equal(preferCandidate(confirmedLong, uncertainShort), true, "CONFIRMED beats UNCERTAIN even if far longer");
  assert.equal(preferCandidate(uncertainShort, confirmedLong), false);
});

test("preferCandidate: a materially higher vote score wins even when longer (length never trumps correctness)", () => {
  const strongLong = cand("a", "CONFIRMED", 0.9, 5000);
  const weakShort = cand("b", "CONFIRMED", 0.5, 10); // Δscore 0.4 > epsilon
  assert.equal(preferCandidate(strongLong, weakShort), true);
});

test("preferCandidate: at EQUAL correctness (same rank, |Δscore| ≤ ε) the SHORTER answer wins", () => {
  const concise = cand("a", "CONFIRMED", 0.80, 40);
  const verbose = cand("b", "CONFIRMED", 0.82, 400); // within ε=0.05 → tied on correctness
  assert.equal(preferCandidate(concise, verbose), true, "concise wins the tie");
  assert.equal(preferCandidate(verbose, concise), false, "verbosity is never rewarded");
});

test("selectWinner: verbosity is not rewarded — among equally-correct answers the shortest wins, and it is POSITION-FREE", () => {
  // The shortest answer belongs to seat 'z' (lexicographically LAST) and appears LAST
  // in the array. If selection leaked position/seatId order, 'a' (verbose) would win.
  const cands: WinnerCandidate[] = [
    cand("a", "CONFIRMED", 0.81, 500), // verbose, first in array, lexicographically first
    cand("m", "CONFIRMED", 0.80, 120),
    cand("z", "CONFIRMED", 0.82, 12),  // concise, last in array, lexicographically last
  ];
  assert.equal(selectWinner(cands)!.seatId, "z");
  // Order-invariance: reversing the input must not change the winner.
  assert.equal(selectWinner([...cands].reverse())!.seatId, "z");
});

test("selectWinner: fully tied (same rank, score, length) → deterministic seatId tiebreak, never array order", () => {
  const cands: WinnerCandidate[] = [
    cand("c", "CONFIRMED", 0.8, 50),
    cand("a", "CONFIRMED", 0.8, 50),
    cand("b", "CONFIRMED", 0.8, 50),
  ];
  assert.equal(selectWinner(cands)!.seatId, "a");
  assert.equal(selectWinner([...cands].reverse())!.seatId, "a", "deterministic regardless of order");
});

test("selectWinner: empty set → null (no fabricated winner)", () => {
  assert.equal(selectWinner([]), null);
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

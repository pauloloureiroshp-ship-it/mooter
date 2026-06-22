import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideActOrEscalate,
  linearOpinionPool,
  conformalThreshold,
  strongestRefute,
} from "../src/escalation.ts";
import type { CouncilVerdict } from "../src/types.ts";

function v(partial: Partial<CouncilVerdict>): CouncilVerdict {
  return {
    recommendation: "do it",
    confidence: 0.9,
    consensus: [],
    dissent: [],
    uniqueFindings: [],
    minorityReport: [],
    seats: ["a", "b", "c"],
    winnerSeatId: "a",
    judge: null,
    rounds: 1,
    costUsd: 0,
    latencyMs: 100,
    modelCalls: 9,
    convergence: "CONFIRMED",
    voteScore: 0.9,
    coverageNote: "",
    ...partial,
  };
}

test("linearOpinionPool: weighted mean, clamped to [0,1]", () => {
  assert.equal(linearOpinionPool([1, 0], [1, 1]), 0.5);
  assert.ok(Math.abs(linearOpinionPool([0.9, 0.6], [2, 1]) - 0.8) < 1e-9); // (1.8+0.6)/3
  assert.equal(linearOpinionPool([]), 0);
});

test("conformalThreshold: no calibration → 1 - alpha", () => {
  assert.equal(conformalThreshold([], 0.2), 0.8);
});

test("conformalThreshold: uses (1-alpha) quantile of calibration", () => {
  const cal = [0.5, 0.6, 0.7, 0.8, 0.9];
  const t = conformalThreshold(cal, 0.2);
  assert.ok(t >= 0.8 && t <= 0.9, `got ${t}`);
});

test("strongestRefute: max confidence among minority refutes", () => {
  const verdict = v({
    minorityReport: [
      { reviewer: "b", lens: "security", verdict: "refute", confidence: 0.8, rationale: "x" },
      { reviewer: "c", lens: "repro", verdict: "uncertain", confidence: 0.95, rationale: "y" },
    ],
  });
  assert.equal(strongestRefute(verdict), 0.8);
});

test("ACT only on strong consensus + no credible objection", () => {
  const d = decideActOrEscalate(v({ convergence: "CONFIRMED", confidence: 0.95, minorityReport: [] }));
  assert.equal(d.decision, "ACT");
});

test("ESCALATE when convergence is not CONFIRMED (even if confidence looks high)", () => {
  const d = decideActOrEscalate(v({ convergence: "UNCERTAIN", confidence: 0.95 }));
  assert.equal(d.decision, "ESCALATE");
  assert.ok(d.reasons.some((r) => /not CONFIRMED/.test(r)));
});

test("ESCALATE on a credible objection even when CONFIRMED with high confidence", () => {
  const d = decideActOrEscalate(
    v({
      convergence: "CONFIRMED",
      confidence: 0.95,
      minorityReport: [{ reviewer: "c", lens: "security", verdict: "refute", confidence: 0.9, rationale: "drops the auth check" }],
    }),
  );
  assert.equal(d.decision, "ESCALATE");
  assert.ok(d.reasons.some((r) => /credible objection/.test(r)));
});

test("ESCALATE when pooled confidence is below the conformal threshold", () => {
  const d = decideActOrEscalate(v({ convergence: "CONFIRMED", confidence: 0.5 }), { alpha: 0.1 }); // need ≥0.9
  assert.equal(d.decision, "ESCALATE");
  assert.ok(d.reasons.some((r) => /threshold/.test(r)));
});

test("SAFETY INVARIANT: a credible refute can never yield ACT (no false-ACT under disagreement)", () => {
  for (const conf of [0.5, 0.7, 0.9, 0.99]) {
    const d = decideActOrEscalate(
      v({ convergence: "CONFIRMED", confidence: conf, minorityReport: [{ reviewer: "c", lens: "security", verdict: "refute", confidence: 0.75, rationale: "real risk" }] }),
    );
    assert.equal(d.decision, "ESCALATE", `conf=${conf} must escalate under a credible refute`);
  }
});

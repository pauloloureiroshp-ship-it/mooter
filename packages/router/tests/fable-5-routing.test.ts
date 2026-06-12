// fable-5-routing.test.ts — Wave 58 (A.17) adaptive-escalation DoD.
// Run: cd packages/router && npm test   (tsx --test tests/*.test.ts)
//
// Boundary under test: adaptiveRoute ranks REAL TES candidates, runs the
// cheapest viable model first, has an INJECTED judge score the answer, and
// escalates to the next-TES candidate on low confidence. executor + judge are
// stubbed so NO real model is ever called. Confidence is the JUDGE score (the
// Sonnet self-judge by default), NOT classify.js's routing confidence. Honest:
// when nothing clears the threshold we return best-so-far with a
// "confidence threshold not reached" warning, never a faked pass.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";

import {
  adaptiveRoute,
  rankCandidates,
  scoresToConfidence,
  appendEscalation,
  escalationLogPath,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_MIN_CONFIDENCE,
  type RankedCandidate,
  type Executor,
  type Judge,
  type EscalationRecord,
} from "../src/fable-5-routing.ts";

// --- helpers ----------------------------------------------------------------

/** A throwaway MOOTER_HOME so the escalation journal never touches the real ~/.mooter. */
function tmpHome(): string {
  return mkdtempSync(join(tmpdir(), "fable5-"));
}

/** An executor that records which models it was asked to run, with fixed cost. */
function recordingExecutor(opts: { cost?: number | null; tokens?: number | null } = {}): {
  exec: Executor;
  calls: string[];
} {
  const calls: string[] = [];
  const exec: Executor = (model, _task) => {
    calls.push(model);
    return {
      text: `answer from ${model}`,
      cost: opts.cost === undefined ? 0.01 : opts.cost,
      tokens: opts.tokens === undefined ? 100 : opts.tokens,
    };
  };
  return { exec, calls };
}

/** A descending TES ranking of N synthetic candidates (TEST-ONLY seam input —
 *  injects ORDER, not capability; the real matrix is honestly sparse). */
function fakeRanking(models: string[]): RankedCandidate[] {
  return models.map((model, i) => ({ model, score: 0.9 - i * 0.05, tes: 9000 - i * 1000 }));
}

const C = "coding.backend"; // a category with a real measured+priced candidate

// ---------------------------------------------------------------------------
// rankCandidates — REAL TES only, no fabrication
// ---------------------------------------------------------------------------

describe("rankCandidates — real TES, anti-fabrication", () => {
  test("returns only measured+priced models, sorted by TES descending", () => {
    const r = rankCandidates(C, 0);
    // The real matrix has a measured+priced candidate for coding.backend.
    assert.ok(r.length >= 1, "expected >=1 viable candidate for coding.backend");
    for (const c of r) {
      assert.ok(typeof c.tes === "number" && Number.isFinite(c.tes), "tes must be finite");
      assert.ok(c.score >= 0 && c.score <= 1, "score in [0,1]");
    }
    for (let i = 1; i < r.length; i++) {
      assert.ok(r[i - 1].tes >= r[i].tes, "TES must be non-increasing");
    }
  });

  test("min_score gate excludes every candidate below it", () => {
    // No measured score reaches 1.1, so the pool must be empty.
    assert.equal(rankCandidates(C, 1.1).length, 0);
  });

  test("a category with no measured+priced model yields an empty pool (honest)", () => {
    // context.audio is unmeasured in the seed — never fabricated into a candidate.
    assert.equal(rankCandidates("context.audio", 0).length, 0);
  });
});

// ---------------------------------------------------------------------------
// adaptiveRoute — accept on first viable candidate
// ---------------------------------------------------------------------------

describe("adaptiveRoute — accept path", () => {
  test("accepts the first candidate when judge confidence >= min_confidence", async () => {
    const { exec, calls } = recordingExecutor();
    const r = await adaptiveRoute({
      task: "implement X",
      task_category: C,
      min_score: 0,
      executor: exec,
      judge: () => 0.9,
      home: tmpHome(),
    });
    assert.equal(r.final_confidence_met, true);
    assert.equal(r.attempts.length, 1, "should not escalate once accepted");
    assert.equal(calls.length, 1, "executor called exactly once");
    assert.equal(r.winning_model, calls[0]);
    assert.match(r.escalation_reason, /accepted on attempt 1/i);
    assert.equal(r.total_cost, 0.01);
    assert.equal(r.cost_complete, true);
  });
});

// ---------------------------------------------------------------------------
// adaptiveRoute — escalation walk (test-only candidate seam, real logic)
// ---------------------------------------------------------------------------

describe("adaptiveRoute — escalation", () => {
  test("escalates DOWN the TES ranking until a candidate clears the threshold", async () => {
    const { exec, calls } = recordingExecutor();
    const ranking = fakeRanking(["cheap-A", "mid-B", "strong-C"]);
    // Judge fails the first two, passes the third.
    const judge: Judge = (_t, answer) => (answer.includes("strong-C") ? 0.95 : 0.3);
    const r = await adaptiveRoute({
      task: "hard task",
      task_category: C,
      min_score: 0,
      max_attempts: 3,
      executor: exec,
      judge,
      __candidates: ranking,
      home: tmpHome(),
    });
    assert.deepEqual(calls, ["cheap-A", "mid-B", "strong-C"], "tried in TES-desc order");
    assert.equal(r.final_confidence_met, true);
    assert.equal(r.winning_model, "strong-C");
    assert.equal(r.attempts.length, 3);
    assert.equal(r.final_confidence, 0.95);
    assert.equal(r.total_cost, 0.03);
  });

  test("max_attempts caps how many candidates are tried", async () => {
    const { exec, calls } = recordingExecutor();
    const ranking = fakeRanking(["A", "B", "C", "D"]);
    const r = await adaptiveRoute({
      task: "t",
      task_category: C,
      min_score: 0,
      max_attempts: 2,
      executor: exec,
      judge: () => 0.1, // never clears
      __candidates: ranking,
      home: tmpHome(),
    });
    assert.equal(calls.length, 2, "stopped at max_attempts");
    assert.equal(r.attempts.length, 2);
    assert.equal(r.final_confidence_met, false);
    assert.match(r.escalation_reason, /ran out of attempts/i);
  });

  test("attempts are clamped to the number of viable candidates", async () => {
    const { exec, calls } = recordingExecutor();
    const ranking = fakeRanking(["only-A"]);
    const r = await adaptiveRoute({
      task: "t",
      task_category: C,
      min_score: 0,
      max_attempts: 5, // more than candidates
      executor: exec,
      judge: () => 0.1,
      __candidates: ranking,
      home: tmpHome(),
    });
    assert.equal(calls.length, 1, "cannot try more models than exist");
    assert.equal(r.attempts.length, 1);
  });
});

// ---------------------------------------------------------------------------
// adaptiveRoute — HONEST failure (never fake success)
// ---------------------------------------------------------------------------

describe("adaptiveRoute — honest threshold-not-reached", () => {
  test("returns best-so-far with a 'threshold not reached' warning, met=false", async () => {
    const { exec } = recordingExecutor();
    const ranking = fakeRanking(["A", "B", "C"]);
    // B is the best of a bad lot (0.6) but still below the 0.75 default.
    const judge: Judge = (_t, answer) =>
      answer.includes("B") ? 0.6 : answer.includes("A") ? 0.4 : 0.5;
    const r = await adaptiveRoute({
      task: "t",
      task_category: C,
      min_score: 0,
      executor: exec,
      judge,
      __candidates: ranking,
      home: tmpHome(),
    });
    assert.equal(r.final_confidence_met, false, "must NOT claim success");
    assert.match(r.escalation_reason, /confidence threshold not reached/i);
    assert.equal(r.winning_model, "B", "returns the best-so-far, not the last");
    assert.equal(r.final_confidence, 0.6);
    assert.ok(r.final && r.final.includes("B"), "final text is the best-so-far answer");
  });

  test("a null judge confidence (unknown) is treated as below threshold, never a pass", async () => {
    const { exec } = recordingExecutor();
    const r = await adaptiveRoute({
      task: "t",
      task_category: C,
      min_score: 0,
      executor: exec,
      judge: () => null, // judge could not score (honest unknown)
      home: tmpHome(),
    });
    assert.equal(r.final_confidence_met, false);
    assert.equal(r.final_confidence, null);
    assert.match(r.escalation_reason, /threshold not reached/i);
  });

  test("an executor that throws collapses to an empty, null-cost attempt (never throws out)", async () => {
    const throwing: Executor = () => {
      throw new Error("boom");
    };
    const r = await adaptiveRoute({
      task: "t",
      task_category: C,
      min_score: 0,
      executor: throwing,
      judge: () => 0.9,
      __candidates: fakeRanking(["A"]),
      home: tmpHome(),
    });
    assert.equal(r.attempts.length, 1);
    assert.equal(r.attempts[0].cost, null);
    assert.equal(r.cost_complete, false, "unknown cost is honest-incomplete");
    assert.equal(r.final, "");
  });
});

// ---------------------------------------------------------------------------
// adaptiveRoute — cost honesty
// ---------------------------------------------------------------------------

describe("adaptiveRoute — cost accounting", () => {
  test("total_cost sums known costs; cost_complete=false when any is unknown", async () => {
    let n = 0;
    const exec: Executor = (model) => {
      n++;
      // First attempt known cost, second attempt unknown cost.
      return { text: `r-${model}`, cost: n === 1 ? 0.02 : null, tokens: 10 };
    };
    const r = await adaptiveRoute({
      task: "t",
      task_category: C,
      min_score: 0,
      max_attempts: 2,
      executor: exec,
      judge: () => 0.1,
      __candidates: fakeRanking(["A", "B"]),
      home: tmpHome(),
    });
    assert.equal(r.total_cost, 0.02, "only the known cost is summed");
    assert.equal(r.cost_complete, false, "unknown cost flagged honestly");
  });
});

// ---------------------------------------------------------------------------
// adaptiveRoute — guards / empty cases (nothing run)
// ---------------------------------------------------------------------------

describe("adaptiveRoute — guards", () => {
  test("unknown category runs nothing and explains why", async () => {
    const { exec, calls } = recordingExecutor();
    const r = await adaptiveRoute({
      task: "t",
      task_category: "coding.nope",
      executor: exec,
      judge: () => 0.9,
      home: tmpHome(),
    });
    assert.equal(r.final, null);
    assert.equal(r.winning_model, null);
    assert.equal(calls.length, 0);
    assert.match(r.escalation_reason, /unknown task_category/i);
  });

  test("no viable candidate (empty pool) runs nothing and explains why", async () => {
    const { exec, calls } = recordingExecutor();
    const r = await adaptiveRoute({
      task: "t",
      task_category: "context.audio", // unmeasured → empty pool
      min_score: 0,
      executor: exec,
      judge: () => 0.9,
      home: tmpHome(),
    });
    assert.equal(r.final, null);
    assert.equal(calls.length, 0);
    assert.match(r.escalation_reason, /no viable candidate/i);
  });
});

// ---------------------------------------------------------------------------
// scoresToConfidence — the default-judge blend (documented convention)
// ---------------------------------------------------------------------------

describe("scoresToConfidence — rubric blend", () => {
  test("a perfect rubric maps to 1.0", () => {
    assert.equal(
      scoresToConfidence({ correctness: 1, completeness: 5, relevance: 5, actionability: 5, hallucination: 0 }),
      1,
    );
  });

  test("output is always clamped to [0,1]", () => {
    const c = scoresToConfidence({ correctness: 0, completeness: 1, relevance: 1, actionability: 1, hallucination: 1 });
    assert.ok(c >= 0 && c <= 1);
  });

  test("a hallucination penalises confidence vs an otherwise identical answer", () => {
    const clean = scoresToConfidence({ correctness: 1, completeness: 5, relevance: 5, actionability: 5, hallucination: 0 });
    const halluc = scoresToConfidence({ correctness: 1, completeness: 5, relevance: 5, actionability: 5, hallucination: 1 });
    assert.ok(halluc < clean, "a hallucination must lower confidence");
  });
});

// ---------------------------------------------------------------------------
// Escalation journal — sibling JSONL, best-effort, honest nulls
// ---------------------------------------------------------------------------

describe("escalation journal", () => {
  test("adaptiveRoute appends one row per call to the sibling journal", async () => {
    const home = tmpHome();
    const { exec } = recordingExecutor();
    await adaptiveRoute({
      task: "t",
      task_category: C,
      min_score: 0,
      executor: exec,
      judge: () => 0.9,
      __candidates: fakeRanking(["A", "B"]),
      home,
    });
    const p = escalationLogPath(home);
    assert.ok(existsSync(p), "journal file should exist");
    const lines = readFileSync(p, "utf8").trim().split("\n").filter(Boolean);
    assert.equal(lines.length, 1);
    const row = JSON.parse(lines[0]) as EscalationRecord & { ts: string };
    assert.equal(row.task_category, C);
    assert.equal(row.accepted, true);
    assert.equal(row.winning_model, "A");
    assert.ok(typeof row.ts === "string" && row.ts.length > 0);
  });

  test("appendEscalation is best-effort and returns true on success", () => {
    const home = tmpHome();
    const rec: EscalationRecord = {
      task_category: C,
      attempts: 2,
      escalated: true,
      accepted: false,
      winning_model: "B",
      final_confidence: null, // honest unknown survives the round-trip
      min_confidence: 0.75,
      total_cost: 0.05,
      cost_complete: false,
      models_tried: ["A", "B"],
    };
    assert.equal(appendEscalation(rec, { home }), true);
    const row = JSON.parse(readFileSync(escalationLogPath(home), "utf8").trim());
    assert.equal(row.final_confidence, null, "null is stored, not fabricated");
    assert.equal(row.escalated, true);
  });
});

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

describe("defaults", () => {
  test("DEFAULT_MAX_ATTEMPTS is 3 and DEFAULT_MIN_CONFIDENCE is 0.75 (per brief)", () => {
    assert.equal(DEFAULT_MAX_ATTEMPTS, 3);
    assert.equal(DEFAULT_MIN_CONFIDENCE, 0.75);
  });
});

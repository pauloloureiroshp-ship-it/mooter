// Deliberation protocol — reuses the engine primitives, writes NO new aggregation.
//
//   Phase 1 — Generation: members answer IN PARALLEL, no cross-talk (preserves
//             diversity; avoids anchoring/groupthink). [workflow.parallel]
//   Phase 2 — Cross-exam: each member adversarially reviews the OTHERS' anonymized
//             answers along lenses. [validation.review]  Aggregation: [validation.vote]
//             ADAPTIVE STOPPING (iMAD): if round 1 already converges, skip round 2.
//   Phase 3 — Verdict: synthesize() builds the honest 4-section output.
//
// Cost is metered from the raw CallOutcome (review() throws away cost via LlmCaller,
// so we wrap the seat in a metering caller). Honesty: a seat that errors abstains
// (uncertain) — the council never fabricates an answer it did not get.

import { parallel } from "../../workflow/src/primitives.ts";
import { review } from "../../validation/src/adversarial/reviewer.ts";
import { vote } from "../../validation/src/adversarial/voter.ts";
import { synthesize } from "./verdict.ts";
import type {
  Council,
  CouncilVerdict,
  DeliberationTrace,
  LlmCaller,
  Lens,
  ModelSpec,
  ReviewResult,
  ReviewTarget,
  SeatAnswer,
  VoteResult,
} from "./types.ts";

export interface DeliberateOptions {
  concurrency?: number;
  /** Lenses for round 1 (default correctness). */
  round1Lenses?: Lens[];
  /** Lenses for round 2 (default completeness). */
  round2Lenses?: Lens[];
  /** Adaptive stop: skip round 2 when the winner is CONFIRMED with score ≥ this. */
  stopThreshold?: number;
  maxRounds?: number;
  /** Passed to vote(). */
  voteThreshold?: number;
  /** Extra honesty caveats forwarded to synthesize(). */
  coverageNotes?: string[];
}

interface Meter {
  cost: number;
  latency: number;
  calls: number;
}

function meteredCaller(spec: ModelSpec, m: Meter): LlmCaller {
  return async (prompt: string) => {
    const o = await spec.call(prompt);
    m.cost += o.costUsd;
    m.latency += o.latencyMs;
    m.calls += 1;
    return o.text;
  };
}

function manualVote(threshold: number, reviewers: ReviewResult[] = []): VoteResult {
  return {
    convergence: "UNCERTAIN",
    confirmMass: 0,
    refuteMass: 0,
    uncertainMass: 0,
    score: 0,
    threshold,
    reviewers,
  };
}

/** Rank a candidate's vote: CONFIRMED beats others; then higher score wins. */
function betterVote(a: VoteResult, b: VoteResult): VoteResult {
  const rank = (v: VoteResult) => (v.convergence === "CONFIRMED" ? 2 : v.convergence === "UNCERTAIN" ? 1 : 0);
  if (rank(a) !== rank(b)) return rank(a) > rank(b) ? a : b;
  return a.score >= b.score ? a : b;
}

export async function deliberate(
  prompt: string,
  council: Council,
  opts: DeliberateOptions = {},
): Promise<CouncilVerdict> {
  const concurrency = opts.concurrency ?? 4;
  const round1Lenses = opts.round1Lenses ?? ["correctness"];
  const round2Lenses = opts.round2Lenses ?? ["completeness"];
  const stopThreshold = opts.stopThreshold ?? 0.6;
  const maxRounds = opts.maxRounds ?? 2;
  const voteThreshold = opts.voteThreshold ?? 0.5;
  const wall0 = Date.now();
  const meter: Meter = { cost: 0, latency: 0, calls: 0 };

  // ── Phase 1: independent generation, no cross-talk ─────────────────────────
  const answers: SeatAnswer[] = await parallel(
    council.seats,
    async (seat): Promise<SeatAnswer> => {
      const o = await seat.call(prompt);
      return {
        seatId: seat.id,
        kind: seat.kind,
        text: o.text,
        costUsd: o.costUsd,
        latencyMs: o.latencyMs,
        error: o.error,
      };
    },
    { concurrency },
  );

  const candidates = answers.filter((a) => !a.error && a.text.trim().length > 0);
  const answerCost = answers.reduce((s, a) => s + a.costUsd, 0);

  // No usable answer → honest empty verdict, no fabrication.
  if (candidates.length === 0) {
    const trace: DeliberationTrace = {
      prompt,
      answers,
      candidates: [],
      winnerSeatId: null,
      vote: manualVote(voteThreshold),
      reviews: [],
      rounds: 0,
      costUsd: answerCost,
      latencyMs: Date.now() - wall0,
      modelCalls: answers.length,
    };
    return synthesize(trace, council, { coverageNotes: opts.coverageNotes });
  }

  // ── Phase 2: adversarial cross-exam with adaptive stopping ─────────────────
  const reviewsByCandidate = new Map<string, ReviewResult[]>();
  candidates.forEach((c) => reviewsByCandidate.set(c.seatId, []));
  const allReviews: ReviewResult[] = [];

  const runRound = async (cands: SeatAnswer[], lenses: Lens[]): Promise<void> => {
    const tasks: Array<() => Promise<{ candId: string; rr: ReviewResult }>> = [];
    for (const cand of cands) {
      const target: ReviewTarget = { id: cand.seatId, claim: cand.text, context: prompt };
      for (const seat of council.seats) {
        if (seat.id === cand.seatId) continue; // anonymized OTHERS only — no self-review
        const caller = meteredCaller(seat, meter);
        for (const lens of lenses) {
          tasks.push(async () => ({
            candId: cand.seatId,
            rr: await review(target, lens, caller, `${seat.id}:${lens}`),
          }));
        }
      }
    }
    const results = await parallel(tasks, (t) => t(), { concurrency });
    for (const { candId, rr } of results) {
      reviewsByCandidate.get(candId)!.push(rr);
      allReviews.push(rr);
    }
  };

  let rounds = 0;
  await runRound(candidates, round1Lenses);
  rounds = 1;

  const voteOf = (id: string) => vote(reviewsByCandidate.get(id) ?? [], { threshold: voteThreshold });
  let winnerId = candidates[0].seatId;
  let winnerVote = voteOf(winnerId);
  for (const c of candidates) {
    const v = voteOf(c.seatId);
    if (betterVote(v, winnerVote) === v) {
      winnerVote = v;
      winnerId = c.seatId;
    }
  }

  // Adaptive stopping (iMAD): decisive consensus in EITHER direction → skip round 2.
  // A unanimous refute is consensus too; only genuine uncertainty needs another round.
  const decisive =
    (winnerVote.convergence === "CONFIRMED" || winnerVote.convergence === "REJECTED") &&
    Math.abs(winnerVote.score) >= stopThreshold;
  if (!decisive && maxRounds > 1 && candidates.length > 1) {
    // Round 2: re-examine the top-2 candidates along the round-2 lenses.
    const ranked = [...candidates].sort((a, b) => voteOf(b.seatId).score - voteOf(a.seatId).score);
    const top2 = ranked.slice(0, 2);
    await runRound(top2, round2Lenses);
    rounds = 2;
    winnerId = candidates[0].seatId;
    winnerVote = voteOf(winnerId);
    for (const c of candidates) {
      const v = voteOf(c.seatId);
      if (betterVote(v, winnerVote) === v) {
        winnerVote = v;
        winnerId = c.seatId;
      }
    }
  }

  const trace: DeliberationTrace = {
    prompt,
    answers,
    candidates: candidates.map((c) => ({ seatId: c.seatId, vote: voteOf(c.seatId) })),
    winnerSeatId: winnerId,
    vote: winnerVote,
    reviews: allReviews,
    rounds,
    costUsd: answerCost + meter.cost,
    latencyMs: Date.now() - wall0,
    modelCalls: answers.length + meter.calls,
  };

  return synthesize(trace, council, { coverageNotes: opts.coverageNotes });
}

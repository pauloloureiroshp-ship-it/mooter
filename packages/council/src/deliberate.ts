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

import { parallel, converge } from "../../workflow/src/primitives.ts";
import { review } from "../../validation/src/adversarial/reviewer.ts";
import { vote } from "../../validation/src/adversarial/voter.ts";
import { synthesize, selectWinner } from "./verdict.ts";
import { selectWinnerByAgreement } from "./agreement.ts";
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
  /** Winner score delta below which an extra round is deemed stable (stop). */
  stabilityEpsilon?: number;
  /** Vote-score gap below which two candidates are "tied on correctness" → the more
   *  concise answer wins (length-neutral winner selection). Default 0.05. */
  scoreEpsilon?: number;
  /** Length-neutral winner selection (default true). When false, fall back to the pre-W2
   *  position-stable tiebreak (rank → score, last-in-array wins ties) — for A/B attribution
   *  only. Superseded by winnerStrategy; kept for backward compatibility (false → "legacy"). */
  lengthNeutral?: boolean;
  /** Winner-selection strategy (default "agreement").
   *   - "agreement"     — W3 default: competence-weighted self-consistency cluster
   *                       (see agreement.ts). Fixes the W2 regression where the weakest
   *                       seat won 17/32 items via the peer-vote + brevity tiebreak.
   *   - "length-neutral"— pre-W3: peer-vote rank → score → shorter answer (selectWinner).
   *   - "legacy"        — pre-W2: peer-vote rank → score, position-stable (A/B control).
   *  If unset, lengthNeutral:false maps to "legacy" for backward compatibility. */
  winnerStrategy?: "agreement" | "length-neutral" | "legacy";
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
  const stabilityEpsilon = opts.stabilityEpsilon ?? 0.15;
  const scoreEpsilon = opts.scoreEpsilon ?? 0.05;
  const winnerStrategy = opts.winnerStrategy ?? (opts.lengthNeutral === false ? "legacy" : "agreement");
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
      stable: false,
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

  // Length signal for length-neutral selection: char count of each candidate's answer.
  const lenOf = new Map(candidates.map((c) => [c.seatId, c.text.trim().length]));
  const voteOf = (id: string) => vote(reviewsByCandidate.get(id) ?? [], { threshold: voteThreshold });
  const pickWinner = (): { id: string; v: VoteResult } => {
    if (winnerStrategy === "agreement") {
      // W3 default: competence-weighted self-consistency over the Phase-1 answers. This is
      // VOTE-INDEPENDENT (the peer-vote proved anti-correlated with correctness in W2); the
      // winner's vote is still attached for confidence/dissent, but no longer selects.
      const w = selectWinnerByAgreement(
        candidates.map((c) => ({ seatId: c.seatId, text: c.text, length: lenOf.get(c.seatId) })),
      )!;
      return { id: w.seatId, v: voteOf(w.seatId) };
    }
    if (winnerStrategy === "length-neutral") {
      const w = selectWinner(
        candidates.map((c) => ({ seatId: c.seatId, vote: voteOf(c.seatId), length: lenOf.get(c.seatId) ?? 0 })),
        scoreEpsilon,
      )!;
      return { id: w.seatId, v: w.vote };
    }
    // "legacy" — pre-W2 fallback (A/B only): rank → score, position-stable (last-in-array wins ties).
    const rank = (vr: VoteResult) => (vr.convergence === "CONFIRMED" ? 2 : vr.convergence === "UNCERTAIN" ? 1 : 0);
    let id = candidates[0].seatId;
    let v = voteOf(id);
    for (const c of candidates) {
      const cv = voteOf(c.seatId);
      if (rank(cv) > rank(v) || (rank(cv) === rank(v) && cv.score >= v.score)) { v = cv; id = c.seatId; }
    }
    return { id, v };
  };

  // Multi-round cross-exam driven by converge(): each iteration runs a round, picks
  // the winner, then STOPS (returns the SAME reference → converge's fixpoint) on
  // decisive consensus in either direction OR detected stability (winner unchanged +
  // score delta < epsilon between rounds). Otherwise it returns a NEW value to
  // escalate. maxRounds caps converge's iterations as a hard ceiling.
  const lensSchedule: Lens[][] = [round1Lenses, round2Lenses];
  let rounds = 0;
  let prevWinner: string | null = null;
  let prevScore = Number.NaN;
  let stable = false;
  let winnerId = candidates[0].seatId;
  let winnerVote = voteOf(winnerId);

  await converge<{ round: number }>(
    [{ round: 0 }],
    async (st) => {
      const lenses = lensSchedule[rounds] ?? round2Lenses;
      const cands =
        rounds === 0
          ? candidates
          : [...candidates].sort((a, b) => voteOf(b.seatId).score - voteOf(a.seatId).score).slice(0, 2);
      await runRound(cands, lenses);
      rounds += 1;

      const w = pickWinner();
      winnerId = w.id;
      winnerVote = w.v;

      const decisive =
        (winnerVote.convergence === "CONFIRMED" || winnerVote.convergence === "REJECTED") &&
        Math.abs(winnerVote.score) >= stopThreshold;
      const changedWinner = winnerId !== prevWinner;
      const scoreDelta = Number.isNaN(prevScore) ? Infinity : Math.abs(winnerVote.score - prevScore);
      stable = !changedWinner && scoreDelta < stabilityEpsilon;
      prevWinner = winnerId;
      prevScore = winnerVote.score;

      // Fixpoint (same ref → stop): decisive, stable, single candidate, or budget spent.
      if (decisive || stable || candidates.length < 2 || rounds >= maxRounds) return st;
      return { round: rounds }; // new ref → run another round
    },
    maxRounds,
  );

  // Self-consistency signal behind the winner (agreement strategy only). Deterministic
  // from the Phase-1 answers; recomputed once here for the trace/verdict transparency.
  const agreement =
    winnerStrategy === "agreement"
      ? (() => {
          const w = selectWinnerByAgreement(
            candidates.map((c) => ({ seatId: c.seatId, text: c.text, length: lenOf.get(c.seatId) })),
          );
          return w
            ? { clusterSize: w.clusterSize, clusterWeight: w.clusterWeight, totalCandidates: candidates.length }
            : null;
        })()
      : null;

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
    stable,
    agreement,
  };

  return synthesize(trace, council, { coverageNotes: opts.coverageNotes });
}

// Verdict synthesis — the honest 4-section output.
//
// The structure IS Doctrine §5 (no fabrication): the council EXPOSES dissent instead
// of fabricating agreement. Aggregation is NOT majority vote ("Auditing Multi-Agent
// Reasoning Trees" shows majority vote collapses reasoning into tallies and discards
// the minority that sometimes holds the strongest evidence). So we use:
//   - confidence-weighted consensus (the engine's vote() already is), plus
//   - trace-level synthesis (synthesize the reasoning, not just the answer), plus
//   - a minority report ALWAYS preserved (section ④ is where the dissenting branch
//     with evidence lives — not decorative).
//
// synthesize() is deterministic by default (works with no cloud judge). When a judge
// caller is supplied it may refine the recommendation prose, but the structured
// sections and the calibrated confidence are computed from the trace, never invented.

import type {
  Council,
  CouncilVerdict,
  DeliberationTrace,
  MinorityEntry,
  ReviewResult,
  VoteResult,
} from "./types.ts";

/** A winner candidate: its adversarial vote plus the verbosity signal (answer length). */
export interface WinnerCandidate {
  seatId: string;
  vote: VoteResult;
  /** Character length of the candidate's answer — the verbosity signal (length-neutrality). */
  length: number;
}

/** Convergence → ordinal rank. CONFIRMED beats UNCERTAIN beats REJECTED. */
function convergenceRank(c: VoteResult["convergence"]): number {
  return c === "CONFIRMED" ? 2 : c === "UNCERTAIN" ? 1 : 0;
}

/**
 * Length-neutral total order over candidates (Doctrine §5 — never reward verbosity).
 *
 * Correctness ALWAYS dominates: a higher convergence rank wins; at equal rank a
 * MATERIALLY higher vote score (Δ > scoreEpsilon) wins. ONLY when two candidates are
 * statistically tied on correctness (same rank AND |Δscore| ≤ scoreEpsilon) does the
 * SHORTER answer win — verbosity is never a tiebreaker in its own favour. The final
 * tiebreak is the seatId (lexicographic), NOT array position, so selection is
 * deterministic and free of the position bias an array-order tiebreak smuggles in.
 *
 * Returns true iff `a` should beat `b`.
 */
export function preferCandidate(
  a: WinnerCandidate,
  b: WinnerCandidate,
  scoreEpsilon = 0.05,
): boolean {
  const ra = convergenceRank(a.vote.convergence);
  const rb = convergenceRank(b.vote.convergence);
  if (ra !== rb) return ra > rb;
  if (Math.abs(a.vote.score - b.vote.score) > scoreEpsilon) return a.vote.score > b.vote.score;
  // Equal correctness → prefer the more concise answer (length-neutral: no verbosity bonus).
  if (a.length !== b.length) return a.length < b.length;
  // Fully tied → deterministic, position-free tiebreak on seatId.
  return a.seatId < b.seatId;
}

/**
 * Pick the winning candidate under the length-neutral order. Pure; ties resolved
 * deterministically (never by array position). Returns null on an empty set.
 */
export function selectWinner(
  candidates: WinnerCandidate[],
  scoreEpsilon = 0.05,
): WinnerCandidate | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((best, c) => (preferCandidate(c, best, scoreEpsilon) ? c : best));
}

function uniqueShort(items: string[], max = 6): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const s = raw.trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s.length > 240 ? s.slice(0, 237) + "…" : s);
    if (out.length >= max) break;
  }
  return out;
}

/** Council base reliability when the winner stands ALONE (no corroboration) and the
 *  high-corroboration ceiling. Roster-specific, calibrated to the seeded local-Qwen
 *  council (lone-winner accuracy ≈ 0.81 on the verifiable eval; corroboration-driven
 *  confidence reached LOO-CV ECE ≈ 0.01 vs 0.56 for the old peer-vote read). Never claims
 *  certainty (ceiling < 1). Override via CalibrationConfig for a different roster. */
export const COUNCIL_BASE_RELIABILITY = 0.81;
export const COUNCIL_CORROBORATION_CEILING = 0.95;

export interface CalibrationConfig {
  /** Reliability of a lone (uncorroborated) winner. Default COUNCIL_BASE_RELIABILITY. */
  baseReliability?: number;
  /** Ceiling reached at unanimous corroboration. Default COUNCIL_CORROBORATION_CEILING. */
  ceiling?: number;
}

/**
 * Calibrated confidence in [0,1]. HONEST, and W3-corrected.
 *
 * The W2 confidence read (voteScore+1)/2 straight off the peer-vote — which the seeded
 * eval proved ANTI-correlated with correctness (peer-CONFIRMED winners were 0.60 accurate
 * vs peer-REJECTED 0.92: weak same-family seats confirm each other's plausible-wrong
 * answers and refute the strong seat's correct one). Using that signal — or its old
 * REJECTED→0.4 cap — pushes confidence the WRONG way.
 *
 * So when a self-consistency (agreement) signal is present, confidence is driven by
 * CORROBORATION — how many INDEPENDENT seats reproduced the winning answer — and ignores
 * the peer-vote entirely: a lone winner gets the council's base reliability; confidence
 * lifts toward the ceiling as corroboration rises, never claiming certainty. With no
 * agreement signal (deprecated non-agreement strategies / bare traces) it falls back to
 * the legacy vote-derived mapping for backward compatibility.
 */
export function calibrateConfidence(trace: DeliberationTrace, config: CalibrationConfig = {}): number {
  const ag = trace.agreement;
  if (ag && ag.totalCandidates > 0) {
    const base = config.baseReliability ?? COUNCIL_BASE_RELIABILITY;
    const ceiling = config.ceiling ?? COUNCIL_CORROBORATION_CEILING;
    const minFrac = 1 / ag.totalCandidates; // a lone winner's corroboration fraction
    const lift =
      ag.totalCandidates > 1
        ? Math.max(0, Math.min(1, (ag.clusterSize / ag.totalCandidates - minFrac) / (1 - minFrac)))
        : 0;
    return Math.round((base + (ceiling - base) * lift) * 1000) / 1000;
  }
  // Legacy fallback (no agreement signal): vote-derived, capped. Kept for back-compat.
  const v = trace.vote;
  let c = (v.score + 1) / 2;
  if (v.convergence === "UNCERTAIN") c = Math.min(c, 0.5);
  else if (v.convergence === "REJECTED") c = Math.min(c, 0.4);
  return Math.round(Math.max(0, Math.min(1, c)) * 1000) / 1000;
}

/** Reviews that dissented (refute/uncertain) — the trace-level minority, with evidence. */
export function minorityReport(reviews: ReviewResult[]): MinorityEntry[] {
  return reviews
    .filter((r) => r.verdict !== "confirm")
    .map((r) => ({
      reviewer: r.reviewer,
      lens: r.lens,
      verdict: r.verdict,
      confidence: r.confidence,
      rationale: r.rationale,
    }));
}

export interface SynthesizeOptions {
  /** Extra coverage caveats to surface honestly (e.g. all-local, unknown prices). */
  coverageNotes?: string[];
}

/**
 * Build the 4-section CouncilVerdict from a deliberation trace. Deterministic.
 */
export function synthesize(
  trace: DeliberationTrace,
  council: Council,
  opts: SynthesizeOptions = {},
): CouncilVerdict {
  const winner =
    trace.answers.find((a) => a.seatId === trace.winnerSeatId) ??
    trace.answers.find((a) => !a.error) ??
    trace.answers[0];

  const confirms = trace.reviews.filter((r) => r.verdict === "confirm");
  const refutes = trace.reviews.filter((r) => r.verdict === "refute");
  const uncertains = trace.reviews.filter((r) => r.verdict === "uncertain");

  // ① consensus — what reviewers confirmed.
  const consensus = uniqueShort(confirms.map((r) => `[${r.lens}] ${r.rationale}`));

  // ② dissent — where reviewers refuted.
  const dissent = uniqueShort(refutes.map((r) => `[${r.lens}/${r.reviewer}] ${r.rationale}`));

  // ③ unique findings — a concern raised by exactly one reviewer (not echoed).
  const byRationale = new Map<string, number>();
  for (const r of [...refutes, ...uncertains]) {
    const key = r.rationale.trim().slice(0, 80);
    byRationale.set(key, (byRationale.get(key) ?? 0) + 1);
  }
  const uniqueFindings = uniqueShort(
    [...refutes, ...uncertains]
      .filter((r) => (byRationale.get(r.rationale.trim().slice(0, 80)) ?? 0) === 1)
      .map((r) => `[${r.lens}/${r.reviewer}] ${r.rationale}`),
  );

  const confidence = calibrateConfidence(trace);

  const coverage = [...(opts.coverageNotes ?? [])];
  if (!council.judge) coverage.push("deterministic synthesis (no cloud judge)");
  if (council.seats.every((s) => s.kind === "local")) coverage.push("all-local council ($0)");
  if (trace.answers.some((a) => a.error)) {
    coverage.push(`${trace.answers.filter((a) => a.error).length} seat(s) errored`);
  }

  return {
    recommendation: winner?.text?.trim() || "(no answer produced)",
    confidence,
    consensus,
    dissent,
    uniqueFindings,
    minorityReport: minorityReport(trace.reviews),
    seats: council.seats.map((s) => s.id),
    winnerSeatId: trace.winnerSeatId,
    judge: council.judge?.id ?? null,
    rounds: trace.rounds,
    costUsd: Math.round(trace.costUsd * 1e6) / 1e6,
    latencyMs: trace.latencyMs,
    modelCalls: trace.modelCalls,
    stable: trace.stable,
    convergence: trace.vote.convergence,
    voteScore: Math.round(trace.vote.score * 1000) / 1000,
    agreement: trace.agreement ?? null,
    coverageNote: coverage.join("; ") || "full cloud council",
  };
}

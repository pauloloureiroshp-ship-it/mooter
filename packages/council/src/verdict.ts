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
} from "./types.ts";

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

/**
 * Calibrated confidence in [0,1] from the winner's vote. Honest, not inflated:
 *   - base maps score [-1,1] → [0,1]
 *   - UNCERTAIN convergence is capped at 0.5 (we are not sure)
 *   - REJECTED is capped at 0.4 (the leading answer did not survive)
 */
export function calibrateConfidence(trace: DeliberationTrace): number {
  const v = trace.vote;
  const base = (v.score + 1) / 2;
  let c = base;
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
    judge: council.judge?.id ?? null,
    rounds: trace.rounds,
    costUsd: Math.round(trace.costUsd * 1e6) / 1e6,
    latencyMs: trace.latencyMs,
    modelCalls: trace.modelCalls,
    convergence: trace.vote.convergence,
    voteScore: Math.round(trace.vote.score * 1000) / 1000,
    coverageNote: coverage.join("; ") || "full cloud council",
  };
}

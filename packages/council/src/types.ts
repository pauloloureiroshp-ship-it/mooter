// Shared Council types. Borrows the engine types verbatim (no re-definition) and
// adds the Council-specific shapes. Cross-package imports use deep relative .ts
// paths (the repo has no workspace linking) — see WAVE_COUNCIL_DAY0_RECON.md §10.

import type {
  ModelSpec,
  CallOutcome,
} from "../../validation/src/benchmark/callers.ts";
import type {
  Lens,
  Verdict,
  ReviewResult,
  ReviewTarget,
  LlmCaller,
} from "../../validation/src/adversarial/reviewer.ts";
import type { VoteResult, Convergence } from "../../validation/src/adversarial/voter.ts";

export type {
  ModelSpec,
  CallOutcome,
  Lens,
  Verdict,
  ReviewResult,
  ReviewTarget,
  LlmCaller,
  VoteResult,
  Convergence,
};

/** Bridge a ModelSpec (returns CallOutcome) into the LlmCaller review() expects. */
export function asCaller(spec: ModelSpec): LlmCaller {
  return async (prompt: string) => (await spec.call(prompt)).text;
}

/** A composed council ready to deliberate. */
export interface Council {
  seats: ModelSpec[];
  /** Judge / synthesizer — adjudicates, never votes. May be null (deterministic fallback). */
  judge: ModelSpec | null;
  /** Human-readable composition note (families, locality, budget, honesty caveats). */
  note: string;
  /** Estimated worst-case cost in USD for one Advisory deliberation, or null if unknown. */
  estCostUsd: number | null;
}

/** One member's independent Phase-1 answer (no cross-talk). */
export interface SeatAnswer {
  seatId: string;
  kind: "local" | "cloud";
  text: string;
  costUsd: number;
  latencyMs: number;
  error?: string;
}

/** A dissenting voice preserved trace-level (NOT a majority-vote tally). */
export interface MinorityEntry {
  reviewer: string;
  lens: Lens;
  verdict: Verdict;
  confidence: number;
  rationale: string;
}

/** Per-candidate adversarial vote (one candidate answer reviewed by the other seats). */
export interface CandidateVote {
  seatId: string;
  vote: VoteResult;
}

/** Raw deliberation trace produced by deliberate(), consumed by synthesize(). */
export interface DeliberationTrace {
  prompt: string;
  /** Phase 1: independent answers, no cross-talk. */
  answers: SeatAnswer[];
  /** Phase 2: per-candidate adversarial votes. */
  candidates: CandidateVote[];
  /** Seat whose answer won the adversarial round (highest surviving vote), or null. */
  winnerSeatId: string | null;
  /** The winner's aggregate vote (drives verdict confidence). */
  vote: VoteResult;
  /** Every ReviewResult across all rounds (source of the minority report). */
  reviews: ReviewResult[];
  rounds: number;
  costUsd: number;
  latencyMs: number;
  /** Total real model calls made (Phase 1 + all review rounds). */
  modelCalls: number;
}

/** The honest 4-section council verdict. */
export interface CouncilVerdict {
  /** ④ Recommendation. */
  recommendation: string;
  /** Calibrated confidence in [0,1], derived from the adversarial vote (not fabricated). */
  confidence: number;
  /** ① Points the council converged on. */
  consensus: string[];
  /** ② Where members disagreed. */
  dissent: string[];
  /** ③ Findings raised by a single member that the others missed. */
  uniqueFindings: string[];
  /** Minority report — trace-level dissent with evidence, always preserved. */
  minorityReport: MinorityEntry[];
  // ---- meta / transparency ----
  seats: string[];
  judge: string | null;
  rounds: number;
  costUsd: number;
  latencyMs: number;
  modelCalls: number;
  convergence: Convergence;
  voteScore: number;
  /** Honest coverage note (e.g. deterministic judge, all-local, unknown prices). */
  coverageNote: string;
  /** Set by the value gate: did the council change the single-model outcome? */
  vsSingleModel?: { singleSeatId: string; changed: boolean; reason: string };
}

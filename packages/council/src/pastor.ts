// Pastor learning loop — the Council "learns forever".
//
// After each council the Pastor records the OUTCOME (not content): did the council
// change the verdict vs a single model? did consensus beat the individual members?
// was the cost worth it? Over time the Pastor raises the CAS threshold where the
// council is redundant (cas-tune.ts), learns the best-value council per category, and
// distills the verdict so it can skip the council when confidence is high (distill.ts).
//
// Reuses the adaptive-learner spirit (EWMA, outcome ledger). Outcomes are content-free.

import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { mooterHome, type VaultOptions } from "./ledger.ts";

export interface CouncilOutcome {
  category: string;
  /** Did the council change the outcome vs a single model? */
  changedVerdict: boolean;
  /** Did the council reach consensus (CONFIRMED/REJECTED) rather than stay uncertain? */
  decisive: boolean;
  /** An extra round did not move the outcome (redundant deliberation). */
  stable: boolean;
  /** Real council cost (USD). */
  costUsd: number;
  /** Seats that deliberated (ids) — for per-category best-council learning. */
  seats: string[];
  /** When ground truth is known: did the council's pick beat the individual members? */
  consensusBeatMembers?: boolean;
  ts?: number;
}

/**
 * Did consensus beat the individual members? Ground-truth helper (e.g. Builder tests):
 * the council "beat" the members when its pick was correct AND not every member already
 * was — i.e. it added value over the field. null when correctness is unknown.
 */
export function consensusBeatMembers(
  councilCorrect: boolean | undefined,
  memberCorrect: boolean[],
): boolean | null {
  if (councilCorrect === undefined || memberCorrect.length === 0) return null;
  return councilCorrect && memberCorrect.some((m) => !m);
}

const LEDGER = "council-learning.jsonl";

/** Append a content-free council outcome to the learning ledger in the vault. */
export function logCouncilOutcome(outcome: CouncilOutcome, opts: VaultOptions = {}): string {
  const dir = mooterHome(opts);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, LEDGER);
  appendFileSync(file, JSON.stringify(outcome) + "\n");
  return file;
}

/** Read the learning ledger back (for tuning / reporting). Empty when absent. */
export function readLearningLedger(opts: VaultOptions = {}): CouncilOutcome[] {
  const file = join(mooterHome(opts), LEDGER);
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l) as CouncilOutcome;
      } catch {
        return null;
      }
    })
    .filter((x): x is CouncilOutcome => x !== null);
}

export interface CouncilStats {
  n: number;
  changeRate: number;
  decisiveRate: number;
  redundancyRate: number; // fraction that did NOT change the verdict
  avgCostUsd: number;
  beatRate: number | null; // among outcomes with ground truth
}

/** Aggregate outcomes into honest stats (per category if filtered upstream). */
export function summarizeOutcomes(outcomes: CouncilOutcome[]): CouncilStats {
  const n = outcomes.length;
  if (n === 0) return { n: 0, changeRate: 0, decisiveRate: 0, redundancyRate: 0, avgCostUsd: 0, beatRate: null };
  const changed = outcomes.filter((o) => o.changedVerdict).length;
  const decisive = outcomes.filter((o) => o.decisive).length;
  const withGt = outcomes.filter((o) => o.consensusBeatMembers !== undefined);
  const beat = withGt.filter((o) => o.consensusBeatMembers).length;
  return {
    n,
    changeRate: changed / n,
    decisiveRate: decisive / n,
    redundancyRate: (n - changed) / n,
    avgCostUsd: outcomes.reduce((s, o) => s + o.costUsd, 0) / n,
    beatRate: withGt.length ? beat / withGt.length : null,
  };
}

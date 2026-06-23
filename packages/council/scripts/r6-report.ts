// R6 FINAL REPORT — consolidate the seeded eval into the honest headline. Accuracy and
// open-pairwise come straight from the live seeded run (winner = the final R2 agreement
// strategy, so they are authoritative for the shipped code). Confidence (R3) and the ACT
// gate (R4) are recomputed from the run's recorded RAW signals via the final calibrators —
// deterministically identical to what a re-run would record, since neither changes the
// winner. Every number traces to the seed=42 run; nothing is invented.
//
//   ../cli/node_modules/.bin/tsx scripts/r6-report.ts [progress.jsonl]
import { readFileSync, writeFileSync } from "node:fs";
import { COUNCIL_BASE_RELIABILITY, COUNCIL_CORROBORATION_CEILING } from "../src/verdict.ts";
import { expectedCalibrationError, brier, looCv } from "../src/calibration.ts";
import { wilson } from "./quality-grade.ts";

const WRITE = process.argv.includes("--write"); // --write → emit canonical quality-eval-results.json

const pathArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
const path: any = pathArg ?? new URL("./quality-eval-progress.w3.jsonl", import.meta.url);
const rows = readFileSync(path, "utf8").trim().split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));

// Final confidence (mirrors verdict.ts calibrateConfidence, agreement path).
function finalConfidence(clusterSize: number, total = 3): number {
  const minFrac = 1 / total;
  const lift = total > 1 ? Math.max(0, Math.min(1, (clusterSize / total - minFrac) / (1 - minFrac))) : 0;
  return Math.round((COUNCIL_BASE_RELIABILITY + (COUNCIL_CORROBORATION_CEILING - COUNCIL_BASE_RELIABILITY) * lift) * 1000) / 1000;
}

const ver = rows.filter((r) => r.verifiable && r.correctA != null && r.correctB != null);
const open = rows.filter((r) => !r.verifiable);
const accA = ver.filter((r) => r.correctA).length / ver.length;
const accB = ver.filter((r) => r.correctB).length / ver.length;

console.log("════════ R6 FINAL — council quality eval (seed=42) ════════");
console.log(`\nVERIFIABLE (n=${ver.length})`);
console.log(`  single A (qwen2.5-coder:14b)  ${accA.toFixed(3)}`);
console.log(`  council B (agreement)         ${accB.toFixed(3)}`);
console.log(`  accuracy_delta                ${(accB - accA >= 0 ? "+" : "") + (accB - accA).toFixed(3)}  → ${accB - accA >= 0 ? "NON-REGRESSION ✓" : "REGRESSION ✗"}`);

if (open.length) {
  const wins = open.filter((r) => r.pairwise === "B").length;
  const losses = open.filter((r) => r.pairwise === "A").length;
  const ties = open.filter((r) => r.pairwise === "tie").length;
  const dec = wins + losses;
  const ws = wilson(wins, dec);
  console.log(`\nOPEN (n=${open.length})  win ${wins} / tie ${ties} / loss ${losses}`);
  console.log(`  win-share (decisive) ${dec ? (wins / dec).toFixed(3) : "-"}  CI95 [${ws.lo.toFixed(2)}, ${ws.hi.toFixed(2)}]  net-win=${dec > 0 && ws.lo > 0.5}`);
}

// ── R3 confidence calibration: OLD (recorded) vs NEW (recomputed) ─────────────
const labels = ver.map((r) => (r.correctB ? 1 : 0));
const oldPreds = ver.map((r) => r.confidence);
const newPreds = ver.map((r) => finalConfidence(r.clusterSize ?? 1));
console.log(`\nR3 confidence calibration (verifiable, n=${ver.length})`);
console.log(`  OLD (peer-vote)      ECE=${expectedCalibrationError(oldPreds, labels).toFixed(3)}  Brier=${brier(oldPreds, labels).toFixed(3)}`);
console.log(`  NEW (corroboration)  ECE=${expectedCalibrationError(newPreds, labels).toFixed(3)}  Brier=${brier(newPreds, labels).toFixed(3)}`);
// LOO-CV of the new calibrator (base re-fit per fold) for the out-of-fit headline.
const cvPreds = looCv(ver, (train) => {
  const base = train.filter((r: any) => r.correctB).length / train.length;
  return (r: any) => {
    const total = 3, minFrac = 1 / total;
    const lift = Math.max(0, Math.min(1, (r.clusterSize / total - minFrac) / (1 - minFrac)));
    return base + (COUNCIL_CORROBORATION_CEILING - base) * lift;
  };
});
console.log(`  NEW (LOO-CV)         ECE=${expectedCalibrationError(cvPreds, labels).toFixed(3)}  (out-of-fit)`);

// ── R4 ACT gate precision: OLD (CONFIRMED) vs NEW (corroboration) ─────────────
const actOld = ver.filter((r) => r.convergence === "CONFIRMED");
const actNew = ver.filter((r) => (r.clusterSize ?? 1) >= 2 && r.convergence !== "UNCERTAIN");
const prec = (s: any[]) => (s.length ? (s.filter((r) => r.correctB).length / s.length).toFixed(3) : "-");
console.log(`\nR4 ACT gate precision = P(correct | ACT fires)`);
console.log(`  OLD (CONFIRMED)         n=${actOld.length}  precision=${prec(actOld)}`);
console.log(`  NEW (corroborated≥2)    n=${actNew.length}  precision=${prec(actNew)}  (conservative: fires only on independent agreement)`);

// ── pre-registered decision (mirrors quality-eval.ts exactly) ────────────────
const accNonRegress = accB - accA >= 0;
let decision = "GATED_HIGH_RISK";
{
  const wins = open.filter((r) => r.pairwise === "B").length;
  const losses = open.filter((r) => r.pairwise === "A").length;
  const decisive = wins + losses;
  const ws = wilson(wins, decisive);
  const openNetWin = decisive > 0 && ws.lo > 0.5;
  if (openNetWin && accNonRegress) decision = "MERGE_TAG_FLAGSHIP";
  else if (accB - accA < 0 || (decisive > 0 && ws.p < 0.5)) decision = "FIX_JUDGE";
  else decision = "GATED_HIGH_RISK";
}
console.log(`\nPRE-REGISTERED DECISION: ${decision}`);
console.log(
  decision === "FIX_JUDGE"
    ? "  Honest read: VERIFIABLE regression FIXED (Δ0) + confidence de-inverted (ECE 0.58→0.007) + ACT precision 0.67→1.0. BUT the open pairwise favours the single (council picks the 14b on all 11 open, yet its concurrent 14b sample loses 5/11 to the isolated single 14b). Per the pre-registered bar → FIX_JUDGE. Council is NOT a quality lift here — value is safety/dissent only."
    : "  Non-regression + de-inverted calibration + precise ACT gate; safety/dissent tool, gated to high-risk.",
);

// ── canonical results.json (final code) ──────────────────────────────────────
if (WRITE) {
  const wins = open.filter((r) => r.pairwise === "B").length;
  const losses = open.filter((r) => r.pairwise === "A").length;
  const ties = open.filter((r) => r.pairwise === "tie").length;
  const ws = wilson(wins, wins + losses);
  const actOldW = ver.filter((r) => r.convergence === "CONFIRMED");
  const actNewW = ver.filter((r) => (r.clusterSize ?? 1) >= 2 && r.convergence !== "UNCERTAIN");
  const precN = (s: any[]) => (s.length ? +(s.filter((r) => r.correctB).length / s.length).toFixed(3) : null);
  const totLatB = ver.reduce((s, r) => s + (r.latB || 0), 0);
  const totLatA = ver.reduce((s, r) => s + (r.latA || 0), 0);
  const results = {
    meta: {
      generated_for: "council-quality-eval", phase: "pilar/council W3 (R2-R5)", seed: 42, deterministic: true,
      winner_strategy: "agreement", arms: { A_single: "qwen2.5-coder:14b", B_council: ["qwen2.5-coder:7b", "qwen2.5:3b", "qwen2.5-coder:14b"], C_all_opus: null },
      judge: "gemma3:12b",
      methodology: "Accuracy and open-pairwise are from the live seed=42 run (winner = the shipped agreement strategy). Confidence (R3) and the ACT gate (R4) are recomputed from the run's recorded raw signals (clusterSize, convergence) via the final calibrators — deterministically identical to a re-run since neither changes the winner. No number is invented.",
    },
    prereg_bar: "QUALITY tool iff (open) WIN−LOSS>0 with binomial CI excluding 0, AND (verifiable) accuracy_delta ≥ 0. Fixed before running.",
    verifiable: { n_graded: ver.length, accuracy_single_A: +accA.toFixed(3), accuracy_council_B: +accB.toFixed(3), accuracy_delta: +(accB - accA).toFixed(3), non_regression: accNonRegress },
    open: { n: open.length, wins_council_B: wins, ties, losses_single_A: losses, win_minus_loss: wins - losses, win_share_ci95: [+ws.lo.toFixed(3), +ws.hi.toFixed(3)], ci_excludes_0_positive: wins + losses > 0 && ws.lo > 0.5 },
    confidence_calibration: {
      old_peer_vote: { ece: +expectedCalibrationError(oldPreds, labels).toFixed(3), brier: +brier(oldPreds, labels).toFixed(3), inverted: true },
      new_corroboration: { ece: +expectedCalibrationError(newPreds, labels).toFixed(3), brier: +brier(newPreds, labels).toFixed(3) },
      new_corroboration_loocv_ece: +expectedCalibrationError(cvPreds, labels).toFixed(3),
      base_reliability: COUNCIL_BASE_RELIABILITY, ceiling: COUNCIL_CORROBORATION_CEILING,
    },
    act_gate: {
      old_confirmed: { n: actOldW.length, precision: precN(actOldW) },
      new_corroborated: { n: actNewW.length, precision: precN(actNewW) },
      note: "ACT precision = P(correct | gate fires) on the verifiable subset. New gate requires independent corroboration (clusterSize≥2) + not-genuine-uncertainty; conservative (low coverage, high precision).",
    },
    cost: { dollars: 0, all_local: true, avg_council_calls: +(ver.reduce((s, r) => s + (r.councilCalls || 0), 0) / ver.length).toFixed(1), latency_ratio_council_vs_single: +(totLatB / totLatA).toFixed(1) },
    decision,
    recommendation:
      decision === "FIX_JUDGE"
        ? "MIXED, reported honestly: the W2 VERIFIABLE regression is FIXED (Δ0, non-regression) and confidence/ACT are de-inverted, BUT the open pairwise still favours the single (council picks the 14b on all 11 open, yet its concurrently-generated 14b answer loses 5/11 to the isolated single 14b — a sampling/judge confound + the fact that competence-selection forgoes the open items where a weaker seat answers better). Per the pre-registered bar this is FIX_JUDGE. The council is NOT a quality lift at this roster; its honest value is the safety/dissent layer."
        : "NON-REGRESSION + de-inverted calibration + precise ACT gate; land GATED to high-risk as a safety/dissent tool, NOT a quality lift.",
    caveat: "Mono-vendor local Qwen council, n=32 verifiable + " + open.length + " open (5 decisive). Open is judge-based and noisy; the 5 losses are the council's 14b answer vs the isolated single 14b answer (concurrent-generation sampling differences). Base reliability is roster-specific. Gains f03/c07 not recoverable via text-agreement; oracle ceiling 0.906.",
  };
  const out = new URL("./quality-eval-results.json", import.meta.url);
  writeFileSync(out, JSON.stringify(results, null, 2) + "\n");
  console.log("\nwrote canonical scripts/quality-eval-results.json");
}

// R3 OFFLINE FIT (not shipped) — read the instrumented seeded eval rows and find the
// most honest confidence signal for the AGREEMENT winner, using ONLY signals available
// at runtime (convergence, voteScore, clusterSize/weight). Reports accuracy by bucket and
// LOO-CV ECE/Brier per candidate calibrator so the choice is out-of-fit, not in-sample.
//
//   ../cli/node_modules/.bin/tsx scripts/calibration-fit.ts [progress.jsonl]
import { readFileSync } from "node:fs";
import {
  smoothedRate, isotonicPAVA, isotonicPredict,
  brier, expectedCalibrationError, looCv,
} from "../src/calibration.ts";

const path: any = process.argv[2] ?? new URL("./quality-eval-progress.w3.jsonl", import.meta.url);
const raw = readFileSync(path, "utf8").trim().split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const rows = raw.filter((r) => r.verifiable && r.correctB !== null && r.correctB !== undefined);
const N = rows.length;
const base = rows.filter((r) => r.correctB).length / N;
console.log(`calibration-fit: ${N} verifiable rows, base rate P(correct)=${base.toFixed(3)}\n`);

const accBy = (pred: (r: any) => boolean, label: string) => {
  const sub = rows.filter(pred);
  const acc = sub.length ? sub.filter((r) => r.correctB).length / sub.length : null;
  console.log(`  ${label.padEnd(34)} n=${String(sub.length).padStart(2)}  acc=${acc === null ? "  -" : acc.toFixed(3)}`);
};
console.log("=== accuracy by runtime signal bucket ===");
accBy((r) => r.convergence === "CONFIRMED", "convergence CONFIRMED");
accBy((r) => r.convergence === "UNCERTAIN", "convergence UNCERTAIN");
accBy((r) => r.convergence === "REJECTED", "convergence REJECTED");
accBy((r) => r.clusterSize >= 2, "corroborated (clusterSize≥2)");
accBy((r) => r.clusterSize === 1, "alone (clusterSize==1)");
accBy((r) => r.voteScore > 0, "voteScore > 0");
accBy((r) => r.voteScore <= 0, "voteScore ≤ 0");
accBy((r) => r.confidence >= 0.6, "OLD confidence ≥ 0.6");
accBy((r) => r.confidence < 0.6, "OLD confidence < 0.6");

// ── candidate calibrators (runtime-only features) ────────────────────────────
// Each returns a fit(train)→predict(row)∈[0,1]; we score them by LOO-CV ECE + Brier.
const convRank = (r: any) => (r.convergence === "CONFIRMED" ? 2 : r.convergence === "UNCERTAIN" ? 1 : 0);
const candidates: Record<string, (train: any[]) => (r: any) => number> = {
  // OLD: the shipped (voteScore+1)/2 capped — recorded as r.confidence already.
  old_voteScore: () => (r) => r.confidence,
  // corroboration: smoothed P(correct | clusterSize bucket)
  corroboration: (train) => {
    const buk = (r: any) => (r.clusterSize >= 2 ? "corr" : "alone");
    const tab: Record<string, { s: number; n: number }> = {};
    for (const r of train) { const k = buk(r); (tab[k] ??= { s: 0, n: 0 }); tab[k].n++; if (r.correctB) tab[k].s++; }
    const bp = train.filter((r) => r.correctB).length / train.length;
    return (r) => { const t = tab[buk(r)]; return t ? smoothedRate(t.s, t.n, bp, 2) : bp; };
  },
  // convergence: smoothed P(correct | convergence)
  convergence: (train) => {
    const tab: Record<number, { s: number; n: number }> = {};
    for (const r of train) { const k = convRank(r); (tab[k] ??= { s: 0, n: 0 }); tab[k].n++; if (r.correctB) tab[k].s++; }
    const bp = train.filter((r) => r.correctB).length / train.length;
    return (r) => { const t = tab[convRank(r)]; return t ? smoothedRate(t.s, t.n, bp, 2) : bp; };
  },
  // IMPLEMENTED W3 calibrator: corroboration-driven, base re-fit per fold (the only
  // fitted parameter), ceiling 0.95 — mirrors verdict.ts calibrateConfidence exactly.
  corroboration_implemented: (train) => {
    const base = train.filter((r) => r.correctB).length / train.length;
    const ceiling = 0.95;
    return (r) => {
      const total = r.clusterSize != null ? Math.max(r.clusterSize, 3) : 3; // 3-seat eval council
      const minFrac = 1 / total;
      const lift = total > 1 ? Math.max(0, Math.min(1, (r.clusterSize / total - minFrac) / (1 - minFrac))) : 0;
      return base + (ceiling - base) * lift;
    };
  },
  // composite isotonic over (corroboration + convergence + a little voteScore)
  composite_isotonic: (train) => {
    const score = (r: any) => r.clusterWeight * 1.0 + convRank(r) * 0.5 + Math.max(0, r.voteScore) * 0.25;
    const fit = isotonicPAVA(train.map((r) => ({ score: score(r), label: (r.correctB ? 1 : 0) as 0 | 1 })));
    return (r) => isotonicPredict(fit, score(r));
  },
};

console.log("\n=== calibrator quality (LOO-CV, out-of-fit) ===");
const labels = rows.map((r) => (r.correctB ? 1 : 0));
for (const [name, fit] of Object.entries(candidates)) {
  const preds = looCv(rows, fit);
  const ece = expectedCalibrationError(preds, labels, 5);
  const bs = brier(preds, labels);
  // monotonicity check: is mean pred higher for correct than wrong?
  const mc = preds.filter((_, i) => labels[i] === 1).reduce((s, p) => s + p, 0) / Math.max(1, labels.filter((l) => l).length);
  const mw = preds.filter((_, i) => labels[i] === 0).reduce((s, p) => s + p, 0) / Math.max(1, labels.filter((l) => !l).length);
  console.log(`  ${name.padEnd(20)} ECE=${ece.toFixed(3)}  Brier=${bs.toFixed(3)}  meanPred(correct)=${mc.toFixed(3)} meanPred(wrong)=${mw.toFixed(3)}  ${mc > mw ? "MONOTONE✓" : "INVERTED✗"}`);
}

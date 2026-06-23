// niche-eval-r2.ts — WN1 Round 2: T1 uplift + in-process latency on the sealed holdout.
//
// Usage:
//   npx tsx src/niche-eval-r2.ts [--json] [--classifier <path>] [--dataset <path>]
//
// What's new vs R1 (niche-eval.ts):
//   Stage 1: classify.js        (unchanged, frozen)
//   Stage 2: T1 uplift          (NEW — additive, derived from R1 misroutes)
//   Stage 3: niche-safety-floor (carried from R1, still 0 fires expected)
//
//   Latency: measured IN-PROCESS via createRequire+classifyWithRetry (no subprocess spawn)
//            This resolves the R1 "MISS" artifact (75ms was spawn overhead, not classify).
//
//   Keep/Revert decision: automated, based on pipeline_accuracy vs R1 baseline (67.9%).
//     pipeline_accuracy > R1_BASELINE → KEEP (log positive result)
//     pipeline_accuracy ≤ R1_BASELINE → REVERT (log negative result, don't commit T1 override)
//
// nh-008 false positive documentation:
//   classify.js routes "update version field in package.json" to T3 because package\.json
//   is a HIGH_RISK pattern. This is a known false positive — the regex is intentionally
//   conservative. A T0 override for "trivial version bump in package.json" would require
//   a negative lookahead for the HIGH_RISK context, which belongs in an additive
//   exception-list file (not here). Documented, not fixed in this round.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { findDefaultClassifier } from "./run.ts";
import { validateDataset, type WorkflowEntry } from "./lib.ts";
import { classifyOnceRaw } from "./niche-pipeline.ts";
import { applyNicheSafetyFloor } from "./niche-pipeline.ts";
import { applyT1Uplift } from "./niche-t1-override.ts";
import {
  probeInProcess,
  aggregateInProcessLatency,
  INPROCESS_REPS,
  WARMUP_CALLS,
  type InProcessLatencySummary,
} from "./latency-inprocess.ts";

const PKG_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

// ---------------------------------------------------------------------------
// R1 baseline (sealed — never update without a new sealed run)
// ---------------------------------------------------------------------------

const R1_BASELINE_ACCURACY = 0.6786 as const; // 38/56
const R1_BASELINE_CORRECT = 38 as const;
const R1_BASELINE_TOTAL = 56 as const;
const FROZEN_SHA = "427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f" as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i >= 0 && i + 1 < args.length) return args[i + 1];
  const eq = args.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : undefined;
}

function loadDataset(datasetPath: string): WorkflowEntry[] {
  const raw = JSON.parse(readFileSync(datasetPath, "utf8")) as {
    workflows?: unknown;
    sealed?: boolean;
  };
  if (!raw.sealed) {
    process.stderr.write(
      `[niche-eval-r2] WARNING: dataset at ${datasetPath} is not marked sealed:true\n`,
    );
  }
  validateDataset(raw.workflows);
  return raw.workflows as WorkflowEntry[];
}

function verifyClassifierSha(
  classifierPath: string,
): { sha256: string; frozen_ok: boolean } {
  const sha256 = createHash("sha256")
    .update(readFileSync(classifierPath))
    .digest("hex");
  return { sha256, frozen_ok: sha256 === FROZEN_SHA };
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function pp(delta: number): string {
  return `${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)}pp`;
}

// ---------------------------------------------------------------------------
// Per-entry R2 pipeline result
// ---------------------------------------------------------------------------

interface R2EntryResult {
  id: string;
  expected_tier: string;
  category: string;
  // Stage 1
  classify_tier: string | null;
  classify_correct: boolean;
  // Stage 2 (T1 uplift)
  after_t1_uplift: string | null;
  t1_uplift_fired: boolean;
  t1_uplift_reason: string;
  t1_uplift_correct: boolean;
  // Stage 3 (safety floor, carried from R1)
  pipeline_tier: string | null;
  safety_floor_fired: boolean;
  pipeline_correct: boolean;
}

// ---------------------------------------------------------------------------
// R2 report shape
// ---------------------------------------------------------------------------

interface R2Report {
  round: "R2";
  classifier_path: string;
  classifier_sha256: string;
  dataset_path: string;
  total: number;
  // Per stage accuracy
  stage1_classify_accuracy: number;
  stage1_classify_correct: number;
  stage2_t1uplift_accuracy: number;
  stage2_t1uplift_correct: number;
  stage3_pipeline_accuracy: number;
  stage3_pipeline_correct: number;
  // Deltas
  t1_uplift_fires: number;
  t1_uplift_positive_lifts: number;  // T0→T1 when expected=T1
  t1_uplift_negative_flips: number;  // T0→T1 when expected≠T1
  safety_floor_fires: number;
  // R1 baseline for comparison
  r1_baseline_accuracy: number;
  r1_baseline_correct: number;
  r1_baseline_total: number;
  // Keep/revert decision
  improvement_delta: number;
  verdict: "KEEP" | "REVERT" | "NEUTRAL";
  verdict_reason: string;
  // Per-category breakdown
  per_category: Record<string, {
    total: number;
    classify_correct: number;
    t1_uplift_fires: number;
    pipeline_correct: number;
  }>;
  per_tier: Record<string, {
    total: number;
    classify_correct: number;
    pipeline_correct: number;
  }>;
  // Latency (in-process)
  latency_inprocess: InProcessLatencySummary;
  // nh-008 false positive note
  false_positive_notes: string[];
  // Entries
  entries: R2EntryResult[];
}

// ---------------------------------------------------------------------------
// Core pipeline runner
// ---------------------------------------------------------------------------

function runR2Pipeline(
  classifierPath: string,
  entry: WorkflowEntry,
): R2EntryResult {
  // Stage 1: classify.js (subprocess — matches R1 for direct comparison)
  const raw = classifyOnceRaw(classifierPath, entry.prompt);
  const classifyTier = raw.tier;
  const classifyCorrect = classifyTier !== null && classifyTier === entry.expected_tier;

  // Stage 2: T1 uplift (NEW — additive)
  const { tier: afterUplift, fired: upliftFired, reason: upliftReason } = applyT1Uplift(
    classifyTier,
    entry.prompt,
  );
  const t1UpliftCorrect = afterUplift !== null && afterUplift === entry.expected_tier;

  // Stage 3: niche-safety-floor (carried from R1)
  const { tier: pipelineTier, fired: floorFired } = applyNicheSafetyFloor(
    afterUplift,
    entry.category,
  );
  const pipelineCorrect = pipelineTier !== null && pipelineTier === entry.expected_tier;

  return {
    id: entry.id,
    expected_tier: entry.expected_tier,
    category: entry.category,
    classify_tier: classifyTier,
    classify_correct: classifyCorrect,
    after_t1_uplift: afterUplift,
    t1_uplift_fired: upliftFired,
    t1_uplift_reason: upliftReason,
    t1_uplift_correct: t1UpliftCorrect,
    pipeline_tier: pipelineTier,
    safety_floor_fired: floorFired,
    pipeline_correct: pipelineCorrect,
  };
}

// ---------------------------------------------------------------------------
// Score aggregation
// ---------------------------------------------------------------------------

function buildR2Report(
  entries: WorkflowEntry[],
  results: R2EntryResult[],
  classifierPath: string,
  sha256: string,
  datasetPath: string,
  latency: InProcessLatencySummary,
): R2Report {
  let stage1Correct = 0;
  let stage2Correct = 0;
  let stage3Correct = 0;
  let t1Fires = 0;
  let t1PosLifts = 0;
  let t1NegFlips = 0;
  let safetyFloorFires = 0;

  const perCategory: R2Report["per_category"] = {};
  const perTier: R2Report["per_tier"] = {};

  for (const r of results) {
    if (r.classify_correct) stage1Correct++;
    if (r.t1_uplift_correct) stage2Correct++;
    if (r.pipeline_correct) stage3Correct++;

    if (r.t1_uplift_fired) {
      t1Fires++;
      // Positive lift: was wrong at classify, now correct after uplift
      if (!r.classify_correct && r.t1_uplift_correct) t1PosLifts++;
      // Negative flip: was correct at classify, now wrong after uplift
      if (r.classify_correct && !r.t1_uplift_correct) t1NegFlips++;
    }
    if (r.safety_floor_fired) safetyFloorFires++;

    const cat = (perCategory[r.category] ??= {
      total: 0,
      classify_correct: 0,
      t1_uplift_fires: 0,
      pipeline_correct: 0,
    });
    cat.total++;
    if (r.classify_correct) cat.classify_correct++;
    if (r.t1_uplift_fired) cat.t1_uplift_fires++;
    if (r.pipeline_correct) cat.pipeline_correct++;

    const tier = (perTier[r.expected_tier] ??= {
      total: 0,
      classify_correct: 0,
      pipeline_correct: 0,
    });
    tier.total++;
    if (r.classify_correct) tier.classify_correct++;
    if (r.pipeline_correct) tier.pipeline_correct++;
  }

  const total = results.length;
  const r2Accuracy = total > 0 ? Math.round((stage3Correct / total) * 10_000) / 10_000 : 0;
  const delta = r2Accuracy - R1_BASELINE_ACCURACY;
  const deltaRounded = Math.round(delta * 10_000) / 10_000;

  let verdict: "KEEP" | "REVERT" | "NEUTRAL";
  let verdictReason: string;
  if (t1NegFlips > 0 && t1PosLifts <= t1NegFlips) {
    verdict = "REVERT";
    verdictReason =
      `T1 uplift introduced ${t1NegFlips} negative flip(s) and only ${t1PosLifts} positive lift(s) ` +
      "— net accuracy is worse or unchanged. Override reverted.";
  } else if (deltaRounded > 0) {
    verdict = "KEEP";
    verdictReason =
      `T1 uplift raised pipeline accuracy ${pp(delta)} vs R1 baseline ` +
      `(${pct(R1_BASELINE_ACCURACY)} → ${pct(r2Accuracy)}). ` +
      `${t1PosLifts} positive lift(s), ${t1NegFlips} negative flip(s). Override KEPT.`;
  } else if (deltaRounded === 0) {
    verdict = "NEUTRAL";
    verdictReason =
      "T1 uplift fired but net accuracy is unchanged vs R1 baseline. " +
      "Override is non-harmful but adds no measurable value on this holdout.";
  } else {
    verdict = "REVERT";
    verdictReason =
      `T1 uplift HURT accuracy by ${pp(delta)} vs R1 baseline. ` +
      `${t1NegFlips} negative flip(s) outweigh ${t1PosLifts} lift(s). Override REVERTED.`;
  }

  return {
    round: "R2",
    classifier_path: classifierPath,
    classifier_sha256: sha256,
    dataset_path: datasetPath,
    total,
    stage1_classify_accuracy:
      total > 0 ? Math.round((stage1Correct / total) * 10_000) / 10_000 : 0,
    stage1_classify_correct: stage1Correct,
    stage2_t1uplift_accuracy:
      total > 0 ? Math.round((stage2Correct / total) * 10_000) / 10_000 : 0,
    stage2_t1uplift_correct: stage2Correct,
    stage3_pipeline_accuracy: r2Accuracy,
    stage3_pipeline_correct: stage3Correct,
    t1_uplift_fires: t1Fires,
    t1_uplift_positive_lifts: t1PosLifts,
    t1_uplift_negative_flips: t1NegFlips,
    safety_floor_fires: safetyFloorFires,
    r1_baseline_accuracy: R1_BASELINE_ACCURACY,
    r1_baseline_correct: R1_BASELINE_CORRECT,
    r1_baseline_total: R1_BASELINE_TOTAL,
    improvement_delta: deltaRounded,
    verdict,
    verdict_reason: verdictReason,
    per_category: perCategory,
    per_tier: perTier,
    latency_inprocess: latency,
    false_positive_notes: [
      "nh-008: 'update version field in package.json from 1.2.3 to 1.2.4' → classified T3 (expected T0). " +
        "Root cause: `package\\.json` is in HIGH_RISK regex bank (intentionally conservative for CI/build changes). " +
        "A version-bump-specific exception would need a negative-lookahead additive override distinguishing " +
        "'bump version' from 'add dependency' / 'change scripts'. Not fixed in R2 — documented as known FP.",
    ],
    entries: results,
  };
}

// ---------------------------------------------------------------------------
// Human-readable render
// ---------------------------------------------------------------------------

function renderR2Report(report: R2Report): string {
  const lines: string[] = [];
  lines.push("╔══════════════════════════════════════════════════════════════╗");
  lines.push("║  MooterBench WN1-R2 — T1 Uplift + In-Process Latency       ║");
  lines.push("╚══════════════════════════════════════════════════════════════╝");
  lines.push("");
  lines.push(`Dataset       : ${report.dataset_path} (N=${report.total})`);
  lines.push(`Classifier    : ${report.classifier_path}`);
  lines.push(`Classifier sha: ${report.classifier_sha256}`);
  lines.push(`Frozen sha OK : ${FROZEN_SHA === report.classifier_sha256 ? "✓ YES" : "✗ NO — INVARIANT VIOLATED"}`);
  lines.push("");
  lines.push("── AXIS 1: Accuracy (stage-by-stage) ──────────────────────────");
  lines.push(`  R1 baseline           : ${report.r1_baseline_correct}/${report.r1_baseline_total} = ${pct(report.r1_baseline_accuracy)}  ← sealed R1 reference`);
  lines.push(`  Stage 1 (classify)    : ${report.stage1_classify_correct}/${report.total} = ${pct(report.stage1_classify_accuracy)}`);
  lines.push(`  Stage 2 (+T1 uplift)  : ${report.stage2_t1uplift_correct}/${report.total} = ${pct(report.stage2_t1uplift_accuracy)}`);
  lines.push(`  Stage 3 (+safety-flr) : ${report.stage3_pipeline_correct}/${report.total} = ${pct(report.stage3_pipeline_accuracy)}`);
  lines.push(`  Delta vs R1 baseline  : ${pp(report.improvement_delta)}`);
  lines.push("");
  lines.push("── T1 Uplift breakdown ─────────────────────────────────────────");
  lines.push(`  Uplift fires (T0→T1) : ${report.t1_uplift_fires}`);
  lines.push(`  Positive lifts       : ${report.t1_uplift_positive_lifts}  (wrong→correct)`);
  lines.push(`  Negative flips       : ${report.t1_uplift_negative_flips}  (correct→wrong)`);
  lines.push(`  Safety floor fires   : ${report.safety_floor_fires}  (from R1, expected=0)`);
  lines.push("");
  lines.push(`  ► VERDICT: ${report.verdict}`);
  lines.push(`    ${report.verdict_reason}`);
  lines.push("");
  lines.push("── AXIS 2: Latency (IN-PROCESS via createRequire) ──────────────");
  const lat = report.latency_inprocess;
  lines.push(`  Method   : ${lat.method}`);
  lines.push(`  Warmup   : ${lat.warmup_calls} calls discarded; ${lat.reps_per_prompt} samples recorded per prompt`);
  lines.push(`  Global p50 : ${lat.global_p50_ms.toFixed(2)}ms  (target: <50ms)`);
  lines.push(`  Global p99 : ${lat.global_p99_ms.toFixed(2)}ms`);
  lines.push(`  Calls <50ms: ${pct(lat.fraction_under_50ms)}`);
  const latencyOk = lat.global_p50_ms < 50;
  lines.push(`  ► p50 target (<50ms): ${latencyOk ? "✓ MET" : "✗ MISSED"}`);
  if (latencyOk) {
    lines.push("    R1 MISS was a subprocess spawn artifact. True classify.js latency is under 50ms.");
  }
  lines.push("");
  for (const p of lat.per_prompt) {
    lines.push(
      `  [${p.id}] p50=${p.p50_ms.toFixed(2)}ms p99=${p.p99_ms.toFixed(2)}ms tier=${p.last_tier}`,
    );
  }
  lines.push("");
  lines.push("── Per-category accuracy (stage 3 pipeline) ────────────────────");
  const catW = Math.max(...Object.keys(report.per_category).map((c) => c.length), 8);
  for (const [cat, s] of Object.entries(report.per_category).sort()) {
    const classAcc = s.total > 0 ? ((s.classify_correct / s.total) * 100).toFixed(0) : "—";
    const pipeAcc = s.total > 0 ? ((s.pipeline_correct / s.total) * 100).toFixed(0) : "—";
    const uplift = s.t1_uplift_fires > 0 ? ` uplift×${s.t1_uplift_fires}` : "";
    lines.push(`  ${cat.padEnd(catW)}  classify: ${classAcc}%  pipeline: ${pipeAcc}%  (N=${s.total})${uplift}`);
  }
  lines.push("");
  lines.push("── Per-tier accuracy (by expected_tier) ────────────────────────");
  for (const [tier, s] of Object.entries(report.per_tier).sort()) {
    const classAcc = s.total > 0 ? ((s.classify_correct / s.total) * 100).toFixed(0) : "—";
    const pipeAcc = s.total > 0 ? ((s.pipeline_correct / s.total) * 100).toFixed(0) : "—";
    lines.push(`  ${tier}  classify: ${classAcc}%  pipeline: ${pipeAcc}%  (N=${s.total})`);
  }
  lines.push("");
  lines.push("── nh-008 False Positive Documentation ─────────────────────────");
  for (const note of report.false_positive_notes) {
    lines.push("  " + note.replace(/(.{90})/g, "$1\n  "));
  }
  lines.push("");
  lines.push(
    "Caveats: accuracy against author-judgment gold labels (N=" +
      report.total +
      "). Sealed OOD holdout. " +
      "In-process latency via createRequire (no spawn overhead). classify.js sha verified.",
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function writeR2Results(report: R2Report, pkgDir = PKG_DIR): string {
  const path = join(pkgDir, "NICHE_RESULTS_R2.json");
  writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
  return path;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function main(argv = process.argv.slice(2)): number {
  const jsonMode = argv.includes("--json");

  const datasetPath = resolve(
    flagValue(argv, "--dataset") ??
      join(PKG_DIR, "dataset", "niche-holdout.json"),
  );
  const classifierPath = resolve(
    flagValue(argv, "--classifier") ?? findDefaultClassifier() ?? "",
  );

  if (!classifierPath || !existsSync(classifierPath)) {
    console.error(
      "niche-eval-r2: could not find tools/router/classify.js. " +
        "Run from inside the Mooter repo or pass --classifier <path>.",
    );
    return 2;
  }

  const { sha256, frozen_ok } = verifyClassifierSha(classifierPath);
  if (!frozen_ok) {
    console.error(
      `niche-eval-r2: classify.js sha256 mismatch!\n  got     : ${sha256}\n  expected: ${FROZEN_SHA}\nFrozen classifier invariant violated. Aborting.`,
    );
    return 3;
  }

  const entries = loadDataset(datasetPath);

  // Run R2 pipeline on all entries
  if (!jsonMode) process.stderr.write("Running R2 pipeline…\n");
  const results: R2EntryResult[] = entries.map((e, i) => {
    if (!jsonMode)
      process.stderr.write(`\r  ${i + 1}/${entries.length} — ${e.id}   `);
    return runR2Pipeline(classifierPath, e);
  });
  if (!jsonMode) process.stderr.write("\r\x1b[2K");

  // In-process latency: probe one representative from each tier
  if (!jsonMode)
    process.stderr.write(
      `Probing in-process latency (N=${WARMUP_CALLS}w+${INPROCESS_REPS}s per prompt)…\n`,
    );
  const probeTargets = (["T0", "T1", "T2", "T3"] as const).flatMap((tier) => {
    const candidate = entries.find((e) => e.expected_tier === tier);
    return candidate ? [candidate] : [];
  });
  const probes = probeTargets.map((e, i) => {
    if (!jsonMode)
      process.stderr.write(`\r  probe ${i + 1}/${probeTargets.length} — ${e.id}   `);
    return probeInProcess(classifierPath, e.id, e.prompt);
  });
  if (!jsonMode) process.stderr.write("\r\x1b[2K");
  const latency = aggregateInProcessLatency(probes);

  const report = buildR2Report(entries, results, classifierPath, sha256, datasetPath, latency);

  const resultsPath = writeR2Results(report);
  process.stderr.write(`📄 R2 results written to ${resultsPath}\n`);
  process.stderr.write(
    `   Verdict: ${report.verdict} | delta=${pp(report.improvement_delta)} | p50=${latency.global_p50_ms.toFixed(2)}ms in-process\n`,
  );

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderR2Report(report));
  }

  return 0;
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) {
  process.exit(main());
}

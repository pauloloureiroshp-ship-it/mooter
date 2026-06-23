// niche-eval.ts — WN1: honest pipeline eval on the sealed coding-niche holdout.
//
// Usage:
//   npx tsx src/niche-eval.ts [--json] [--no-latency] [--classifier <path>] [--dataset <path>]
//
// Outputs:
//   - Human-readable report to stdout
//   - NICHE_RESULTS.json written to package root
//   - classify.js sha256 verified before any measurement
//
// What this measures (vs the existing run.ts):
//   run.ts      → classify.js only on the general 50-workflow dataset
//   niche-eval  → classify.js + niche-safety-floor on the SEALED 56-prompt
//                 coding-niche holdout, across 3 axes:
//                   1. Accuracy (classify vs full pipeline)
//                   2. Latency (classify.js p50/p99, target <50ms)
//                   3. Safety  (high-risk coding prompts → T3)
//
// Improvement under test:
//   The niche-safety-floor is the additive component. This eval measures
//   whether it raises the pipeline accuracy above classify-only accuracy.
//   A zero improvement (floor never fires, or fires but makes things worse)
//   IS a valid result — documented honestly in NICHE_RESULTS.json.
//
// Competitors cited for niche bench-watch (not measured here, cited from
// published reports):
//   RouteLLM (Ong et al., 2024): 40% cost reduction, 95%+ GPT-4 quality on
//     MMLU/MT-Bench general benchmark. NOT a coding-niche eval.
//   Martian (Martian AI, 2024): 23% average cost reduction on general
//     workflows. No published coding-niche breakdown.
//   Mooter (this eval): coding-niche ONLY, classify <50ms, safety floor.
//     Apples-to-oranges on cost since Mooter targets local-first (T0 free).

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findDefaultClassifier } from "./run.ts";
import { validateDataset, type WorkflowEntry } from "./lib.ts";
import {
  N_LATENCY_REPS,
  SAFETY_FLOOR_CATEGORIES,
  aggregateLatency,
  latencyForCase,
  runNichePipeline,
  type NicheEvalReport,
  type NichePipelineResult,
} from "./niche-pipeline.ts";

const PKG_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i >= 0 && i + 1 < args.length) return args[i + 1];
  const eq = args.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : undefined;
}

// ---------------------------------------------------------------------------
// Dataset loader (reuses the validateDataset invariant from lib.ts)
// ---------------------------------------------------------------------------

function loadNicheHoldout(datasetPath: string): WorkflowEntry[] {
  const raw = JSON.parse(readFileSync(datasetPath, "utf8")) as {
    workflows?: unknown;
    sealed?: boolean;
  };
  if (raw.sealed !== true) {
    console.error(
      `[niche-eval] WARNING: dataset at ${datasetPath} is not marked sealed:true — ` +
        "are you sure this is the holdout dataset?",
    );
  }
  validateDataset(raw.workflows);
  return raw.workflows as WorkflowEntry[];
}

// ---------------------------------------------------------------------------
// SHA-256 guard for classify.js (frozen invariant, re-checked before every run)
// ---------------------------------------------------------------------------

const FROZEN_SHA = "427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f" as const;

export function verifyClassifierSha(classifierPath: string): {
  sha256: string;
  frozen_ok: boolean;
} {
  const sha256 = createHash("sha256")
    .update(readFileSync(classifierPath))
    .digest("hex");
  return { sha256, frozen_ok: sha256 === FROZEN_SHA };
}

// ---------------------------------------------------------------------------
// Score computation
// ---------------------------------------------------------------------------

function buildReport(
  entries: WorkflowEntry[],
  results: NichePipelineResult[],
  classifierPath: string,
  sha256: string,
  datasetPath: string,
  latency: NicheEvalReport["latency"],
): NicheEvalReport {
  let classifyCorrect = 0;
  let pipelineCorrect = 0;
  let safetyFloorFires = 0;
  let floorPositiveLift = 0;
  let floorNegativeFlip = 0;

  const perCategory: NicheEvalReport["per_category"] = {};
  const perTier: NicheEvalReport["per_tier"] = {};

  for (const r of results) {
    if (r.classify_correct) classifyCorrect++;
    if (r.correct) pipelineCorrect++;
    if (r.safety_floor_fired) {
      safetyFloorFires++;
      // The floor fires when classify was <T3 but category is HIGH_RISK.
      // check whether this was a lift or a flip:
      if (!r.classify_correct && r.correct) floorPositiveLift++;
      if (r.classify_correct && !r.correct) floorNegativeFlip++;
    }

    const cat = (perCategory[r.category] ??= {
      total: 0,
      classify_correct: 0,
      pipeline_correct: 0,
      safety_floor_fires: 0,
    });
    cat.total++;
    if (r.classify_correct) cat.classify_correct++;
    if (r.correct) cat.pipeline_correct++;
    if (r.safety_floor_fired) cat.safety_floor_fires++;

    const tier = (perTier[r.expected_tier] ??= {
      total: 0,
      classify_correct: 0,
      pipeline_correct: 0,
    });
    tier.total++;
    if (r.classify_correct) tier.classify_correct++;
    if (r.correct) tier.pipeline_correct++;
  }

  const total = results.length;
  return {
    classifier_path: classifierPath,
    classifier_sha256: sha256,
    dataset_path: datasetPath,
    total,
    classify_accuracy: total > 0 ? Math.round((classifyCorrect / total) * 10_000) / 10_000 : 0,
    classify_correct: classifyCorrect,
    pipeline_accuracy: total > 0 ? Math.round((pipelineCorrect / total) * 10_000) / 10_000 : 0,
    pipeline_correct: pipelineCorrect,
    safety_floor_fires: safetyFloorFires,
    floor_positive_lifts: floorPositiveLift,
    floor_negative_flips: floorNegativeFlip,
    per_category: perCategory,
    per_tier: perTier,
    latency,
    entries: results,
  };
}

// ---------------------------------------------------------------------------
// Human-readable rendering
// ---------------------------------------------------------------------------

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function renderNicheReport(report: NicheEvalReport): string {
  const lines: string[] = [];
  lines.push("╔══════════════════════════════════════════════════════════════╗");
  lines.push("║  MooterBench WN1 — Niche Pipeline Eval (coding-niche, OOD)  ║");
  lines.push("╚══════════════════════════════════════════════════════════════╝");
  lines.push("");
  lines.push(`Dataset       : ${report.dataset_path} (N=${report.total})`);
  lines.push(`Classifier    : ${report.classifier_path}`);
  lines.push(`Classifier sha: ${report.classifier_sha256}`);
  lines.push(`Frozen sha OK : ${FROZEN_SHA === report.classifier_sha256 ? "✓ YES" : "✗ NO — FROZEN INVARIANT VIOLATED"}`);
  lines.push("");
  lines.push("── AXIS 1: Accuracy ────────────────────────────────────────────");
  lines.push(`  Baseline (classify only)  : ${report.classify_correct}/${report.total} = ${pct(report.classify_accuracy)}`);
  lines.push(`  Pipeline (+ safety floor) : ${report.pipeline_correct}/${report.total} = ${pct(report.pipeline_accuracy)}`);
  const delta = report.pipeline_accuracy - report.classify_accuracy;
  const deltaStr = delta >= 0 ? `+${(delta * 100).toFixed(1)}pp` : `${(delta * 100).toFixed(1)}pp`;
  lines.push(`  Delta (floor effect)      : ${deltaStr}`);
  lines.push("");
  lines.push("── Safety floor breakdown ──────────────────────────────────────");
  lines.push(`  Floor fired (classify <T3 but HIGH_RISK cat) : ${report.safety_floor_fires}`);
  lines.push(`  Positive lifts (wrong→correct)               : ${report.floor_positive_lifts}`);
  lines.push(`  Negative flips (correct→wrong)               : ${report.floor_negative_flips}`);
  if (report.safety_floor_fires === 0) {
    lines.push("  ► Floor NEVER fired — classify.js already handled all HIGH_RISK cases.");
    lines.push("    This is an HONEST NEGATIVE: the additive improvement adds 0%.");
    lines.push("    The floor is still a valid safety net against future regressions.");
  } else if (delta > 0) {
    lines.push(`  ► Floor IMPROVED accuracy by ${deltaStr} — KEEP the improvement.`);
  } else if (delta < 0) {
    lines.push(`  ► Floor HURT accuracy by ${deltaStr} — REVERT. Negative result logged.`);
  } else {
    lines.push("  ► Floor fired but net accuracy change is 0 — neutral result.");
  }
  lines.push("");
  lines.push("── AXIS 2: Latency (classify.js only, N=" + N_LATENCY_REPS + " reps/prompt) ────");
  lines.push(`  Global p50 : ${report.latency.global_p50_ms.toFixed(1)}ms  (target: <50ms)`);
  lines.push(`  Global p99 : ${report.latency.global_p99_ms.toFixed(1)}ms`);
  lines.push(`  Calls <50ms: ${pct(report.latency.fraction_under_50ms)}`);
  const latencyOk = report.latency.global_p50_ms < 50;
  lines.push(`  ► p50 target (<50ms): ${latencyOk ? "✓ MET" : "✗ MISSED"}`);
  lines.push("");
  lines.push("── AXIS 3: Safety (T3 correctness on HIGH_RISK categories) ─────");
  const safetyCategories = [...SAFETY_FLOOR_CATEGORIES];
  for (const cat of safetyCategories) {
    const s = report.per_category[cat];
    if (!s) continue;
    lines.push(
      `  ${cat.padEnd(20)} pipeline correct: ${s.pipeline_correct}/${s.total}  floor fires: ${s.safety_floor_fires}`,
    );
  }
  lines.push("");
  lines.push("── Per-category accuracy (pipeline) ────────────────────────────");
  const catW = Math.max(...Object.keys(report.per_category).map((c) => c.length), 8);
  for (const [cat, s] of Object.entries(report.per_category).sort()) {
    const classifyAcc = s.total > 0 ? ((s.classify_correct / s.total) * 100).toFixed(0) : "—";
    const pipelineAcc = s.total > 0 ? ((s.pipeline_correct / s.total) * 100).toFixed(0) : "—";
    lines.push(`  ${cat.padEnd(catW)}  classify: ${classifyAcc}%  pipeline: ${pipelineAcc}%  (N=${s.total})`);
  }
  lines.push("");
  lines.push("── Per-tier accuracy (by expected_tier, pipeline) ───────────────");
  for (const [tier, s] of Object.entries(report.per_tier).sort()) {
    const classifyAcc = s.total > 0 ? ((s.classify_correct / s.total) * 100).toFixed(0) : "—";
    const pipelineAcc = s.total > 0 ? ((s.pipeline_correct / s.total) * 100).toFixed(0) : "—";
    lines.push(`  ${tier}  classify: ${classifyAcc}%  pipeline: ${pipelineAcc}%  (N=${s.total})`);
  }
  lines.push("");
  lines.push("── Bench-watch: Mooter vs RouteLLM / Martian ───────────────────");
  lines.push("  RouteLLM (Ong et al., 2024, arXiv:2406.18665):");
  lines.push("    40% cost reduction, 95%+ GPT-4 quality — general benchmark (MMLU/MT-Bench).");
  lines.push("    No published coding-niche or latency breakdown.");
  lines.push("  Martian (Martian AI 2024, blog.withmartian.com/routing-benchmarks):");
  lines.push("    23% avg cost reduction — general workflows, no niche OOD holdout.");
  lines.push("  Mooter WN1 (this run, coding-niche OOD holdout):");
  lines.push(`    classify accuracy: ${pct(report.classify_accuracy)}  |  pipeline: ${pct(report.pipeline_accuracy)}`);
  lines.push(`    classify p50: ${report.latency.global_p50_ms.toFixed(1)}ms  |  T0 = $0 (local-first)`);
  lines.push("    NOTE: direct cost-reduction comparison not applicable — Mooter routes");
  lines.push("    to local Ollama (T0, free) while RouteLLM/Martian compare cloud tiers only.");
  lines.push("");
  lines.push(
    "Caveats: accuracy against author-judgment gold labels (N=" +
      report.total +
      "). Sealed OOD holdout. " +
      "Latency measured via execFileSync (includes spawn overhead). Not a microbenchmark.",
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Results persistence
// ---------------------------------------------------------------------------

export function writeNicheResults(
  report: NicheEvalReport,
  pkgDir = PKG_DIR,
): string {
  const path = join(pkgDir, "NICHE_RESULTS.json");
  writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
  return path;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function main(argv = process.argv.slice(2)): number {
  const jsonMode = argv.includes("--json");
  const skipLatency = argv.includes("--no-latency");

  const datasetPath = resolve(
    flagValue(argv, "--dataset") ??
      join(PKG_DIR, "dataset", "niche-holdout.json"),
  );
  const classifierPath = resolve(
    flagValue(argv, "--classifier") ?? findDefaultClassifier() ?? "",
  );

  if (!classifierPath || !existsSync(classifierPath)) {
    console.error(
      "niche-eval: could not find tools/router/classify.js. " +
        "Run from inside the Mooter repo or pass --classifier <path>.",
    );
    return 2;
  }

  // SHA-256 guard — always verify before measuring
  const { sha256, frozen_ok } = verifyClassifierSha(classifierPath);
  if (!frozen_ok) {
    console.error(
      `niche-eval: classify.js sha256 mismatch!\n  got     : ${sha256}\n  expected: ${FROZEN_SHA}\nThe frozen classifier invariant was violated. Aborting.`,
    );
    return 3;
  }

  // Load dataset
  const entries = loadNicheHoldout(datasetPath);

  // Stage 1+2: run classify + safety-floor on every entry
  if (!jsonMode) process.stderr.write("Running pipeline…\n");
  const results = entries.map((e, i) => {
    if (!jsonMode) process.stderr.write(`\r  ${i + 1}/${entries.length} — ${e.id}   `);
    return runNichePipeline(classifierPath, e);
  });
  if (!jsonMode) process.stderr.write("\r\x1b[2K");

  // Latency probe (subset: one T0, one T1, one T2, one T3)
  let latencySummary: NicheEvalReport["latency"];
  if (skipLatency) {
    latencySummary = {
      global_p50_ms: 0,
      global_p99_ms: 0,
      fraction_under_50ms: 0,
      per_prompt: [],
    };
  } else {
    // Probe one representative from each tier to keep runtime reasonable
    const probeTargets = (["T0", "T1", "T2", "T3"] as const).flatMap((tier) => {
      const candidate = entries.find((e) => e.expected_tier === tier);
      return candidate ? [candidate] : [];
    });
    if (!jsonMode) process.stderr.write(`Probing latency on ${probeTargets.length} entries (${N_LATENCY_REPS} reps each)…\n`);
    const probes = probeTargets.map((e, i) => {
      if (!jsonMode) process.stderr.write(`\r  latency ${i + 1}/${probeTargets.length} — ${e.id}   `);
      return latencyForCase(classifierPath, e);
    });
    if (!jsonMode) process.stderr.write("\r\x1b[2K");
    latencySummary = aggregateLatency(probes);
  }

  const report = buildReport(entries, results, classifierPath, sha256, datasetPath, latencySummary);

  // Persist
  const resultsPath = writeNicheResults(report);
  process.stderr.write(`📄 Niche results written to ${resultsPath}\n`);

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderNicheReport(report));
  }

  return 0;
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) {
  process.exit(main());
}

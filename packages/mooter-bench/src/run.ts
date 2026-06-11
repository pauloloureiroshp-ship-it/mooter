// MooterBench runner — classifies all dataset workflows through the REAL
// Mooter router (tools/router/classify.js) and reports routing accuracy,
// a T0-T3 confusion matrix, completion rate, and estimated cost savings
// vs an all-T3 baseline. No network calls: classify.js is a local,
// deterministic regex/heuristic classifier.
//
// Usage:
//   npx tsx src/run.ts [--json] [--classifier <path>] [--dataset <path>]

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ASSUMED_INPUT_TOKENS,
  ASSUMED_OUTPUT_TOKENS,
  PRICING_PER_MTOK,
  TIERS,
  estimateSavings,
  score,
  validateDataset,
  type Prediction,
  type ScoreReport,
  type SavingsEstimate,
  type WorkflowEntry,
} from "./lib.ts";

const PKG_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i >= 0 && i + 1 < args.length) return args[i + 1];
  const eq = args.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : undefined;
}

/** Walk up from the package dir looking for tools/router/classify.js. */
export function findDefaultClassifier(startDir = PKG_DIR): string | null {
  let dir = startDir;
  for (let i = 0; i < 8; i++) {
    const cand = join(dir, "tools", "router", "classify.js");
    if (existsSync(cand)) return cand;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Run the real classifier on one prompt. Never throws — failures become
 *  { completed: false } so completion_rate stays honest. */
export function classifyOne(classifierPath: string, id: string, prompt: string): Prediction {
  try {
    const out = execFileSync(process.execPath, [classifierPath, prompt], {
      encoding: "utf8",
      timeout: 30_000,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, MOOTER_BENCH: "1" },
    });
    // classify.js prints a single JSON object; tolerate leading noise by
    // grabbing the first '{' onward.
    const jsonStart = out.indexOf("{");
    if (jsonStart < 0) return { id, predicted_tier: null, completed: false };
    const parsed = JSON.parse(out.slice(jsonStart)) as Record<string, unknown>;
    const tier = typeof parsed.tier === "string" ? parsed.tier : null;
    if (!tier) return { id, predicted_tier: null, completed: false };
    return {
      id,
      predicted_tier: tier,
      completed: true,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : undefined,
      recommended_model:
        typeof parsed.recommended_model === "string" ? parsed.recommended_model : undefined,
    };
  } catch {
    return { id, predicted_tier: null, completed: false };
  }
}

export function loadDataset(datasetPath: string): WorkflowEntry[] {
  const raw = JSON.parse(readFileSync(datasetPath, "utf8")) as { workflows?: unknown };
  validateDataset(raw.workflows);
  return raw.workflows;
}

function classifierSha(classifierPath: string): string {
  return createHash("sha256").update(readFileSync(classifierPath)).digest("hex");
}

// ---------------------------------------------------------------------------
// Human-readable rendering
// ---------------------------------------------------------------------------
function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function renderReport(
  report: ScoreReport,
  savings: SavingsEstimate,
  meta: { classifier: string; sha256: string; dataset: string; date: string },
): string {
  const lines: string[] = [];
  lines.push("MooterBench v0.1.0 — routing accuracy benchmark");
  lines.push(`date: ${meta.date}`);
  lines.push(`classifier: ${meta.classifier}`);
  lines.push(`classifier sha256: ${meta.sha256}`);
  lines.push(`dataset: ${meta.dataset} (N=${report.total})`);
  lines.push("");
  lines.push(`Routing accuracy : ${report.correct}/${report.total} = ${pct(report.accuracy)}`);
  lines.push(`Completion rate  : ${report.completed}/${report.total} = ${pct(report.completion_rate)}`);
  lines.push("");
  lines.push("Per-category accuracy");
  const catW = Math.max(...Object.keys(report.per_category).map((c) => c.length), 8);
  for (const [cat, s] of Object.entries(report.per_category).sort()) {
    lines.push(`  ${cat.padEnd(catW)}  ${s.correct}/${s.total}  ${pct(s.accuracy)}`);
  }
  lines.push("");
  lines.push("Confusion matrix (rows = expected, cols = predicted)");
  const cols = [...TIERS, "other", "invalid"];
  lines.push(`  ${"".padEnd(4)}${cols.map((c) => c.padStart(8)).join("")}`);
  for (const t of TIERS) {
    const row = cols.map((c) => String(report.confusion[t][c] ?? 0).padStart(8)).join("");
    lines.push(`  ${t.padEnd(4)}${row}`);
  }
  lines.push("");
  lines.push("Estimated cost vs all-T3 (Opus) baseline");
  lines.push(
    `  Assumption: ${ASSUMED_INPUT_TOKENS} input + ${ASSUMED_OUTPUT_TOKENS} output tokens per workflow.`,
  );
  lines.push(
    "  Pricing (2026-06 Anthropic list prices, USD per Mtok in/out): " +
      `Opus $${PRICING_PER_MTOK.T3.input}/$${PRICING_PER_MTOK.T3.output}, ` +
      `Sonnet $${PRICING_PER_MTOK.T2.input}/$${PRICING_PER_MTOK.T2.output}, ` +
      `Haiku $${PRICING_PER_MTOK.T1.input}/$${PRICING_PER_MTOK.T1.output}, local $0.`,
  );
  lines.push(`  All-T3 baseline : $${savings.baseline_all_t3_usd.toFixed(4)}`);
  lines.push(`  Routed          : $${savings.routed_usd.toFixed(4)}`);
  lines.push(
    `  Estimated saved : $${savings.saved_usd.toFixed(4)} (${savings.saved_pct.toFixed(1)}%)`,
  );
  if (savings.invalid_costed_as_t3 > 0) {
    lines.push(`  (${savings.invalid_costed_as_t3} invalid decision(s) costed as T3, conservative)`);
  }
  lines.push("");
  lines.push(
    "Caveat: savings are ESTIMATES from list prices and an assumed token profile, " +
      "not measured billing. Accuracy is against author-judgment gold labels (N=" +
      report.total +
      ").",
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export function main(argv = process.argv.slice(2)): number {
  const jsonMode = argv.includes("--json");
  const datasetPath = resolve(
    flagValue(argv, "--dataset") ?? join(PKG_DIR, "dataset", "workflows.json"),
  );
  const classifierPath = resolve(
    flagValue(argv, "--classifier") ?? findDefaultClassifier() ?? "",
  );

  if (!classifierPath || !existsSync(classifierPath)) {
    console.error(
      "MooterBench: could not find tools/router/classify.js. " +
        "Run from inside the Mooter repo or pass --classifier <path>.",
    );
    return 2;
  }

  const entries = loadDataset(datasetPath);
  const predictions: Prediction[] = [];
  for (const e of entries) {
    if (!jsonMode) process.stderr.write(`\rclassifying ${predictions.length + 1}/${entries.length}…`);
    predictions.push(classifyOne(classifierPath, e.id, e.prompt));
  }
  if (!jsonMode) process.stderr.write("\r\x1b[2K");

  const report = score(entries, predictions);
  const savings = estimateSavings(predictions);
  const meta = {
    classifier: classifierPath,
    sha256: classifierSha(classifierPath),
    dataset: datasetPath,
    date: new Date().toISOString().slice(0, 10),
  };

  if (jsonMode) {
    console.log(
      JSON.stringify(
        {
          bench: "MooterBench",
          version: "0.1.0",
          ...meta,
          pricing_usd_per_mtok: PRICING_PER_MTOK,
          assumed_tokens: { input: ASSUMED_INPUT_TOKENS, output: ASSUMED_OUTPUT_TOKENS },
          report,
          savings,
          predictions,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(renderReport(report, savings, meta));
  }
  return 0;
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) {
  process.exit(main());
}

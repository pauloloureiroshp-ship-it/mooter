// pipeline.ts — live-loop CYCLE 1 MEASURE artifact (ADDITIVE; classify.js read-only).
//
// WHAT IT MEASURES
// The existing MooterBench (run.ts) scores classify.js ALONE and costs each tier at a
// flat flagship model. It is structurally blind to the Wave-58 additive engine
// (decideAgent + specialization-matrix + TES). This harness measures the END-TO-END
// additive pipeline on the SAME 50 real workflows:
//
//     prompt → classify.js (FROZEN, gives the TIER) → domain bridge → decideAgent
//              (Pareto-best MEASURED model within the roster)
//
// and answers ONE falsifiable question:
//
//     "On a real prompt, does the additive engine produce a MEASURED
//      (benchmark-backed) model decision, or does it fall back to a tier
//      heuristic that adds nothing over the flat-tier baseline?"
//
// HONESTY NOTES
//   * classify.js is invoked read-only via a subprocess; it is never imported or
//     modified. Its sha is the CI-frozen 427d8c0…4bc48f.
//   * The domain bridge below is a DELIBERATELY COARSE, documented heuristic. It is
//     NOT a production classifier. classify.js classifies the COMPLEXITY axis
//     (trivial / reasoning / architecture); decideAgent's matrix is indexed by the
//     DOMAIN axis (coding.* / reasoning.* / writing.*). The bridge exists only so the
//     orphaned engine can be exercised at all. We pass min_score:0 to measure the
//     OPTIMISTIC reach CEILING — if even the most generous reach is low, the real
//     reach is lower.
//   * Deterministic, $0, zero network. Reproducible for a given classifier sha +
//     benchmark-seed.
//
// This is a MEASURE cycle: a negative result (engine adds ~no measured value today)
// is the product — it tells us the bottleneck is matrix COVERAGE, not routing code.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { decideAgent, type DecideAgentResult } from "../../router/src/decide-agent.ts";
import { TASK_CATEGORIES } from "../../router/src/task-categories.ts";

const PKG_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

// ---------------------------------------------------------------------------
// Path resolution (walk up to the repo's tools/router/classify.js)
// ---------------------------------------------------------------------------
function findClassifier(startDir: string): string | null {
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

interface Workflow {
  id: string;
  category: string;
  prompt: string;
  expected_tier: string;
}

interface ClassifyOut {
  tier: string | null;
  task_category: string | null;
  confidence: number | null;
}

/** Run the FROZEN classifier on one prompt (read-only subprocess). */
function classify(classifierPath: string, prompt: string): ClassifyOut {
  try {
    const out = execFileSync(process.execPath, [classifierPath, prompt], {
      encoding: "utf8",
      timeout: 30_000,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, MOOTER_BENCH: "1" },
    });
    const j = out.indexOf("{");
    if (j < 0) return { tier: null, task_category: null, confidence: null };
    const p = JSON.parse(out.slice(j)) as Record<string, unknown>;
    return {
      tier: typeof p.tier === "string" ? p.tier : null,
      task_category: typeof p.task_category === "string" ? p.task_category : null,
      confidence: typeof p.confidence === "number" ? p.confidence : null,
    };
  } catch {
    return { tier: null, task_category: null, confidence: null };
  }
}

// ---------------------------------------------------------------------------
// Domain bridge: prompt → one of the 24 Wave-58 categories (COARSE, documented).
// Order matters: most specific signals first. This is a measurement scaffold,
// not a production classifier — see the honesty note at the top of the file.
// ---------------------------------------------------------------------------
const DOMAIN_RULES: Array<[RegExp, string]> = [
  [/\b(translate|traduz|tradu[çc])/i, "writing.translation"],
  [/\b(css|tailwind|react|component|button|frontend|ui|layout|jsx|html)\b/i, "coding.frontend"],
  [/\b(sql|query|schema|migration|database|index|postgres|table)\b/i, "coding.data"],
  [/\b(docker|kubernetes|k8s|ci\b|pipeline|deploy|terraform|infra|nginx|yaml)\b/i, "coding.infra"],
  [/\b(auth|token|secret|credential|vulnerab|xss|csrf|injection|security|encrypt)\b/i, "coding.security"],
  [/\b(refactor|rename|extract|restructure|move .*module|clean ?up)\b/i, "coding.refactor"],
  [/\b(test|spec|jest|vitest|pytest|coverage|assert)\b/i, "coding.test"],
  [/\b(bug|crash|error|stack ?trace|why .*fail|debug|reconnect|race condition|leak)\b/i, "coding.debug"],
  [/\b(leetcode|competitive|algorithm|complexity|dynamic programming|big-?o)\b/i, "coding.competitive"],
  [/\b(api|endpoint|server|backend|route|handler|function|service|class|method)\b/i, "coding.backend"],
  [/\b(prove|theorem|integral|equation|calculus|algebra|\d+\s*[\+\-\*\/]\s*\d+)\b/i, "reasoning.math"],
  [/\b(physics|chemistry|biology|scientific|hypothesis|experiment)\b/i, "reasoning.science"],
  [/\b(docs?|documentation|readme|changelog|release notes|guide)\b/i, "writing.structured"],
  [/\b(summari[sz]e|resume|tl;?dr|explain|describe)\b/i, "writing.prose-en"],
  [/[áàâãéêíóôõúç]/i, "writing.prose-pt-pt"],
];

function bridgeDomain(prompt: string): string {
  for (const [rx, cat] of DOMAIN_RULES) if (rx.test(prompt)) return cat;
  return "reasoning.general"; // honest default for "no recognizable domain signal"
}

/** A decideAgent result is MEASURED iff its chosen model's score is benchmark-backed
 *  (cited_source present and not a "tier-heuristic:Tx" fallback marker). */
function isMeasured(r: DecideAgentResult): boolean {
  return (
    r.chosen_model !== null &&
    typeof r.cited_source === "string" &&
    r.cited_source.length > 0 &&
    !r.cited_source.includes("tier-heuristic")
  );
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
function main(): void {
  const classifierPath = resolve(findClassifier(PKG_DIR) ?? "");
  if (!classifierPath || !existsSync(classifierPath)) {
    console.error("classify.js not found");
    process.exit(1);
  }
  const sha = createHash("sha256").update(readFileSync(classifierPath)).digest("hex");
  const datasetPath = join(PKG_DIR, "dataset", "workflows.json");
  const workflows = (JSON.parse(readFileSync(datasetPath, "utf8")).workflows ?? []) as Workflow[];

  let measured = 0;
  let heuristic = 0;
  let nullPick = 0;
  const perGroup: Record<string, { measured: number; total: number }> = {};
  const rows: string[] = [];

  for (const w of workflows) {
    const c = classify(classifierPath, w.prompt);
    const domain = bridgeDomain(w.prompt);
    const group = domain.split(".")[0];
    perGroup[group] ??= { measured: 0, total: 0 };
    perGroup[group].total++;

    // min_score:0 → OPTIMISTIC reach ceiling (most generous to the engine).
    const r = decideAgent({ task_category: domain, min_score: 0 });

    let basis: string;
    if (r.chosen_model === null) {
      nullPick++;
      basis = "null";
    } else if (isMeasured(r)) {
      measured++;
      perGroup[group].measured++;
      basis = "MEASURED";
    } else {
      heuristic++;
      basis = "heuristic";
    }
    rows.push(
      `  ${w.id.padEnd(18)} tier=${c.tier ?? "?"}  domain=${domain.padEnd(20)} ` +
        `pick=${(r.chosen_model ?? "—").padEnd(22)} ${basis}`,
    );
  }

  const n = workflows.length;
  const reach = n ? measured / n : 0;

  // How many of the 24 categories CAN the engine make a measured decision in at all?
  // (engine knowledge ceiling, independent of the prompt bridge)
  let measurableCats = 0;
  for (const cat of TASK_CATEGORIES) {
    const r = decideAgent({ task_category: cat, min_score: 0 });
    if (isMeasured(r)) measurableCats++;
  }

  console.log("MooterPipelineBench — additive-engine reach (CYCLE 1 measure)");
  console.log(`classifier sha256: ${sha}`);
  console.log(`dataset: ${datasetPath} (N=${n})`);
  console.log("");
  console.log("Per-workflow pipeline decision:");
  for (const r of rows) console.log(r);
  console.log("");
  console.log("HEADLINE — additive engine value on real prompts:");
  console.log(`  MEASURED Pareto decisions : ${measured}/${n} = ${(reach * 100).toFixed(1)}%`);
  console.log(`  heuristic fallbacks       : ${heuristic}/${n} (no better than flat-tier)`);
  console.log(`  null picks (nothing qualified): ${nullPick}/${n}`);
  console.log(
    `  engine knowledge ceiling  : ${measurableCats}/24 categories can yield a measured decision`,
  );
  console.log("");
  console.log("Interpretation: a low MEASURED rate means the orphaned Wave-58 engine");
  console.log("adds ~no benchmark-backed value on real prompts today — the bottleneck is");
  console.log("matrix COVERAGE (measured cells), not the routing code. $0, deterministic.");
}

main();

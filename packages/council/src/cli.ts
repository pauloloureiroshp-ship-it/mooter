// `mooter council` — the Advisory Council CLI surface (self-contained + testable).
//
//   mooter council "<prompt>" [--category C] [--budget USD] [--local-only] [--json]
//   mooter council explain "<prompt>" [--category C] [--budget USD] [--local-only]
//
// `explain` is dry (no model calls): it shows WHY a council would convene (CAS
// reasons), the composition, and the cost vs an all-Opus baseline. The run path
// composes a real council and deliberates. Invoking the command IS an explicit
// @council, so CAS convenes by intent.

import { computeCAS, type CasResult } from "./cas.ts";
import { composeCouncil as realCompose, type ComposeBudget } from "./compose.ts";
import { deliberate as realDeliberate } from "./deliberate.ts";
import { renderCouncilChip, OPUS_PER_CALL_EST } from "./chip.ts";
import { decideActOrEscalate } from "./escalation.ts";
import type { Council, CouncilVerdict } from "./types.ts";

export interface CliResult {
  exitCode: number;
  output: string;
}

export interface CliDeps {
  composeCouncil: typeof realCompose;
  deliberate: typeof realDeliberate;
  hasCloudKey: boolean;
}

interface ParsedArgs {
  mode: "run" | "explain";
  prompt: string;
  category: string;
  budget: number;
  localOnly: boolean;
  json: boolean;
  decide: boolean;
}

function parseArgs(args: string[]): ParsedArgs {
  let mode: "run" | "explain" = "run";
  const positional: string[] = [];
  let category = "reasoning.general";
  let budget = 0;
  let localOnly = false;
  let json = false;
  let decide = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "explain" && positional.length === 0 && mode === "run") mode = "explain";
    else if (a === "--category") category = args[++i] ?? category;
    else if (a === "--budget") budget = Number(args[++i] ?? "0") || 0;
    else if (a === "--local-only") localOnly = true;
    else if (a === "--json") json = true;
    else if (a === "--decide") decide = true;
    else positional.push(a);
  }
  return { mode, prompt: positional.join(" ").trim(), category, budget, localOnly, json, decide };
}

function bullets(items: string[]): string {
  return items.length ? items.map((i) => `  - ${i}`).join("\n") : "  (none)";
}

function renderVerdict(v: CouncilVerdict): string {
  const lines = [
    renderCouncilChip(v),
    `confidence: ${v.confidence} · convergence: ${v.convergence} · rounds: ${v.rounds} · calls: ${v.modelCalls}`,
    ``,
    `① Consensus`,
    bullets(v.consensus),
    `② Dissent`,
    bullets(v.dissent),
    `③ Unique findings`,
    bullets(v.uniqueFindings),
    `④ Recommendation`,
    `  ${v.recommendation.replace(/\n/g, "\n  ")}`,
  ];
  if (v.minorityReport.length) {
    lines.push(``, `Minority report (${v.minorityReport.length}):`);
    for (const m of v.minorityReport) {
      lines.push(`  - [${m.reviewer}/${m.lens}] ${m.verdict} (${m.confidence}): ${m.rationale}`);
    }
  }
  lines.push(``, `coverage: ${v.coverageNote}`);
  return lines.join("\n");
}

export async function runCouncilCli(args: string[], deps: Partial<CliDeps> = {}): Promise<CliResult> {
  const compose = deps.composeCouncil ?? realCompose;
  const deliberate = deps.deliberate ?? realDeliberate;
  const hasCloudKey = deps.hasCloudKey ?? !!process.env.ANTHROPIC_API_KEY;

  const p = parseArgs(args);
  if (!p.prompt) {
    return {
      exitCode: 2,
      output:
        'usage: mooter council "<prompt>" [--category C] [--budget USD] [--local-only] [--decide] [--json]\n' +
        '       mooter council explain "<prompt>" [...]',
    };
  }

  // Invoking the command is an explicit @council → CAS convenes by intent.
  const cas: CasResult = computeCAS({ explicit: true, category: p.category });
  const budget: ComposeBudget = { maxCostUsd: p.budget };
  const council: Council = compose(p.category, cas, budget, { localOnly: p.localOnly, hasCloudKey });

  if (p.mode === "explain") {
    const estCalls = council.seats.length + council.seats.length * Math.max(0, council.seats.length - 1);
    const allOpus = Math.round(estCalls * OPUS_PER_CALL_EST * 1e6) / 1e6;
    const saved = allOpus > 0 ? Math.max(0, Math.round(((allOpus - council.estCostUsd) / allOpus) * 100)) : 0;
    if (p.json) {
      return {
        exitCode: 0,
        output: JSON.stringify(
          { mode: "explain", prompt: p.prompt, category: p.category, cas, composition: council.note, estCostUsd: council.estCostUsd, allOpusEstUsd: allOpus, savedPct: saved },
          null,
          2,
        ),
      };
    }
    return {
      exitCode: 0,
      output: [
        `🏛 Mooter Council — explain`,
        `prompt: ${JSON.stringify(p.prompt)}`,
        `category: ${p.category}`,
        `CAS: ${cas.convene ? "CONVENE" : "single-model"} (score ${cas.score}) — ${cas.reasons.join("; ")}`,
        `composition: ${council.note}`,
        `est cost: ${council.estCostUsd === 0 ? "$0.00 (all-local)" : `$${council.estCostUsd.toFixed(2)}`} · ~${estCalls} calls vs all-Opus ~$${allOpus.toFixed(2)} → saved ~${saved}%`,
      ].join("\n"),
    };
  }

  // run mode — real deliberation.
  const verdict = await deliberate(p.prompt, council);
  const decision = p.decide ? decideActOrEscalate(verdict) : null;
  if (p.json) {
    return { exitCode: 0, output: JSON.stringify(decision ? { verdict, decision } : verdict, null, 2) };
  }
  const lines = [
    `🏛 Mooter Council — advisory`,
    `prompt: ${JSON.stringify(p.prompt)}`,
    `CAS: CONVENE (score ${cas.score}) — ${cas.reasons.join("; ")}`,
    `composition: ${council.note}`,
    ``,
    renderVerdict(verdict),
  ];
  if (decision) {
    lines.push(
      ``,
      `⚖ decision: ${decision.decision} (pooled ${decision.pooledConfidence} vs threshold ${decision.threshold})`,
      `  ${decision.reasons.join("; ")}`,
    );
  }
  return { exitCode: 0, output: lines.join("\n") };
}

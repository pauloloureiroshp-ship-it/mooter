// packages/cli/src/fable-observe/cca-f-audit-cmd.ts — Wave 54 Phases B→E wiring.
//
// `mooter cca-f audit [--seed N] [--count N] [--overnight] [--json]` — runs the
// audit loop (B), stages Pastor learning samples (C), renders the morning report
// (D), and writes the publish artefacts (E). Pure orchestration over the phase
// modules; LLM transports are injectable via deps for tests.

import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { ccafAuditDir } from "./config.ts";
import { runAudit, type AuditDeps, type AuditReport } from "./cca-f-audit.ts";
import { stageLearning, type LearnResult } from "./cca-f-learn.ts";
import { renderReportMarkdown } from "./cca-f-report.ts";
import { writePublishArtefacts } from "./cca-f-publish.ts";
import { readDecisions } from "./cca-f-readback.ts";

export interface CmdResult {
  exitCode: number;
  output: string;
}

const AUDIT_USAGE = `mooter cca-f audit — run the CCA-F audit harness (Wave 54)

  mooter cca-f audit [--seed N] [--count N] [--overnight] [--json]

  --seed N      RNG seed for the question set (default 42 · same seed ⇒ same 60 questions)
  --count N     number of questions (default 60 · the official domain allocation)
  --overnight   label the run as the scheduled overnight cohort (no behavioural change)
  --json        emit the JSON report to stdout instead of the human summary

Local-first: answers resolve on local Ollama (free); only the Sonnet self-judge
touches the cloud (via the claude CLI / Claude Max — no API key, no per-token cost).
Output → ~/.mooter/cca-f/audit/<session_id>/ (decisions.jsonl · report.json ·
report.md · notion-page.md · chip.json). NOT the official Anthropic exam.`;

function numFlag(args: string[], name: string, dflt: number): number {
  const i = args.indexOf(name);
  if (i === -1) return dflt;
  const n = Number(args[i + 1]);
  return Number.isFinite(n) ? n : dflt;
}

export interface AuditCmdResult {
  report: AuditReport;
  learn: LearnResult;
  dir: string;
  reportMarkdown: string;
}

/**
 * Programmatic entry (also used by tests). Runs B→E and returns the artefacts.
 * Re-reads decisions.jsonl so learning + the final report reflect exactly what
 * was logged (single source of truth on disk).
 */
export async function runAuditPipeline(
  opts: { seed: number; count?: number },
  deps: AuditDeps = {},
): Promise<AuditCmdResult> {
  const home = deps.home ?? homedir();
  const report = await runAudit(opts, deps);
  const dir = ccafAuditDir(home, report.session_id);

  // Phase C — stage learning from the on-disk decisions (re-read, not in-memory).
  const decisions = readDecisions(join(dir, "decisions.jsonl"));
  const learn = stageLearning(decisions, report.session_id, home);
  report.learning.high_confidence_count = learn.high_confidence_count;

  // Phase D — render the report markdown and persist the final JSON (with count).
  const reportMarkdown = renderReportMarkdown(report, learn);
  writeFileSync(join(dir, "report.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  writeFileSync(join(dir, "report.md"), reportMarkdown, "utf8");

  // Phase E — publish artefacts (file-based; Notion push is interactive/manual).
  writePublishArtefacts(dir, report, reportMarkdown);

  return { report, learn, dir, reportMarkdown };
}

/** CLI entry for `mooter cca-f audit`. */
export async function runCcaFAudit(args: string[], deps: AuditDeps = {}): Promise<CmdResult> {
  if (args.includes("--help") || args.includes("help")) {
    return { exitCode: 0, output: AUDIT_USAGE };
  }
  const seed = numFlag(args, "--seed", 42);
  const count = numFlag(args, "--count", 60);
  const json = args.includes("--json");

  let res: AuditCmdResult;
  try {
    res = await runAuditPipeline({ seed, count }, deps);
  } catch (e) {
    return { exitCode: 1, output: `cca-f audit failed: ${e instanceof Error ? e.message : String(e)}` };
  }

  if (json) {
    return { exitCode: 0, output: JSON.stringify(res.report, null, 2) };
  }

  const s = res.report.summary;
  const lines = [
    "🐮 CCA-F audit complete (NOT the official Anthropic exam)",
    `   session: ${res.report.session_id} · seed ${res.report.seed}`,
    `   pass: ${s.passed}/${s.total} (${Math.round(s.pass_rate * 100)}%) · routing ${Math.round(s.routing_accuracy * 100)}% · judge failures ${s.judge_failures}`,
    `   learning: +${res.learn.high_confidence_count} high-confidence samples`,
    `   📁 ${res.dir}`,
    `      report.md · report.json · decisions.jsonl · notion-page.md · chip.json`,
  ];
  return { exitCode: 0, output: lines.join("\n") };
}

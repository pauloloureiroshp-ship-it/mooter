// packages/cli/src/fable-observe/cca-f-report.ts — Wave 54 Phase D.
//
// Renders the morning report markdown from an AuditReport (the JSON report is the
// report object itself, written by runAudit). Every number here comes from the
// report — nothing is recomputed or invented. The honest disclaimer is mandatory.

import type { AuditReport } from "./cca-f-audit.ts";
import type { LearnResult } from "./cca-f-learn.ts";

const DOMAIN_LABEL: Record<string, string> = {
  agentic: "Agentic Architecture (27%)",
  cc_config: "CC Configuration (20%)",
  prompt_eng: "Prompt Engineering (20%)",
  mcp: "MCP Tools (18%)",
  context: "Context Management (15%)",
};

const DOMAIN_ORDER = ["agentic", "cc_config", "prompt_eng", "mcp", "context"];

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h ${m}min` : m > 0 ? `${m}min ${sec}s` : `${sec}s`;
}

export function renderReportMarkdown(report: AuditReport, learn?: LearnResult): string {
  const { summary, by_domain } = report;
  const date = report.started_at.slice(0, 10);

  const rows = DOMAIN_ORDER.filter((d) => by_domain[d]).map((d) => {
    const st = by_domain[d];
    return `| ${DOMAIN_LABEL[d] ?? d} | ${st.passed}/${st.total} (${pct(st.pass_rate)}) | ${st.tier_matches}/${st.total} (${pct(st.routing_accuracy)}) | ${st.avg_score}/100 |`;
  });

  const failureLines = report.failure_patterns.length
    ? report.failure_patterns.map((p) => `- ${p}`).join("\n")
    : "- None — every domain met the 70% floor.";

  const learnLine =
    learn && learn.high_confidence_count > 0
      ? `- High-confidence samples staged: **+${learn.high_confidence_count}** → \`${learn.path}\`\n- ${learn.note}`
      : `- High-confidence samples staged: **0**${learn ? `\n- ${learn.note}` : ""}`;

  return `# CCA-F Audit Report — ${date}

> ${report.disclaimer}

## Summary
- Session: \`${report.session_id}\` · seed ${report.seed}${report.algorithm_version ? ` · classifier ${report.algorithm_version}` : ""}
- Total questions: ${summary.total}
- Passed: ${summary.passed} (${pct(summary.pass_rate)})
- Failed: ${summary.failed} (${pct(1 - summary.pass_rate)})
- Routing accuracy (tier == expected): ${pct(summary.routing_accuracy)}
- Judge failures: ${summary.judge_failures}
- Total cost: $${summary.total_cost_usd.toFixed(2)} USD (local Ollama resolve + Claude Max judge → cost is Max quota, not USD)
- Duration: ${fmtDuration(report.duration_ms)}
- ${report.classify_sha_note}

## By Domain
| Domain | Pass Rate | Routing Accuracy | Avg Score |
|---|---|---|---|
${rows.join("\n")}

## Failure Patterns
${failureLines}

## Pastor Learning
${learnLine}
- Pastor delta: **N/A** — no trained adapter on disk yet; samples are staged for the first manual distill cycle. No delta is claimed (would be fabricated).

## Honest Caveats
- N=1 cohort (Paulo's machine).
- Synthetic questions INSPIRED BY the public CCA-F rubric — NOT official Anthropic exam questions, and never copies of protected ones (each question cites the public objective it models).
- LLM self-judge (Sonnet) — bias present; an LLM grading output is a proxy, not ground truth.
- Pastor LoRA not yet community-trained; routing here is classify.js (frozen) + Pastor adapter signal (currently baseline, no adapter materialised).

## Methodology
See \`packages/mooter-bench/README.md\`. Reproduce with: \`mooter cca-f audit --seed ${report.seed}\` (same seed ⇒ same 60 questions).
`;
}

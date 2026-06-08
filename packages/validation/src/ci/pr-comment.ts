// Formats the MLWR delta as a GitHub PR comment (Wave 30 Phase F).

import type { BenchmarkSummary } from "../types.ts";
import type { RegressionResult } from "./regression-detect.ts";

export const PR_COMMENT_MARKER = "<!-- mooter-benchmark-mlwr -->";

export function formatPrComment(
  base: BenchmarkSummary,
  cur: BenchmarkSummary,
  reg: RegressionResult,
): string {
  const verdict = reg.regressed
    ? `🔴 **MLWR regression** — \`${reg.worstTier}\` dropped past the ${reg.thresholdPp}pp gate. Merge blocked.`
    : `🟢 **No MLWR regression** (gate ${reg.thresholdPp}pp).`;

  const rows = [...reg.perTier, reg.overall].map((d) => {
    const arrow = d.deltaPp > 0 ? "▲" : d.deltaPp < 0 ? "▼" : "■";
    const sign = d.deltaPp >= 0 ? "+" : "";
    const flag = d.regressed ? " ⚠️" : "";
    return `| ${d.tier} | ${d.basePct}% | ${d.curPct}% | ${arrow} ${sign}${d.deltaPp}pp${flag} |`;
  });

  return [
    PR_COMMENT_MARKER,
    `### 🐮 Mooter Benchmark — MLWR delta`,
    ``,
    verdict,
    ``,
    `| Tier | baseline | current | Δ |`,
    `|------|----------|---------|---|`,
    ...rows,
    ``,
    `_baseline ${base.runs} runs · current ${cur.runs} runs · MLWR = Mooter Locality Win Rate (local-or-cheaper tier meets the quality bar)._`,
  ].join("\n");
}

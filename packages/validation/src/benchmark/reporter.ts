// Benchmark reporter (Wave 30 Phase L) — JSONL + Markdown + chart spec.

import type { RunResult } from "./runner.ts";
import type { MlwrReport } from "./mlwr.ts";
import { TIERS, type MlwrByTier } from "../types.ts";

export function toResultsJsonl(results: RunResult[]): string {
  return results
    .map((r) =>
      JSON.stringify({
        taskId: r.taskId,
        segment: r.segment,
        tier: r.tier,
        model: r.model,
        modelKind: r.modelKind,
        run: r.run,
        pass: r.pass,
        costUsd: Math.round((r.costUsd || 0) * 1e6) / 1e6,
        latencyMs: Math.round(r.latencyMs),
        gradeReason: r.gradeReason,
        error: r.error ?? null,
        // truncate text to keep the artifact reviewable
        text: (r.text ?? "").slice(0, 400),
      }),
    )
    .join("\n");
}

function pct(x: number): number {
  return Math.round(x * 1000) / 10;
}

export interface ReportMeta {
  generatedAt: string;
  models: string[];
  runsPerTask: number;
  tasksCount: number;
  note?: string;
}

export function toReport(results: RunResult[], report: MlwrReport, meta: ReportMeta): string {
  const errors = results.filter((r) => r.error);
  const byModel = new Map<string, { pass: number; total: number; cost: number }>();
  for (const r of results) {
    const e = byModel.get(r.model) ?? { pass: 0, total: 0, cost: 0 };
    e.total++;
    if (r.pass) e.pass++;
    e.cost += r.costUsd || 0;
    byModel.set(r.model, e);
  }

  const lines: string[] = [
    `# Mooter Showcase Benchmark v2 — Report`,
    ``,
    `Generated: ${meta.generatedAt}`,
    `Tasks: ${meta.tasksCount} · models: ${meta.models.join(", ")} · runs/task: ${meta.runsPerTask}`,
    meta.note ? `\n> ${meta.note}` : "",
    ``,
    `## MLWR (Mooter Locality Win Rate) — local routed model meets the objective bar`,
    ``,
    `| Tier | pass | total | MLWR |`,
    `|------|------|-------|------|`,
    ...TIERS.map((t) => `| ${t} | ${report.perTier[t].pass} | ${report.perTier[t].total} | ${pct(report.mlwr[t])}% |`),
    `| **overall** | — | ${report.runs} | **${pct(report.mlwr.overall)}%** |`,
    ``,
    `Local cost: $${report.localCostUsd.toFixed(4)} · cloud cost: $${report.cloudCostUsd.toFixed(4)}`,
    ``,
    `## Per-model pass rate`,
    ``,
    `| Model | pass | total | rate | cost |`,
    `|-------|------|-------|------|------|`,
    ...[...byModel.entries()].map(
      ([m, e]) => `| ${m} | ${e.pass} | ${e.total} | ${pct(e.total ? e.pass / e.total : 0)}% | $${e.cost.toFixed(4)} |`,
    ),
    ``,
    `## Reliability`,
    ``,
    `- total runs: ${results.length}`,
    `- errors/skips: ${errors.length}${errors.length ? ` (${[...new Set(errors.map((e) => (e.error ?? "").split(":")[0]))].join(", ")})` : ""}`,
    ``,
  ];
  return lines.filter((l) => l !== "").join("\n") + "\n";
}

/** Minimal Vega-Lite-style spec for the MLWR-by-tier hero chart. */
export function toChartSpec(mlwr: MlwrByTier): object {
  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    description: "Mooter MLWR by tier",
    data: { values: TIERS.map((t) => ({ tier: t, mlwr: pct(mlwr[t]) })) },
    mark: "bar",
    encoding: {
      x: { field: "tier", type: "ordinal" },
      y: { field: "mlwr", type: "quantitative", title: "MLWR %", scale: { domain: [0, 100] } },
    },
  };
}

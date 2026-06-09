// Wave 34 — markdown report writer for `mooter audit fan-out`.
//
// `renderMarkdown` is pure (no I/O) so it's testable without touching disk;
// `writeReport`/`writeReportAt` are the only functions that write.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { FanOutReport } from "./orchestrator.ts";

export interface ReportMeta {
  facetsRequested: string[];
}

export function renderMarkdown(report: FanOutReport, meta: ReportMeta): string {
  const dur = ((report.finishedAtMs - report.startedAtMs) / 1000).toFixed(1);
  const lines: string[] = [];
  lines.push("# Mooter Audit — fan-out");
  lines.push("");
  lines.push(`- facets: ${meta.facetsRequested.join(", ")}`);
  lines.push(`- local workers: ${report.localCount} · cloud calls: ${report.cloudCount} · concurrency: ${report.concurrency}`);
  lines.push(`- total cost: $${report.totalCostUsd.toFixed(4)}${report.cloudCount === 0 ? " (local-only — free)" : ""}`);
  lines.push(`- duration: ${dur}s`);
  lines.push("");
  for (const f of report.facets) {
    lines.push(`## ${f.facet}  ·  ${f.sources} source(s)  ·  ${f.backend}/${f.model}`);
    lines.push("");
    lines.push(f.ok ? (f.text.trim() || "(empty finding)") : `⚠️ no finding — ${f.error}`);
    lines.push("");
  }
  lines.push("## Synthesis");
  lines.push("");
  lines.push(
    report.synthesis
      ? report.synthesis.trim()
      : "_(skipped — local-only run; pass `--max-cost <usd>` to enable a single cloud synthesis)_",
  );
  lines.push("");
  return lines.join("\n");
}

/** Default report path: <root>/audit/fan_out_<filesystem-safe-ts>.md */
export function reportPath(root: string, nowMs: number): string {
  const ts = new Date(nowMs).toISOString().replace(/[:.]/g, "-");
  return join(root, "audit", `fan_out_${ts}.md`);
}

/** Write the report to an explicit path (mkdir -p its dir). Returns the path. */
export function writeReportAt(path: string, report: FanOutReport, meta: ReportMeta): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, renderMarkdown(report, meta), "utf8");
  return path;
}

/** Write to the default <root>/audit/fan_out_<ts>.md. Returns the path. */
export function writeReport(root: string, report: FanOutReport, meta: ReportMeta, nowMs: number): string {
  return writeReportAt(reportPath(root, nowMs), report, meta);
}

// Wave 34 — `mooter audit` CLI surface (subcommand: fan-out).
//
// Thin handler: arg parsing + facet selection + the fan-out + the report write.
// Self-contained (no @mooter/workflow import) so the zero-runtime-deps CLI stays
// load-safe. Everything is injectable (root, worker, io, nowMs) so tests run
// with zero network and zero filesystem writes outside a temp dir.

import type { CmdResult } from "./trail.ts";
import { selectFacets, FACET_NAMES, type FacetIO } from "../audit/facets.ts";
import { runFanOut, type WorkerFn } from "../audit/orchestrator.ts";
import { writeReport, writeReportAt } from "../audit/report.ts";

export const AUDIT_USAGE = `mooter audit — parallel local-first codebase audit

Usage:
  mooter audit fan-out [--facets <csv>] [--max-cost <usd>] [--concurrency <n>]
                       [--model <m>] [--out <path>] [--json] [--no-write] [--strict]

Facets (default: all): ${FACET_NAMES.join(", ")}

Each facet probes a slice of the repo (read-only) and sends the evidence to a
FREE local Ollama worker, all in parallel. With --max-cost > 0 a single cloud
synthesis call summarizes the findings. Writes audit/fan_out_<ts>.md by default.`;

interface Parsed {
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(rest: string[]): Parsed {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

export interface AuditDeps {
  /** Repo root (default process.cwd()). */
  root?: string;
  /** Injected clock (default Date.now()). */
  nowMs?: number;
  /** Injected worker (tests). */
  worker?: WorkerFn;
  /** Injected facet IO (tests). */
  io?: FacetIO;
}

export async function runAudit(args: string[], deps: AuditDeps = {}): Promise<CmdResult> {
  const { positional, flags } = parseArgs(args);
  const sub = positional[0];

  if (!sub || sub === "help" || flags.help) {
    return { exitCode: 0, output: AUDIT_USAGE };
  }
  if (sub !== "fan-out") {
    return { exitCode: 1, output: `Unknown subcommand "${sub}".\n\n${AUDIT_USAGE}` };
  }

  const { facets, unknown } = selectFacets(typeof flags.facets === "string" ? flags.facets : undefined);
  if (unknown.length) {
    return { exitCode: 1, output: `Unknown facet(s): ${unknown.join(", ")}. Valid: ${FACET_NAMES.join(", ")}` };
  }

  const root = deps.root ?? process.cwd();
  const nowMs = deps.nowMs ?? Date.now();
  const rawCost = typeof flags["max-cost"] === "string" ? Number(flags["max-cost"]) : 0;
  const maxCostUsd = Number.isFinite(rawCost) && rawCost > 0 ? rawCost : 0;
  const concurrency = typeof flags.concurrency === "string" ? Math.max(1, Number(flags.concurrency) || 4) : 4;

  const report = await runFanOut({
    root,
    facets,
    maxCostUsd,
    model: typeof flags.model === "string" ? flags.model : undefined,
    concurrency,
    io: deps.io,
    worker: deps.worker,
    nowMs,
  });

  const meta = { facetsRequested: facets.map((f) => f.name) };
  let writtenPath: string | null = null;
  if (!flags["no-write"]) {
    writtenPath =
      typeof flags.out === "string" ? writeReportAt(flags.out, report, meta) : writeReport(root, report, meta, nowMs);
  }

  const anyFailed = report.facets.some((f) => !f.ok);
  const exitCode = flags.strict && anyFailed ? 1 : 0;

  if (flags.json) {
    return { exitCode, output: JSON.stringify({ ...report, reportPath: writtenPath }, null, 2) };
  }

  const okCount = report.facets.filter((f) => f.ok).length;
  const out: string[] = [];
  out.push(`🐮 mooter audit fan-out — ${report.facets.length} facet(s), ${okCount} ok`);
  out.push(`   local ${report.localCount} · cloud ${report.cloudCount} · $${report.totalCostUsd.toFixed(4)}${report.cloudCount === 0 ? " (free)" : ""}`);
  for (const f of report.facets) {
    out.push(`   ${f.ok ? "✓" : "⚠"} ${f.facet}${f.ok ? "" : ` — ${f.error}`}`);
  }
  if (writtenPath) out.push(`   report → ${writtenPath}`);
  return { exitCode, output: out.join("\n") };
}

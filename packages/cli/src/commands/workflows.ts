// `mooter workflows` — mirror of CC native /workflows (Wave 58 Phase D).
//
// Lists running + completed workflow runs by reading the lightweight JSON
// files in ~/.mooter/workflows/:
//
//   active-run.json       — live pointer written by the workflow engine
//   <run-id>.json         — optional JSON sidecar written on completion
//
// The SQLite store (state.db) is the authoritative history source, but it
// requires better-sqlite3 (a native dep). Since the CLI must stay load-safe
// with zero native deps, this command reads only JSON files — honest, no
// fabrication. If state.db grows and JSON sidecars are absent, a note is
// shown pointing to `mooter workflow list` (which loads the engine lazily).
//
// Pure core (no I/O side effects): readWorkflowsDir() + buildWorkflowsOutput()
// are exported for tests. IO is injectable (the `io` seam).

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { CmdResult } from "./trail.ts";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorkflowEntry {
  run_id: string;
  workflow_name?: string;
  status: string;
  ts_start?: number;
  ts_end?: number;
  ts?: number;               // active-run.json live timestamp
  agents_done?: number;
  agents_total?: number;
  phase?: number;
  num_phases?: number;
  actual_cost_usd?: number;
  estimated_savings_usd?: number;
  /** Source file for tracing. */
  _source?: string;
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

function mooterWorkflowsDir(home?: string): string {
  return join(home ?? homedir(), ".mooter", "workflows");
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normaliseEntry(obj: Record<string, unknown>, source: string): WorkflowEntry | null {
  if (!obj || typeof obj !== "object") return null;
  const runId = String(obj.run_id || obj.workflow_name || "").trim();
  if (!runId) return null;
  const entry: WorkflowEntry = {
    run_id: runId,
    status: String(obj.status || "unknown"),
    _source: source,
  };
  if (obj.workflow_name != null) entry.workflow_name = String(obj.workflow_name);
  if (obj.ts_start != null) entry.ts_start = Number(obj.ts_start);
  if (obj.ts_end != null) entry.ts_end = Number(obj.ts_end);
  if (obj.ts != null) entry.ts = Number(obj.ts);
  if (obj.agents_done != null) entry.agents_done = Number(obj.agents_done);
  if (obj.agents_total != null) entry.agents_total = Number(obj.agents_total);
  if (obj.phase != null) entry.phase = Number(obj.phase);
  if (obj.num_phases != null) entry.num_phases = Number(obj.num_phases);
  if (obj.actual_cost_usd != null) entry.actual_cost_usd = Number(obj.actual_cost_usd);
  if (obj.estimated_savings_usd != null) entry.estimated_savings_usd = Number(obj.estimated_savings_usd);
  return entry;
}

/** Read JSON files in ~/.mooter/workflows/ and return normalised entries.
 *  Pure (takes dir path, no IO side effects of its own — callers provide the
 *  actual fs reads via the injected `readFile` / `listDir` helpers). */
export function readWorkflowsDir(opts: {
  dir: string;
  readFile: (p: string) => string | null;
  listDir: (p: string) => string[] | null;
}): WorkflowEntry[] {
  const { dir, readFile, listDir } = opts;

  const entries: WorkflowEntry[] = [];
  const seen = new Set<string>();

  // 1. active-run.json — always first (most current).
  const activeRaw = readFile(join(dir, "active-run.json"));
  if (activeRaw) {
    const parsed = tryParseJson(activeRaw);
    if (parsed && typeof parsed === "object") {
      const e = normaliseEntry(parsed as Record<string, unknown>, "active-run.json");
      if (e) {
        entries.push(e);
        seen.add(e.run_id);
      }
    }
  }

  // 2. Any other *.json sidecars (completed records, oldest first).
  const files = listDir(dir);
  if (files) {
    const sidecars = files
      .filter((f) => f.endsWith(".json") && f !== "active-run.json")
      .sort(); // lexicographic = roughly chronological for timestamp-prefixed names
    for (const f of sidecars) {
      const raw = readFile(join(dir, f));
      if (!raw) continue;
      const parsed = tryParseJson(raw);
      if (!parsed || typeof parsed !== "object") continue;
      const e = normaliseEntry(parsed as Record<string, unknown>, f);
      if (e && !seen.has(e.run_id)) {
        entries.push(e);
        seen.add(e.run_id);
      }
    }
  }

  return entries;
}

// ── Formatting helpers ────────────────────────────────────────────────────────

const STALE_MS = 6 * 60 * 60 * 1000; // 6h — same constant as workflow-status.js

function isStale(entry: WorkflowEntry, now: number): boolean {
  const ts = entry.ts ?? entry.ts_start;
  return ts !== undefined && now - ts > STALE_MS;
}

function effectiveStatus(entry: WorkflowEntry, now: number): string {
  if (entry.status === "running" && isStale(entry, now)) return "stale";
  return entry.status;
}

function fmtTimestamp(ts: number | undefined): string {
  if (ts == null) return "?";
  try {
    return new Date(ts).toLocaleString("en-GB", { hour12: false });
  } catch {
    return String(ts);
  }
}

function fmtCost(usd: number | undefined): string {
  if (usd == null) return "";
  return ` · $${usd.toFixed(4)}`;
}

function fmtAgents(entry: WorkflowEntry): string {
  const done = entry.agents_done;
  const total = entry.agents_total;
  if (done == null && total == null) return "";
  const parts: string[] = [];
  if (done != null && total != null) parts.push(`${done}/${total} agents`);
  else if (total != null) parts.push(`${total} agents`);
  if (entry.num_phases != null && entry.num_phases > 0) {
    parts.push(`phase ${entry.phase ?? 1}/${entry.num_phases}`);
  }
  return parts.length ? ` · ${parts.join(" · ")}` : "";
}

function renderRow(entry: WorkflowEntry, now: number): string {
  const status = effectiveStatus(entry, now);
  const statusGlyph =
    status === "running"    ? "🔄" :
    status === "completed"  ? "✅" :
    status === "failed"     ? "❌" :
    status === "cancelled"  ? "⏹" :
    status === "stale"      ? "⚠" :
    "·";
  const name = entry.workflow_name ?? entry.run_id;
  const ts = fmtTimestamp(entry.ts ?? entry.ts_start);
  const agents = fmtAgents(entry);
  const cost = fmtCost(entry.actual_cost_usd);
  return `  ${statusGlyph}  ${status.padEnd(10)}  ${name.padEnd(28)}  ${ts}${agents}${cost}`;
}

function renderDetail(entry: WorkflowEntry, now: number): string {
  const status = effectiveStatus(entry, now);
  const lines: string[] = [
    `mooter workflows · ${entry.workflow_name ?? entry.run_id}`,
    ``,
    `  run_id       ${entry.run_id}`,
    `  status       ${status}`,
  ];
  if (entry.workflow_name) lines.push(`  name         ${entry.workflow_name}`);
  if (entry.ts_start != null) lines.push(`  started      ${fmtTimestamp(entry.ts_start)}`);
  if (entry.ts_end != null)   lines.push(`  ended        ${fmtTimestamp(entry.ts_end)}`);
  if (entry.ts != null && entry.ts_start == null) lines.push(`  last_seen    ${fmtTimestamp(entry.ts)}`);
  if (entry.agents_done != null || entry.agents_total != null) {
    lines.push(`  agents       ${entry.agents_done ?? "?"}/${entry.agents_total ?? "?"}`);
  }
  if (entry.phase != null && entry.num_phases != null) {
    lines.push(`  phase        ${entry.phase}/${entry.num_phases}`);
  }
  if (entry.actual_cost_usd != null) {
    lines.push(`  cost         $${entry.actual_cost_usd.toFixed(4)}`);
  }
  if (entry.estimated_savings_usd != null) {
    lines.push(`  saved        $${entry.estimated_savings_usd.toFixed(2)}`);
  }
  lines.push(`  source       ${entry._source ?? "unknown"}`);
  return lines.join("\n");
}

// ── Pure output builder (exported for tests) ──────────────────────────────────

export interface WorkflowsOptions {
  entries: WorkflowEntry[];
  name?: string;       // detail mode: find entry by run_id or workflow_name
  json?: boolean;
  now?: number;
}

export function buildWorkflowsOutput(opts: WorkflowsOptions): CmdResult {
  const now = opts.now ?? Date.now();
  const { entries, name, json } = opts;

  // Detail mode: `mooter workflows <name>`.
  if (name) {
    const found = entries.find(
      (e) => e.run_id === name || e.workflow_name === name,
    );
    if (!found) {
      return {
        exitCode: 1,
        output: `mooter workflows: no workflow run named or identified as '${name}'`,
      };
    }
    if (json) {
      return { exitCode: 0, output: JSON.stringify(found, null, 2) };
    }
    return { exitCode: 0, output: renderDetail(found, now) };
  }

  // List mode.
  if (json) {
    return { exitCode: 0, output: JSON.stringify(entries, null, 2) };
  }

  if (entries.length === 0) {
    return {
      exitCode: 0,
      output: [
        "mooter workflows — no workflow runs found",
        "",
        "  Workflow runs appear here once you start one:",
        "    mooter workflow run <name>",
        "",
        "  Historical runs (in ~/.mooter/workflows/state.db) are accessible via:",
        "    mooter workflow list",
      ].join("\n"),
    };
  }

  const header = `mooter workflows  (${entries.length} run${entries.length === 1 ? "" : "s"})`;
  const divider = "  " + "─".repeat(72);
  const rows = entries.map((e) => renderRow(e, now));
  const footer = [
    "",
    "  Detail:   mooter workflows <name>",
    "  Live:     mooter workflows --tail",
    "  History:  mooter workflow list   (requires engine / native deps)",
  ].join("\n");
  return {
    exitCode: 0,
    output: [header, divider, ...rows, footer].join("\n"),
  };
}

// ── Arg parsing ───────────────────────────────────────────────────────────────

interface Parsed {
  name?: string;
  json: boolean;
  tail: boolean;
  help: boolean;
}

function parseArgs(args: string[]): Parsed {
  const positional = args.filter((a) => !a.startsWith("--"));
  return {
    name: positional[0],
    json: args.includes("--json"),
    tail: args.includes("--tail"),
    help: args.includes("--help") || args.includes("-h"),
  };
}

// ── IO seam (injectable for tests) ───────────────────────────────────────────

export interface WorkflowsIO {
  home(): string;
  readFile(p: string): string | null;
  listDir(p: string): string[] | null;
  /** Write a line to stdout (used by --tail). */
  write(s: string): void;
  /** Sleep ms (used by --tail poll). */
  sleep(ms: number): Promise<void>;
  /** Return true to stop the --tail loop (used by tests). */
  shouldStop(): boolean;
}

function defaultIO(): WorkflowsIO {
  return {
    home: () => homedir(),
    readFile(p) {
      try { return readFileSync(p, "utf8"); } catch { return null; }
    },
    listDir(p) {
      try { return readdirSync(p); } catch { return null; }
    },
    write(s) { process.stdout.write(s); },
    sleep(ms) { return new Promise<void>((r) => setTimeout(r, ms)); },
    shouldStop() { return false; },
  };
}

// ── Main entry ────────────────────────────────────────────────────────────────

const USAGE = `mooter workflows — list running and completed workflow runs

Usage:
  mooter workflows             list all known runs (active + JSON sidecars)
  mooter workflows <name>      detail view for a run (run_id or workflow_name)
  mooter workflows --tail      poll active-run.json and print updates (best-effort)
  mooter workflows --json      machine-readable JSON output

Data source: ~/.mooter/workflows/active-run.json (live) + *.json sidecars.
Historical runs in state.db require: mooter workflow list`;

const TAIL_INTERVAL_MS = 2000;

export async function runWorkflows(args: string[], _io?: WorkflowsIO): Promise<CmdResult> {
  const io = _io ?? defaultIO();
  const { name, json, tail, help } = parseArgs(args);

  if (help) {
    return { exitCode: 0, output: USAGE };
  }

  const dir = mooterWorkflowsDir(io.home());

  // --tail: poll active-run.json every 2 s until it disappears or is stale.
  if (tail) {
    // Note: --tail has no live stream API — it polls the file.
    // If --json is also set, each frame is emitted as a JSON line.
    let lastId: string | null = null;
    let iterations = 0;

    // do-while: always run at least one frame so the caller sees a result
    // immediately (avoids a blank output when --tail is used with tests that
    // set shouldStop() = true before the first check).
    do {
      const entries = readWorkflowsDir({ dir, readFile: io.readFile, listDir: io.listDir });
      const active = entries.find((e) => e.status === "running");

      if (!active) {
        if (iterations === 0) {
          io.write("mooter workflows --tail: no active workflow run found.\n");
          io.write("Start one with: mooter workflow run <name>\n");
        } else {
          io.write("mooter workflows --tail: run finished or pointer gone.\n");
        }
        break;
      }

      if (active.run_id !== lastId) {
        lastId = active.run_id;
      }

      if (json) {
        io.write(JSON.stringify(active) + "\n");
      } else {
        const agents = active.agents_done != null && active.agents_total != null
          ? `${active.agents_done}/${active.agents_total} agents`
          : "";
        const phase = active.num_phases != null
          ? ` · phase ${active.phase ?? 1}/${active.num_phases}`
          : "";
        io.write(`\r🔄 ${active.workflow_name ?? active.run_id}${phase}${agents ? " · " + agents : ""}  `);
      }

      iterations++;
      await io.sleep(TAIL_INTERVAL_MS);
    } while (!io.shouldStop());

    return { exitCode: 0, output: "" };
  }

  // Normal: load + render.
  const entries = readWorkflowsDir({ dir, readFile: io.readFile, listDir: io.listDir });
  return buildWorkflowsOutput({ entries, name, json });
}

// `mooter agents` — interactive list of the live/recent sub-agent herd (Wave 58
// batch 3, Phase B). Mirrors the Claude Code dynamic-workflows UX: an arrow-key
// list of agents you can drill into, plus a non-interactive `--json` path and a
// `mooter agents stats` view (avg duration per agent type from A.10 heartbeats).
//
// Design (copying explain.ts / workflow.ts / dashboard.ts conventions):
//   - CmdResult ({ exitCode, output }) — the only contract the index + tests use.
//   - LAZY data import: the CommonJS source modules (subagent_tracker.js,
//     agents-progress-status.js) are required INSIDE the handler, never at the
//     top level, so the zero-runtime-deps CLI bundle + the other commands' tests
//     stay load-safe.
//   - INJECTABLE IO: every side effect (data source, clock, writer, raw-mode TTY
//     loop) is behind an option so the --json + stats paths are pure and tested
//     WITHOUT driving raw-mode stdin (dashboard.ts drives the real loop; tests
//     never do).
//
// Anti-fabrication (Doctrine V4 #5): every number rendered comes from a REAL
// source field — subagent_tracker's cumulative {count,total_ms,avg_ms,errors} and
// the A.10 heartbeat {task_category, phases[], actual_total_duration_ms}. When a
// source is absent we render an honest 'no data' / '?' — never an invented score,
// cost, or duration. No model/tier/savings is shown for an agent unless its real
// record carries it.

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CmdResult } from "./trail.ts";

// CommonJS source modules (tools/router/*.js) are resolved via createRequire so
// the ESM CLI (tsx) can load them; bare `require` is undefined under ESM. Paths
// resolve relative to this file: packages/cli/src/commands → ../../../../tools/router.
const _here = dirname(fileURLToPath(import.meta.url));
const _req = createRequire(import.meta.url);
function _routerPath(name: string): string {
  return join(_here, "..", "..", "..", "..", "tools", "router", name);
}

// ── shapes (mirror the real CommonJS sources; kept structural, not imported) ──

/** One active in-flight subagent record (subagent_tracker snapshot().active[]). */
export interface ActiveAgent {
  spawn_id?: string;
  agent_name: string;
  tier?: string | null;
  model?: string | null;
  local?: boolean;
  started_at?: number;
}

/** One cumulative agent-class record (subagent_tracker snapshot().cumulative[]). */
export interface CumulativeAgent {
  agent_name: string;
  count: number;
  total_ms: number;
  avg_ms: number;
  errors: number;
  local: boolean;
  model?: string | null;
  tier?: string | null;
}

/** Read-only herd view — the subset of subagent_tracker.snapshot() we render. */
export interface HerdSnapshot {
  active_count: number;
  active_local: number;
  active_cloud: number;
  active: ActiveAgent[];
  peak_concurrent: number;
  cumulative: CumulativeAgent[];
}

/** Live active-run pointer, normalised (agents-progress-status.readActiveWorkflow). */
export interface ActiveWorkflow {
  id: string;
  done: number;
  total: number;
  tokens: number;
  status: string;
  ts: number | null;
}

/** A.10 heartbeat phase. */
export interface HeartbeatPhase {
  phase_name: string;
  started_ms: number;
  completed_ms?: number;
}

/** A.10-extended session heartbeat (only the fields stats reads). */
export interface AgentHeartbeat {
  session_id?: string;
  terminal_name?: string;
  branch?: string | null;
  task_category?: string;
  phases?: HeartbeatPhase[];
  actual_total_duration_ms?: number;
}

/** All data the renderers need, injectable so the pure paths are testable. */
export interface AgentsData {
  snapshot: HerdSnapshot | null;
  workflow: ActiveWorkflow | null;
  heartbeats: AgentHeartbeat[];
}

export interface AgentsOptions {
  /** Pre-resolved data (tests inject this; the live CLI lazy-loads it). */
  data?: AgentsData;
  /** Filter to only currently-running agents. */
  running?: boolean;
  /** Filter to a single workflow/run id. */
  workflow?: string;
  /** Non-interactive structured output. */
  json?: boolean;
  /** Subcommand: undefined = list, "stats" = duration report. */
  sub?: string;
  /** Injectable clock for elapsed/age math. */
  now?: () => number;
  /** Self session id (so we can scope the herd snapshot read). */
  sessionId?: string;
  /** Injectable interactive runner; the default drives raw-mode stdin. */
  interactive?: (rows: AgentRow[], data: AgentsData, now: number) => Promise<CmdResult>;
}

// ── per-LLM emoji (lazy CommonJS require; never fabricates) ───────────────────

type EmojiFor = (modelId: string) => { emoji: string; label: string; color: string };

let _emojiFor: EmojiFor | null = null;
function emojiFor(modelId: string | null | undefined): { emoji: string; label: string } {
  if (!_emojiFor) {
    try {
      // Lazy: the map ships as CommonJS in tools/router and must not be pulled
      // into the bundle at import time.
      const mod = _req(_routerPath("llm-emoji-map.js"));
      _emojiFor = mod.emojiForModel as EmojiFor;
    } catch {
      _emojiFor = () => ({ emoji: "🤖", label: "Unknown", color: "gray" });
    }
  }
  const d = _emojiFor(modelId ?? "");
  return { emoji: d.emoji, label: d.label };
}

// ── pure formatting helpers ───────────────────────────────────────────────────

/** Compact elapsed: `9s` · `1m 12s` · `1h 4m` (mirrors agents-progress-status). */
export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const rs = s % 60;
    return rs ? `${m}m ${rs}s` : `${m}m`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** A row in the interactive/JSON list — one per agent (active first, then recent). */
export interface AgentRow {
  /** "active" = in flight now; "recent" = a completed cumulative class. */
  state: "active" | "recent";
  agent_name: string;
  emoji: string;
  family: string;
  model: string | null;
  tier: string | null;
  local: boolean;
  /** Elapsed for active rows; null for recent. */
  elapsed_ms: number | null;
  /** Count for recent rows (how many ran); null for active. */
  count: number | null;
  /** Avg duration for recent rows; null when unknown. */
  avg_ms: number | null;
  errors: number | null;
}

/**
 * Build the agent rows from a herd snapshot. Active (in-flight) agents come
 * first, sorted oldest-first (longest-running on top); then recent agent classes
 * sorted by count. `running` keeps only active rows. Pure: data + now in, rows out.
 */
export function buildRows(data: AgentsData, now: number, opts: { running?: boolean } = {}): AgentRow[] {
  const snap = data.snapshot;
  const rows: AgentRow[] = [];

  const active = (snap?.active ?? []).filter((a) => a && a.agent_name);
  active.sort((a, b) => (a.started_at ?? 0) - (b.started_at ?? 0));
  for (const a of active) {
    const e = emojiFor(a.model);
    rows.push({
      state: "active",
      agent_name: a.agent_name,
      emoji: e.emoji,
      family: e.label,
      model: a.model ?? null,
      tier: a.tier ?? null,
      local: !!a.local,
      elapsed_ms: typeof a.started_at === "number" ? Math.max(0, now - a.started_at) : null,
      count: null,
      avg_ms: null,
      errors: null,
    });
  }

  if (!opts.running) {
    const cumulative = (snap?.cumulative ?? []).filter((c) => c && c.agent_name);
    for (const c of cumulative) {
      const e = emojiFor(c.model);
      rows.push({
        state: "recent",
        agent_name: c.agent_name,
        emoji: e.emoji,
        family: e.label,
        model: c.model ?? null,
        tier: c.tier ?? null,
        local: !!c.local,
        elapsed_ms: null,
        count: c.count,
        // total_ms can be 0 (no real duration captured) → avg unknown, not 0.
        avg_ms: c.count > 0 && c.total_ms > 0 ? Math.round(c.total_ms / c.count) : null,
        errors: c.errors ?? 0,
      });
    }
  }

  return rows;
}

/** One-line render of a row for the list view. */
export function renderRow(r: AgentRow, selected: boolean): string {
  const cursor = selected ? "›" : " ";
  const where = r.local ? "🏠" : "☁";
  const head = `${cursor} ${r.emoji} ${r.agent_name}`.padEnd(34);
  if (r.state === "active") {
    const el = r.elapsed_ms != null ? fmtDuration(r.elapsed_ms) : "?";
    const model = r.model ? ` · ${r.model}` : "";
    return `${head} ${where} running ${el}${model}`;
  }
  const avg = r.avg_ms != null ? ` · avg ${fmtDuration(r.avg_ms)}` : "";
  const errs = r.errors ? ` · ${r.errors} err` : "";
  return `${head} ${where} ×${r.count}${avg}${errs}`;
}

/** Multi-line detail render for one selected agent. */
export function renderDetail(r: AgentRow): string {
  const lines: string[] = [];
  lines.push(`${r.emoji} ${r.agent_name}  (${r.family})`);
  lines.push(`  state    ${r.state === "active" ? "running now" : "recent (completed)"}`);
  lines.push(`  provider ${r.local ? "🏠 local (Ollama · free)" : "☁ cloud"}`);
  lines.push(`  model    ${r.model ?? "?"}`);
  lines.push(`  tier     ${r.tier ?? "?"}`);
  if (r.state === "active") {
    lines.push(`  elapsed  ${r.elapsed_ms != null ? fmtDuration(r.elapsed_ms) : "?"}`);
  } else {
    lines.push(`  runs     ${r.count ?? "?"}`);
    lines.push(`  avg dur  ${r.avg_ms != null ? fmtDuration(r.avg_ms) : "no data"}`);
    lines.push(`  errors   ${r.errors ?? 0}`);
  }
  return lines.join("\n");
}

// ── --json (pure, testable) ───────────────────────────────────────────────────

export function buildJson(data: AgentsData, now: number, opts: { running?: boolean; workflow?: string } = {}): unknown {
  const rows = buildRows(data, now, { running: opts.running });
  const wf = data.workflow;
  return {
    schema_version: "1.0.0",
    generated_ms: now,
    running_only: !!opts.running,
    workflow_filter: opts.workflow ?? null,
    active_count: data.snapshot?.active_count ?? 0,
    peak_concurrent: data.snapshot?.peak_concurrent ?? 0,
    workflow: wf
      ? { id: wf.id, status: wf.status, done: wf.done, total: wf.total, tokens: wf.tokens || null }
      : null,
    agents: rows,
  };
}

// ── stats (pure, testable) — avg duration per agent type from A.10 heartbeats ──

export interface CategoryStat {
  task_category: string;
  samples: number;
  /** null when no heartbeat carried a real duration → honest 'no data'. */
  avg_ms: number | null;
}

/**
 * Aggregate avg duration per agent type (task_category) from A.10 heartbeats.
 * A sample contributes a duration when the heartbeat has a real
 * actual_total_duration_ms, OR when its phases carry started_ms+completed_ms we
 * can sum. A category with samples but no measurable duration reports avg_ms:null
 * (honest 'no data'), never a fabricated 0.
 */
export function computeStats(heartbeats: AgentHeartbeat[]): CategoryStat[] {
  const acc = new Map<string, { samples: number; totalMs: number; measured: number }>();
  for (const hb of heartbeats ?? []) {
    if (!hb) continue;
    const cat = (typeof hb.task_category === "string" && hb.task_category.trim()) || "uncategorised";
    const dur = heartbeatDuration(hb);
    const cur = acc.get(cat) ?? { samples: 0, totalMs: 0, measured: 0 };
    cur.samples += 1;
    if (dur != null) {
      cur.totalMs += dur;
      cur.measured += 1;
    }
    acc.set(cat, cur);
  }
  return [...acc.entries()]
    .map(([task_category, v]) => ({
      task_category,
      samples: v.samples,
      avg_ms: v.measured > 0 ? Math.round(v.totalMs / v.measured) : null,
    }))
    .sort((a, b) => b.samples - a.samples || a.task_category.localeCompare(b.task_category));
}

/** Real duration for one heartbeat: actual_total_duration_ms, else summed phases, else null. */
export function heartbeatDuration(hb: AgentHeartbeat): number | null {
  if (Number.isFinite(hb.actual_total_duration_ms) && (hb.actual_total_duration_ms as number) > 0) {
    return hb.actual_total_duration_ms as number;
  }
  const phases = Array.isArray(hb.phases) ? hb.phases : [];
  let sum = 0;
  let any = false;
  for (const p of phases) {
    if (p && Number.isFinite(p.started_ms) && Number.isFinite(p.completed_ms as number)) {
      const d = (p.completed_ms as number) - p.started_ms;
      if (d > 0) {
        sum += d;
        any = true;
      }
    }
  }
  return any ? sum : null;
}

export function renderStats(stats: CategoryStat[]): string {
  if (stats.length === 0) {
    return "🐄 mooter agents stats\n\n  no data — no A.10 heartbeats with task timings found yet.\n  (Stats fill in as multi-agent workflow runs record per-task heartbeats.)";
  }
  const lines = ["🐄 mooter agents stats — avg duration per agent type (A.10 heartbeats)", ""];
  for (const s of stats) {
    const avg = s.avg_ms != null ? fmtDuration(s.avg_ms) : "no data";
    const noun = s.samples === 1 ? "sample" : "samples";
    lines.push(`  ${s.task_category.padEnd(22)} avg ${avg.padEnd(10)} (${s.samples} ${noun})`);
  }
  lines.push("");
  lines.push("  'no data' = the heartbeats for that type carried no measurable duration (never invented).");
  return lines.join("\n");
}

// ── list render (non-interactive frame, also used as the interactive frame) ───

export function renderList(rows: AgentRow[], data: AgentsData, selectedIdx: number, opts: { running?: boolean; interactive?: boolean } = {}): string {
  const lines: string[] = [];
  const wf = data.workflow;
  const header = opts.running ? "🐄 mooter agents — running now" : "🐄 mooter agents";
  lines.push(header);
  if (wf) {
    const tot = wf.total > 0 ? `${wf.done}/${wf.total}` : wf.status;
    lines.push(`   workflow ${wf.id} · ${tot}`);
  }
  lines.push("");
  if (rows.length === 0) {
    lines.push(opts.running ? "  (no agents running right now)" : "  (no active or recent agents yet)");
  } else {
    rows.forEach((r, i) => lines.push(renderRow(r, opts.interactive ? i === selectedIdx : false)));
  }
  if (opts.interactive) {
    lines.push("");
    lines.push("  ↑/↓ select · Enter detail · q quit");
  }
  return lines.join("\n");
}

// ── live data loaders (lazy CommonJS require; never at module top level) ──────

async function loadData(sessionId: string | undefined, now: number): Promise<AgentsData> {
  let snapshot: HerdSnapshot | null = null;
  let workflow: ActiveWorkflow | null = null;
  let heartbeats: AgentHeartbeat[] = [];

  try {
    const tracker = _req(_routerPath("subagent_tracker.js"));
    const sid = sessionId ?? process.env.CLAUDE_SESSION_ID ?? process.env.MOOTER_SESSION_ID ?? undefined;
    snapshot = tracker.snapshot({ session_id: sid }) as HerdSnapshot;
  } catch {
    snapshot = null;
  }

  try {
    const ap = _req(_routerPath("agents-progress-status.js"));
    workflow = ap.readActiveWorkflow(null, now) as ActiveWorkflow | null;
  } catch {
    workflow = null;
  }

  try {
    heartbeats = loadHeartbeats();
  } catch {
    heartbeats = [];
  }

  return { snapshot, workflow, heartbeats };
}

/** Read A.10 heartbeats from ~/.mooter/orchestration/heartbeats (best-effort). */
function loadHeartbeats(): AgentHeartbeat[] {
  const fs = _req("node:fs") as typeof import("node:fs");
  const path = _req("node:path") as typeof import("node:path");
  const os = _req("node:os") as typeof import("node:os");
  const home = process.env.MOOTER_HOME
    ? path.join(process.env.MOOTER_HOME, "orchestration", "heartbeats")
    : path.join(os.homedir(), ".mooter", "orchestration", "heartbeats");
  let names: string[];
  try {
    names = fs.readdirSync(home).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  const out: AgentHeartbeat[] = [];
  for (const n of names.slice(0, 64)) {
    try {
      out.push(JSON.parse(fs.readFileSync(path.join(home, n), "utf8")) as AgentHeartbeat);
    } catch {
      /* skip unreadable heartbeat */
    }
  }
  return out;
}

// ── default interactive runner (raw-mode stdin; mirrors dashboard.ts) ─────────

function defaultInteractive(rows: AgentRow[], data: AgentsData, now: number): Promise<CmdResult> {
  // Non-TTY (piped / CI): render one static frame and return — never block.
  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    return Promise.resolve({ exitCode: 0, output: renderList(rows, data, 0, { interactive: false }) });
  }
  return new Promise<CmdResult>((resolve) => {
    let selected = 0;
    let mode: "list" | "detail" = "list";
    let done = false;

    const restore = () => {
      try {
        process.stdin.setRawMode?.(false);
        process.stdin.pause();
      } catch {
        /* ignore */
      }
      process.stdout.write("\x1b[?25h\x1b[?1049l");
    };
    const finish = () => {
      if (done) return;
      done = true;
      restore();
      process.off("SIGINT", finish);
      process.off("SIGTERM", finish);
      process.off("exit", restore);
      resolve({ exitCode: 0, output: "" });
    };
    const render = () => {
      process.stdout.write("\x1b[H\x1b[2J");
      const frame = mode === "detail" && rows[selected]
        ? renderDetail(rows[selected]) + "\n\n  ← back (any key) · q quit"
        : renderList(rows, data, selected, { interactive: true });
      process.stdout.write(frame + "\n");
    };

    process.stdout.write("\x1b[?1049h\x1b[?25l");
    process.on("exit", restore);
    process.on("SIGINT", finish);
    process.on("SIGTERM", finish);

    try {
      process.stdin.setRawMode?.(true);
      process.stdin.resume();
      process.stdin.on("data", (d: Buffer) => {
        const k = d.toString();
        if (k === "q" || k === "\x03") return finish();
        if (mode === "detail") {
          mode = "list"; // any key returns to the list
          return render();
        }
        if (k === "\r" || k === "\n") {
          if (rows[selected]) mode = "detail";
        } else if (k === "\x1b[A" || k === "k") {
          selected = Math.max(0, selected - 1);
        } else if (k === "\x1b[B" || k === "j") {
          selected = Math.min(Math.max(0, rows.length - 1), selected + 1);
        }
        render();
      });
    } catch {
      /* non-TTY fallback already handled above */
    }
    render();
  });
}

// ── orchestrator ──────────────────────────────────────────────────────────────

export async function runAgents(opts: AgentsOptions = {}): Promise<CmdResult> {
  const now = (opts.now ?? Date.now)();
  const data = opts.data ?? (await loadData(opts.sessionId, now));

  // `mooter agents stats` — avg duration per agent type from A.10 heartbeats.
  if (opts.sub === "stats") {
    const stats = computeStats(data.heartbeats);
    if (opts.json) {
      return { exitCode: 0, output: JSON.stringify({ schema_version: "1.0.0", generated_ms: now, stats }, null, 2) };
    }
    return { exitCode: 0, output: renderStats(stats) };
  }

  // Optional workflow filter: keep only agents whose run matches (we can only
  // honestly filter by the active run pointer's id — recent classes carry no
  // run id, so a --workflow filter narrows to the active set).
  let scoped = data;
  if (opts.workflow) {
    const wf = data.workflow && data.workflow.id === opts.workflow ? data.workflow : null;
    scoped = { ...data, workflow: wf };
  }

  if (opts.json) {
    return { exitCode: 0, output: JSON.stringify(buildJson(scoped, now, { running: opts.running, workflow: opts.workflow }), null, 2) };
  }

  const rows = buildRows(scoped, now, { running: opts.running });
  const interactive = opts.interactive ?? defaultInteractive;
  return interactive(rows, scoped, now);
}

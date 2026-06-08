// `mooter dashboard` — live TUI of the Mooter's state (Wave 2.6 Day 2).
//
// The statusline gives a 2-line glance; this is the full-screen view. It reads
// the SAME sources as the statusline / `mooter trail` (no invented schema):
//   · Moos active / tier mix          ← decisions.log ("classified" events)
//   · saved $ / saved % / turn $       ← savings-tracker /metrics endpoint
//   · quota 5h / 7d                    ← quota-state.json
//   · ctx %                            ← runtime-only (Claude Code stdin); n/a here
//
// Zero dependencies — raw ANSI only (no blessed/ink/chalk). The pure core,
// `buildDashboard`, returns the frame as a string so dashboard.test.ts drives it
// without a TTY, a tracker, or a session. `runDashboard` is the imperative shell:
// alternate screen + refresh loop + robust cleanup (Ctrl+C / SIGTERM / `q`).

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  decisionsForSession,
  tierMixLast10,
  type DecisionEvent,
  type TrackerMetrics,
} from "./trail.ts";
import { listInstalledPacks, getActivePack } from "../packs.ts";
import { listTaskAdapters } from "../../../synthesis/src/lora/adapter-registry.ts";

export interface CmdResult {
  exitCode: number;
  output: string;
}

export interface DashboardOptions {
  refreshMs?: number;
  sessionId?: string;
  /** Override decisions.log path (tests). */
  decisionsLog?: string;
  /** Override quota-state.json path (tests). */
  quotaPath?: string;
  /** Injected tracker metrics. `undefined` → fetch; `null` → tracker offline. */
  metrics?: TrackerMetrics | null;
  /** Custom metrics fetcher; default GETs the local tracker, null on failure. */
  fetchMetrics?: (sessionId?: string) => Promise<TrackerMetrics | null>;
  /** Pre-supplied event lines (tests); default reads `decisionsLog`. */
  lines?: string[];
  /** Width of the frame (default 64). */
  width?: number;
  /** Override the ~/.mooter root (tests / PACK section). */
  mooterHome?: string;
  // Wave 32 (Phase D) — injectable data for the 4 added widgets (tests bypass I/O).
  /** Pastor v2 task adapters; default reads the synthesis registry. */
  pastorAdapters?: { type: string; name: string }[];
  /** Hardware profile; default reads ~/.mooter/profile.json. `null` → unknown. */
  hardware?: { gpu?: string; vramGb?: number; ramGb?: number; cpuCores?: number } | null;
  /** Recent workflow runs; default empty (runDashboard fills via workflow state). */
  workflowRuns?: { runId: string; status: string; task?: string }[];
  /** Cost-cap limits; default parses ~/.mooter/limits.toml. */
  limits?: Record<string, string | number> | null;
}

const DEFAULT_WIDTH = 64;

/** Mirror of tools/router/paths.js resolution (kept decoupled, like trail.ts). */
function routerDir(): string {
  const claudeDir =
    process.env.MOOTER_CLAUDE_DIR || process.env.FRUGAL_CLAUDE_DIR || join(homedir(), ".claude");
  return join(claudeDir, "tools", "router");
}

function readLines(opts: DashboardOptions): string[] {
  if (opts.lines) return opts.lines;
  const path = opts.decisionsLog ?? join(routerDir(), "decisions.log");
  try {
    return readFileSync(path, "utf8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

interface MooRow {
  glyph: string;
  name: string;
  calls: number;
  lastConf: number | null;
}

/**
 * Glyph by provider/model family — local Moos graze at home (🏠), cloud is ☁.
 * Mirrors `tools/router/glyphs.js` PROVIDER_GLYPHS (the canonical map); the CLI
 * stays decoupled from router internals (same boundary as trail.ts ↔ paths.js),
 * so the values are duplicated deliberately rather than imported across packages.
 */
function mooGlyph(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("opus") || m.includes("sonnet") || m.includes("haiku")) return "☁";
  if (m.includes("codex") || m.includes("gpt") || m.includes("oai")) return "⚡";
  return "🏠"; // local (ollama / qwen / gemma / deepseek / …)
}

/**
 * Group the session's classified events into one row per model, newest-confidence
 * kept. Latency / token columns are intentionally absent — decisions.log carries
 * neither, and the savings-tracker aggregates cost only, not per-Moo timing.
 */
export function aggregateMoos(events: DecisionEvent[]): MooRow[] {
  const byModel = new Map<string, MooRow>();
  for (const e of events) {
    const name = e.recommended_model || (e.tier ? `${e.tier} (model n/a)` : "unknown");
    const row = byModel.get(name) ?? { glyph: mooGlyph(name), name, calls: 0, lastConf: null };
    row.calls++;
    if (typeof e.confidence === "number") row.lastConf = e.confidence;
    byModel.set(name, row);
  }
  return [...byModel.values()].sort((a, b) => b.calls - a.calls);
}

/**
 * Display width of a string in terminal columns. Box alignment uses this instead
 * of `.length` because emoji render two columns wide but count as one (or two)
 * UTF-16 code units. Zero-dep heuristic: codepoints in the emoji/symbol ranges
 * count as 2, everything else (incl. box-drawing and block glyphs) as 1.
 */
export function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    const wide =
      (cp >= 0x1f000) || // emoji & pictographs (🐮 🐄 🏠 …)
      (cp >= 0x2600 && cp <= 0x27bf) || // misc symbols & dingbats (☁ ⚡ …)
      (cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
      (cp >= 0x2e80 && cp <= 0xa4cf) || // CJK
      (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul syllables
      (cp >= 0xf900 && cp <= 0xfaff) || // CJK compat
      (cp >= 0xff00 && cp <= 0xff60); // fullwidth forms
    w += wide ? 2 : 1;
  }
  return w;
}

function padToWidth(s: string, target: number): string {
  const pad = Math.max(0, target - displayWidth(s));
  return s + " ".repeat(pad);
}

export function progressBar(pct: number, width: number): string {
  const p = Math.max(0, Math.min(100, pct));
  const filled = Math.round((p / 100) * width);
  return `[${"█".repeat(filled)}${"░".repeat(width - filled)}]`;
}

export function boxTop(title: string, width: number): string {
  const inner = width - 2;
  const label = ` ${title} `;
  const dashes = Math.max(0, inner - 1 - displayWidth(label));
  return `┌─${label}${"─".repeat(dashes)}┐`;
}

export function boxRow(content: string, width: number): string {
  const inner = width - 2;
  // Trim on display width (emoji = 2 cols) so a wide glyph never overruns.
  let trimmed = content;
  while (displayWidth(trimmed) > inner) trimmed = trimmed.slice(0, -1);
  return `│${padToWidth(trimmed, inner)}│`;
}

export function boxSep(width: number): string {
  return `├${"─".repeat(width - 2)}┤`;
}

export function boxBottom(width: number): string {
  return `└${"─".repeat(width - 2)}┘`;
}

interface Quota {
  h5Pct: number | null;
  d7Pct: number | null;
}

function loadQuota(opts: DashboardOptions): Quota {
  const path = opts.quotaPath ?? join(routerDir(), "quota-state.json");
  const pct = (w: any): number | null => {
    if (w && typeof w.limit === "number" && w.limit > 0) {
      return Math.max(0, Math.min(100, Math.round((1 - (w.tokens_used || 0) / w.limit) * 100)));
    }
    return null;
  };
  try {
    const quota = JSON.parse(readFileSync(path, "utf8"));
    const a = quota?.providers?.anthropic;
    return { h5Pct: pct(a?.window_5h), d7Pct: pct(a?.window_7d ?? a?.window_weekly) };
  } catch {
    return { h5Pct: null, d7Pct: null };
  }
}

function mooterHomeDir(opts: DashboardOptions): string {
  return opts.mooterHome ?? join(homedir(), ".mooter");
}

/** Wave 32 (Phase D) — hardware from ~/.mooter/profile.json (best-effort). */
function loadHardware(opts: DashboardOptions): DashboardOptions["hardware"] {
  if (opts.hardware !== undefined) return opts.hardware;
  try {
    const p = JSON.parse(readFileSync(join(mooterHomeDir(opts), "profile.json"), "utf8"));
    return {
      gpu: p?.gpu?.model,
      vramGb: p?.gpu?.vram_gb,
      ramGb: p?.ram_gb,
      cpuCores: p?.cpu_cores,
    };
  } catch {
    return null;
  }
}

/** Wave 32 (Phase D) — minimal TOML key=value reader for limits.toml (no dep). */
function loadLimits(opts: DashboardOptions): Record<string, string | number> | null {
  if (opts.limits !== undefined) return opts.limits;
  try {
    const txt = readFileSync(join(mooterHomeDir(opts), "limits.toml"), "utf8");
    const out: Record<string, string | number> = {};
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*([a-z0-9_]+)\s*=\s*(.+?)\s*(?:#.*)?$/i);
      if (m && !line.trim().startsWith("#")) {
        const v = m[2].replace(/^["']|["']$/g, "");
        out[m[1]] = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
      }
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

/** Wave 32 (Phase D) — Pastor v2 task adapters from the synthesis registry. */
function loadPastorAdapters(opts: DashboardOptions): { type: string; name: string }[] {
  if (opts.pastorAdapters) return opts.pastorAdapters;
  try {
    return listTaskAdapters().map((a: any) => ({ type: a.task_type ?? a.type ?? "task", name: a.name ?? a.id ?? "adapter" }));
  } catch {
    return [];
  }
}

/**
 * Build the dashboard frame as a string. Pure given its inputs (events + metrics
 * + quota are all injectable), so tests render it with no I/O.
 */
export function buildDashboard(opts: DashboardOptions = {}): string {
  const width = opts.width ?? DEFAULT_WIDTH;
  const sessionId = opts.sessionId ?? process.env.CLAUDE_SESSION_ID;
  const events = decisionsForSession(readLines(opts), sessionId);
  const moos = aggregateMoos(events);
  const metrics = opts.metrics ?? null;
  const quota = loadQuota(opts);
  const barW = 20;

  const out: string[] = [];
  out.push(boxTop(`🐮 Mooter Dashboard · session ${sessionId ? sessionId.slice(0, 8) : "—"}`, width));

  // MOOS ACTIVE — one row per model the Mooter pastored this session.
  out.push(boxRow("  MOOS ACTIVE", width));
  if (moos.length === 0) {
    out.push(boxRow("    (no Moos pastored yet this session)", width));
  } else {
    for (const m of moos) {
      const conf = m.lastConf === null ? "—" : m.lastConf.toFixed(2);
      out.push(boxRow(`    ${m.glyph} ${m.name.padEnd(18)} ${String(m.calls).padStart(3)} calls · conf ${conf}`, width));
    }
  }
  out.push(boxRow(`    ${tierMixLast10(events)}`, width));
  out.push(boxSep(width));

  // SAVINGS — from the tracker (offline → honest "n/a").
  out.push(boxRow("  SAVINGS", width));
  if (metrics) {
    const saved = typeof metrics.saved === "number" ? `$${metrics.saved.toFixed(2)}` : "n/a";
    const pct = typeof metrics.saved_pct === "number" ? `${Math.round(metrics.saved_pct)}%` : "n/a";
    const turn = typeof metrics.last_turn_cost_usd === "number" ? `$${metrics.last_turn_cost_usd.toFixed(2)}` : "n/a";
    const all = typeof metrics.alltime_cost_usd === "number" ? `$${metrics.alltime_cost_usd.toFixed(2)}` : "n/a";
    out.push(boxRow(`    saved ${saved} (${pct}) · this prompt ${turn} · session ${all}`, width));
  } else {
    out.push(boxRow("    (savings-tracker offline — no live cost figures)", width));
  }
  out.push(boxSep(width));

  // QUOTA — Anthropic windows.
  out.push(boxRow("  QUOTA (Anthropic)", width));
  out.push(boxRow(`    5h ${progressBar(quota.h5Pct ?? 0, barW)} ${quota.h5Pct === null ? "n/a" : quota.h5Pct + "%"}`, width));
  out.push(boxRow(`    7d ${progressBar(quota.d7Pct ?? 0, barW)} ${quota.d7Pct === null ? "n/a" : quota.d7Pct + "%"}`, width));
  out.push(boxSep(width));

  // CONTEXT — runtime-only; not available outside the live statusline pipe.
  out.push(boxRow("  CONTEXT", width));
  out.push(boxRow("    ctx % — runtime-only (live statusline)", width));
  out.push(boxSep(width));

  // PACK — fixes W2.7 MIN-1 (packs were invisible on the dashboard). Lists the
  // installed packs + the active one; usage counts are honestly "no data yet"
  // (there is no per-pack usage log in this build).
  const installed = listInstalledPacks(opts.mooterHome);
  const active = getActivePack(opts.mooterHome);
  out.push(boxRow("  PACK", width));
  out.push(boxRow(`    Active: ${active ?? "none"}`, width));
  out.push(boxRow(`    Installed: ${installed.length} pack${installed.length === 1 ? "" : "s"}${installed.length ? " · " + installed.slice(0, 3).join(", ") + (installed.length > 3 ? ", …" : "") : ""}`, width));
  out.push(boxRow("    Usage: no per-pack usage data yet", width));
  out.push(boxSep(width));

  // ADAPTER — honest baseline disclosure. Forge (install + validate) shipped
  // Wave 5 D2; auto-training ships Wave 5 D3. No fabricated LoRA telemetry.
  // Kept within the box inner width.
  out.push(boxRow("  ADAPTER · ◌ baseline", width));
  out.push(boxRow("    Install a .gguf via `mooter forge install`", width));
  out.push(boxRow("    Auto-training ships Wave 5 D3", width));
  out.push(boxRow("    Run `mooter adapter list` to see adapters", width));
  out.push(boxSep(width));

  // PASTOR v2 — per-task LoRA routing adapters (Wave 31 registry). Honest:
  // counts the adapters the router can select; "trained" status lives in
  // `mooter pastor state`, not fabricated here.
  const pastor = loadPastorAdapters(opts);
  out.push(boxRow("  PASTOR v2 (per-task routing)", width));
  if (pastor.length === 0) {
    out.push(boxRow("    (no task adapters registered)", width));
  } else {
    out.push(boxRow(`    ${pastor.length} task adapters · ${pastor.slice(0, 4).map((p) => p.type).join(", ")}${pastor.length > 4 ? ", …" : ""}`, width));
    out.push(boxRow("    Route: `mooter pastor route <task>` · state: `mooter pastor state`", width));
  }
  out.push(boxSep(width));

  // HARDWARE — from the setup profile (GPU / VRAM / RAM / cores). Drives which
  // local models fit; null when no profile captured yet.
  const hw = loadHardware(opts);
  out.push(boxRow("  HARDWARE", width));
  if (hw && (hw.gpu || hw.ramGb)) {
    out.push(boxRow(`    GPU: ${hw.gpu ?? "none"}${hw.vramGb ? ` · ${hw.vramGb} GB VRAM` : ""}`, width));
    out.push(boxRow(`    RAM: ${hw.ramGb ?? "?"} GB · CPU: ${hw.cpuCores ?? "?"} cores`, width));
  } else {
    out.push(boxRow("    (no profile yet — run `mooter setup detect`)", width));
  }
  out.push(boxSep(width));

  // WORKFLOWS — recent local-first workflow runs (Wave 28 engine). Empty is the
  // steady state; runDashboard fills this from the workflow run store.
  const runs = opts.workflowRuns ?? [];
  out.push(boxRow("  WORKFLOWS (recent)", width));
  if (runs.length === 0) {
    out.push(boxRow("    (no workflow runs yet — `mooter workflow create`)", width));
  } else {
    for (const r of runs.slice(0, 3)) {
      const task = (r.task ?? "").slice(0, 28);
      out.push(boxRow(`    ${r.status.padEnd(9)} ${r.runId.slice(0, 10)} ${task}`, width));
    }
    out.push(boxRow("    Watch live: `mooter workflow watch <run_id>`", width));
  }
  out.push(boxSep(width));

  // LIMITS — cost-cap guardrails (Wave 30 limits.toml). Shows the ceilings the
  // bandit/ultramoo modes respect; null when no limits file exists.
  const limits = loadLimits(opts);
  out.push(boxRow("  LIMITS (cost-cap)", width));
  if (limits) {
    const wf = limits.max_workflow_cost_usd;
    const ses = limits.max_session_cost_usd;
    const t3 = limits.max_t3_calls_per_5min;
    out.push(boxRow(`    workflow ≤ $${wf ?? "?"} · session ≤ $${ses ?? "?"}`, width));
    out.push(boxRow(`    T3 ≤ ${t3 ?? "?"}/5min · concurrent ≤ ${limits.max_concurrent_workflows ?? "?"}`, width));
  } else {
    out.push(boxRow("    (no limits.toml — defaults apply)", width));
  }
  out.push(boxSep(width));

  out.push(boxRow("  Press q to exit · r to refresh · w to watch a workflow", width));
  out.push(boxBottom(width));

  return out.join("\n");
}

/**
 * Imperative shell: enter the alternate screen, render on an interval, and
 * restore the terminal on ANY exit path. Resolves when the user quits.
 */
export async function runDashboard(opts: DashboardOptions = {}): Promise<CmdResult> {
  const refreshMs = opts.refreshMs ?? 1000;
  const metrics =
    opts.metrics !== undefined ? opts.metrics : await (opts.fetchMetrics ?? defaultFetchMetrics)(opts.sessionId);

  // Wave 32 (Phase D) — best-effort recent workflow runs from the Wave 28 store.
  // Lazy + guarded: an absent/empty DB just yields no rows (steady state).
  let workflowRuns = opts.workflowRuns;
  if (workflowRuns === undefined) {
    try {
      const { listRuns } = await import("../../../workflow/src/state.ts");
      workflowRuns = listRuns(5).map((r: any) => ({
        runId: r.run_id ?? r.runId ?? "?",
        status: r.status ?? "?",
        task: r.task ?? r.description,
      }));
    } catch {
      workflowRuns = [];
    }
  }
  const frameOpts: DashboardOptions = { ...opts, metrics, workflowRuns };

  return new Promise<CmdResult>((resolve) => {
    let interval: ReturnType<typeof setInterval> | null = null;
    let done = false;

    const restore = () => {
      if (interval) clearInterval(interval);
      try {
        process.stdin.setRawMode?.(false);
        process.stdin.pause();
      } catch {
        /* ignore */
      }
      // Restore screen + cursor.
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
      process.stdout.write("\x1b[H"); // home cursor (no full clear → less flicker)
      process.stdout.write(buildDashboard(frameOpts) + "\n");
    };

    // Enter alternate screen + hide cursor.
    process.stdout.write("\x1b[?1049h\x1b[?25l");
    process.on("exit", restore);
    process.on("SIGINT", finish);
    process.on("SIGTERM", finish);

    try {
      process.stdin.setRawMode?.(true);
      process.stdin.resume();
      process.stdin.on("data", (data: Buffer) => {
        const key = data.toString();
        if (key === "q" || key === "\x03") finish(); // q or Ctrl+C
        else if (key === "r" || key === "w") render(); // refresh (w: re-pulls workflow rows next tick)
      });
    } catch {
      /* non-TTY: render once below, the interval still ticks */
    }

    render();
    interval = setInterval(render, refreshMs);
  });
}

async function defaultFetchMetrics(sessionId?: string): Promise<TrackerMetrics | null> {
  const base = "http://127.0.0.1:7821/metrics";
  const url = sessionId ? `${base}?session_id=${encodeURIComponent(sessionId)}` : base;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(400) });
    if (!res.ok) return null;
    return (await res.json()) as TrackerMetrics;
  } catch {
    return null;
  }
}

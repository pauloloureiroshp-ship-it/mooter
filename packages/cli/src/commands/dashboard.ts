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

function boxTop(title: string, width: number): string {
  const inner = width - 2;
  const label = ` ${title} `;
  const dashes = Math.max(0, inner - 1 - displayWidth(label));
  return `┌─${label}${"─".repeat(dashes)}┐`;
}

function boxRow(content: string, width: number): string {
  const inner = width - 2;
  // Trim on display width (emoji = 2 cols) so a wide glyph never overruns.
  let trimmed = content;
  while (displayWidth(trimmed) > inner) trimmed = trimmed.slice(0, -1);
  return `│${padToWidth(trimmed, inner)}│`;
}

function boxSep(width: number): string {
  return `├${"─".repeat(width - 2)}┤`;
}

function boxBottom(width: number): string {
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
    out.push(boxRow(`    saved ${saved} (${pct}) · turn ${turn} · alltime ${all}`, width));
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

  // ADAPTER — honest baseline disclosure (Wave 2.8 Ponto #8). No fabricated
  // LoRA telemetry; real numbers land when Adapter Forge ships in Wave 5.
  // Kept within the box inner width (lines wrap as separate rows).
  out.push(boxRow("  ADAPTER · ◌ baseline — no LoRA yet", width));
  out.push(boxRow("    projects with custom LoRA: 0", width));
  out.push(boxRow("    packs with custom LoRA: 0", width));
  out.push(boxRow("    Adapter Forge ships Wave 5 (~Q3 2026)", width));
  out.push(boxRow("", width));
  out.push(boxRow("  Press q to exit · r to refresh", width));
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
  const frameOpts: DashboardOptions = { ...opts, metrics };

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
        else if (key === "r") render(); // force refresh
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

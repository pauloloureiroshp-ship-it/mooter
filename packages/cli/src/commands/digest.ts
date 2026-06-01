// `mooter digest` — Wave 10 A.5 (Variant 1) session digest.
//
// A glanceable end-of-session summary: how the session's prompts spread across
// the tiers, with the local tier doing the heavy lifting, plus the spent / naive
// / kept totals. It reads the SAME sources as `mooter trail` and never invents a
// number:
//   · per-tier counts + % + representative model  ← decisions.log ("classified")
//   · session duration                             ← first→last ts_ms (when present)
//   · spent / saved / saved %                      ← savings-tracker /metrics
//   · "heavy lifting" list                         ← decisions.log prompt_preview
//                                                    (already sanitized at log time)
//
// Per-tier dollar figures are deliberately NOT shown: decisions.log carries no
// per-event cost (that lives only as an aggregate in the tracker), so a per-tier
// breakdown would be fabricated. The honest split is by COUNT, with the dollar
// totals coming from the tracker.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CmdResult, TrailOptions, TrackerMetrics } from "./trail.ts";

interface DigestEvent {
  event?: string;
  session_id?: string;
  source?: string;
  ts_ms?: number;
  tier?: string;
  recommended_model?: string;
  prompt_preview?: string;
  wall_clock_ms?: number;
}

const TIER_ORDER = ["T0", "T1", "T2", "T3"] as const;
const TIER_GLYPH: Record<string, string> = { T0: "🏠", T1: "☁", T2: "☁", T3: "☁" };

function shortModel(model: string | undefined): string {
  const m = String(model || "").toLowerCase();
  if (m.includes("opus")) return "opus";
  if (m.includes("sonnet")) return "sonnet";
  if (m.includes("haiku")) return "haiku";
  if (m.includes("gpt")) return "gpt";
  if (m.includes("gemini")) return "gemini";
  if (/qwen|llama|deepseek|gemma|mistral|phi/.test(m)) return m.split(":")[0] || "ollama";
  return m || "";
}

function routerDir(): string {
  const claudeDir =
    process.env.MOOTER_CLAUDE_DIR || process.env.FRUGAL_CLAUDE_DIR || join(homedir(), ".claude");
  return join(claudeDir, "tools", "router");
}

function readLines(opts: TrailOptions): string[] {
  if (opts.lines) return opts.lines;
  const path = opts.decisionsLog ?? join(routerDir(), "decisions.log");
  try {
    return readFileSync(path, "utf8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function sessionEvents(lines: string[], sessionId?: string): DigestEvent[] {
  const out: DigestEvent[] = [];
  for (const line of lines) {
    let e: DigestEvent;
    try {
      e = JSON.parse(line) as DigestEvent;
    } catch {
      continue;
    }
    if (!e || e.event !== "classified" || e.source === "mooter-tester") continue;
    if (sessionId && e.session_id && e.session_id !== "unknown" && e.session_id !== sessionId) continue;
    out.push(e);
  }
  return out;
}

export interface DigestTier {
  tier: string;
  count: number;
  pct: number;
  model: string;
}

export interface Digest {
  prompts: number;
  durationMs: number | null;
  tiers: DigestTier[];
  spent: number | null;
  saved: number | null;
  savedPct: number | null;
  localTasks: Array<{ preview: string; model: string; tier: string; ms: number | null }>;
}

/** Build the digest object from session events + optional tracker metrics. Pure. */
export function buildDigest(events: DigestEvent[], metrics: TrackerMetrics | null): Digest {
  const counts: Record<string, number> = { T0: 0, T1: 0, T2: 0, T3: 0 };
  const models: Record<string, Record<string, number>> = { T0: {}, T1: {}, T2: {}, T3: {} };
  let firstTs: number | null = null;
  let lastTs: number | null = null;
  for (const e of events) {
    const t = e.tier;
    if (t && t in counts) {
      counts[t]++;
      const sm = shortModel(e.recommended_model);
      if (sm) models[t][sm] = (models[t][sm] || 0) + 1;
    }
    if (typeof e.ts_ms === "number") {
      if (firstTs === null || e.ts_ms < firstTs) firstTs = e.ts_ms;
      if (lastTs === null || e.ts_ms > lastTs) lastTs = e.ts_ms;
    }
  }
  const total = counts.T0 + counts.T1 + counts.T2 + counts.T3;
  const tiers: DigestTier[] = TIER_ORDER.filter((t) => counts[t] > 0).map((t) => {
    const topModel =
      Object.entries(models[t]).sort((a, b) => b[1] - a[1])[0]?.[0] ||
      (t === "T0" ? "local" : "");
    return { tier: t, count: counts[t], pct: total ? Math.round((counts[t] / total) * 100) : 0, model: topModel };
  });

  // Up to 3 most recent local (T0) tasks, using the already-sanitized preview.
  const localTasks = events
    .filter((e) => e.tier === "T0" && typeof e.prompt_preview === "string" && e.prompt_preview)
    .slice(-3)
    .reverse()
    .map((e) => ({
      preview: String(e.prompt_preview),
      model: shortModel(e.recommended_model) || "local",
      tier: "T0",
      ms: typeof e.wall_clock_ms === "number" ? e.wall_clock_ms : null,
    }));

  return {
    prompts: total,
    durationMs: firstTs !== null && lastTs !== null ? lastTs - firstTs : null,
    tiers,
    spent: metrics && typeof metrics.alltime_cost_usd === "number" ? metrics.alltime_cost_usd : null,
    saved: metrics && typeof metrics.saved === "number" ? metrics.saved : null,
    savedPct: metrics && typeof metrics.saved_pct === "number" ? Math.round(metrics.saved_pct) : null,
    localTasks,
  };
}

function fmtDuration(ms: number | null): string {
  if (ms === null || ms <= 0) return "";
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function bar(pct: number, width = 20): string {
  const filled = Math.round((Math.max(0, Math.min(100, pct)) / 100) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function truncate(s: string, max = 36): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

export function printDigestHuman(d: Digest): string {
  const lines: string[] = [];
  const dur = fmtDuration(d.durationMs);
  const head = [`${d.prompts} prompts`, dur, d.saved !== null ? `saved $${d.saved.toFixed(2)}${d.savedPct !== null ? ` (${d.savedPct}%)` : ""}` : null]
    .filter(Boolean)
    .join(" · ");
  lines.push("");
  lines.push(`  ✓ Session digest — ${head}`);
  lines.push("");

  if (d.tiers.length === 0) {
    lines.push("  (no classified prompts in this session yet)");
    return lines.join("\n");
  }

  const n = d.tiers.length;
  d.tiers.forEach((t, i) => {
    const branch = n === 1 ? "└─" : i === 0 ? "┌─" : i === n - 1 ? "└─" : "├─";
    const label = `${TIER_GLYPH[t.tier] || "·"} ${t.tier} ${t.model}`.padEnd(22);
    lines.push(`  ${branch} ${label} ${bar(t.pct)}  ${String(t.count).padStart(3)} · ${String(t.pct).padStart(2)}%`);
  });
  lines.push("");

  // Spent / naive / kept — only when the tracker is reachable (never fabricated).
  if (d.spent !== null && d.saved !== null) {
    const naive = d.spent + d.saved;
    lines.push(`  Spent $${d.spent.toFixed(3)}  ·  All-Opus would cost $${naive.toFixed(3)}  ·  You kept $${d.saved.toFixed(3)}`);
  } else {
    lines.push("  (cost totals unavailable — savings-tracker offline; run `mooter trail` for provenance)");
  }

  if (d.localTasks.length) {
    lines.push("");
    lines.push("  Heavy lifting done locally:");
    for (const t of d.localTasks) {
      const ms = t.ms !== null ? `   ${t.ms}ms` : "";
      lines.push(`    · ${truncate(t.preview).padEnd(38)} → ${t.model}   ${t.tier}${ms}`);
    }
  }
  return lines.join("\n");
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

export async function runDigest(opts: TrailOptions = {}): Promise<CmdResult> {
  const sessionId = opts.sessionId ?? process.env.CLAUDE_SESSION_ID;
  const events = sessionEvents(readLines(opts), sessionId);
  const metrics =
    opts.metrics !== undefined ? opts.metrics : await (opts.fetchMetrics ?? defaultFetchMetrics)(sessionId);
  const digest = buildDigest(events, metrics);
  const output = opts.json ? JSON.stringify(digest, null, 2) : printDigestHuman(digest);
  return { exitCode: 0, output };
}

// `mooter trail` — provenance of every statusline number (Wave 2.5 Day 4).
//
// The statusline shows aggregates (saved $, tier badge, tier mix, quota). This
// command answers "where does each number come from?" by printing, for every
// figure, its value + the formula + the source it was read from. It reads the
// SAME sources the statusline does — it never recomputes from an invented
// schema:
//   · tier / model / confidence / tier-mix  ← decisions.log ("classified" events)
//   · saved $ / saved % / turn $ / alltime $ ← savings-tracker /metrics endpoint
//                                              (the authoritative cost aggregator;
//                                               decisions.log carries no cost)
//   · quota 5h remaining                     ← quota-state.json
//   · ctx %                                  ← Claude Code stdin at render time
//                                              (runtime-only; not available here)
//
// All sources are injectable so trail.test.ts drives it without files, a tracker,
// or a session. Output is human-readable by default, machine-readable with --json.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface CmdResult {
  exitCode: number;
  output: string;
}

/** A "classified" line as written by tools/router/inject_context.js. */
export interface DecisionEvent {
  event?: string;
  session_id?: string;
  ts?: string;
  tier?: string;
  recommended_model?: string;
  confidence?: number;
  source?: string;
}

/** Subset of the savings-tracker /metrics payload the statusline consumes. */
export interface TrackerMetrics {
  saved?: number;
  saved_pct?: number;
  last_turn_cost_usd?: number;
  alltime_cost_usd?: number;
}

export interface TrailOptions {
  sessionId?: string;
  json?: boolean;
  /** Override the decisions.log path (tests). */
  decisionsLog?: string;
  /** Override quota-state.json path (tests). */
  quotaPath?: string;
  /**
   * Injected tracker metrics. `undefined` → fetch via `fetchMetrics`; `null` →
   * treat the tracker as offline (so tests need no HTTP server).
   */
  metrics?: TrackerMetrics | null;
  /** Custom metrics fetcher; default GETs the local tracker, null on failure. */
  fetchMetrics?: (sessionId?: string) => Promise<TrackerMetrics | null>;
  /** Pre-supplied event lines (tests); default reads `decisionsLog`. */
  lines?: string[];
  /** `--evolution`: print the 7d-vs-prev-7d comparison instead of the trail. */
  evolution?: boolean;
  /** Override "now" in ms for evolution windowing (tests). */
  nowMs?: number;
  /** `--safety`: print the safety-boost summary over the last N classified events. */
  safety?: boolean;
  /** How many recent classified events to summarize for --safety (default 100). */
  safetyWindow?: number;
  /** `--by-keyword`: with --safety, break boost rate down per keyword. */
  byKeyword?: boolean;
}

/**
 * Summarize safety-boost telemetry over the last N classified events from
 * decisions.log (Wave 3 D1). Counts applications, reasons, and tier upgrades —
 * all from real logged fields (safety_boost_applied / _reason / _from); never
 * fabricated. Pure given `lines`.
 */
export function buildSafety(lines: string[], windowN = 100): Record<string, unknown> {
  const events: Array<{ applied: boolean; reason: string | null; from: string | null; to: string }> = [];
  for (const line of lines) {
    let e: any;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (!e || e.event !== "classified") continue;
    if (e.source === "mooter-tester") continue;
    events.push({
      applied: e.safety_boost_applied === true,
      reason: typeof e.safety_boost_reason === "string" ? e.safety_boost_reason : null,
      from: typeof e.safety_boost_from === "string" ? e.safety_boost_from : null,
      to: typeof e.tier === "string" ? e.tier : "?",
    });
  }
  const window = events.slice(-windowN);
  const applied = window.filter((e) => e.applied);
  const reasons: Record<string, number> = {};
  const upgrades: Record<string, number> = {};
  for (const e of applied) {
    // Normalize the reason to its kind (drop the per-event value after ':' or '(').
    const kind = e.reason ? e.reason.split(/[:(]/)[0].trim() : "unknown";
    reasons[kind] = (reasons[kind] || 0) + 1;
    if (e.from) {
      const key = `${e.from} → ${e.to}`;
      upgrades[key] = (upgrades[key] || 0) + 1;
    }
  }
  return { window: window.length, applied: applied.length, reasons, upgrades };
}

function printSafetyHuman(s: Record<string, unknown>): string {
  const window = s.window as number;
  const applied = s.applied as number;
  const reasons = s.reasons as Record<string, number>;
  const upgrades = s.upgrades as Record<string, number>;
  const pct = window > 0 ? Math.round((applied / window) * 100) : 0;
  const lines: string[] = [];
  lines.push(`🐮 mooter — safety boosts (last ${window} classified prompts)`);
  lines.push("");
  lines.push(`  applied: ${applied} of ${window} (${pct}%)`);
  if (applied > 0) {
    lines.push("  reasons:");
    for (const [k, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) lines.push(`    ${k}: ${n}`);
    lines.push("  upgrades:");
    for (const [k, n] of Object.entries(upgrades).sort((a, b) => b[1] - a[1])) lines.push(`    ${k}: ${n}`);
  }
  lines.push("");
  lines.push("  Safety boosts protect architecture-grade prompts from a too-small Moo.");
  lines.push("  Every boost carries an explicit reason (no black-box) — classify.js is untouched.");
  return lines.join("\n");
}

export async function runSafety(opts: TrailOptions): Promise<CmdResult> {
  const lines = readLines(opts);
  if (opts.byKeyword) {
    const k = buildSafetyByKeyword(lines, opts.safetyWindow ?? 100);
    const output = opts.json ? JSON.stringify(k, null, 2) : printSafetyByKeywordHuman(k);
    return { exitCode: 0, output };
  }
  const s = buildSafety(lines, opts.safetyWindow ?? 100);
  const output = opts.json ? JSON.stringify(s, null, 2) : printSafetyHuman(s);
  return { exitCode: 0, output };
}

// Mirror of tools/router/safety_boost.js ARCHITECTURAL_KEYWORDS — the CLI stays
// decoupled from router internals (same boundary as paths.js), so the list is
// duplicated deliberately rather than imported across packages.
export const SAFETY_KEYWORDS = [
  "design", "strategy", "architecture", "architect", "audit", "review",
  "refactor", "redesign", "migration", "migrate", "sharding", "partitioning",
  "schema", "consistency", "distributed", "scalability",
];

const OVERBOOST_THRESHOLD_PCT = 30;

/**
 * Per-keyword safety-boost rate over the last N classified events. For each
 * keyword we count how many BOOSTED prompts contained it (from prompt_preview)
 * vs how many prompts contained it at all — flagging any keyword whose boost
 * rate exceeds 30% as a possible over-boost (the W3 D1 NIT). Honest: counts come
 * from real logged prompt_preview, attributed by keyword presence. Pure.
 */
export function buildSafetyByKeyword(lines: string[], windowN = 100): Record<string, unknown> {
  const events: Array<{ applied: boolean; preview: string }> = [];
  for (const line of lines) {
    let e: any;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (!e || e.event !== "classified" || e.source === "mooter-tester") continue;
    events.push({ applied: e.safety_boost_applied === true, preview: String(e.prompt_preview || "").toLowerCase() });
  }
  const window = events.slice(-windowN);
  const byKeyword: Record<string, { seen: number; boosted: number; rate_pct: number; over: boolean }> = {};
  for (const kw of SAFETY_KEYWORDS) {
    const seen = window.filter((e) => e.preview.includes(kw));
    const boosted = seen.filter((e) => e.applied).length;
    if (seen.length === 0) continue;
    const rate = Math.round((boosted / seen.length) * 100);
    byKeyword[kw] = { seen: seen.length, boosted, rate_pct: rate, over: rate > OVERBOOST_THRESHOLD_PCT };
  }
  return { window: window.length, threshold_pct: OVERBOOST_THRESHOLD_PCT, by_keyword: byKeyword };
}

function printSafetyByKeywordHuman(k: Record<string, unknown>): string {
  const window = k.window as number;
  const byKeyword = k.by_keyword as Record<string, { seen: number; boosted: number; rate_pct: number; over: boolean }>;
  const lines: string[] = [];
  lines.push(`🐮 mooter — safety boosts by keyword (last ${window} classified prompts)`);
  lines.push("");
  const entries = Object.entries(byKeyword).sort((a, b) => b[1].boosted - a[1].boosted);
  if (entries.length === 0) {
    lines.push("  (no architectural keywords seen in this window)");
  } else {
    for (const [kw, v] of entries) {
      lines.push(`  ${kw.padEnd(14)} ${v.boosted}/${v.seen} boosted (${v.rate_pct}%)`);
    }
    lines.push("");
    const over = entries.filter(([, v]) => v.over);
    if (over.length === 0) {
      lines.push(`  ✓ all keyword boost rates within the ${k.threshold_pct}% range`);
    } else {
      for (const [kw, v] of over) {
        lines.push(`  ⚠ possible over-boost: "${kw}" boosted ${v.boosted}/${v.seen} (${v.rate_pct}%) — review safety_seeds.json`);
      }
    }
  }
  return lines.join("\n");
}

/** A classified event with the fields evolution needs (ts_ms + tier + conf). */
interface TimedEvent {
  ts_ms: number;
  tier?: string;
  confidence?: number;
}

interface EvolutionWindow {
  prompts: number;
  tierMix: Record<string, number>;
  avgConf: number | null;
}

function parseTimedEvents(lines: string[]): TimedEvent[] {
  const out: TimedEvent[] = [];
  for (const line of lines) {
    let e: any;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (!e || e.event !== "classified") continue;
    if (e.source === "mooter-tester") continue;
    if (typeof e.ts_ms !== "number") continue;
    out.push({ ts_ms: e.ts_ms, tier: e.tier, confidence: e.confidence });
  }
  return out;
}

function summarizeWindow(events: TimedEvent[]): EvolutionWindow {
  const tierMix: Record<string, number> = { T0: 0, T1: 0, T2: 0, T3: 0 };
  let confSum = 0;
  let confN = 0;
  for (const e of events) {
    if (e.tier && e.tier in tierMix) tierMix[e.tier]++;
    if (typeof e.confidence === "number") {
      confSum += e.confidence;
      confN++;
    }
  }
  return { prompts: events.length, tierMix, avgConf: confN ? confSum / confN : null };
}

/**
 * Compare the last 7-day window against the previous 7-day window. Built ONLY
 * from decisions.log fields that exist (ts_ms · tier · confidence) — prompt
 * volume, tier distribution, and average confidence. Per-window dollar savings
 * is deliberately NOT computed here: decisions.log carries no per-event cost
 * (that lives in the savings-tracker), and fabricating it would violate
 * provenance. Pure given (events, nowMs).
 */
export function buildEvolution(lines: string[], nowMs: number): Record<string, unknown> {
  const events = parseTimedEvents(lines);
  const week = 7 * 24 * 3600 * 1000;
  const last7 = events.filter((e) => e.ts_ms >= nowMs - week);
  const prev7 = events.filter((e) => e.ts_ms >= nowMs - 2 * week && e.ts_ms < nowMs - week);
  const a = summarizeWindow(prev7);
  const b = summarizeWindow(last7);
  const pct = (from: number, to: number) => (from > 0 ? ((to - from) / from) * 100 : to > 0 ? 100 : 0);
  return {
    prev7: a,
    last7: b,
    prompts_delta_pct: pct(a.prompts, b.prompts),
    conf_delta: a.avgConf !== null && b.avgConf !== null ? b.avgConf - a.avgConf : null,
  };
}

function mixStr(m: Record<string, number>): string {
  return `T0:${m.T0} T1:${m.T1} T2:${m.T2} T3:${m.T3}`;
}

function printEvolutionHuman(evo: Record<string, unknown>): string {
  const a = evo.prev7 as EvolutionWindow;
  const b = evo.last7 as EvolutionWindow;
  const pd = evo.prompts_delta_pct as number;
  const cd = evo.conf_delta as number | null;
  const sign = (n: number) => (n >= 0 ? "+" : "");
  const lines: string[] = [];
  lines.push("🐮 mooter — evolution (last 7d vs previous 7d)");
  lines.push("");
  lines.push("VOLUME");
  lines.push(`  prompts:   ${a.prompts} → ${b.prompts}   (${sign(pd)}${pd.toFixed(1)}%)`);
  lines.push("");
  lines.push("TIER MIX");
  lines.push(`  prev 7d:   ${mixStr(a.tierMix)}`);
  lines.push(`  last 7d:   ${mixStr(b.tierMix)}`);
  lines.push("");
  lines.push("CONFIDENCE");
  const af = a.avgConf === null ? "—" : a.avgConf.toFixed(2);
  const bf = b.avgConf === null ? "—" : b.avgConf.toFixed(2);
  const cds = cd === null ? "" : `   (${sign(cd)}${cd.toFixed(2)})`;
  lines.push(`  avg conf:  ${af} → ${bf}${cds}`);
  lines.push("");
  lines.push("OPTIMIZATIONS APPLIED");
  lines.push("  quantization: Q4_K_M (local baseline)");
  lines.push("  LoRA: ◌ none yet (install your own .gguf via `mooter forge install`)");
  lines.push("");
  lines.push("NOTE");
  lines.push("  Per-window dollar savings is not shown — decisions.log carries no");
  lines.push("  per-event cost. Cumulative savings: run `mooter trail`.");
  return lines.join("\n");
}

export async function runEvolution(opts: TrailOptions): Promise<CmdResult> {
  const lines = readLines(opts);
  const nowMs = opts.nowMs ?? Date.now();
  const evo = buildEvolution(lines, nowMs);
  const output = opts.json ? JSON.stringify(evo, null, 2) : printEvolutionHuman(evo);
  return { exitCode: 0, output };
}

/** A single traced figure: its value, the formula behind it, and its source. */
interface Traced {
  value: unknown;
  formula: string;
  source: string;
}

/** Mirror of tools/router/paths.js resolution so the CLI stays decoupled. */
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

/**
 * Parse "classified" events for a session, oldest→newest. Mirrors the
 * statusline digest filter: tester noise is dropped, and events tagged with a
 * different session are skipped (legacy untagged events always count).
 */
export function decisionsForSession(lines: string[], sessionId?: string): DecisionEvent[] {
  const out: DecisionEvent[] = [];
  for (const line of lines) {
    let evt: DecisionEvent;
    try {
      evt = JSON.parse(line) as DecisionEvent;
    } catch {
      continue;
    }
    if (!evt || evt.event !== "classified") continue;
    if (evt.source === "mooter-tester") continue;
    if (sessionId && evt.session_id && evt.session_id !== "unknown" && evt.session_id !== sessionId) {
      continue;
    }
    out.push(evt);
  }
  return out;
}

/** last-10 tier distribution (mirrors tools/router/tier-mix.js tierMixLast10). */
export function tierMixLast10(events: DecisionEvent[]): string {
  const last10 = events.slice(-10);
  const counts: Record<string, number> = { T0: 0, T1: 0, T2: 0, T3: 0 };
  for (const e of last10) {
    const t = e.tier;
    if (t === "T0" || t === "T1" || t === "T2" || t === "T3") counts[t]++;
  }
  return `last10: T0:${counts.T0} T1:${counts.T1} T2:${counts.T2} T3:${counts.T3}`;
}

function readQuota5h(quotaPath?: string): Traced {
  const path = quotaPath ?? join(routerDir(), "quota-state.json");
  try {
    const quota = JSON.parse(readFileSync(path, "utf8"));
    const w = quota?.providers?.anthropic?.window_5h;
    if (w && typeof w.limit === "number" && w.limit > 0) {
      const pct = Math.max(0, Math.min(100, Math.round((1 - (w.tokens_used || 0) / w.limit) * 100)));
      return {
        value: `${pct}%`,
        formula: "round((1 - tokens_used / limit) * 100)",
        source: `${path} · providers.anthropic.window_5h`,
      };
    }
  } catch {
    /* fall through */
  }
  return { value: null, formula: "round((1 - tokens_used / limit) * 100)", source: `${path} (unavailable)` };
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

/** Build the full provenance trail object. Pure given its inputs. */
export async function buildTrail(opts: TrailOptions): Promise<Record<string, unknown>> {
  const sessionId = opts.sessionId ?? process.env.CLAUDE_SESSION_ID;
  const lines = readLines(opts);
  const events = decisionsForSession(lines, sessionId);
  const last = events.length ? events[events.length - 1] : undefined;

  const metrics =
    opts.metrics !== undefined
      ? opts.metrics
      : await (opts.fetchMetrics ?? defaultFetchMetrics)(sessionId);
  const trackerSrc = "savings-tracker /metrics" + (metrics ? "" : " (offline — no live cost figures)");

  const counts: Record<string, number> = { T0: 0, T1: 0, T2: 0, T3: 0 };
  for (const e of events) if (e.tier && e.tier in counts) counts[e.tier]++;

  return {
    session_id: sessionId ?? null,
    event_count: events.length,
    saved: {
      value: metrics && typeof metrics.saved === "number" ? `$${metrics.saved.toFixed(2)}` : null,
      formula: "SUM(baseline_cost - actual_cost) over session events",
      source: trackerSrc,
    } as Traced,
    saved_pct: {
      value: metrics && typeof metrics.saved_pct === "number" ? `${Math.round(metrics.saved_pct)}%` : null,
      formula: "saved / baseline_cost * 100",
      source: trackerSrc,
    } as Traced,
    last_decision: {
      value: last ? `${last.tier} ${last.recommended_model ?? "?"} ${Number(last.confidence ?? 0).toFixed(2)}` : null,
      formula: "most recent 'classified' event for this session",
      source: "decisions.log · tier=classify.js · model=recommended_model · confidence=axis1_confidence",
    } as Traced,
    turn: {
      value: metrics && typeof metrics.last_turn_cost_usd === "number" ? `$${metrics.last_turn_cost_usd.toFixed(2)}` : null,
      formula: "last event cost_micros / 1e6",
      source: trackerSrc,
    } as Traced,
    alltime: {
      value: metrics && typeof metrics.alltime_cost_usd === "number" ? `$${metrics.alltime_cost_usd.toFixed(2)}` : null,
      formula: "SUM(event cost_micros) / 1e6",
      source: trackerSrc,
    } as Traced,
    tier_mix: {
      value: tierMixLast10(events),
      formula: "count tier over the last 10 events this session",
      source: "decisions.log · last 10 classified events",
    } as Traced,
    ctx: {
      value: null,
      formula: "session.context.percent_used",
      source: "Claude Code stdin at render time (runtime-only)",
    } as Traced,
    quota_5h: readQuota5h(opts.quotaPath),
  };
}

function printTrailHuman(trail: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push(`🐮 mooter — provenance trail (session ${trail.session_id ?? "—"})`);
  lines.push(`   ${trail.event_count} classified event(s) in scope`);
  lines.push("");
  const order: Array<[string, string]> = [
    ["saved", "saved"],
    ["saved_pct", "saved %"],
    ["last_decision", "last decision"],
    ["turn", "turn cost"],
    ["alltime", "alltime cost"],
    ["tier_mix", "tier mix"],
    ["ctx", "ctx %"],
    ["quota_5h", "quota 5h"],
  ];
  for (const [key, label] of order) {
    const t = trail[key] as Traced | undefined;
    if (!t) continue;
    const val = t.value === null || t.value === undefined ? "(unavailable)" : String(t.value);
    lines.push(`${label.padEnd(15)} = ${val}`);
    lines.push(`${" ".repeat(17)}formula: ${t.formula}`);
    lines.push(`${" ".repeat(17)}source:  ${t.source}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

export async function runTrail(opts: TrailOptions = {}): Promise<CmdResult> {
  if (opts.safety) return runSafety(opts);
  if (opts.evolution) return runEvolution(opts);
  const trail = await buildTrail(opts);
  const output = opts.json ? JSON.stringify(trail, null, 2) : printTrailHuman(trail);
  return { exitCode: 0, output };
}

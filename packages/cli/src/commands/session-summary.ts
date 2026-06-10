// Wave Mega 50-51 · Phase 4.D — `mooter session-summary`.
//
// Rich end-of-session Markdown report built ONLY from local data:
//   ~/.claude/tools/router/decisions.log  (classified / executed / turn_end)
//   git (cwd worktree + branch, best-effort)
//
// Honesty rules (same doctrine as digest/explain):
//   · costs are computed ONLY when token counts were actually recorded —
//     otherwise the report says so explicitly and shows decision counts only.
//   · the savings line follows the same rule (never invented from tier mix).
//   · Notion sync is a MANUAL documented step (--notion prints instructions;
//     no network call is ever made here).
//
// The SessionEnd hook (~/.claude/hooks/sessionend-summary-trigger.js) probes
// `mooter session-summary --help` — so --help MUST exit 0.

import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

export interface CmdResult {
  exitCode: number;
  output: string;
}

export interface SessionSummaryOptions {
  /** ~ root (defaults to os.homedir()). Injectable for tests. */
  home?: string;
  /** Working directory for the worktree/branch probe. */
  cwd?: string;
  /** Injectable git runner. */
  gitRunner?: (args: string[], cwd?: string) => string;
}

const USAGE = `usage: mooter session-summary [--session <id>] [--json] [--out <file>] [--notion]

Rich Markdown report for one Claude Code session, from local decisions.log only:
  header (id · time span · turns) · tier mix · models · tokens · cost honesty ·
  worktree · rationale highlights (top task categories).

  --session <id>   session id (or unique prefix); default = most recent in the log
  --json           emit the same data as JSON
  --out <file>     also write the markdown to <file>
  --notion         print the manual Notion-sync instruction (no network call)
  --help           this text (exit 0)`;

// Authoritative 2026-06 list prices per M tokens (see pricing-correto-2026):
// local $0 · Haiku $1/$5 · Sonnet $3/$15 · Opus $5/$25 · Fable $10/$50.
const PRICES: Record<string, { inUsd: number; outUsd: number }> = {
  local: { inUsd: 0, outUsd: 0 },
  haiku: { inUsd: 1, outUsd: 5 },
  sonnet: { inUsd: 3, outUsd: 15 },
  opus: { inUsd: 5, outUsd: 25 },
  fable: { inUsd: 10, outUsd: 50 },
};
const TIER_CLASS: Record<string, string> = { T0: "local", T1: "haiku", T2: "sonnet", T3: "opus", T5: "fable" };
const TIERS = ["T0", "T1", "T2", "T3", "T5"] as const;

interface RawEvent {
  event?: string;
  session_id?: string;
  ts?: string;
  ts_ms?: number;
  tier?: string;
  task_category?: string;
  recommended_model?: string;
  model_used?: string | null;
  tokens_in?: number;
  tokens_out?: number;
}

function decisionsLogPath(home?: string): string {
  return join(home ?? homedir(), ".claude", "tools", "router", "decisions.log");
}

function readEvents(home?: string): RawEvent[] {
  let data: string;
  try {
    data = readFileSync(decisionsLogPath(home), "utf8");
  } catch {
    return [];
  }
  const out: RawEvent[] = [];
  for (const line of data.split("\n")) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line);
      // Guard the known footgun: a literal `null` (or non-object) JSONL line
      // parses fine but is not an event (see Wave 31 JSON.parse('null') lesson).
      if (o && typeof o === "object" && !Array.isArray(o)) out.push(o as RawEvent);
    } catch {
      /* skip malformed line */
    }
  }
  return out;
}

function tsMs(e: RawEvent): number {
  if (typeof e.ts_ms === "number") return e.ts_ms;
  const t = e.ts ? Date.parse(e.ts) : NaN;
  return Number.isFinite(t) ? t : 0;
}

function fmtTs(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtDur(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h${min % 60}m`;
}

export interface SessionSummaryData {
  sessionId: string;
  spanStartMs: number;
  spanEndMs: number;
  turns: number;
  decisions: number;
  tierMix: Record<string, number>;
  taskCategories: { category: string; count: number }[];
  modelsRecommended: string[];
  modelsUsed: string[];
  tokensIn: number | null; // null = not recorded
  tokensOut: number | null;
  /** Per-tier cost over events WITH token counts; null when none recorded. */
  costByTier: Record<string, number> | null;
  costTotalUsd: number | null;
  /** Savings vs all-Opus over the SAME token-counted events; null when not computable. */
  savedVsOpusUsd: number | null;
  costNote: string;
  worktree: { cwd: string; branch: string | null } | null;
}

export function buildSummary(
  events: RawEvent[],
  sessionArg: string | undefined,
  opts: SessionSummaryOptions = {},
): SessionSummaryData | null {
  const withSid = events.filter((e) => typeof e.session_id === "string" && e.session_id);
  if (!withSid.length) return null;

  // Resolve the session: explicit id (or unique prefix) > most recent in the log.
  let sid: string | null = null;
  if (sessionArg) {
    const ids = [...new Set(withSid.map((e) => e.session_id as string))];
    sid = ids.includes(sessionArg)
      ? sessionArg
      : ids.filter((i) => i.startsWith(sessionArg)).length === 1
        ? ids.find((i) => i.startsWith(sessionArg))!
        : null;
    if (!sid) return null;
  } else {
    let best = -1;
    for (const e of withSid) {
      const t = tsMs(e);
      if (t >= best) {
        best = t;
        sid = e.session_id as string;
      }
    }
  }
  const ev = withSid.filter((e) => e.session_id === sid);
  if (!ev.length) return null;

  const classified = ev.filter((e) => e.event === "classified");
  const executed = ev.filter((e) => e.event === "executed");
  const turns = ev.filter((e) => e.event === "turn_end").length;

  const times = ev.map(tsMs).filter((t) => t > 0);
  const spanStartMs = times.length ? Math.min(...times) : 0;
  const spanEndMs = times.length ? Math.max(...times) : 0;

  const tierMix: Record<string, number> = {};
  const cats = new Map<string, number>();
  const recommended = new Set<string>();
  for (const e of classified) {
    if (e.tier && /^T[0-5]$/.test(e.tier)) tierMix[e.tier] = (tierMix[e.tier] ?? 0) + 1;
    if (e.task_category) cats.set(e.task_category, (cats.get(e.task_category) ?? 0) + 1);
    if (e.recommended_model) recommended.add(e.recommended_model);
  }
  const used = new Set<string>();
  for (const e of executed) if (e.model_used) used.add(e.model_used);

  // Tokens + cost: ONLY over executed events that actually recorded counts.
  const tokenEvents = executed.filter((e) => (e.tokens_in ?? 0) > 0 || (e.tokens_out ?? 0) > 0);
  let tokensIn: number | null = null;
  let tokensOut: number | null = null;
  let costByTier: Record<string, number> | null = null;
  let costTotalUsd: number | null = null;
  let savedVsOpusUsd: number | null = null;
  let costNote: string;
  if (tokenEvents.length) {
    tokensIn = 0;
    tokensOut = 0;
    costByTier = {};
    costTotalUsd = 0;
    let opusBaseline = 0;
    for (const e of tokenEvents) {
      const tin = e.tokens_in ?? 0;
      const tout = e.tokens_out ?? 0;
      tokensIn += tin;
      tokensOut += tout;
      const cls = TIER_CLASS[e.tier ?? ""] ?? "opus";
      const p = PRICES[cls];
      const cost = (tin / 1e6) * p.inUsd + (tout / 1e6) * p.outUsd;
      costByTier[e.tier ?? "?"] = (costByTier[e.tier ?? "?"] ?? 0) + cost;
      costTotalUsd += cost;
      opusBaseline += (tin / 1e6) * PRICES.opus.inUsd + (tout / 1e6) * PRICES.opus.outUsd;
    }
    savedVsOpusUsd = opusBaseline - costTotalUsd;
    costNote =
      tokenEvents.length === executed.length && executed.length
        ? `costs computed from recorded token counts (${tokenEvents.length} calls) at list prices.`
        : `costs computed ONLY over the ${tokenEvents.length} call(s) with recorded token counts — the remaining decisions carry none.`;
  } else {
    costNote = "costs not computable: token counts absent — showing decision counts only.";
  }

  // Worktree (best-effort, honest null outside a repo).
  let worktree: SessionSummaryData["worktree"] = null;
  const cwd = opts.cwd ?? process.cwd();
  const git =
    opts.gitRunner ??
    ((args: string[], dir?: string) =>
      execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  try {
    const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], cwd).trim();
    worktree = { cwd, branch: branch || null };
  } catch {
    worktree = null;
  }

  return {
    sessionId: sid!,
    spanStartMs,
    spanEndMs,
    turns,
    decisions: classified.length,
    tierMix,
    taskCategories: [...cats.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3),
    modelsRecommended: [...recommended].sort(),
    modelsUsed: [...used].sort(),
    tokensIn,
    tokensOut,
    costByTier,
    costTotalUsd,
    savedVsOpusUsd,
    costNote,
    worktree,
  };
}

export function renderMarkdown(d: SessionSummaryData): string {
  const out: string[] = [];
  out.push(`# Mooter session summary — ${d.sessionId.slice(0, 8)}`);
  out.push("");
  out.push(`- session : ${d.sessionId}`);
  out.push(
    d.spanStartMs
      ? `- span    : ${fmtTs(d.spanStartMs)} → ${fmtTs(d.spanEndMs)} (${fmtDur(d.spanEndMs - d.spanStartMs)})`
      : `- span    : (no timestamps recorded)`,
  );
  out.push(`- turns   : ${d.turns ? `${d.turns} (turn_end events)` : "not recorded"}`);
  out.push(
    d.worktree
      ? `- worktree: ${d.worktree.cwd} (branch ${d.worktree.branch ?? "(detached)"})`
      : `- worktree: (not a git repository)`,
  );
  out.push("");

  out.push(`## Tier mix (${d.decisions} routing decisions)`);
  out.push("");
  if (d.decisions) {
    out.push("| tier | decisions | % |");
    out.push("|------|-----------|---|");
    for (const t of TIERS) {
      const n = d.tierMix[t] ?? 0;
      if (!n) continue;
      out.push(`| ${t} | ${n} | ${Math.round((n / d.decisions) * 100)}% |`);
    }
  } else {
    out.push("(no classified decisions for this session)");
  }
  out.push("");

  out.push("## Models");
  out.push("");
  out.push(`- recommended: ${d.modelsRecommended.length ? d.modelsRecommended.join(", ") : "(none recorded)"}`);
  out.push(`- used       : ${d.modelsUsed.length ? d.modelsUsed.join(", ") : "not recorded"}`);
  out.push("");

  out.push("## Tokens & cost");
  out.push("");
  if (d.tokensIn !== null) {
    out.push(`- tokens: ${d.tokensIn} in / ${d.tokensOut} out`);
    out.push("");
    out.push("| tier | est. cost |");
    out.push("|------|-----------|");
    for (const [t, c] of Object.entries(d.costByTier!)) out.push(`| ${t} | $${c.toFixed(4)} |`);
    out.push(`| **total** | **$${d.costTotalUsd!.toFixed(4)}** |`);
    out.push("");
    out.push(`- ~saved vs all-Opus: $${d.savedVsOpusUsd!.toFixed(4)} (same tokens priced at Opus $5/$25 per M — estimate)`);
  } else {
    out.push("- tokens: not recorded");
  }
  out.push(`- ${d.costNote}`);
  out.push("");

  out.push("## Rationale highlights");
  out.push("");
  if (d.taskCategories.length) {
    for (const c of d.taskCategories) out.push(`- ${c.category} ×${c.count}`);
  } else {
    out.push("(no task categories recorded)");
  }
  return out.join("\n");
}

function notionInstruction(d: SessionSummaryData | null): string {
  const date = new Date().toISOString().slice(0, 10);
  const headline = d ? `session ${d.sessionId.slice(0, 8)} summary` : "session summary";
  return [
    "── Notion sync (manual, documented step — mooter makes NO network call) ──",
    `1. Create a sub-page under the Notion HQ with the title:`,
    `   📊 Sessão ${date} — ${headline}`,
    `2. Paste the markdown above (or the --out file) as the page body.`,
    `3. Notion MCP/API automation is a documented manual step for now;`,
    `   nothing was sent anywhere by this command.`,
  ].join("\n");
}

export function runSessionSummary(args: string[], opts: SessionSummaryOptions = {}): CmdResult {
  if (args.includes("--help") || args.includes("-h")) {
    return { exitCode: 0, output: USAGE };
  }
  const si = args.indexOf("--session");
  const sessionArg = si >= 0 ? args[si + 1] : undefined;
  const oi = args.indexOf("--out");
  const outFile = oi >= 0 ? args[oi + 1] : undefined;
  const json = args.includes("--json");
  const notion = args.includes("--notion");

  const events = readEvents(opts.home);
  const data = buildSummary(events, sessionArg, opts);
  if (!data) {
    const msg = sessionArg
      ? `session not found (or ambiguous prefix) in decisions.log: ${sessionArg}`
      : "no routing decisions found in decisions.log — nothing to summarize yet.";
    if (json) return { exitCode: sessionArg ? 1 : 0, output: JSON.stringify({ session: null, note: msg }) };
    return { exitCode: sessionArg ? 1 : 0, output: msg };
  }

  if (json) {
    return { exitCode: 0, output: JSON.stringify(data, null, 2) };
  }

  const md = renderMarkdown(data);
  let output = md;
  if (outFile) {
    try {
      writeFileSync(outFile, md + "\n");
      output += `\n\nwrote ${outFile}`;
    } catch (e) {
      return { exitCode: 1, output: `${md}\n\ncould not write ${outFile}: ${(e as Error).message}` };
    }
  }
  if (notion) output += "\n\n" + notionInstruction(data);
  return { exitCode: 0, output };
}

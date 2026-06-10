// `mooter sessions list` (Wave 33 A.6) — list Claude Code sessions for the
// current project with age, prompt count, tier breakdown, and an estimated
// savings figure.
//
// Sources (all read-only, no network):
//   - transcripts: ~/.claude/projects/<encoded-cwd>/<session-id>.jsonl
//       birth time → session start/age; count of user-turn lines → prompts.
//   - tier mix:    ~/.claude/tools/router/decisions.log
//       classified events stamped with session_id (same id Claude Code passes
//       on stdin); grouped here into T0/T1/T2/T3 per session.
//   - savings:     ESTIMATED from the tier mix (decisions.log carries no
//       per-call cost). Labeled "~saved" so it is never read as measured.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Wave 33.5 Block A — the new subcommands (watch/show/diff/quota/worktrees/kill/
// focus/export) live in @mooter/sessions-orchestrator; `list` stays here intact.
import { runSessionsExtended } from "../../../sessions-orchestrator/src/commands.ts";

export interface CmdResult {
  exitCode: number;
  output: string;
}

export interface SessionsOptions {
  /** Project working directory (defaults to process.cwd()). Injectable for tests. */
  cwd?: string;
  /** ~ root (defaults to os.homedir()). Injectable for tests. */
  home?: string;
  /** "now" in ms (defaults to Date.now()). Injectable for tests. */
  now?: number;
  /** Max rows (defaults to 10). */
  limit?: number;
  /** The current session id (defaults to env CLAUDE_SESSION_ID) — marked (LIVE). */
  liveSessionId?: string;
}

// Nominal $ saved per routed call vs an all-Opus baseline, for an average
// ~3k-in / 0.8k-out call: Opus ≈ $0.035; Haiku ≈ $0.007; Sonnet ≈ $0.021; local
// $0. saved = opusCost − tierCost. Honest estimate — the table labels it "~".
const SAVED_PER_CALL: Record<string, number> = { T0: 0.035, T1: 0.028, T2: 0.014, T3: 0 };

/** Claude Code encodes a project path by replacing every non-alphanumeric char with '-'. */
export function encodeProjectDir(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, "-");
}

function projectPath(cwd: string, home: string): string {
  return join(home, ".claude", "projects", encodeProjectDir(cwd));
}

function decisionsLogPath(home: string): string {
  return join(home, ".claude", "tools", "router", "decisions.log");
}

/** <60min → "47m"; <24h → "2h47m"; ≥24h → "2d4h". */
function fmtAge(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0m";
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h${min % 60}m`;
  return `${Math.floor(hr / 24)}d${hr % 24}h`;
}

/** Count user-turn lines in a transcript. Best-effort: parse failures skip a line. */
function countUserPrompts(file: string): number {
  let data: string;
  try {
    data = readFileSync(file, "utf8");
  } catch {
    return 0;
  }
  let n = 0;
  for (const line of data.split("\n")) {
    if (!line) continue;
    // Cheap pre-filter to avoid JSON.parse on every assistant/tool line.
    if (line.indexOf('"type":"user"') === -1) continue;
    try {
      const o = JSON.parse(line);
      if (o.type !== "user" || o.isMeta) continue;
      const content = o.message && o.message.content;
      // A real prompt has string content, or an array with at least one block
      // that is NOT a tool_result (tool_result-only turns are continuations,
      // not user prompts, and would otherwise massively inflate the count).
      if (typeof content === "string") {
        if (content.trim()) n++;
      } else if (Array.isArray(content)) {
        if (content.some((b) => b && b.type !== "tool_result")) n++;
      }
    } catch {
      /* skip a malformed line */
    }
  }
  return n;
}

type TierRec = { T0: number; T1: number; T2: number; T3: number };

/** Group classified decisions by session_id into a tier histogram. */
function tierBySession(home: string): Map<string, TierRec> {
  const map = new Map<string, TierRec>();
  let data: string;
  try {
    data = readFileSync(decisionsLogPath(home), "utf8");
  } catch {
    return map;
  }
  for (const line of data.split("\n")) {
    if (!line || line.indexOf('"tier"') === -1) continue;
    try {
      const o = JSON.parse(line);
      const sid: unknown = o.session_id;
      const tier: unknown = o.tier;
      if (typeof sid !== "string" || typeof tier !== "string" || !/^T[0-3]$/.test(tier)) continue;
      let rec = map.get(sid);
      if (!rec) {
        rec = { T0: 0, T1: 0, T2: 0, T3: 0 };
        map.set(sid, rec);
      }
      rec[tier as keyof TierRec]++;
    } catch {
      /* skip */
    }
  }
  return map;
}

function estSaved(rec: TierRec): number {
  return (
    rec.T0 * SAVED_PER_CALL.T0 +
    rec.T1 * SAVED_PER_CALL.T1 +
    rec.T2 * SAVED_PER_CALL.T2 +
    rec.T3 * SAVED_PER_CALL.T3
  );
}

export function runSessions(args: string[], opts: SessionsOptions = {}): CmdResult {
  const sub = args[0] ?? "list";
  if (sub !== "list") {
    // Delegate every non-list subcommand to the orchestrator package.
    return runSessionsExtended(args, { home: opts.home, cwd: opts.cwd, now: opts.now });
  }

  const li = args.indexOf("--limit");
  const limit =
    opts.limit ?? (li >= 0 ? Math.max(1, parseInt(args[li + 1] || "10", 10) || 10) : 10);

  const cwd = opts.cwd ?? process.cwd();
  const home = opts.home ?? homedir();
  const now = opts.now ?? Date.now();
  const live = opts.liveSessionId ?? process.env.CLAUDE_SESSION_ID ?? null;

  const dir = projectPath(cwd, home);
  if (!existsSync(dir)) {
    return { exitCode: 0, output: "no Claude Code sessions found for this project yet." };
  }

  let files: { sid: string; full: string; birth: number; mtime: number }[];
  try {
    files = readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => {
        const full = join(dir, f);
        const st = statSync(full);
        return {
          sid: f.replace(/\.jsonl$/, ""),
          full,
          birth: st.birthtimeMs > 0 ? st.birthtimeMs : st.ctimeMs,
          mtime: st.mtimeMs,
        };
      });
  } catch {
    return { exitCode: 0, output: "no Claude Code sessions found for this project yet." };
  }

  if (!files.length) {
    return { exitCode: 0, output: "no Claude Code sessions found for this project yet." };
  }

  files.sort((a, b) => b.mtime - a.mtime);
  // The most-recently-active session is "live" unless an explicit id is given.
  const liveSid = live ?? files[0].sid;
  const rows = files.slice(0, limit);

  const tiers = tierBySession(home);
  const fmtTs = (ms: number) => {
    const d = new Date(ms);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  const out: string[] = [];
  out.push("session start            age      prompts  T0/T1/T2/T3      ~saved");
  for (const r of rows) {
    const rec = tiers.get(r.sid) ?? { T0: 0, T1: 0, T2: 0, T3: 0 };
    const prompts = countUserPrompts(r.full);
    const isLive = r.sid === liveSid;
    const start = `${fmtTs(r.birth)}${isLive ? " (LIVE)" : ""}`.padEnd(22);
    const age = fmtAge(now - r.birth).padEnd(8);
    const mix = `${rec.T0}/${rec.T1}/${rec.T2}/${rec.T3}`.padEnd(15);
    const saved = `$${estSaved(rec).toFixed(2)}`;
    out.push(`${start} ${age} ${String(prompts).padEnd(8)} ${mix}  ${saved}`);
  }
  out.push("");
  out.push("~saved is estimated from the tier mix (nominal per-call cost vs all-Opus).");
  return { exitCode: 0, output: out.join("\n") };
}

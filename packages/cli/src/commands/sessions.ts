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

import {
  readFileSync,
  readdirSync,
  statSync,
  existsSync,
  appendFileSync,
  mkdirSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, basename } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

// Wave 33.5 Block A — the new subcommands (watch/show/diff/quota/kill/
// focus/export) live in @mooter/sessions-orchestrator; `list` stays here intact.
// Wave Mega 50-51 (4.C) — `worktrees` is now rendered HERE (richer chips view
// joining git worktrees with live heartbeats); the frozen orchestrator package
// is only IMPORTED (host-side bridge pattern, Wave 33.8) — never edited.
import { runSessionsExtended } from "../../../sessions-orchestrator/src/commands.ts";
import { listWorktrees, type GitRunner } from "../../../sessions-orchestrator/src/worktrees.ts";
import { listHeartbeats, isHeartbeatStale } from "../../../worktree-conductor/src/heartbeat.ts";

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
  // Wave Mega 50-51 (4.C) — new intel subcommands handled in the CLI layer.
  if (sub === "worktrees") return runSessionsWorktrees(opts as SessionsIntelOptions);
  if (sub === "tmux-attach") return runSessionsTmuxAttach(args[1] ?? "", opts as SessionsIntelOptions);
  if (sub === "notify") return runSessionsNotify(args[1] ?? "", args.slice(2).join(" "), opts as SessionsIntelOptions);
  if (sub !== "list") {
    // Delegate every other non-list subcommand to the orchestrator package.
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

// ───────────────────────── Wave Mega 50-51 · Phase 4.C ─────────────────────────
// Session intel: worktree chips · tmux attach · file-based cross-session signals.
//
// Cross-session signalling is FILE-BASED on purpose: notify appends a JSONL
// message to ~/.mooter/sessions/inbox/<id>.jsonl and wait polls its own inbox.
// Live push via a SubagentStop hook is a documented LATER wiring step — the
// deterministic core here works with zero hooks and zero daemons.

export interface SessionsIntelOptions extends SessionsOptions {
  /** Injectable `git` runner (defaults to execFileSync git). */
  gitRunner?: GitRunner;
  /** Injectable tmux facade (defaults to the real tmux binary). */
  tmux?: TmuxRunner;
  /** wait poll interval ms (default 500). */
  pollMs?: number;
  /** Sender id stamped on notify messages (defaults to env CLAUDE_SESSION_ID). */
  fromSessionId?: string;
}

export interface TmuxRunner {
  available(): boolean;
  /** tmux session names, [] when the server is not running. */
  ls(): string[];
  /** Attach to a target; returns the tmux exit code. */
  attach(target: string): number;
}

const realTmux: TmuxRunner = {
  available() {
    try {
      execFileSync("tmux", ["-V"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  },
  ls() {
    try {
      return execFileSync("tmux", ["ls", "-F", "#{session_name}"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
        .split("\n")
        .filter(Boolean);
    } catch {
      return []; // no server running
    }
  },
  attach(target: string) {
    const r = spawnSync("tmux", ["attach", "-t", target], { stdio: "inherit" });
    return r.status ?? 1;
  },
};

/** ~/.mooter/sessions root (opts.home wins; MOOTER_HOME mirrors conductor paths). */
function sessionsRoot(home?: string): string {
  const root = home
    ? join(home, ".mooter")
    : process.env.MOOTER_HOME || join(homedir(), ".mooter");
  return join(root, "sessions");
}

function inboxPath(id: string, home?: string): string {
  const safe = id.replace(/[^A-Za-z0-9_.-]/g, "-");
  return join(sessionsRoot(home), "inbox", `${safe}.jsonl`);
}

/** Fresh (non-stale) conductor heartbeats — [] when none recorded (honest empty state). */
function freshHeartbeats(opts: SessionsIntelOptions): ReturnType<typeof listHeartbeats> {
  const now = opts.now ?? Date.now();
  try {
    return listHeartbeats(opts.home).filter((hb) => !isHeartbeatStale(hb, now));
  } catch {
    return [];
  }
}

/** `mooter sessions worktrees` — chips joining git worktrees with live sessions. */
export function runSessionsWorktrees(opts: SessionsIntelOptions = {}): CmdResult {
  const cwd = opts.cwd ?? process.cwd();
  const wts = listWorktrees(cwd, opts.gitRunner);
  if (!wts.length) {
    return { exitCode: 0, output: "not a git repository (or no worktrees) — nothing to show." };
  }
  const live = freshHeartbeats(opts);
  const liveByPath = new Map(live.map((hb) => [hb.worktree_path, hb]));

  const norm = (p: string) => p.replace(/[\\/]+$/, "");
  // "this" worktree = the one whose path contains cwd (longest match wins, so a
  // nested worktree beats its parent repo).
  const here = norm(cwd);
  let thisPath: string | null = null;
  for (const w of wts) {
    const p = norm(w.path);
    if ((here === p || here.startsWith(p + "/")) && (!thisPath || p.length > thisPath.length)) thisPath = p;
  }
  const chips = wts.map((w) => {
    const parts = [basename(w.path)];
    if (w.branch) parts.push(w.branch);
    else if (w.detached) parts.push("(detached)");
    const hb = liveByPath.get(w.path) ?? liveByPath.get(norm(w.path));
    if (hb) parts.push(`● live${hb.terminal_name && hb.terminal_name !== "unknown" ? ` ${hb.terminal_name}` : ""}`);
    if (norm(w.path) === thisPath) parts.push("◀ this");
    return `[${parts.join(" ")}]`;
  });

  const out: string[] = [`worktrees (${wts.length}):`, "  " + chips.join(" ")];
  if (!live.length) {
    out.push("");
    out.push("(no live sessions — no fresh conductor heartbeats recorded)");
  }
  return { exitCode: 0, output: out.join("\n") };
}

/** `mooter sessions tmux-attach <id>` — attach to the tmux target a session recorded. */
export function runSessionsTmuxAttach(id: string, opts: SessionsIntelOptions = {}): CmdResult {
  if (!id) return { exitCode: 1, output: "usage: mooter sessions tmux-attach <session-id>" };
  const tmux = opts.tmux ?? realTmux;
  if (!tmux.available()) {
    return { exitCode: 1, output: "tmux not found — install tmux (or run from a terminal that has it) first." };
  }
  // Orchestrator state: the conductor heartbeat's terminal_name is the only
  // recorded terminal linkage we have. It counts as a tmux target only when a
  // tmux session by that name actually exists.
  const hbs = listHeartbeats(opts.home);
  const hb =
    hbs.find((h) => h.session_id === id) ??
    (hbs.filter((h) => h.session_id.startsWith(id)).length === 1
      ? hbs.find((h) => h.session_id.startsWith(id))
      : undefined);
  const tmuxSessions = tmux.ls();
  const recorded = hb && hb.terminal_name && hb.terminal_name !== "unknown" ? hb.terminal_name : null;

  if (recorded && tmuxSessions.includes(recorded)) {
    const code = tmux.attach(recorded);
    return { exitCode: code, output: `attaching to tmux session '${recorded}' (recorded by session ${id.slice(0, 8)})…` };
  }

  // Honest fallback: never spawn a tmux session silently — list and suggest.
  const out: string[] = [
    recorded
      ? `session ${id.slice(0, 8)} recorded terminal '${recorded}', but no tmux session by that name is running.`
      : `no tmux pane/window recorded for session ${id.slice(0, 8)} in orchestrator state.`,
  ];
  if (tmuxSessions.length) {
    out.push("running tmux sessions:");
    for (const s of tmuxSessions) out.push(`  tmux attach -t ${s}`);
  } else {
    out.push("no tmux sessions running — mooter never spawns one silently; start your own with `tmux new -s <name>`.");
  }
  return { exitCode: 1, output: out.join("\n") };
}

/** `mooter sessions notify <id> <message>` — append to the target's file inbox. */
export function runSessionsNotify(id: string, message: string, opts: SessionsIntelOptions = {}): CmdResult {
  if (!id || !message.trim()) {
    return { exitCode: 1, output: "usage: mooter sessions notify <session-id> <message>" };
  }
  const file = inboxPath(id, opts.home);
  const rec: Record<string, unknown> = {
    ts: new Date(opts.now ?? Date.now()).toISOString(),
    message: message.trim(),
  };
  const from = opts.fromSessionId ?? process.env.CLAUDE_SESSION_ID;
  if (from) rec.from = from;
  try {
    mkdirSync(join(sessionsRoot(opts.home), "inbox"), { recursive: true });
    appendFileSync(file, JSON.stringify(rec) + "\n");
  } catch (e) {
    return { exitCode: 1, output: `could not write inbox ${file}: ${(e as Error).message}` };
  }
  return { exitCode: 0, output: `notified ${id} (inbox: ${file})` };
}

/** `mooter sessions wait <id> [--timeout s]` — poll own inbox for a NEW message. */
export async function runSessionsWait(
  id: string,
  args: string[],
  opts: SessionsIntelOptions = {},
): Promise<CmdResult> {
  if (!id) return { exitCode: 1, output: "usage: mooter sessions wait <session-id> [--timeout <s>]" };
  const ti = args.indexOf("--timeout");
  const timeoutS = ti >= 0 ? Math.max(0.1, Number(args[ti + 1]) || 60) : 60;
  const pollMs = opts.pollMs ?? 500;
  const file = inboxPath(id, opts.home);

  const readLines = (): string[] => {
    try {
      return readFileSync(file, "utf8").split("\n").filter(Boolean);
    } catch {
      return [];
    }
  };
  const baseline = readLines().length;
  const deadline = Date.now() + timeoutS * 1000;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  while (Date.now() < deadline) {
    await sleep(Math.min(pollMs, Math.max(1, deadline - Date.now())));
    const lines = readLines();
    if (lines.length > baseline) {
      let msg = lines[lines.length - 1];
      let from = "";
      try {
        const o = JSON.parse(msg);
        msg = String(o.message ?? msg);
        if (o.from) from = ` (from ${String(o.from).slice(0, 8)})`;
      } catch {
        /* raw line is still a message */
      }
      return { exitCode: 0, output: `message for ${id}${from}: ${msg}` };
    }
  }
  return { exitCode: 3, output: `timeout: no message for ${id} within ${timeoutS}s` };
}

/**
 * Async entry used by the CLI shell — routes `wait` (the only polling
 * subcommand) and falls through to the sync dispatcher for everything else.
 */
export async function runSessionsAsync(args: string[], opts: SessionsIntelOptions = {}): Promise<CmdResult> {
  if (args[0] === "wait") return runSessionsWait(args[1] ?? "", args.slice(2), opts);
  return runSessions(args, opts);
}

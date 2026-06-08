// Wave 33.5 Block A.2 — sessions-orchestrator subcommand handlers.
//
// The CLI (`packages/cli/src/commands/sessions.ts`) keeps the Wave 33 `list`
// renderer untouched and delegates the NEW subcommands here:
//   quota · worktrees · show · diff · export · watch · focus · kill
//
// Each returns { exitCode, output } so the CLI dispatch stays a one-liner. All
// reads are local; `kill` is deliberately honest about what it can and cannot do
// (we hold no Claude-Code pid linkage, so we never pretend to terminate one).

import { buildState, type BuildStateOptions, type SessionsState } from "./state.ts";
import { forecastQuota, renderQuota } from "./quota.ts";
import { listWorktrees } from "./worktrees.ts";
import { aggregateCrossSession, renderAggregate } from "./aggregator.ts";
import { renderDashboard } from "./tui.ts";
import type { SessionInfo } from "./types.ts";

export interface CmdResult {
  exitCode: number;
  output: string;
}

export interface SessionsCmdOptions extends BuildStateOptions {}

function findSession(state: SessionsState, idPrefix: string): SessionInfo | null {
  if (!idPrefix) return null;
  const exact = state.sessions.find((s) => s.sessionId === idPrefix);
  if (exact) return exact;
  const pref = state.sessions.filter((s) => s.sessionId.startsWith(idPrefix));
  return pref.length === 1 ? pref[0] : null;
}

function fmtTs(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function runQuota(opts: SessionsCmdOptions = {}): CmdResult {
  return { exitCode: 0, output: renderQuota(forecastQuota({ home: opts.home, now: opts.now })) };
}

export function runWorktrees(opts: SessionsCmdOptions = {}): CmdResult {
  const wts = listWorktrees(opts.cwd, opts.gitRunner);
  if (!wts.length) return { exitCode: 0, output: "no git worktrees found." };
  const out: string[] = ["worktree                                  branch                 head"];
  for (const w of wts) {
    const path = w.path.length > 40 ? "…" + w.path.slice(-39) : w.path.padEnd(40);
    const branch = (w.detached ? "(detached)" : w.branch ?? "(none)").padEnd(22);
    out.push(`${path}  ${branch} ${w.head.slice(0, 9)}`);
  }
  return { exitCode: 0, output: out.join("\n") };
}

export function runShow(id: string, opts: SessionsCmdOptions = {}): CmdResult {
  const state = buildState(opts);
  const s = findSession(state, id);
  if (!s) return { exitCode: 1, output: `session not found (or ambiguous prefix): ${id}` };
  const out: string[] = [];
  out.push(`session ${s.sessionId}${s.live ? "  (LIVE)" : ""}`);
  out.push(`  project    : ${s.project}`);
  out.push(`  worktree   : ${s.worktreePath ?? "(unmapped)"}`);
  out.push(`  branch     : ${s.branch ?? "(unknown)"}`);
  out.push(`  started    : ${fmtTs(s.birthMs)}`);
  out.push(`  last active: ${fmtTs(s.mtimeMs)}`);
  out.push(`  prompts    : ${s.prompts}`);
  out.push(`  tier mix   : T0=${s.tiers.T0} T1=${s.tiers.T1} T2=${s.tiers.T2} T3=${s.tiers.T3}`);
  out.push(`  ~saved     : $${s.estSavedUsd.toFixed(2)} (estimated)`);
  out.push(`  workflow   : ${s.workflow ? `${s.workflow.id} ${s.workflow.done}/${s.workflow.total}` : "(none active)"}`);
  out.push(`  transcript : ${s.transcriptPath}`);
  return { exitCode: 0, output: out.join("\n") };
}

export function runDiff(id1: string, id2: string, opts: SessionsCmdOptions = {}): CmdResult {
  const state = buildState(opts);
  const a = findSession(state, id1);
  const b = findSession(state, id2);
  if (!a || !b) return { exitCode: 1, output: `one or both sessions not found: ${id1}, ${id2}` };
  const row = (label: string, va: string, vb: string) =>
    `  ${label.padEnd(12)} ${va.padEnd(24)} ${vb}`;
  const out: string[] = [];
  out.push(`               ${a.sessionId.slice(0, 8).padEnd(24)} ${b.sessionId.slice(0, 8)}`);
  out.push(row("prompts", String(a.prompts), String(b.prompts)));
  out.push(row("T0/T1/T2/T3", `${a.tiers.T0}/${a.tiers.T1}/${a.tiers.T2}/${a.tiers.T3}`, `${b.tiers.T0}/${b.tiers.T1}/${b.tiers.T2}/${b.tiers.T3}`));
  out.push(row("~saved", `$${a.estSavedUsd.toFixed(2)}`, `$${b.estSavedUsd.toFixed(2)}`));
  out.push(row("branch", a.branch ?? "?", b.branch ?? "?"));
  return { exitCode: 0, output: out.join("\n") };
}

export function runExport(opts: SessionsCmdOptions = {}): CmdResult {
  // Local GDPR-style export of the orchestrator's derived state. Carries no
  // prompt text — only counts, tiers, timestamps, paths.
  const state = buildState(opts);
  const redacted = {
    schema: state.schema,
    generatedAtMs: state.generatedAtMs,
    quota: state.quota,
    worktrees: state.worktrees,
    sessions: state.sessions.map((s) => ({
      sessionId: s.sessionId,
      project: s.project,
      birthMs: s.birthMs,
      mtimeMs: s.mtimeMs,
      prompts: s.prompts,
      tiers: s.tiers,
      estSavedUsd: s.estSavedUsd,
      branch: s.branch,
      worktreePath: s.worktreePath,
    })),
  };
  return { exitCode: 0, output: JSON.stringify(redacted, null, 2) };
}

export function runWatchFrame(opts: SessionsCmdOptions = {}): CmdResult {
  const state = buildState(opts);
  const agg = aggregateCrossSession({ home: opts.home, now: opts.now });
  return { exitCode: 0, output: renderDashboard(state, agg, { now: opts.now }) };
}

export function runFocus(id: string, opts: SessionsCmdOptions = {}): CmdResult {
  const state = buildState(opts);
  const s = findSession(state, id);
  if (!s) return { exitCode: 1, output: `session not found: ${id}` };
  if (s.worktreePath) {
    return { exitCode: 0, output: `cd ${JSON.stringify(s.worktreePath)}` };
  }
  return {
    exitCode: 0,
    output: `session ${s.sessionId.slice(0, 8)} is not mapped to a worktree; transcript: ${s.transcriptPath}`,
  };
}

export function runKill(id: string, args: string[], opts: SessionsCmdOptions = {}): CmdResult {
  const state = buildState(opts);
  const s = findSession(state, id);
  if (!s) return { exitCode: 1, output: `session not found: ${id}` };
  // Honest scope: we hold no pid linkage to an external Claude Code process, so
  // we never fabricate a termination. We surface what we know and let the user
  // act. (Block B's spawn-orchestrator DOES own pids and supports --graceful.)
  const graceful = args.includes("--graceful");
  return {
    exitCode: 0,
    output:
      `mooter does not own this Claude Code session's process (no pid linkage from transcripts).\n` +
      `To stop it, switch to its terminal${s.branch ? ` (branch ${s.branch})` : ""} and exit Claude Code` +
      `${graceful ? " (Ctrl-D / /exit for a graceful stop)" : ""}.\n` +
      `Spawned agents (mooter spawn) are killable with: mooter spawn kill <id> --graceful`,
  };
}

/** Single entry the CLI delegates the NEW subcommands to. `list` stays in cli. */
export function runSessionsExtended(args: string[], opts: SessionsCmdOptions = {}): CmdResult {
  const sub = args[0] ?? "";
  const rest = args.slice(1);
  switch (sub) {
    case "quota":
      return runQuota(opts);
    case "worktrees":
      return runWorktrees(opts);
    case "show":
      return runShow(rest[0] ?? "", opts);
    case "diff":
      return runDiff(rest[0] ?? "", rest[1] ?? "", opts);
    case "export":
      return runExport(opts);
    case "watch":
      return runWatchFrame(opts);
    case "focus":
      return runFocus(rest[0] ?? "", opts);
    case "kill":
      return runKill(rest[0] ?? "", rest, opts);
    default:
      return {
        exitCode: 1,
        output:
          `usage: mooter sessions <list|watch|show|diff|quota|worktrees|kill|focus|export>`,
      };
  }
}

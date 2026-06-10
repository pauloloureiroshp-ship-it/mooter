// Wave 33.5 Block A.1 — local sessions-state cache.
//
// The watcher daemon (or any CLI invocation) snapshots discovered sessions +
// worktrees + quota to ~/.mooter/sessions_state.json so the TUI and statusline
// can read a single cheap file instead of re-scanning every transcript. Pure
// local cache; safe to delete; rebuilt on next poll.

import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

import { mooterPath } from "../../synthesis/src/config.ts";
import { discoverSessions, type DiscoverOptions } from "./discovery.ts";
import { listWorktrees, annotateWorktrees, type GitRunner } from "./worktrees.ts";
import { forecastQuota } from "./quota.ts";
import type { SessionInfo, WorktreeInfo, QuotaForecast } from "./types.ts";

export interface SessionsState {
  schema: 1;
  generatedAtMs: number;
  sessions: SessionInfo[];
  worktrees: WorktreeInfo[];
  quota: QuotaForecast;
}

export function sessionsStatePath(): string {
  return mooterPath("sessions_state.json");
}

export interface BuildStateOptions extends DiscoverOptions {
  cwd?: string;
  gitRunner?: GitRunner;
}

/** Discover + worktree-annotate + forecast into one immutable snapshot. */
export function buildState(opts: BuildStateOptions = {}): SessionsState {
  const now = opts.now ?? Date.now();
  const worktrees = listWorktrees(opts.cwd, opts.gitRunner);
  const sessions = annotateWorktrees(discoverSessions({ ...opts, now }), worktrees);
  const quota = forecastQuota({ home: opts.home, now });
  return { schema: 1, generatedAtMs: now, sessions, worktrees, quota };
}

export function writeState(state: SessionsState, path = sessionsStatePath()): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(state) + "\n", "utf8");
}

export function readState(path = sessionsStatePath()): SessionsState | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as SessionsState;
  } catch {
    return null;
  }
}

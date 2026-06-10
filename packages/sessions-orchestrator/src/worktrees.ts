// Wave 33.5 Block A — git worktree mapping.
//
// Parses `git worktree list --porcelain` and exposes the encoded-folder-name
// each worktree maps to, so a session transcript (stored under an encoded cwd)
// can be tied back to its branch/terminal. The git call is injectable for tests
// and cached by the caller (Block A polls it at most every 30s).

import { execFileSync } from "node:child_process";

import type { WorktreeInfo } from "./types.ts";

/** Claude Code encodes a project path by replacing every non-alphanumeric char with '-'. */
export function encodeProjectDir(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, "-");
}

export type GitRunner = (args: string[], cwd?: string) => string;

const defaultRunner: GitRunner = (args, cwd) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

/**
 * Parse the porcelain output of `git worktree list --porcelain`.
 *
 * Records are separated by blank lines; each begins with `worktree <path>` and
 * may carry `HEAD <sha>`, `branch refs/heads/<name>`, `bare`, or `detached`.
 */
export function parseWorktreePorcelain(text: string): WorktreeInfo[] {
  const out: WorktreeInfo[] = [];
  let cur: Partial<WorktreeInfo> | null = null;
  const flush = () => {
    if (cur && cur.path) {
      out.push({
        path: cur.path,
        head: cur.head ?? "",
        branch: cur.branch ?? null,
        bare: cur.bare ?? false,
        detached: cur.detached ?? false,
        encoded: encodeProjectDir(cur.path),
      });
    }
    cur = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (line === "") {
      flush();
      continue;
    }
    if (line.startsWith("worktree ")) {
      flush();
      cur = { path: line.slice("worktree ".length) };
    } else if (!cur) {
      continue;
    } else if (line.startsWith("HEAD ")) {
      cur.head = line.slice("HEAD ".length);
    } else if (line.startsWith("branch ")) {
      cur.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
    } else if (line === "bare") {
      cur.bare = true;
    } else if (line === "detached") {
      cur.detached = true;
    }
  }
  flush();
  return out;
}

export function listWorktrees(cwd?: string, run: GitRunner = defaultRunner): WorktreeInfo[] {
  try {
    return parseWorktreePorcelain(run(["worktree", "list", "--porcelain"], cwd));
  } catch {
    return [];
  }
}

/**
 * Match each session's encoded project folder to a worktree, annotating
 * worktreePath/branch in place. The encoded folder name is the join point.
 */
export function annotateWorktrees<T extends { project: string; worktreePath?: string | null; branch?: string | null }>(
  sessions: T[],
  worktrees: WorktreeInfo[],
): T[] {
  const byEncoded = new Map(worktrees.map((w) => [w.encoded, w]));
  for (const s of sessions) {
    const w = byEncoded.get(s.project);
    if (w) {
      s.worktreePath = w.path;
      s.branch = w.branch;
    }
  }
  return sessions;
}

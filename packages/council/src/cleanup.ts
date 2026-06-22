// Worktree cleanup — zero leaks, idempotent.
//
// Removes member worktrees (git worktree remove → fs rm fallback → prune) and reaps
// stale conductor leases. Branches are intentionally KEPT (the diffs are the
// deliverable). Safe to call twice — already-removed worktrees are not an error.

import { execFileSync } from "node:child_process";
import { rmSync, existsSync } from "node:fs";
import { reap } from "../../worktree-conductor/src/conductor.ts";

export interface CleanupResult {
  removed: string[];
  failed: string[];
  reaped: string[];
}

function gitQuiet(args: string[], cwd: string): boolean {
  try {
    execFileSync("git", args, { cwd, stdio: ["ignore", "ignore", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

export function cleanupWorktrees(
  repoDir: string,
  worktreeDirs: string[],
  opts: { home?: string } = {},
): CleanupResult {
  const removed: string[] = [];
  const failed: string[] = [];

  for (const dir of worktreeDirs) {
    let ok = gitQuiet(["worktree", "remove", "--force", dir], repoDir);
    if (!ok && existsSync(dir)) {
      try {
        rmSync(dir, { recursive: true, force: true });
        ok = true;
      } catch {
        ok = false;
      }
    }
    if (ok || !existsSync(dir)) removed.push(dir);
    else failed.push(dir);
  }

  gitQuiet(["worktree", "prune"], repoDir);

  let reaped: string[] = [];
  try {
    reaped = reap({ home: opts.home });
  } catch {
    reaped = [];
  }

  return { removed, failed, reaped };
}

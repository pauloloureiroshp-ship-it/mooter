// Wave 33.5 Block B.2 — per-spawn git worktree lifecycle.
//
// Each spawn runs in its own throwaway worktree on a `spawn/<id>` branch cut
// from the base, so concurrent spawns never collide and the source tree is never
// mutated. The git runner is injectable for tests.

import { join } from "node:path";
import { execFileSync } from "node:child_process";

import { spawnDir } from "./state.ts";

export type GitRunner = (args: string[], cwd?: string) => string;

const defaultGit: GitRunner = (args, cwd) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

export interface CreateWorktreeResult {
  worktreePath: string;
  branch: string;
}

export function spawnBranch(id: string): string {
  return `spawn/${id}`;
}

export function createWorktree(
  id: string,
  opts: { baseBranch?: string; sourceCwd?: string; home?: string; git?: GitRunner } = {},
): CreateWorktreeResult {
  const git = opts.git ?? defaultGit;
  const worktreePath = join(spawnDir(id, opts.home), "tree");
  const branch = spawnBranch(id);
  const base = opts.baseBranch ?? "HEAD";
  git(["worktree", "add", "-b", branch, worktreePath, base], opts.sourceCwd);
  return { worktreePath, branch };
}

export function removeWorktree(
  id: string,
  opts: { sourceCwd?: string; home?: string; git?: GitRunner; force?: boolean } = {},
): boolean {
  const git = opts.git ?? defaultGit;
  const worktreePath = join(spawnDir(id, opts.home), "tree");
  try {
    git(["worktree", "remove", worktreePath, ...(opts.force ? ["--force"] : [])], opts.sourceCwd);
    return true;
  } catch {
    return false;
  }
}

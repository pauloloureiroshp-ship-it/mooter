import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanupWorktrees } from "../src/cleanup.ts";

function initRepo(): { repoDir: string; base: string } {
  const repoDir = mkdtempSync(join(tmpdir(), "council-clean-"));
  const g = (args: string[]) => execFileSync("git", args, { cwd: repoDir, encoding: "utf8" });
  g(["init", "-q", "-b", "main"]);
  g(["config", "user.email", "t@t"]);
  g(["config", "user.name", "t"]);
  writeFileSync(join(repoDir, "f.txt"), "x\n");
  g(["add", "-A"]);
  g(["commit", "-q", "-m", "base"]);
  return { repoDir, base: g(["rev-parse", "HEAD"]).trim() };
}
function worktreeCount(repoDir: string): number {
  return execFileSync("git", ["worktree", "list", "--porcelain"], { cwd: repoDir, encoding: "utf8" })
    .split("\n")
    .filter((l) => l.startsWith("worktree ")).length;
}

test("cleanupWorktrees removes all member worktrees (zero leaks), keeps branches", () => {
  const { repoDir, base } = initRepo();
  const scratch = mkdtempSync(join(tmpdir(), "council-clean-wt-"));
  const dirs = ["w1", "w2"].map((b) => join(scratch, b));
  execFileSync("git", ["worktree", "add", "-b", "council/w1", dirs[0], base], { cwd: repoDir });
  execFileSync("git", ["worktree", "add", "-b", "council/w2", dirs[1], base], { cwd: repoDir });
  assert.equal(worktreeCount(repoDir), 3);

  const res = cleanupWorktrees(repoDir, dirs, { home: mkdtempSync(join(tmpdir(), "council-home-")) });
  assert.equal(res.failed.length, 0);
  assert.equal(worktreeCount(repoDir), 1, "only main worktree remains");
  assert.ok(dirs.every((d) => !existsSync(d)));

  // branches kept (the diffs are the deliverable)
  const branches = execFileSync("git", ["branch", "--format=%(refname:short)"], { cwd: repoDir, encoding: "utf8" });
  assert.match(branches, /council\/w1/);
});

test("cleanupWorktrees is idempotent (already-removed is not an error)", () => {
  const { repoDir } = initRepo();
  const res = cleanupWorktrees(repoDir, [join(repoDir, "nope-1"), join(repoDir, "nope-2")], {
    home: mkdtempSync(join(tmpdir(), "council-home-")),
  });
  assert.equal(res.failed.length, 0);
  assert.ok(Array.isArray(res.reaped));
});

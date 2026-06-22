import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildWithCouncil, type Implementor } from "../src/builder.ts";
import type { Council, ModelSpec } from "../src/types.ts";

function seat(id: string): ModelSpec {
  return { id, tier: "T0", kind: "local", call: async () => ({ text: "", costUsd: 0, latencyMs: 0 }) };
}

function initRepo(): { repoDir: string; base: string } {
  const repoDir = mkdtempSync(join(tmpdir(), "council-repo-"));
  const g = (args: string[]) => execFileSync("git", args, { cwd: repoDir, encoding: "utf8" });
  g(["init", "-q", "-b", "main"]);
  g(["config", "user.email", "t@t"]);
  g(["config", "user.name", "t"]);
  writeFileSync(join(repoDir, "impl.cjs"), "module.exports = { add: (a, b) => 0 };\n"); // stub (fails)
  writeFileSync(
    join(repoDir, "run-tests.cjs"),
    "const { add } = require('./impl.cjs'); if (add(2,3) !== 5) { console.error('FAIL'); process.exit(1); } console.log('OK');\n",
  );
  g(["add", "-A"]);
  g(["commit", "-q", "-m", "base"]);
  return { repoDir, base: g(["rev-parse", "HEAD"]).trim() };
}

function worktreeCount(repoDir: string): number {
  const out = execFileSync("git", ["worktree", "list", "--porcelain"], { cwd: repoDir, encoding: "utf8" });
  return out.split("\n").filter((l) => l.startsWith("worktree ")).length;
}
function branches(repoDir: string): string[] {
  return execFileSync("git", ["branch", "--format=%(refname:short)"], { cwd: repoDir, encoding: "utf8" })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

const writeImpl = (body: string): Implementor => async (_m, { worktreeDir }) => {
  writeFileSync(join(worktreeDir, "impl.cjs"), body);
};
const bySeat = (correctPrefix: string): Implementor => async (m, ctx) => {
  const good = "module.exports = { add: (a, b) => a + b };\n";
  const bad = "module.exports = { add: (a, b) => a * b };\n";
  await writeImpl(m.id.startsWith(correctPrefix) ? good : bad)(m, ctx);
};

test("GATE C: Builder Council picks a passing implementation; worktrees cleaned (zero leaks); branches kept", async () => {
  const { repoDir, base } = initRepo();
  const home = mkdtempSync(join(tmpdir(), "council-home-"));
  const scratchDir = mkdtempSync(join(tmpdir(), "council-scratch-"));
  const council: Council = { seats: [seat("good-a"), seat("good-b"), seat("bad-c")], judge: null, note: "", estCostUsd: 0 };

  const res = await buildWithCouncil(council, { repoDir, base, spec: "make add() correct", testArgv: ["node", "run-tests.cjs"], home, scratchDir }, { implementor: bySeat("good") });

  assert.ok(res.winner, "a winner exists");
  assert.equal(res.winner!.passed, true);
  assert.ok(res.winner!.seatId.startsWith("good"), `winner ${res.winner!.seatId} should be a passing seat`);
  assert.equal(res.members.find((m) => m.seatId === "bad-c")!.passed, false, "wrong impl fails tests");

  // zero leaks: only the main worktree remains, scratch dir removed
  assert.equal(worktreeCount(repoDir), 1, "only the main worktree remains");
  assert.equal(res.cleanedUp, true);
  assert.ok(!existsSync(scratchDir) || readdirSync(scratchDir).length === 0, "scratch dir cleaned");

  // branches kept as the deliverable (diffs preserved)
  const b = branches(repoDir);
  assert.ok(b.some((x) => x.startsWith("council/good-a")), `branches kept: ${b.join(",")}`);
});

test("GATE C: no implementation passes → honest 'no winner', no fabrication", async () => {
  const { repoDir, base } = initRepo();
  const home = mkdtempSync(join(tmpdir(), "council-home-"));
  const scratchDir = mkdtempSync(join(tmpdir(), "council-scratch-"));
  const council: Council = { seats: [seat("x"), seat("y")], judge: null, note: "", estCostUsd: 0 };

  const res = await buildWithCouncil(
    council,
    { repoDir, base, spec: "impossible", testArgv: ["node", "run-tests.cjs"], home, scratchDir },
    { implementor: writeImpl("module.exports = { add: (a, b) => a - b };\n") }, // always wrong
  );

  assert.equal(res.winner, null, "no winner when nothing passes");
  assert.match(res.note, /no implementation passed/);
  assert.equal(worktreeCount(repoDir), 1, "still cleaned up");
});

test("GATE C: a winner branch actually contains the fix (real diff, real test pass)", async () => {
  const { repoDir, base } = initRepo();
  const home = mkdtempSync(join(tmpdir(), "council-home-"));
  const scratchDir = mkdtempSync(join(tmpdir(), "council-scratch-"));
  const council: Council = { seats: [seat("solo")], judge: null, note: "", estCostUsd: 0 };

  const res = await buildWithCouncil(council, { repoDir, base, spec: "fix add", testArgv: ["node", "run-tests.cjs"], home, scratchDir }, { implementor: writeImpl("module.exports = { add: (a, b) => a + b };\n") });

  assert.ok(res.winner);
  // the kept branch holds the corrected impl
  const show = execFileSync("git", ["show", `${res.winner!.branch}:impl.cjs`], { cwd: repoDir, encoding: "utf8" });
  assert.match(show, /a \+ b/);
});

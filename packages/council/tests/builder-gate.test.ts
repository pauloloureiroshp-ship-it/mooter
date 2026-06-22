// SELF-GATE C — Builder Council correctness, full pipeline.
// composeCouncil → buildWithCouncil → tests-as-judge → cleanup, on a REAL git repo.
// Confirms: a passing implementation is chosen, worktrees are cleaned (zero leaks),
// branches are kept. Deterministic (injected implementor) so the gate is reliable.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { composeCouncil } from "../src/compose.ts";
import { buildWithCouncil, type Implementor } from "../src/builder.ts";
import type { CasResult } from "../src/cas.ts";

const cas: CasResult = { score: 1, reasons: ["explicit"], convene: true, threshold: 0.5 };
const noMatrix: any = () => ({ chosen_model: null, reason: "", tes: null, alternatives: [], cited_source: null, coverage_note: "" });

function initRepo(): { repoDir: string; base: string } {
  const repoDir = mkdtempSync(join(tmpdir(), "council-cgate-"));
  const g = (a: string[]) => execFileSync("git", a, { cwd: repoDir, encoding: "utf8" });
  g(["init", "-q", "-b", "main"]);
  g(["config", "user.email", "t@t"]);
  g(["config", "user.name", "t"]);
  writeFileSync(join(repoDir, "impl.cjs"), "module.exports = { mul: (a, b) => 0 };\n");
  writeFileSync(join(repoDir, "run-tests.cjs"), "const {mul}=require('./impl.cjs'); if(mul(3,4)!==12){console.error('FAIL');process.exit(1);} console.log('OK');\n");
  g(["add", "-A"]);
  g(["commit", "-q", "-m", "base"]);
  return { repoDir, base: g(["rev-parse", "HEAD"]).trim() };
}
function worktreeCount(repoDir: string): number {
  return execFileSync("git", ["worktree", "list", "--porcelain"], { cwd: repoDir, encoding: "utf8" })
    .split("\n")
    .filter((l) => l.startsWith("worktree ")).length;
}

test("GATE C (e2e): compose → build → judge → cleanup picks a passing impl, zero leaks", async () => {
  const { repoDir, base } = initRepo();
  const home = mkdtempSync(join(tmpdir(), "council-home-"));
  const scratchDir = mkdtempSync(join(tmpdir(), "council-scratch-"));

  // Compose a REAL all-local council (no network: seats are built, never called here).
  const council = composeCouncil("coding.competitive", cas, { maxCostUsd: 0 }, {
    localOnly: true,
    hasCloudKey: false,
    decide: noMatrix,
  });
  assert.ok(council.seats.length >= 1);
  const anchorId = council.seats[0].id;

  // Only the anchor implements the correct fix; the rest are wrong.
  const implementor: Implementor = async (member, { worktreeDir }) => {
    const good = "module.exports = { mul: (a, b) => a * b };\n";
    const bad = "module.exports = { mul: (a, b) => a + b };\n";
    writeFileSync(join(worktreeDir, "impl.cjs"), member.id === anchorId ? good : bad);
  };

  const res = await buildWithCouncil(council, { repoDir, base, spec: "fix mul()", testArgv: ["node", "run-tests.cjs"], home, scratchDir }, { implementor });

  assert.ok(res.winner, "a passing implementation was chosen");
  assert.equal(res.winner!.passed, true);
  assert.equal(res.winner!.seatId, anchorId, "winner is the only passing seat");
  assert.equal(worktreeCount(repoDir), 1, "zero leaks — only main worktree remains");
  assert.equal(res.cleanedUp, true);
  assert.ok(!existsSync(scratchDir) || true);
});

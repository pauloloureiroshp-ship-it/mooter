// Builder Council — concurrent implementations adjudicated by tests.
//
// Each member implements the change in its OWN isolated git worktree, in parallel.
// Tests are the judge: pass-rate = utility, objective ground truth, not vibes. The
// worktree-conductor coordinates the lock/heartbeats (it does NOT create worktrees —
// Day-0 recon §8 — so the Builder runs `git worktree add/remove` itself, on top).
//
// HARD INVARIANT: the Builder NEVER merges to main and never touches the base ref —
// it only creates member BRANCHES + worktrees and produces diffs. Losing worktrees
// are removed (zero leaks); branches are kept as the deliverable.

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parallel } from "../../workflow/src/primitives.ts";
import { acquireWithRecovery, reap } from "../../worktree-conductor/src/conductor.ts";
import { release } from "../../worktree-conductor/src/locks.ts";
import { judgeByTests } from "./tests-judge.ts";
import type { Council, ModelSpec } from "./types.ts";

export interface BuilderTask {
  /** Git repo root the worktrees are created from. */
  repoDir: string;
  /** Base ref (commit/branch) the member worktrees start from. */
  base: string;
  /** Human description of the change, handed to each implementor. */
  spec: string;
  /** Test command argv run in each worktree (cwd = worktree). exit 0 = pass. */
  testArgv: string[];
  /** Member branch prefix. Default "council/". */
  branchPrefix?: string;
  /** Scratch dir for worktrees. Default <repoDir>/.council-worktrees. */
  scratchDir?: string;
  /** When true, a dedicated seat generates tests in each worktree before judging. */
  testsMissing?: boolean;
  /** Conductor lock home (tests → tmp). */
  home?: string;
  /** Lock owner session id. Default "council-builder". */
  sessionId?: string;
}

/** Mutates files in `worktreeDir` to implement the task. Injected (LLM patch / test). */
export type Implementor = (
  member: ModelSpec,
  ctx: { worktreeDir: string; task: BuilderTask },
) => Promise<void>;

export interface MemberBuild {
  seatId: string;
  branch: string;
  worktreeDir: string;
  applied: boolean;
  passed: boolean;
  /** Sum of added+deleted lines vs base — length signal for the length-neutral judge. */
  diffLines: number;
  /** The unified diff vs base (capped) — shown to the anonymized LLM tie-break judge. */
  diff?: string;
  testOutput: string;
  error?: string;
}

export interface BuilderResult {
  winner: MemberBuild | null;
  members: MemberBuild[];
  cleanedUp: boolean;
  note: string;
}

export interface BuilderOptions {
  implementor: Implementor;
  concurrency?: number;
  /** A dedicated seat that writes tests into a worktree when task.testsMissing. */
  testGenerator?: Implementor;
  /** Override the judge (sync). Default: judgeByTests (length-neutral + LLM tie-break). */
  pickWinner?: (passing: MemberBuild[]) => MemberBuild | null;
}

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
function gitSafe(args: string[], cwd: string): { ok: boolean; out: string } {
  try {
    return { ok: true, out: git(args, cwd) };
  } catch (e: any) {
    return { ok: false, out: String(e?.stderr ?? e?.message ?? e) };
  }
}
function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function runTests(testArgv: string[], cwd: string): { passed: boolean; output: string } {
  if (testArgv.length === 0) return { passed: false, output: "no test command" };
  try {
    const out = execFileSync(testArgv[0], testArgv.slice(1), {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { passed: true, output: out.slice(-2000) };
  } catch (e: any) {
    return { passed: false, output: String(e?.stdout ?? "") + String(e?.stderr ?? e?.message ?? e).slice(-2000) };
  }
}

function diffLinesVsBase(worktreeDir: string, base: string): number {
  const { ok, out } = gitSafe(["diff", "--numstat", base], worktreeDir);
  if (!ok) return 0;
  let n = 0;
  for (const line of out.trim().split("\n")) {
    if (!line) continue;
    const [add, del] = line.split("\t");
    n += (Number(add) || 0) + (Number(del) || 0);
  }
  return n;
}

/**
 * Run a Builder Council: one worktree per seat, parallel implementation, tests as
 * judge, then cleanup. Never merges to main; produces member branches + a winner.
 */
export async function buildWithCouncil(
  council: Council,
  task: BuilderTask,
  opts: BuilderOptions,
): Promise<BuilderResult> {
  const concurrency = opts.concurrency ?? 4;
  const prefix = task.branchPrefix ?? "council/";
  const scratch = task.scratchDir ?? join(task.repoDir, ".council-worktrees");
  const sessionId = task.sessionId ?? "council-builder";
  const lockResource = `council-builder:${sanitize(task.repoDir)}`;
  const notes: string[] = [];

  mkdirSync(scratch, { recursive: true });

  // Coordinate via the conductor lock (best-effort; within-process we serialize adds).
  let locked = false;
  try {
    const acq = acquireWithRecovery(lockResource, { sessionId }, { home: task.home });
    locked = acq.outcome.acquired;
    if (!locked) notes.push("conductor lock held by another session (proceeding serialized)");
  } catch {
    notes.push("conductor lock unavailable (proceeding)");
  }

  const members: MemberBuild[] = [];
  // 1) Create worktrees SERIALLY (refs/index race-safe).
  for (let i = 0; i < council.seats.length; i++) {
    const seat = council.seats[i];
    const branch = `${prefix}${sanitize(seat.id)}-${i}`;
    const worktreeDir = join(scratch, sanitize(branch));
    const add = gitSafe(["worktree", "add", "-b", branch, worktreeDir, task.base], task.repoDir);
    members.push({
      seatId: seat.id,
      branch,
      worktreeDir,
      applied: false,
      passed: false,
      diffLines: 0,
      testOutput: "",
      error: add.ok ? undefined : `worktree add failed: ${add.out}`,
    });
  }

  // 2) Implement + test IN PARALLEL (independent worktrees). Pair each MemberBuild
  //    with its seat up front — workflow.parallel passes only the item, not an index.
  const pairs = members.map((m, i) => ({ m, seat: council.seats[i] }));
  await parallel(
    pairs,
    async ({ m, seat }): Promise<void> => {
      if (m.error) return; // worktree add failed
      try {
        await opts.implementor(seat, { worktreeDir: m.worktreeDir, task });
        m.applied = true;
      } catch (e) {
        m.error = `implementor error: ${(e as Error).message}`;
        return;
      }
      // If the task ships no tests, a dedicated seat generates them first (design 11e).
      if (task.testsMissing && opts.testGenerator) {
        try {
          await opts.testGenerator(seat, { worktreeDir: m.worktreeDir, task });
        } catch (e) {
          m.error = `test generation error: ${(e as Error).message}`;
        }
      }
      m.diffLines = diffLinesVsBase(m.worktreeDir, task.base);
      m.diff = gitSafe(["diff", task.base], m.worktreeDir).out.slice(0, 4000);
      const t = runTests(task.testArgv, m.worktreeDir);
      m.passed = t.passed;
      m.testOutput = t.output;
    },
    { concurrency },
  );

  // 3) Persist each member's diff as a branch commit (deliverable). Serial, best-effort.
  for (const m of members) {
    if (!m.applied) continue;
    gitSafe(["add", "-A"], m.worktreeDir);
    gitSafe(["-c", "user.email=council@mooter", "-c", "user.name=Council Builder", "commit", "-m", `council: ${m.seatId}`], m.worktreeDir);
  }

  // 4) Judge: tests are the judge; the LLM judge only breaks ties among passing builds.
  const passing = members.filter((m) => m.passed);
  let winner: MemberBuild | null;
  if (opts.pickWinner) {
    winner = passing.length ? opts.pickWinner(passing) : null;
    if (!winner) notes.push(passing.length ? "judge returned no winner" : "no implementation passed — no winner (honest)");
  } else {
    const j = await judgeByTests(members, { llmJudge: council.judge });
    winner = j.winner;
    notes.push(j.note);
  }

  // 5) Cleanup: remove ALL worktrees (zero leaks); KEEP branches (the diffs). Reap stale locks.
  let cleanedUp = true;
  for (const m of members) {
    const rm = gitSafe(["worktree", "remove", "--force", m.worktreeDir], task.repoDir);
    if (!rm.ok && existsSync(m.worktreeDir)) {
      try {
        rmSync(m.worktreeDir, { recursive: true, force: true });
      } catch {
        cleanedUp = false;
      }
    }
  }
  gitSafe(["worktree", "prune"], task.repoDir);
  try {
    if (existsSync(scratch)) rmSync(scratch, { recursive: true, force: true });
  } catch {
    /* scratch root best-effort */
  }
  try {
    reap({ home: task.home });
    if (locked) release(lockResource, sessionId, { home: task.home });
  } catch {
    /* conductor cleanup best-effort */
  }

  return {
    winner,
    members,
    cleanedUp,
    note: `${passing.length}/${members.length} passed · ${notes.join("; ") || "ok"}`,
  };
}

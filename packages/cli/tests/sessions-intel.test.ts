// Wave Mega 50-51 (4.C) — sessions intel: worktree chips · tmux-attach ·
// file-based notify/wait. Everything runs against an isolated tmp HOME with
// injected git/tmux runners — no real repo, tmux, or ~/.mooter is touched.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  runSessionsWorktrees,
  runSessionsTmuxAttach,
  runSessionsNotify,
  runSessionsWait,
  runSessionsAsync,
  type TmuxRunner,
} from "../src/commands/sessions.ts";

const PORCELAIN = [
  "worktree /work/paulo-frugal",
  "HEAD 1111111111111111111111111111111111111111",
  "branch refs/heads/main",
  "",
  "worktree /work/wave-mega-50-51-fable",
  "HEAD 2222222222222222222222222222222222222222",
  "branch refs/heads/feat/wave_mega-4-session-intel",
  "",
].join("\n");

const gitOk = () => PORCELAIN;
const gitFail = () => {
  throw new Error("fatal: not a git repository");
};

function tmpHome(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeHeartbeat(home: string, sid: string, worktreePath: string, terminalName: string, nowMs: number): void {
  const dir = join(home, ".mooter", "orchestration", "heartbeats");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${sid}.json`),
    JSON.stringify({
      session_id: sid,
      terminal_name: terminalName,
      worktree_path: worktreePath,
      branch: null,
      intent: "",
      last_heartbeat: new Date(nowMs).toISOString(),
      last_heartbeat_ms: nowMs,
      active_locks: [],
      pending_intents: [],
      pid: 0,
    }),
  );
}

// ── worktrees ────────────────────────────────────────────────────────────────

test("sessions worktrees renders chips from porcelain and marks ◀ this", () => {
  const home = tmpHome("mooter-intel-wt-");
  const r = runSessionsWorktrees({ home, cwd: "/work/wave-mega-50-51-fable", gitRunner: gitOk, now: 1000 });
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /\[paulo-frugal main\]/);
  assert.match(r.output, /\[wave-mega-50-51-fable feat\/wave_mega-4-session-intel ◀ this\]/);
  // No heartbeats recorded → honest empty state, never a fake "live".
  assert.match(r.output, /no live sessions/);
  assert.doesNotMatch(r.output, /● live/);
});

test("sessions worktrees marks a worktree live from a fresh heartbeat", () => {
  const home = tmpHome("mooter-intel-wt-live-");
  const now = 5_000_000;
  writeHeartbeat(home, "aaaa1111", "/work/paulo-frugal", "frugal-term", now - 1000); // fresh (< 30s)
  const r = runSessionsWorktrees({ home, cwd: "/work/wave-mega-50-51-fable", gitRunner: gitOk, now });
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /\[paulo-frugal main ● live frugal-term\]/);
  assert.doesNotMatch(r.output, /no live sessions/);
});

test("sessions worktrees handles not-a-repo gracefully", () => {
  const home = tmpHome("mooter-intel-wt-norepo-");
  const r = runSessionsWorktrees({ home, cwd: "/elsewhere", gitRunner: gitFail });
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /not a git repository/);
});

// ── tmux-attach ──────────────────────────────────────────────────────────────

function fakeTmux(available: boolean, sessions: string[]): { tmux: TmuxRunner; attached: string[] } {
  const attached: string[] = [];
  return {
    attached,
    tmux: {
      available: () => available,
      ls: () => sessions,
      attach: (t) => {
        attached.push(t);
        return 0;
      },
    },
  };
}

test("sessions tmux-attach is honest when tmux is absent (exit 1)", () => {
  const home = tmpHome("mooter-intel-tmux-absent-");
  const { tmux } = fakeTmux(false, []);
  const r = runSessionsTmuxAttach("abc", { home, tmux });
  assert.equal(r.exitCode, 1);
  assert.match(r.output, /tmux not found/);
});

test("sessions tmux-attach attaches to the recorded target when it exists", () => {
  const home = tmpHome("mooter-intel-tmux-rec-");
  const now = Date.now();
  writeHeartbeat(home, "bbbb2222-cccc", "/work/x", "mooter-main", now);
  const { tmux, attached } = fakeTmux(true, ["mooter-main", "scratch"]);
  const r = runSessionsTmuxAttach("bbbb2222", { home, tmux });
  assert.equal(r.exitCode, 0);
  assert.deepEqual(attached, ["mooter-main"]);
  assert.match(r.output, /attaching to tmux session 'mooter-main'/);
});

test("sessions tmux-attach lists sessions + suggests when nothing is recorded (never spawns)", () => {
  const home = tmpHome("mooter-intel-tmux-sugg-");
  const { tmux, attached } = fakeTmux(true, ["alpha", "beta"]);
  const r = runSessionsTmuxAttach("unknown-session", { home, tmux });
  assert.equal(r.exitCode, 1);
  assert.equal(attached.length, 0, "must never attach (or spawn) without a recorded target");
  assert.match(r.output, /no tmux pane\/window recorded/);
  assert.match(r.output, /tmux attach -t alpha/);
  assert.match(r.output, /tmux attach -t beta/);
});

// ── notify / wait ────────────────────────────────────────────────────────────

test("sessions notify appends to the target inbox; wait picks it up (roundtrip)", async () => {
  const home = tmpHome("mooter-intel-inbox-");
  // Start waiting FIRST (fast poll, short timeout), then notify.
  const waitP = runSessionsWait("sess-1", ["--timeout", "5"], { home, pollMs: 20 });
  await new Promise((r) => setTimeout(r, 60));
  const n = runSessionsNotify("sess-1", "phase 4 done — pull my branch", { home, fromSessionId: "sender-9" });
  assert.equal(n.exitCode, 0);
  const inbox = join(home, ".mooter", "sessions", "inbox", "sess-1.jsonl");
  assert.ok(existsSync(inbox), "inbox file created");
  const rec = JSON.parse(readFileSync(inbox, "utf8").trim());
  assert.equal(rec.message, "phase 4 done — pull my branch");
  assert.equal(rec.from, "sender-9");
  assert.ok(rec.ts);

  const w = await waitP;
  assert.equal(w.exitCode, 0);
  assert.match(w.output, /phase 4 done — pull my branch/);
  assert.match(w.output, /from sender-9/);
});

test("sessions wait times out with exit 3 when no message arrives", async () => {
  const home = tmpHome("mooter-intel-timeout-");
  const r = await runSessionsWait("lonely", ["--timeout", "0.2"], { home, pollMs: 20 });
  assert.equal(r.exitCode, 3);
  assert.match(r.output, /timeout/);
});

test("sessions wait/notify require explicit ids (usage, exit 1)", async () => {
  const home = tmpHome("mooter-intel-usage-");
  const n = runSessionsNotify("", "hi", { home });
  assert.equal(n.exitCode, 1);
  assert.match(n.output, /usage/);
  const w = await runSessionsAsync(["wait"], { home });
  assert.equal(w.exitCode, 1);
  assert.match(w.output, /usage/);
});

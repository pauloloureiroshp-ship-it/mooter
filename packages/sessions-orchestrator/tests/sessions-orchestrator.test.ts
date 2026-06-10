// Wave 33.5 Block A — @mooter/sessions-orchestrator tests.
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { discoverSessions, estSaved } from "../src/discovery.ts";
import { parseWorktreePorcelain, encodeProjectDir, annotateWorktrees, listWorktrees } from "../src/worktrees.ts";
import { forecastQuota } from "../src/quota.ts";
import { resolveTerminalLabel, terminalChip } from "../src/terminal.ts";
import { progressDots, workflowChip } from "../src/workflow-chip.ts";
import { aggregateCrossSession } from "../src/aggregator.ts";
import { runSessionsExtended } from "../src/commands.ts";

const NOW = 1_780_000_000_000; // fixed "now"

/** Build a fake ~ with two projects, three sessions, and a decisions.log. */
function fakeHome(): string {
  const home = mkdtempSync(join(tmpdir(), "moo-sess-"));
  const projA = join(home, ".claude", "projects", "-home-paulo-frugal");
  const projB = join(home, ".claude", "projects", "-tmp-other");
  mkdirSync(projA, { recursive: true });
  mkdirSync(projB, { recursive: true });

  // session a: 2 real prompts (one string, one block) + a tool_result-only turn
  const a = [
    JSON.stringify({ type: "user", message: { content: "hello" } }),
    JSON.stringify({ type: "user", message: { content: [{ type: "text", text: "do x" }] } }),
    JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: "ok" }] } }),
    JSON.stringify({ type: "assistant", message: { content: "hi" } }),
  ].join("\n");
  writeFileSync(join(projA, "aaaaaaaa-1111-2222-3333-444444444444.jsonl"), a);

  // session b: 1 prompt
  writeFileSync(
    join(projA, "bbbbbbbb-1111-2222-3333-444444444444.jsonl"),
    JSON.stringify({ type: "user", message: { content: "only one" } }),
  );

  // session c in another project
  writeFileSync(
    join(projB, "cccccccc-1111-2222-3333-444444444444.jsonl"),
    JSON.stringify({ type: "user", message: { content: "other proj" } }),
  );

  // decisions.log: session a → T0,T0,T2 ; session b → T3 ; category mix
  const dlogDir = join(home, ".claude", "tools", "router");
  mkdirSync(dlogDir, { recursive: true });
  const dlog = [
    { event: "classified", session_id: "aaaaaaaa-1111-2222-3333-444444444444", tier: "T0", task_category: "summarize", ts_ms: NOW - 60000 },
    { event: "classified", session_id: "aaaaaaaa-1111-2222-3333-444444444444", tier: "T0", task_category: "summarize", ts_ms: NOW - 50000 },
    { event: "classified", session_id: "aaaaaaaa-1111-2222-3333-444444444444", tier: "T2", task_category: "bug_investigation", ts_ms: NOW - 40000 },
    { event: "classified", session_id: "bbbbbbbb-1111-2222-3333-444444444444", tier: "T3", task_category: "architecture", ts_ms: NOW - 30000 },
    { event: "classified", session_id: "bbbbbbbb-1111-2222-3333-444444444444", tier: "T0", task_category: "summarize", ts_ms: NOW - 20000 },
    { event: "arbiter_call", outcome: "failed" }, // non-classified line ignored
  ].map((o) => JSON.stringify(o)).join("\n");
  writeFileSync(join(dlogDir, "decisions.log"), dlog);

  return home;
}

test("discoverSessions finds sessions across ALL projects, newest first", () => {
  const home = fakeHome();
  const s = discoverSessions({ home, now: NOW, liveSessionId: "aaaaaaaa-1111-2222-3333-444444444444" });
  assert.strictEqual(s.length, 3);
  // exactly the explicit live id is flagged live
  assert.strictEqual(s.filter((x) => x.live).length, 1);
  const a = s.find((x) => x.sessionId.startsWith("aaaa"))!;
  assert.strictEqual(a.prompts, 2, "tool_result-only turn must not count");
  assert.deepStrictEqual(a.tiers, { T0: 2, T1: 0, T2: 1, T3: 0 });
  assert.strictEqual(a.live, true);
});

test("estSaved uses the nominal per-tier table", () => {
  assert.ok(Math.abs(estSaved({ T0: 1, T1: 0, T2: 0, T3: 0 }) - 0.035) < 1e-9);
  assert.strictEqual(estSaved({ T0: 0, T1: 0, T2: 0, T3: 5 }), 0); // T3 saves nothing
});

test("parseWorktreePorcelain handles main + linked + detached + bare", () => {
  const txt = [
    "worktree /home/paulo/frugal",
    "HEAD abc123",
    "branch refs/heads/main",
    "",
    "worktree /home/paulo/wt-exp",
    "HEAD def456",
    "detached",
    "",
    "worktree /home/paulo/bare",
    "bare",
    "",
  ].join("\n");
  const w = parseWorktreePorcelain(txt);
  assert.strictEqual(w.length, 3);
  assert.strictEqual(w[0].branch, "main");
  assert.strictEqual(w[1].detached, true);
  assert.strictEqual(w[1].branch, null);
  assert.strictEqual(w[2].bare, true);
  assert.strictEqual(w[0].encoded, encodeProjectDir("/home/paulo/frugal"));
});

test("annotateWorktrees maps a session's encoded project to its branch", () => {
  const sessions = [{ project: encodeProjectDir("/home/paulo/frugal"), worktreePath: null as string | null, branch: null as string | null }];
  const wts = parseWorktreePorcelain("worktree /home/paulo/frugal\nHEAD abc\nbranch refs/heads/wave33_5-historic\n\n");
  annotateWorktrees(sessions, wts);
  assert.strictEqual(sessions[0].branch, "wave33_5-historic");
  assert.strictEqual(sessions[0].worktreePath, "/home/paulo/frugal");
});

test("listWorktrees swallows a failing git runner", () => {
  const out = listWorktrees(undefined, () => {
    throw new Error("no git");
  });
  assert.deepStrictEqual(out, []);
});

test("forecastQuota counts cloud calls and stays flagged estimated", () => {
  const home = fakeHome();
  const q = forecastQuota({ home, now: NOW });
  assert.strictEqual(q.estimated, true);
  assert.strictEqual(q.totalCallsInWindow, 5);
  assert.strictEqual(q.cloudCallsInWindow, 2); // one T2 + one T3
  assert.ok(q.projectedCloudCalls >= q.cloudCallsInWindow);
});

test("forecastQuota with no log degrades to zeros", () => {
  const home = mkdtempSync(join(tmpdir(), "moo-empty-"));
  const q = forecastQuota({ home, now: NOW });
  assert.strictEqual(q.totalCallsInWindow, 0);
  assert.strictEqual(q.projectedCloudCalls, 0);
});

test("resolveTerminalLabel honours the chain order", () => {
  assert.deepStrictEqual(resolveTerminalLabel({ override: "mylabel" }), { name: "mylabel", source: "override" });
  assert.strictEqual(resolveTerminalLabel({ env: { ZELLIJ_SESSION_NAME: "z1" } as NodeJS.ProcessEnv, cwd: "/x" }).source, "zellij");
  assert.strictEqual(resolveTerminalLabel({ env: { WEZTERM_PANE: "7" } as NodeJS.ProcessEnv, cwd: "/x" }).name, "pane-7");
  // worktree branch beats basename
  const wts = parseWorktreePorcelain("worktree /home/paulo/frugal\nHEAD a\nbranch refs/heads/feat\n\n");
  assert.deepStrictEqual(resolveTerminalLabel({ env: {} as NodeJS.ProcessEnv, cwd: "/home/paulo/frugal", worktrees: wts }), {
    name: "feat",
    source: "worktree",
  });
  // bare cwd fallback
  assert.strictEqual(resolveTerminalLabel({ env: {} as NodeJS.ProcessEnv, cwd: "/home/paulo/myproj" }).name, "myproj");
});

test("terminalChip wraps in parens and respects hidden", () => {
  assert.strictEqual(terminalChip({ override: "wave33" }), "(wave33)");
  assert.strictEqual(terminalChip({ override: "wave33" }, true), "");
});

test("progressDots renders filled/spinner/empty and caps width", () => {
  assert.strictEqual(progressDots(0, 4, 7, 0).length > 0, true);
  assert.strictEqual(progressDots(4, 4, 7, 0), "●●●●"); // complete → no spinner
  const mid = progressDots(2, 4, 7, 0);
  assert.ok(mid.startsWith("●●"));
  assert.strictEqual(progressDots(0, 0, 7, 0), ""); // no total → empty
});

test("workflowChip reads the active-run pointer and hides stale/none", () => {
  const home = mkdtempSync(join(tmpdir(), "moo-wf-"));
  const dir = join(home, ".mooter", "workflows");
  mkdirSync(dir, { recursive: true });
  // none yet
  assert.strictEqual(workflowChip({ home, now: NOW }), "");
  // running, fresh
  writeFileSync(
    join(dir, "active-run.json"),
    JSON.stringify({ run_id: "wf_abc123def", status: "running", agents_done: 3, agents_total: 7, ts: NOW - 1000 }),
  );
  const chip = workflowChip({ home, now: NOW });
  assert.ok(chip.includes("🔄"), chip);
  assert.ok(chip.includes("3/7"), chip);
  // stale → hidden
  assert.strictEqual(workflowChip({ home, now: NOW + 120000 }), "");
});

test("aggregateCrossSession produces advisory modal tiers per category", () => {
  const home = fakeHome();
  const r = aggregateCrossSession({ home, now: NOW, minSupport: 1 });
  assert.strictEqual(r.totalDecisions, 5);
  assert.strictEqual(r.totalSessions, 2);
  const summarize = r.categories.find((c) => c.category === "summarize")!;
  assert.strictEqual(summarize.modalTier, "T0");
  assert.strictEqual(summarize.counts.T0, 3);
  assert.strictEqual(summarize.sessions, 2); // both sessions did summarize
});

test("runSessionsExtended dispatches the new subcommands", () => {
  const home = fakeHome();
  const opts = { home, now: NOW, gitRunner: () => "" };
  assert.strictEqual(runSessionsExtended(["quota"], opts).exitCode, 0);
  assert.ok(runSessionsExtended(["quota"], opts).output.includes("forecast"));
  assert.ok(runSessionsExtended(["worktrees"], opts).output.includes("no git worktrees"));
  assert.ok(runSessionsExtended(["watch"], opts).output.includes("Mooter Sessions"));
  assert.ok(runSessionsExtended(["export"], opts).output.includes('"schema"'));
  assert.strictEqual(runSessionsExtended(["show", "aaaa"], opts).exitCode, 0);
  assert.ok(runSessionsExtended(["show", "aaaa"], opts).output.includes("prompts"));
  assert.strictEqual(runSessionsExtended(["bogus"], opts).exitCode, 1);
  // kill is honest: no pid linkage
  assert.ok(runSessionsExtended(["kill", "aaaa"], opts).output.includes("does not own"));
});

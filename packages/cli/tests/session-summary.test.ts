// Wave Mega 50-51 (4.D) — `mooter session-summary`. Drives runSessionSummary
// against a fixture decisions.log in an isolated tmp HOME. Asserts the tier-mix
// math, the cost-honesty rules (never compute $ without token counts), the
// --json shape, --help exit 0 (SessionEnd hook probe contract), and empty-state.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runSessionSummary } from "../src/commands/session-summary.ts";

const SID = "99999999-aaaa-bbbb-cccc-000000000001";
const OTHER = "00000000-old-old-old-000000000000";

function homeWith(lines: object[]): string {
  const home = mkdtempSync(join(tmpdir(), "mooter-sum-"));
  const dir = join(home, ".claude", "tools", "router");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "decisions.log"), lines.map((o) => JSON.stringify(o)).join("\n") + "\n");
  return home;
}

const gitFail = () => {
  throw new Error("not a repo");
};
const gitOk = () => "feat/test-branch\n";

function fixtureNoTokens(): string {
  return homeWith([
    { event: "classified", session_id: OTHER, ts_ms: 1, tier: "T3", task_category: "architecture" },
    { event: "classified", session_id: SID, ts_ms: 1000, tier: "T0", task_category: "trivial_local", recommended_model: "qwen3:30b" },
    { event: "classified", session_id: SID, ts_ms: 2000, tier: "T0", task_category: "trivial_local", recommended_model: "qwen3:30b" },
    { event: "classified", session_id: SID, ts_ms: 3000, tier: "T2", task_category: "bug_investigation", recommended_model: "claude-sonnet-4-6" },
    { event: "classified", session_id: SID, ts_ms: 4000, tier: "T3", task_category: "architecture", recommended_model: "claude-opus-4-8" },
    { event: "executed", session_id: SID, ts_ms: 4100, tier: "T3", tokens_in: 0, tokens_out: 0, model_used: null },
    { event: "turn_end", session_id: SID, ts_ms: 5000 },
    { event: "turn_end", session_id: SID, ts_ms: 6000 },
  ]);
}

test("summary: tier mix counts + percents, defaults to most recent session", () => {
  const home = fixtureNoTokens();
  const r = runSessionSummary([], { home, gitRunner: gitFail, cwd: "/x" });
  assert.equal(r.exitCode, 0);
  assert.match(r.output, new RegExp(SID)); // picked SID (most recent), not OTHER
  assert.match(r.output, /Tier mix \(4 routing decisions\)/);
  assert.match(r.output, /\| T0 \| 2 \| 50% \|/);
  assert.match(r.output, /\| T2 \| 1 \| 25% \|/);
  assert.match(r.output, /\| T3 \| 1 \| 25% \|/);
  assert.match(r.output, /turns {3}: 2 \(turn_end events\)/);
  assert.match(r.output, /\(not a git repository\)/);
});

test("summary: honest when token counts are absent — no $ invented", () => {
  const home = fixtureNoTokens();
  const r = runSessionSummary([], { home, gitRunner: gitFail, cwd: "/x" });
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /tokens: not recorded/);
  assert.match(r.output, /costs not computable: token counts absent/);
  assert.doesNotMatch(r.output, /total\*\* \| \*\*\$/, "no cost table without token counts");
  assert.doesNotMatch(r.output, /~saved vs all-Opus/, "no savings line without token counts");
});

test("summary: computes per-tier cost + savings ONLY from recorded tokens", () => {
  const home = homeWith([
    { event: "classified", session_id: SID, ts_ms: 1000, tier: "T1", task_category: "commit_msg" },
    { event: "classified", session_id: SID, ts_ms: 2000, tier: "T3", task_category: "architecture" },
    // 1M in / 1M out on Haiku → $1 + $5 = $6; Opus baseline $5 + $25 = $30 → saved $24.
    { event: "executed", session_id: SID, ts_ms: 2100, tier: "T1", tokens_in: 1_000_000, tokens_out: 1_000_000, model_used: "claude-haiku-4-5" },
  ]);
  const r = runSessionSummary([], { home, gitRunner: gitOk, cwd: "/repo" });
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /tokens: 1000000 in \/ 1000000 out/);
  assert.match(r.output, /\| T1 \| \$6\.0000 \|/);
  assert.match(r.output, /\*\*\$6\.0000\*\*/);
  assert.match(r.output, /~saved vs all-Opus: \$24\.0000/);
  assert.match(r.output, /branch feat\/test-branch/);
  assert.match(r.output, /used {7}: claude-haiku-4-5/);
});

test("summary: --json emits the structured shape", () => {
  const home = fixtureNoTokens();
  const r = runSessionSummary(["--json"], { home, gitRunner: gitFail, cwd: "/x" });
  assert.equal(r.exitCode, 0);
  const o = JSON.parse(r.output);
  assert.equal(o.sessionId, SID);
  assert.equal(o.decisions, 4);
  assert.deepEqual(o.tierMix, { T0: 2, T2: 1, T3: 1 });
  assert.equal(o.turns, 2);
  assert.equal(o.tokensIn, null);
  assert.equal(o.costTotalUsd, null);
  assert.equal(o.savedVsOpusUsd, null);
  assert.equal(o.taskCategories[0].category, "trivial_local");
});

test("summary: --help exits 0 (SessionEnd hook probe contract)", () => {
  const r = runSessionSummary(["--help"], { home: "/nonexistent-home" });
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /usage: mooter session-summary/);
  assert.match(r.output, /--notion/);
});

test("summary: empty decisions.log → honest empty state, exit 0", () => {
  const home = mkdtempSync(join(tmpdir(), "mooter-sum-empty-"));
  const r = runSessionSummary([], { home, gitRunner: gitFail, cwd: "/x" });
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /no routing decisions found/);
});

test("summary: --session unknown id → exit 1; unique prefix resolves", () => {
  const home = fixtureNoTokens();
  const bad = runSessionSummary(["--session", "deadbeef"], { home, gitRunner: gitFail, cwd: "/x" });
  assert.equal(bad.exitCode, 1);
  assert.match(bad.output, /session not found/);
  const pref = runSessionSummary(["--session", "9999"], { home, gitRunner: gitFail, cwd: "/x" });
  assert.equal(pref.exitCode, 0);
  assert.match(pref.output, new RegExp(SID));
});

test("summary: --out writes the markdown file; --notion prints the manual step", () => {
  const home = fixtureNoTokens();
  const out = join(home, "report.md");
  const r = runSessionSummary(["--out", out, "--notion"], { home, gitRunner: gitFail, cwd: "/x" });
  assert.equal(r.exitCode, 0);
  const file = readFileSync(out, "utf8");
  assert.match(file, /# Mooter session summary/);
  assert.match(r.output, /wrote /);
  assert.match(r.output, /Notion sync \(manual/);
  assert.match(r.output, /📊 Sessão \d{4}-\d{2}-\d{2}/);
  assert.match(r.output, /NO network call/);
});

// `mooter agents` suite (Wave 58 batch 3, Phase B). node:test + tsx.
// Run: cd packages/cli && npm test
//
// We test the PURE + non-interactive paths only (--json, stats, the row/stats
// builders) with INJECTED data — the raw-mode interactive loop is never driven in
// tests (it is the same dashboard.ts pattern, exercised live, not here). Every
// assertion locks an anti-fabrication invariant: a missing source → 'no data' /
// '?' / null, never an invented number.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runAgents,
  buildRows,
  buildJson,
  computeStats,
  heartbeatDuration,
  renderStats,
  renderList,
  fmtDuration,
  type AgentsData,
  type AgentHeartbeat,
} from "../src/commands/agents.ts";

const NOW = 1_000_000_000_000;

function data(over: Partial<AgentsData> = {}): AgentsData {
  return {
    snapshot: {
      active_count: 1,
      active_local: 1,
      active_cloud: 0,
      peak_concurrent: 2,
      active: [{ spawn_id: "s1", agent_name: "local-summarizer", model: "qwen3:30b", tier: "T0", local: true, started_at: NOW - 5000 }],
      cumulative: [
        { agent_name: "model-reasoner", count: 4, total_ms: 40000, avg_ms: 10000, errors: 1, local: false, model: "claude-sonnet-4-6", tier: "T2" },
        { agent_name: "cheap-triage", count: 2, total_ms: 0, avg_ms: 0, errors: 0, local: false, model: "claude-haiku-4-5", tier: "T1" },
      ],
    },
    workflow: { id: "run-1", done: 3, total: 7, tokens: 0, status: "running", ts: NOW - 72000 },
    heartbeats: [],
    ...over,
  };
}

// ── fmtDuration ──────────────────────────────────────────────────────────────

test("fmtDuration: seconds / minutes+seconds / hours", () => {
  assert.equal(fmtDuration(9000), "9s");
  assert.equal(fmtDuration(72000), "1m 12s");
  assert.equal(fmtDuration(4 * 60000), "4m");
  assert.equal(fmtDuration((3600 + 4 * 60) * 1000), "1h 4m");
});

// ── buildRows ────────────────────────────────────────────────────────────────

test("buildRows: active first (with elapsed + emoji), then recent classes", () => {
  const rows = buildRows(data(), NOW);
  assert.equal(rows[0].state, "active");
  assert.equal(rows[0].agent_name, "local-summarizer");
  assert.equal(rows[0].emoji, "🦙"); // qwen → Ollama family (real map, not invented)
  assert.equal(rows[0].elapsed_ms, 5000);
  assert.equal(rows[0].count, null);
  // recent rows follow
  const reasoner = rows.find((r) => r.agent_name === "model-reasoner")!;
  assert.equal(reasoner.state, "recent");
  assert.equal(reasoner.emoji, "✨"); // claude family
  assert.equal(reasoner.avg_ms, 10000);
  assert.equal(reasoner.errors, 1);
});

test("buildRows: --running keeps only in-flight agents", () => {
  const rows = buildRows(data(), NOW, { running: true });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].state, "active");
});

test("buildRows: avg is null (not 0) when total_ms is 0 — no fabricated duration", () => {
  const rows = buildRows(data(), NOW);
  const triage = rows.find((r) => r.agent_name === "cheap-triage")!;
  assert.equal(triage.count, 2);
  assert.equal(triage.avg_ms, null);
});

test("buildRows: empty/null snapshot → no rows, no crash", () => {
  assert.deepEqual(buildRows({ snapshot: null, workflow: null, heartbeats: [] }, NOW), []);
});

// ── --json ───────────────────────────────────────────────────────────────────

test("buildJson: structured payload carries real counts + workflow, null tokens", () => {
  const j = buildJson(data(), NOW) as any;
  assert.equal(j.schema_version, "1.0.0");
  assert.equal(j.active_count, 1);
  assert.equal(j.peak_concurrent, 2);
  assert.equal(j.workflow.id, "run-1");
  assert.equal(j.workflow.tokens, null); // Wave 28 writes none → null, not 0/invented
  assert.equal(j.agents.length, 3);
});

test("runAgents --json: non-interactive, exit 0, parseable JSON (injected data)", async () => {
  const res = await runAgents({ json: true, data: data(), now: () => NOW });
  assert.equal(res.exitCode, 0);
  const parsed = JSON.parse(res.output);
  assert.equal(parsed.agents[0].agent_name, "local-summarizer");
});

test("runAgents --json --running: filters to active only", async () => {
  const res = await runAgents({ json: true, running: true, data: data(), now: () => NOW });
  const parsed = JSON.parse(res.output);
  assert.equal(parsed.running_only, true);
  assert.equal(parsed.agents.length, 1);
});

test("runAgents --workflow: matching id keeps the run, non-matching nulls it", async () => {
  const match = JSON.parse((await runAgents({ json: true, workflow: "run-1", data: data(), now: () => NOW })).output);
  assert.equal(match.workflow.id, "run-1");
  const miss = JSON.parse((await runAgents({ json: true, workflow: "nope", data: data(), now: () => NOW })).output);
  assert.equal(miss.workflow, null);
});

// ── stats (A.10 heartbeats) ───────────────────────────────────────────────────

test("heartbeatDuration: prefers actual_total_duration_ms, else summed phases, else null", () => {
  assert.equal(heartbeatDuration({ actual_total_duration_ms: 12000 }), 12000);
  assert.equal(
    heartbeatDuration({ phases: [{ phase_name: "a", started_ms: 0, completed_ms: 3000 }, { phase_name: "b", started_ms: 3000, completed_ms: 8000 }] }),
    8000,
  );
  assert.equal(heartbeatDuration({ task_category: "x" }), null); // no timing → honest null
});

test("computeStats: avg per task_category from real durations; honest null when none", () => {
  const hbs: AgentHeartbeat[] = [
    { task_category: "bug_investigation", actual_total_duration_ms: 10000 },
    { task_category: "bug_investigation", actual_total_duration_ms: 20000 },
    { task_category: "summarise" }, // sample present but no measurable duration
  ];
  const stats = computeStats(hbs);
  const bug = stats.find((s) => s.task_category === "bug_investigation")!;
  assert.equal(bug.samples, 2);
  assert.equal(bug.avg_ms, 15000);
  const sum = stats.find((s) => s.task_category === "summarise")!;
  assert.equal(sum.samples, 1);
  assert.equal(sum.avg_ms, null); // never a fabricated 0
});

test("computeStats: heartbeat without a category → 'uncategorised', no crash", () => {
  const stats = computeStats([{ actual_total_duration_ms: 5000 }]);
  assert.equal(stats[0].task_category, "uncategorised");
  assert.equal(stats[0].avg_ms, 5000);
});

test("renderStats: empty input → honest 'no data', never a number", () => {
  const out = renderStats([]);
  assert.match(out, /no data/);
  assert.ok(!/\d+s\b/.test(out), "no fabricated duration when there is no data");
});

test("runAgents stats --json: structured, injected heartbeats", async () => {
  const res = await runAgents({
    sub: "stats",
    json: true,
    data: data({ heartbeats: [{ task_category: "refactor", actual_total_duration_ms: 6000 }] }),
    now: () => NOW,
  });
  assert.equal(res.exitCode, 0);
  const parsed = JSON.parse(res.output);
  assert.equal(parsed.stats[0].task_category, "refactor");
  assert.equal(parsed.stats[0].avg_ms, 6000);
});

test("runAgents stats (text): renders avg + 'no data' label honestly", async () => {
  const res = await runAgents({
    sub: "stats",
    data: data({ heartbeats: [{ task_category: "refactor", actual_total_duration_ms: 6000 }, { task_category: "summarise" }] }),
    now: () => NOW,
  });
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /refactor\s+avg 6s/);
  assert.match(res.output, /summarise\s+avg no data/);
});

// ── non-interactive list frame (injected interactive runner) ──────────────────

test("runAgents list: injected interactive runner receives the rows (no raw-mode in tests)", async () => {
  let seenRows = 0;
  const res = await runAgents({
    data: data(),
    now: () => NOW,
    interactive: async (rows) => {
      seenRows = rows.length;
      return { exitCode: 0, output: renderList(rows, data(), 0, { interactive: false }) };
    },
  });
  assert.equal(res.exitCode, 0);
  assert.equal(seenRows, 3);
  assert.match(res.output, /mooter agents/);
  assert.match(res.output, /local-summarizer/);
});

test("renderList: empty rows → honest 'no active or recent agents' message", () => {
  const out = renderList([], { snapshot: null, workflow: null, heartbeats: [] }, 0, {});
  assert.match(out, /no active or recent agents/);
});

test("renderList --running header + empty message differs", () => {
  const out = renderList([], { snapshot: null, workflow: null, heartbeats: [] }, 0, { running: true });
  assert.match(out, /running now/);
  assert.match(out, /no agents running right now/);
});

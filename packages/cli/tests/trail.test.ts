// `mooter trail` suite (Wave 2.5 Day 4 sub-feature 1).
// Run: cd packages/cli && npm test
//
// Drives runTrail/buildTrail with injected event lines + metrics so it needs no
// decisions.log, no tracker, and no session. Asserts the trail mirrors the real
// statusline sources (tier/model/confidence/tier-mix from events; saved/turn/
// alltime from the tracker) rather than recomputing from an invented schema.

import { test } from "node:test";
import assert from "node:assert/strict";
import { runTrail, buildTrail, decisionsForSession, tierMixLast10 } from "../src/commands/trail.ts";

function ev(tier: string, session = "s1", extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    event: "classified",
    session_id: session,
    ts: "2026-06-03T12:00:00.000Z",
    tier,
    recommended_model: "claude-sonnet-4-6",
    confidence: 0.84,
    ...extra,
  });
}

const MOCK_METRICS = { saved: 0.27, saved_pct: 89, last_turn_cost_usd: 0.04, alltime_cost_usd: 4.21 };

test("decisionsForSession filters by session, event type, and tester noise", () => {
  const lines = [
    ev("T2", "s1"),
    ev("T0", "s2"),
    JSON.stringify({ event: "option_a_hit" }), // non-classified
    ev("T1", "s1", { source: "mooter-tester" }), // tester noise
    "{ not json",
    ev("T3", "unknown"), // legacy untagged → always counts
  ];
  const got = decisionsForSession(lines, "s1");
  assert.deepEqual(got.map((e) => e.tier), ["T2", "T3"]);
});

test("tierMixLast10 windows and counts the session events", () => {
  const events = decisionsForSession(
    [...Array(6).fill(ev("T0")), ...Array(2).fill(ev("T1")), ...Array(2).fill(ev("T2"))],
    "s1",
  );
  assert.equal(tierMixLast10(events), "last10: T0:6 T1:2 T2:2 T3:0");
});

test("buildTrail derives last decision + tier mix + counts from events", async () => {
  const lines = [ev("T0"), ev("T2"), ev("T2", "s1", { recommended_model: "claude-opus-4-6", confidence: 0.91 })];
  const trail = await buildTrail({ sessionId: "s1", lines, metrics: null, quotaPath: "/nope" });
  assert.equal(trail.event_count, 3);
  const last = trail.last_decision as { value: string };
  assert.match(last.value, /^T2 claude-opus-4-6 0\.91/);
  const mix = trail.tier_mix as { value: string };
  assert.equal(mix.value, "last10: T0:1 T1:0 T2:2 T3:0");
});

test("buildTrail maps tracker metrics into saved/turn/alltime with formulas", async () => {
  const trail = await buildTrail({ sessionId: "s1", lines: [ev("T2")], metrics: MOCK_METRICS, quotaPath: "/nope" });
  const saved = trail.saved as { value: string; formula: string; source: string };
  assert.equal(saved.value, "$0.27");
  assert.match(saved.formula, /baseline_cost - actual_cost/);
  assert.equal((trail.saved_pct as { value: string }).value, "89%");
  assert.equal((trail.turn as { value: string }).value, "$0.04");
  assert.equal((trail.alltime as { value: string }).value, "$4.21");
});

test("buildTrail marks figures unavailable when the tracker is offline", async () => {
  const trail = await buildTrail({ sessionId: "s1", lines: [ev("T2")], metrics: null, quotaPath: "/nope" });
  assert.equal((trail.saved as { value: unknown }).value, null);
  assert.match((trail.saved as { source: string }).source, /offline/);
  // decision-derived figures still resolve (they come from the log, not the tracker).
  assert.match((trail.last_decision as { value: string }).value, /^T2/);
});

test("runTrail --json emits valid JSON with all expected keys", async () => {
  const res = await runTrail({ sessionId: "s1", lines: [ev("T2")], metrics: MOCK_METRICS, quotaPath: "/nope", json: true });
  assert.equal(res.exitCode, 0);
  const parsed = JSON.parse(res.output);
  for (const key of ["saved", "saved_pct", "last_decision", "turn", "alltime", "tier_mix", "ctx", "quota_5h"]) {
    assert.ok(key in parsed, `missing key: ${key}`);
  }
});

test("runTrail human output traces each number with formula + source", async () => {
  const res = await runTrail({ sessionId: "s1", lines: [ev("T2")], metrics: MOCK_METRICS, quotaPath: "/nope" });
  assert.match(res.output, /provenance trail/);
  assert.match(res.output, /saved\s+= \$0\.27/);
  assert.match(res.output, /formula:/);
  assert.match(res.output, /source:/);
});

test("buildTrail falls back to CLAUDE_SESSION_ID when sessionId not passed", async () => {
  const prev = process.env.CLAUDE_SESSION_ID;
  process.env.CLAUDE_SESSION_ID = "env-session";
  try {
    const trail = await buildTrail({ lines: [ev("T2", "env-session"), ev("T0", "other")], metrics: null, quotaPath: "/nope" });
    assert.equal(trail.session_id, "env-session");
    assert.equal(trail.event_count, 1, "only env-session events in scope");
  } finally {
    if (prev === undefined) delete process.env.CLAUDE_SESSION_ID;
    else process.env.CLAUDE_SESSION_ID = prev;
  }
});

test("buildTrail reads quota 5h remaining from quota-state.json", async () => {
  // Inline a temp quota file via a data: trick is not possible; use a real tmp file.
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "mooter-trail-quota-"));
  const qp = join(dir, "quota-state.json");
  writeFileSync(qp, JSON.stringify({ providers: { anthropic: { window_5h: { limit: 1000, tokens_used: 250 } } } }));
  const trail = await buildTrail({ sessionId: "s1", lines: [ev("T2")], metrics: null, quotaPath: qp });
  assert.equal((trail.quota_5h as { value: string }).value, "75%");
});

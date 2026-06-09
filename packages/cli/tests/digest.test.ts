// `mooter digest` suite (Wave 10 A.5 Variant 1).
// Run: cd packages/cli && npm test
//
// Drives runDigest/buildDigest with injected event lines + metrics so it needs
// no decisions.log, no tracker, and no session. Asserts the digest splits by
// COUNT (never per-tier dollars), pulls totals from the tracker, and lists the
// recent local tasks from the already-sanitized prompt_preview.

import { test } from "node:test";
import assert from "node:assert/strict";
import { runDigest, buildDigest, printDigestHuman } from "../src/commands/digest.ts";

function ev(tier: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    event: "classified",
    session_id: "s1",
    ts_ms: 1_700_000_000_000,
    tier,
    recommended_model: tier === "T0" ? "qwen2.5:3b" : tier === "T3" ? "claude-opus-4-8" : "claude-sonnet-4-6",
    ...extra,
  });
}

const events = (lines: string[]) =>
  lines.map((l) => JSON.parse(l)).filter((e) => e.event === "classified");

const MOCK_METRICS = { saved: 0.634, saved_pct: 76, last_turn_cost_usd: 0.02, alltime_cost_usd: 0.198 };

test("buildDigest splits by tier count + pct, top model per tier", () => {
  const lines = [ev("T0"), ev("T0"), ev("T0"), ev("T1"), ev("T2"), ev("T3")];
  const d = buildDigest(events(lines), null);
  assert.equal(d.prompts, 6);
  const t0 = d.tiers.find((t) => t.tier === "T0")!;
  assert.equal(t0.count, 3);
  assert.equal(t0.pct, 50);
  assert.equal(t0.model, "qwen2.5", "local model short name");
  assert.equal(d.tiers.find((t) => t.tier === "T3")!.model, "opus");
});

test("buildDigest derives duration from first→last ts_ms", () => {
  const lines = [ev("T0", { ts_ms: 1000 }), ev("T2", { ts_ms: 1000 + 83 * 60_000 })];
  const d = buildDigest(events(lines), null);
  assert.equal(d.durationMs, 83 * 60_000);
});

test("buildDigest takes spent/saved from the tracker, never per-tier dollars", () => {
  const lines = [ev("T0"), ev("T3")];
  const d = buildDigest(events(lines), MOCK_METRICS);
  assert.equal(d.spent, 0.198);
  assert.equal(d.saved, 0.634);
  assert.equal(d.savedPct, 76);
  // No per-tier dollar field exists on the tier objects.
  assert.ok(!("cost" in d.tiers[0]));
});

test("buildDigest lists up to 3 recent local tasks from prompt_preview", () => {
  const lines = [
    ev("T0", { prompt_preview: "rename useAuth to useSession", wall_clock_ms: 240 }),
    ev("T2", { prompt_preview: "debug the websocket reconnect" }),
    ev("T0", { prompt_preview: "summarize the changelog", wall_clock_ms: 180 }),
  ];
  const d = buildDigest(events(lines), null);
  assert.equal(d.localTasks.length, 2, "only T0 tasks");
  assert.equal(d.localTasks[0].preview, "summarize the changelog", "most recent first");
  assert.equal(d.localTasks[0].ms, 180);
});

test("printDigestHuman shows spent/naive/kept only when tracker reachable", () => {
  const withMetrics = printDigestHuman(buildDigest(events([ev("T0"), ev("T3")]), MOCK_METRICS));
  assert.match(withMetrics, /Spent \$0\.198/);
  assert.match(withMetrics, /All-Opus would cost \$0\.832/, "naive = spent + saved");
  assert.match(withMetrics, /You kept \$0\.634/);

  const offline = printDigestHuman(buildDigest(events([ev("T0")]), null));
  assert.match(offline, /cost totals unavailable/);
  assert.doesNotMatch(offline, /Spent \$/, "no fabricated totals when offline");
});

test("runDigest emits the digest with injected lines + metrics (no IO)", async () => {
  const res = await runDigest({ lines: [ev("T0"), ev("T0"), ev("T3")], metrics: MOCK_METRICS, sessionId: "s1" });
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /Session digest/);
  assert.match(res.output, /🏠 T0/);
});

test("runDigest --json returns the structured digest", async () => {
  const res = await runDigest({ lines: [ev("T0")], metrics: null, sessionId: "s1", json: true });
  const parsed = JSON.parse(res.output);
  assert.equal(parsed.prompts, 1);
  assert.equal(parsed.tiers[0].tier, "T0");
});

// Wave 34.5 (Bug C) — subagent dispatches fold into the tier mix.
test("buildDigest folds subagent dispatches into tier counts (delegated visible)", () => {
  const lines = [ev("T3"), ev("T3")]; // 2 top-level Opus prompts
  const subagents = [
    { tier: "T0", model: "qwen2.5:3b", count: 4, local: true },
    { tier: "T1", model: "claude-haiku-4-5", count: 2, local: false },
  ];
  const d = buildDigest(events(lines), null, subagents);
  assert.equal(d.prompts, 2, "top-level prompts unchanged");
  assert.equal(d.delegated, 6, "4 + 2 delegated dispatches");
  const t0 = d.tiers.find((t) => t.tier === "T0")!;
  assert.equal(t0.count, 4, "T0 reflects the 4 local dispatches");
  assert.equal(t0.model, "qwen2.5");
  // MLWR-style locality: T0+T1 should now be the majority (6 of 8), not 0%.
  const t1 = d.tiers.find((t) => t.tier === "T1")!;
  assert.equal(t0.pct + t1.pct, 75, "delegation moves the cheap-tier share to 75%");
});

test("buildDigest collapses a local subagent with no tier to T0, skips unknown cloud", () => {
  const d = buildDigest(events([ev("T2")]), null, [
    { count: 3, local: true }, // local, no tier → T0
    { count: 5, local: false }, // cloud, no tier → skipped (never guessed)
  ]);
  assert.equal(d.delegated, 3, "only the local, attributable dispatch counts");
  assert.equal(d.tiers.find((t) => t.tier === "T0")!.count, 3);
  assert.equal(d.prompts, 1);
});

test("printDigestHuman header shows the delegated count when present", () => {
  const out = printDigestHuman(buildDigest(events([ev("T3")]), null, [{ tier: "T0", count: 4, local: true }]));
  assert.match(out, /1 prompts \+ 4 delegated/);
  // No subagents → no "delegated" noise.
  const plain = printDigestHuman(buildDigest(events([ev("T3")]), null));
  assert.doesNotMatch(plain, /delegated/);
});

test("runDigest accepts injected subagents (no herd file IO in tests)", async () => {
  const res = await runDigest({
    lines: [ev("T3")],
    metrics: null,
    sessionId: "s1",
    json: true,
    subagents: [{ tier: "T0", count: 2, local: true }],
  });
  const parsed = JSON.parse(res.output);
  assert.equal(parsed.delegated, 2);
  assert.equal(parsed.prompts, 1);
});

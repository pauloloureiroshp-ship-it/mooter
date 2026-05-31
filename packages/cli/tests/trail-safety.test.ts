// Wave 3 Day 1 — `mooter trail --safety`. node:test + tsx.

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildSafety, runTrail } from "../src/commands/trail.ts";

function classified(extra: Record<string, unknown>) {
  return JSON.stringify({ event: "classified", session_id: "s1", tier: "T0", ...extra });
}

// 3 boosted (1 critical T0→T3, 2 keyword T0→T2/T1→T2), 2 not boosted.
const LINES = [
  classified({ tier: "T3", safety_boost_applied: true, safety_boost_reason: "critical_phrase_match: sharding\\s+strategy", safety_boost_from: "T0" }),
  classified({ tier: "T2", safety_boost_applied: true, safety_boost_reason: "architectural_keyword + low_confidence (0.75)", safety_boost_from: "T0" }),
  classified({ tier: "T2", safety_boost_applied: true, safety_boost_reason: "architectural_keyword + low_confidence (0.80)", safety_boost_from: "T1" }),
  classified({ tier: "T0", safety_boost_applied: false }),
  classified({ tier: "T2", safety_boost_applied: false }),
  JSON.stringify({ event: "option_a_miss" }), // noise, ignored
];

test("buildSafety: counts applications, reasons (normalized), upgrades", () => {
  const s = buildSafety(LINES) as any;
  assert.equal(s.window, 5, "5 classified events in window (noise excluded)");
  assert.equal(s.applied, 3);
  assert.equal(s.reasons["critical_phrase_match"], 1);
  assert.equal(s.reasons["architectural_keyword + low_confidence"], 2, "reason normalized, value stripped");
  assert.equal(s.upgrades["T0 → T3"], 1);
  assert.equal(s.upgrades["T0 → T2"], 1);
  assert.equal(s.upgrades["T1 → T2"], 1);
});

test("buildSafety: respects the window size", () => {
  const s = buildSafety(LINES, 2) as any;
  assert.equal(s.window, 2, "only the last 2 classified events");
});

test("buildSafety: empty log → zeroes, no throw", () => {
  const s = buildSafety([]) as any;
  assert.equal(s.window, 0);
  assert.equal(s.applied, 0);
});

test("runTrail --safety: human output with percent + reasons + upgrades", async () => {
  const res = await runTrail({ lines: LINES, safety: true });
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /safety boosts \(last 5 classified prompts\)/);
  assert.match(res.output, /applied: 3 of 5 \(60%\)/);
  assert.match(res.output, /critical_phrase_match: 1/);
  assert.match(res.output, /T0 → T3: 1/);
  assert.match(res.output, /classify\.js is untouched/);
});

test("runTrail --safety --json: machine-readable", async () => {
  const res = await runTrail({ lines: LINES, safety: true, json: true });
  const obj = JSON.parse(res.output);
  assert.equal(obj.applied, 3);
  assert.equal(obj.window, 5);
});

test("runTrail --safety: no fabricated numbers when nothing boosted", async () => {
  const clean = [classified({ tier: "T0", safety_boost_applied: false }), classified({ tier: "T2", safety_boost_applied: false })];
  const res = await runTrail({ lines: clean, safety: true });
  assert.match(res.output, /applied: 0 of 2 \(0%\)/);
  assert.ok(!/reasons:/.test(res.output), "no reasons section when zero boosts");
});

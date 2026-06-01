// Wave 3 Day 2 — `mooter trail --safety --by-keyword` over-boost monitor.

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildSafetyByKeyword, runTrail, SAFETY_KEYWORDS } from "../src/commands/trail.ts";

function evt(preview: string, applied: boolean) {
  return JSON.stringify({ event: "classified", session_id: "s1", tier: applied ? "T3" : "T0", prompt_preview: preview, safety_boost_applied: applied });
}

// "design": 4 seen, 3 boosted → 75% (over). "review": 2 seen, 0 boosted → 0%.
const LINES = [
  evt("design a sharding strategy", true),
  evt("design the schema", true),
  evt("design a partitioning plan", true),
  evt("design a logo in figma", false),
  evt("review the changelog", false),
  evt("review the readme", false),
];

test("SAFETY_KEYWORDS mirrors the router list (has design/sharding/review)", () => {
  for (const k of ["design", "sharding", "review", "architecture"]) assert.ok(SAFETY_KEYWORDS.includes(k));
});

test("buildSafetyByKeyword: per-keyword seen/boosted/rate", () => {
  const k = buildSafetyByKeyword(LINES) as any;
  assert.equal(k.by_keyword["design"].seen, 4);
  assert.equal(k.by_keyword["design"].boosted, 3);
  assert.equal(k.by_keyword["design"].rate_pct, 75);
  assert.equal(k.by_keyword["design"].over, true, "75% > 30% threshold");
  assert.equal(k.by_keyword["review"].boosted, 0);
  assert.equal(k.by_keyword["review"].over, false);
});

test("buildSafetyByKeyword: omits keywords never seen", () => {
  const k = buildSafetyByKeyword(LINES) as any;
  assert.ok(!("migration" in k.by_keyword), "unseen keyword excluded");
});

test("runTrail --safety --by-keyword: warns on over-boost, ✓ otherwise", async () => {
  const res = await runTrail({ lines: LINES, safety: true, byKeyword: true });
  assert.match(res.output, /by keyword/);
  assert.match(res.output, /design\s+3\/4 boosted \(75%\)/);
  assert.match(res.output, /⚠ possible over-boost: "design"/);
});

test("runTrail --safety --by-keyword: clean window shows the ✓ line", async () => {
  const clean = [evt("review the readme", false), evt("summarize notes", false)];
  const res = await runTrail({ lines: clean, safety: true, byKeyword: true });
  assert.match(res.output, /within the 30% range|no architectural keywords/);
  assert.ok(!/⚠/.test(res.output));
});

test("runTrail --safety --by-keyword --json: machine-readable", async () => {
  const res = await runTrail({ lines: LINES, safety: true, byKeyword: true, json: true });
  const obj = JSON.parse(res.output);
  assert.equal(obj.threshold_pct, 30);
  assert.equal(obj.by_keyword.design.over, true);
});

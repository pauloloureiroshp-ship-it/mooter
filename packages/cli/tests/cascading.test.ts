// Wave Mega 50-51 Phase 2.B — cascading fallback ADVISORY (pure, no IO).
// The advisory recommends; it never mutates routing (classify.js is frozen).
import { test } from "node:test";
import assert from "node:assert";

import {
  detectQualityFloor,
  nextTier,
  adviseCascade,
  CONFIDENCE_FLOOR,
  TOOL_FAILURES_FLOOR,
  T5_OPT_IN_NOTE,
} from "../src/cascading/router.ts";

// ---------------------------------------------------------------------------
// detectQualityFloor

test("refusal text like \"I can't help with\" breaches the quality floor", () => {
  const r = detectQualityFloor({ refusal_text: "I can't help with that request." });
  assert.strictEqual(r.floor_breached, true);
  assert.ok(r.reasons.some((s) => s.includes("refusal")), `reasons: ${r.reasons}`);
});

test("confidence below the floor breaches; exactly at the floor does not", () => {
  const low = detectQualityFloor({ confidence: 0.42 });
  assert.strictEqual(low.floor_breached, true);
  assert.ok(low.reasons.some((s) => s.includes(String(CONFIDENCE_FLOOR))));

  const atFloor = detectQualityFloor({ confidence: CONFIDENCE_FLOOR });
  assert.strictEqual(atFloor.floor_breached, false);
  assert.deepStrictEqual(atFloor.reasons, []);
});

test("tool failures at/above the threshold breach; below does not", () => {
  assert.strictEqual(detectQualityFloor({ tool_failures: TOOL_FAILURES_FLOOR }).floor_breached, true);
  assert.strictEqual(detectQualityFloor({ tool_failures: TOOL_FAILURES_FLOOR - 1 }).floor_breached, false);
});

test("clean signal (no refusal, high confidence, no failures) holds the floor", () => {
  const r = detectQualityFloor({ refusal_text: "Sure, here is the diff.", confidence: 0.9, tool_failures: 0 });
  assert.deepStrictEqual(r, { floor_breached: false, reasons: [] });
});

test("multiple breached signals are all reported as reasons", () => {
  const r = detectQualityFloor({ refusal_text: "I am unable to do that.", confidence: 0.1, tool_failures: 3 });
  assert.strictEqual(r.floor_breached, true);
  assert.strictEqual(r.reasons.length, 3);
});

// ---------------------------------------------------------------------------
// nextTier ladder

test("nextTier walks the real ladder T0→T1→T2→T3", () => {
  assert.deepStrictEqual(nextTier("T0"), { next: "T1", note: null });
  assert.deepStrictEqual(nextTier("T1"), { next: "T2", note: null });
  assert.deepStrictEqual(nextTier("T2"), { next: "T3", note: null });
});

test("nextTier at T3 returns null with the T5 opt-in-only note (never auto-suggests Fable)", () => {
  const r = nextTier("T3");
  assert.strictEqual(r.next, null);
  assert.strictEqual(r.note, T5_OPT_IN_NOTE);
  assert.match(r.note ?? "", /@fable/);
  assert.match(r.note ?? "", /opt-in/i);
});

test("nextTier on an unknown tier returns null with an honest note (no T4 invented)", () => {
  const r = nextTier("T4");
  assert.strictEqual(r.next, null);
  assert.match(r.note ?? "", /unknown tier/);
});

// ---------------------------------------------------------------------------
// adviseCascade

test("adviseCascade escalates T1→T2 on a breach, with advisory-only rationale", () => {
  const advice = adviseCascade({ tier: "T1" }, { refusal_text: "I cannot help with this." });
  assert.strictEqual(advice.escalate, true);
  assert.strictEqual(advice.from, "T1");
  assert.strictEqual(advice.to, "T2");
  assert.match(advice.rationale, /advisory only/);
  assert.match(advice.rationale, /classify\.js routing is unchanged/);
});

test("adviseCascade at T3 never escalates — surfaces the @fable opt-in doctrine instead", () => {
  const advice = adviseCascade({ tier: "T3" }, { confidence: 0.2 });
  assert.strictEqual(advice.escalate, false);
  assert.strictEqual(advice.to, null);
  assert.match(advice.rationale, /@fable/);
});

test("adviseCascade with a healthy signal advises nothing", () => {
  const advice = adviseCascade({ tier: "T0" }, { confidence: 0.95 });
  assert.strictEqual(advice.escalate, false);
  assert.strictEqual(advice.to, null);
  assert.match(advice.rationale, /quality floor holds/);
});

test("adviseCascade is defensive about an entry with no tier", () => {
  const advice = adviseCascade({}, { tool_failures: 5 });
  assert.strictEqual(advice.escalate, false);
  assert.strictEqual(advice.from, null);
  assert.match(advice.rationale, /no tier/);
});

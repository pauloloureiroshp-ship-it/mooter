// Wave 32 (Phase C) — inline token tracker: formatter + color coder.
import { test } from "node:test";
import assert from "node:assert";

import {
  formatPrefix,
  formatPrefixPlain,
  fmtTokens,
  fmtCost,
  fmtMs,
} from "../src/token-tracker/prefix-formatter.ts";
import { TIER_COLOR, TIER_DOT, BACKEND_GLYPH, colorize, useColor } from "../src/token-tracker/color-coder.ts";
import { buildCommandPrefix, isEnabled, startTimer, withInlineTracker } from "../src/token-tracker/tracker.ts";

test("fmtTokens compacts magnitudes honestly", () => {
  assert.strictEqual(fmtTokens(384), "384");
  assert.strictEqual(fmtTokens(13300), "13.3k");
  assert.strictEqual(fmtTokens(1_898_286), "1.9M");
  assert.strictEqual(fmtTokens(0), "0");
});

test("fmtCost: $0 stays $0, sub-cent keeps 4dp, else 2dp", () => {
  assert.strictEqual(fmtCost(0), "$0");
  assert.strictEqual(fmtCost(0.0094), "$0.0094");
  assert.strictEqual(fmtCost(1.2), "$1.20");
});

test("fmtMs rounds and clamps negatives", () => {
  assert.strictEqual(fmtMs(145.7), "146ms");
  assert.strictEqual(fmtMs(-5), "0ms");
});

test("formatPrefixPlain matches the documented shape", () => {
  const s = formatPrefixPlain({ tier: "T2", backend: "cloud", model: "Opus", ms: 380, tokens: 1200, costUsd: 0.0094 });
  assert.strictEqual(s, "[T2 cloud Opus 380ms · 1.2k tok · $0.0094]");
});

test("formatPrefix (no color) includes tier dot + backend glyph", () => {
  const s = formatPrefix({ tier: "T0", backend: "local", model: "qwen", ms: 145, tokens: 384, costUsd: 0 }, { color: false });
  assert.strictEqual(s, `[${TIER_DOT.T0} T0 ${BACKEND_GLYPH.local} qwen 145ms · 384 tok · $0]`);
});

test("formatPrefix with color wraps the tier token in its ANSI code", () => {
  const s = formatPrefix({ tier: "T3", backend: "cloud", model: "Opus", ms: 10, tokens: 100, costUsd: 1 }, { color: true });
  assert.ok(s.includes(TIER_COLOR.T3), "T3 colored");
  assert.ok(s.includes("\x1b[0m"), "reset present");
});

test("color coder: all four tiers have distinct colors and dots", () => {
  const colors = new Set(Object.values(TIER_COLOR));
  const dots = new Set(Object.values(TIER_DOT));
  assert.strictEqual(colors.size, 4);
  assert.strictEqual(dots.size, 4);
});

test("useColor honors NO_COLOR / TERM=dumb", () => {
  assert.strictEqual(useColor({ NO_COLOR: "1" } as any), false);
  assert.strictEqual(useColor({ TERM: "dumb" } as any), false);
  assert.strictEqual(useColor({} as any), true);
  assert.strictEqual(colorize("\x1b[32m", "x", false), "x");
});

test("buildCommandPrefix defaults a pure-local op to T0/local/$0 honestly", () => {
  const s = buildCommandPrefix({ ms: 12 });
  // bare process.env may enable color; assert the structural pieces instead.
  assert.ok(s.startsWith(`[${TIER_DOT.T0} `));
  assert.ok(s.includes("local"));
  assert.ok(s.includes("0 tok"));
  assert.ok(s.includes("$0"));
  assert.ok(s.includes("12ms"));
});

test("isEnabled reflects MOOTER_INLINE_TRACKER", () => {
  assert.strictEqual(isEnabled({ MOOTER_INLINE_TRACKER: "1" } as any), true);
  assert.strictEqual(isEnabled({} as any), false);
});

test("startTimer measures elapsed ms", async () => {
  const stop = startTimer();
  await new Promise((r) => setTimeout(r, 12));
  const ms = stop();
  assert.ok(ms >= 8, `expected >=8ms, got ${ms}`);
});

test("withInlineTracker emits only when enabled and reads result.track", async () => {
  const lines: string[] = [];
  const res = await withInlineTracker(
    () => ({ value: 42, track: { tier: "T2" as const, backend: "cloud" as const, model: "Sonnet", tokens: 500, costUsd: 0.002 } }),
    { enabled: true, write: (s) => lines.push(s) },
  );
  assert.strictEqual((res as any).value, 42);
  assert.strictEqual(lines.length, 1);
  assert.ok(lines[0].includes("T2") && lines[0].includes("Sonnet"), lines[0]);

  const none: string[] = [];
  await withInlineTracker(() => ({ value: 1 }), { enabled: false, write: (s) => none.push(s) });
  assert.strictEqual(none.length, 0, "disabled emits nothing");
});

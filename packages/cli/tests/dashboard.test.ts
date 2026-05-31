// Wave 2.6 Day 2 — `mooter dashboard` TUI core.
//
// node:test + tsx (matches trail.test.ts). The pure `buildDashboard` lets us
// assert the full frame with no TTY, tracker, or session.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildDashboard,
  aggregateMoos,
  progressBar,
  displayWidth,
  type DashboardOptions,
} from "../src/commands/dashboard.ts";

function evt(tier: string, model: string, confidence: number, session = "sess-1") {
  return JSON.stringify({
    event: "classified",
    session_id: session,
    tier,
    recommended_model: model,
    confidence,
  });
}

const LINES = [
  evt("T0", "qwen3:7b", 0.9),
  evt("T0", "qwen3:7b", 0.88),
  evt("T2", "sonnet", 0.84),
  evt("T3", "opus", 0.95),
  evt("T0", "qwen3:7b", 0.91),
];

test("buildDashboard: renders all sections with a boxed frame", () => {
  const out = buildDashboard({ lines: LINES, sessionId: "sess-1", metrics: { saved: 0.27, saved_pct: 89 } });
  const rows = out.split("\n");
  assert.ok(rows.length > 12, "frame has the expected number of rows");
  assert.match(out, /Mooter Dashboard/);
  assert.match(out, /MOOS ACTIVE/);
  assert.match(out, /SAVINGS/);
  assert.match(out, /QUOTA/);
  assert.match(out, /CONTEXT/);
  assert.match(out, /ADAPTER/);
  assert.match(out, /Press q to exit/);
  // box drawing top/bottom present
  assert.ok(rows[0].startsWith("┌"), "top border");
  assert.ok(rows[rows.length - 1].startsWith("└"), "bottom border");
});

test("buildDashboard: shows Moo rows aggregated by model, busiest first", () => {
  const out = buildDashboard({ lines: LINES, sessionId: "sess-1", metrics: null });
  assert.match(out, /🏠 qwen3:7b/, "local Moo with home glyph");
  assert.match(out, /☁ sonnet/, "cloud Moo with cloud glyph");
  assert.match(out, /☁ opus/);
  // qwen3:7b (3 calls) listed before sonnet (1 call)
  const qwenIdx = out.indexOf("qwen3:7b");
  const sonnetIdx = out.indexOf("sonnet");
  assert.ok(qwenIdx < sonnetIdx, "busiest Moo sorted first");
});

test("buildDashboard: tracker offline → honest message, no invented figures", () => {
  const out = buildDashboard({ lines: LINES, sessionId: "sess-1", metrics: null });
  assert.match(out, /savings-tracker offline/);
  assert.ok(!/saved \$/.test(out), "no fabricated saved figure when offline");
});

test("buildDashboard: empty session → no-Moos placeholder", () => {
  const out = buildDashboard({ lines: [], sessionId: "fresh", metrics: null });
  assert.match(out, /no Moos pastored yet/);
});

test("buildDashboard: respects session filter", () => {
  const mixed = [...LINES, evt("T3", "opus", 0.99, "other-session")];
  const out = buildDashboard({ lines: mixed, sessionId: "sess-1", metrics: null });
  // exactly one opus call belongs to sess-1
  assert.match(out, /☁ opus {2,}1 calls/);
});

test("aggregateMoos: counts calls and keeps the latest confidence", () => {
  const events = [
    { event: "classified", tier: "T0", recommended_model: "qwen3:7b", confidence: 0.8 },
    { event: "classified", tier: "T0", recommended_model: "qwen3:7b", confidence: 0.92 },
  ];
  const moos = aggregateMoos(events as any);
  assert.equal(moos.length, 1);
  assert.equal(moos[0].calls, 2);
  assert.equal(moos[0].lastConf, 0.92);
  assert.equal(moos[0].glyph, "🏠");
});

test("displayWidth: emoji count as 2 columns, ascii + box glyphs as 1", () => {
  assert.equal(displayWidth("abc"), 3);
  assert.equal(displayWidth("🐮"), 2, "cow emoji is 2 cols");
  assert.equal(displayWidth("🐮 Mooter"), 9, "2 + 1 (space) + 6");
  assert.equal(displayWidth("│───┤"), 5, "box-drawing glyphs are single-width");
  assert.equal(displayWidth("[████░░]"), 8, "block elements are single-width");
});

test("buildDashboard: every framed row has the same display width", () => {
  const out = buildDashboard({ lines: LINES, sessionId: "sess-1", metrics: { saved: 0.27, saved_pct: 89 } });
  const rows = out.split("\n").filter((r) => r.startsWith("│") || r.startsWith("┌") || r.startsWith("├") || r.startsWith("└"));
  const widths = new Set(rows.map((r) => displayWidth(r)));
  assert.equal(widths.size, 1, `all framed rows align to one width (got ${[...widths].join(",")})`);
});

test("progressBar: fills correctly at boundaries and midpoint", () => {
  assert.equal(progressBar(0, 10), "[░░░░░░░░░░]");
  assert.equal(progressBar(100, 10), "[██████████]");
  assert.equal(progressBar(50, 10), "[█████░░░░░]");
  // clamps out-of-range input
  assert.equal(progressBar(150, 10), "[██████████]");
  assert.equal(progressBar(-5, 10), "[░░░░░░░░░░]");
});

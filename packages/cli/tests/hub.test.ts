// Wave 3 Day 2 — `mooter hub` local activation hub. node:test + tsx.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildHub, hubSuggestions } from "../src/commands/hub.ts";

const NOW = 1_780_000_000_000;
const DAY = 864e5;

function evt(daysAgo: number, applied: boolean, preview = "design a sharding strategy") {
  return JSON.stringify({ event: "classified", session_id: "s1", ts_ms: NOW - daysAgo * DAY, tier: applied ? "T3" : "T0", confidence: 0.9, prompt_preview: preview, safety_boost_applied: applied });
}

function homeWithPacks(packs: string[]): string {
  const home = mkdtempSync(join(tmpdir(), "mooter-hub-"));
  writeFileSync(join(home, "installed.json"), JSON.stringify({ schema_version: "1.0.0", packs, updated_utc: "2026-05-30T00:00:00Z" }));
  return home;
}

const LINES = [evt(1, true), evt(2, false), evt(9, false), evt(10, true)];

test("buildHub: renders all 5 sections in a boxed frame", () => {
  const out = buildHub({ lines: LINES, nowMs: NOW, mooterHome: homeWithPacks(["diagram-systems", "code-audit"]) });
  assert.match(out, /Mooter Hub/);
  assert.match(out, /PACKS INSTALLED \(2\)/);
  assert.match(out, /SAFETY BOOSTS/);
  assert.match(out, /EVOLUTION/);
  assert.match(out, /TELEMETRY/);
  assert.match(out, /SUGGESTIONS/);
  const rows = out.split("\n");
  assert.ok(rows[0].startsWith("┌") && rows[rows.length - 1].startsWith("└"));
});

test("buildHub: honest 'no usage data' + opt-out telemetry by default", () => {
  const out = buildHub({ lines: LINES, nowMs: NOW, mooterHome: homeWithPacks(["diagram-systems"]) });
  assert.match(out, /no per-pack usage data yet/);
  assert.match(out, /TELEMETRY · opt-out/);
});

test("buildHub: empty install → none placeholder + opt-in suggestion", () => {
  const out = buildHub({ lines: [], nowMs: NOW, mooterHome: homeWithPacks([]) });
  assert.match(out, /PACKS INSTALLED \(0\)/);
  assert.match(out, /none — run mooter init/);
  assert.match(out, /Telemetry is off — consider opt-in/);
});

test("hubSuggestions: deterministic — over-boost rule fires on real data", () => {
  const byKeyword = { by_keyword: { design: { boosted: 9, seen: 10, rate_pct: 90, over: true } } };
  const s = hubSuggestions({ telemetry: { enabled: true, signedOk: true, since: "x" }, byKeyword, installedCount: 3 });
  assert.ok(s.some((x) => /design.*review safety_seeds/.test(x)), "over-boost suggestion present");
});

test("hubSuggestions: nothing-to-do message when all clean", () => {
  const s = hubSuggestions({ telemetry: { enabled: true, signedOk: true, since: "x" }, byKeyword: { by_keyword: {} }, installedCount: 3 });
  assert.equal(s.length, 1);
  assert.match(s[0], /Nothing needs attention/);
});

test("hubSuggestions: opt-in suggestion only when telemetry off", () => {
  const off = hubSuggestions({ telemetry: { enabled: false, signedOk: false, since: null }, byKeyword: { by_keyword: {} }, installedCount: 3 });
  assert.ok(off.some((x) => /opt-in/.test(x)));
  const on = hubSuggestions({ telemetry: { enabled: true, signedOk: true, since: "x" }, byKeyword: { by_keyword: {} }, installedCount: 3 });
  assert.ok(!on.some((x) => /opt-in/.test(x)));
});

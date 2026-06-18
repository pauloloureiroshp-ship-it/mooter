// Wave 59A — cross-surface coherence audit.
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildCoherence, gatherCoherence, renderCoherence } from "../src/commands/coherence.ts";
import { runDoctor } from "../src/commands/doctor.ts";

const NOW = 1_700_000_000_000;
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

test("buildCoherence: aligned local≈hub → ok, no cause noise", () => {
  const r = buildCoherence({
    localCalls: 100,
    localSavings: { savedUsd: 10.0, savedPct: 40 },
    hub: { total_calls: 102, saved_usd: 10.2, last_updated: iso(0) },
    mooterHome: "/h/.mooter",
    nowMs: NOW,
  });
  assert.strictEqual(r.level, "ok");
  assert.ok(r.rows.every((row) => row.level === "ok"));
});

test("buildCoherence: large call drift → warn naming multi-device", () => {
  const r = buildCoherence({
    localCalls: 50,
    localSavings: { savedUsd: 5, savedPct: 30 },
    hub: { total_calls: 200, saved_usd: 5.1, last_updated: iso(0) },
    mooterHome: "/h/.mooter",
    nowMs: NOW,
  });
  assert.strictEqual(r.level, "warn");
  const calls = r.rows.find((x) => x.metric === "calls")!;
  assert.strictEqual(calls.level, "warn");
  assert.match(calls.cause, /drift|machine/);
});

test("buildCoherence: fresh session (local 0, hub > 0) blames session/MOOTER_HOME", () => {
  const r = buildCoherence({
    localCalls: 0,
    localSavings: { savedUsd: 0, savedPct: 0 },
    hub: { total_calls: 658, saved_usd: 25.95, last_updated: iso(0) },
    mooterHome: "/custom/.mooter",
    nowMs: NOW,
  });
  const calls = r.rows.find((x) => x.metric === "calls")!;
  const sav = r.rows.find((x) => x.metric === "savings_usd")!;
  assert.strictEqual(calls.level, "warn");
  assert.match(calls.cause, /fresh session|MOOTER_HOME/);
  assert.match(calls.cause, /custom/); // surfaces the actual home
  assert.strictEqual(sav.level, "warn");
  assert.match(sav.cause, /\$0|tracker/);
  assert.match(sav.cause, /25\.95/);
});

test("buildCoherence: hub never synced → unknown with rebuild hint", () => {
  const r = buildCoherence({
    localCalls: 12,
    localSavings: { savedUsd: 1, savedPct: 10 },
    hub: null,
    mooterHome: "/h/.mooter",
    nowMs: NOW,
  });
  assert.strictEqual(r.level, "unknown");
  assert.ok(r.rows.every((row) => row.level === "unknown"));
  assert.match(r.rows[0].cause, /rebuild-stats/);
  assert.strictEqual(r.hubCacheAgeHours, null);
});

test("buildCoherence: savings daemon down → savings row unknown, calls still evaluated", () => {
  const r = buildCoherence({
    localCalls: 100,
    localSavings: null, // daemon unreachable
    hub: { total_calls: 100, saved_usd: 9, last_updated: iso(0) },
    mooterHome: "/h/.mooter",
    nowMs: NOW,
  });
  const calls = r.rows.find((x) => x.metric === "calls")!;
  const sav = r.rows.find((x) => x.metric === "savings_usd")!;
  assert.strictEqual(calls.level, "ok");
  assert.strictEqual(sav.level, "unknown");
  assert.match(sav.cause, /daemon|7821/);
});

test("buildCoherence: stale hub cache (≥24h) is surfaced in the cause + age", () => {
  const r = buildCoherence({
    localCalls: 50,
    localSavings: { savedUsd: 5, savedPct: 30 },
    hub: { total_calls: 200, saved_usd: 5, last_updated: iso(30 * 3_600_000) },
    mooterHome: "/h/.mooter",
    nowMs: NOW,
  });
  assert.strictEqual(r.hubCacheAgeHours, 30);
  const calls = r.rows.find((x) => x.metric === "calls")!;
  assert.match(calls.cause, /30h old/);
});

test("gatherCoherence: reads injected sources (no network)", () => {
  const home = mkdtempSync(join(tmpdir(), "moo-coh-"));
  mkdirSync(join(home, ".mooter"), { recursive: true });
  writeFileSync(
    join(home, ".mooter", "hub-dashboard-cache.json"),
    JSON.stringify({ total_calls: 200, saved_usd: 12.5, last_updated: iso(0) }),
  );
  const log = join(home, "decisions.log");
  writeFileSync(log, Array.from({ length: 200 }, () => '{"event":"classified"}').join("\n") + "\n");

  const r = gatherCoherence({
    mooterHome: join(home, ".mooter"),
    decisionsLogPath: log,
    readSavings: () => ({ savedUsd: 12.4, savedPct: 41 }),
    nowMs: NOW,
  });
  assert.strictEqual(r.level, "ok"); // 200≈200, 12.4≈12.5
  assert.strictEqual(r.rows.find((x) => x.metric === "calls")!.local, 200);
  assert.strictEqual(r.rows.find((x) => x.metric === "calls")!.hub, 200);
});

test("renderCoherence: shows MOOTER_HOME and a ↳ cause for non-ok rows", () => {
  const r = buildCoherence({
    localCalls: 0,
    localSavings: null,
    hub: null,
    mooterHome: "/x/.mooter",
    nowMs: NOW,
  });
  const text = renderCoherence(r).join("\n");
  assert.match(text, /MOOTER_HOME: \/x\/\.mooter/);
  assert.match(text, /hub never synced/);
  assert.match(text, /↳/);
});

test("runDoctor --coherence appends the coherence section (human)", () => {
  const home = mkdtempSync(join(tmpdir(), "moo-coh-doc-"));
  const report = buildCoherence({
    localCalls: 5,
    localSavings: { savedUsd: 1, savedPct: 20 },
    hub: { total_calls: 5, saved_usd: 1, last_updated: iso(0) },
    mooterHome: join(home, ".mooter"),
    nowMs: NOW,
  });
  const r = runDoctor(["--coherence"], {
    classifyPath: null,
    which: () => true,
    ollamaUp: () => true,
    statsReconcile: () => null,
    coherence: () => report,
    home,
  });
  assert.match(r.output, /Coherence — local/);
  assert.match(r.output, /calls/);
  assert.strictEqual(r.exitCode, 0); // coherence never changes exit code
});

test("runDoctor --coherence --json embeds the coherence report", () => {
  const home = mkdtempSync(join(tmpdir(), "moo-coh-json-"));
  const report = buildCoherence({
    localCalls: 0,
    localSavings: null,
    hub: null,
    mooterHome: join(home, ".mooter"),
    nowMs: NOW,
  });
  const r = runDoctor(["--coherence", "--json"], {
    classifyPath: null,
    which: () => true,
    ollamaUp: () => true,
    statsReconcile: () => null,
    coherence: () => report,
    home,
  });
  const parsed = JSON.parse(r.output);
  assert.ok(Array.isArray(parsed.checks));
  assert.ok(parsed.coherence);
  assert.strictEqual(parsed.coherence.level, "unknown");
});

test("runDoctor WITHOUT --coherence is unchanged (no coherence section)", () => {
  const home = mkdtempSync(join(tmpdir(), "moo-coh-off-"));
  const r = runDoctor([], { classifyPath: null, which: () => true, ollamaUp: () => true, statsReconcile: () => null, home });
  assert.doesNotMatch(r.output, /Coherence — local/);
});

// Wave 33 (L11 / B.4) — status poll · health mapping · confirmed advisory bias.
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

import { pollProvider, pollAll, indicatorToHealth, PROVIDERS, type ProviderEndpoint } from "../src/monitor.ts";
import { readState, setEnabled, isActive, recordPoll, suggestBias, statusChip } from "../src/state.ts";

function fakeFetch(indicator: string, ok = true): typeof fetch {
  return (async () => ({ ok, status: ok ? 200 : 500, json: async () => ({ status: { indicator, description: indicator } }) })) as unknown as typeof fetch;
}

const EP: ProviderEndpoint = { id: "anthropic", url: "https://example/status.json" };

// ── monitor ───────────────────────────────────────────────────────────────────
test("indicatorToHealth maps statuspage indicators", () => {
  assert.strictEqual(indicatorToHealth("none"), "operational");
  assert.strictEqual(indicatorToHealth("minor"), "degraded");
  assert.strictEqual(indicatorToHealth("major"), "down");
  assert.strictEqual(indicatorToHealth("critical"), "down");
  assert.strictEqual(indicatorToHealth(undefined), "unknown");
});

test("pollProvider returns health and never throws on network error", async () => {
  const ok = await pollProvider(EP, { fetchImpl: fakeFetch("none") });
  assert.strictEqual(ok.health, "operational");
  const bad = await pollProvider(EP, { fetchImpl: (async () => { throw new Error("x"); }) as unknown as typeof fetch });
  assert.strictEqual(bad.health, "unknown");
});

test("PROVIDERS only includes public statuspage.io endpoints (privacy)", () => {
  for (const p of PROVIDERS) {
    assert.match(p.url, /status\..*\/api\/v2\/status\.json/);
    assert.ok(!/completions|chat|generate|api\.anthropic|api\.openai/.test(p.url), "never an inference endpoint");
  }
});

// ── advisory bias (doctrine: never a tier; only within-tier avoid) ────────────
test("suggestBias is empty while the monitor is disabled", () => {
  const home = mkdtempSync(tmpdir() + "/mooter-arb-");
  const b = suggestBias(home);
  assert.deepStrictEqual(b.avoid, []);
});

test("a single degraded blip does NOT trigger avoid (needs confirmation)", () => {
  const home = mkdtempSync(tmpdir() + "/mooter-arb2-");
  setEnabled(true, home);
  recordPoll([{ id: "anthropic", health: "degraded", description: "" }], { home });
  assert.deepStrictEqual(suggestBias(home, { threshold: 3 }).avoid, [], "one sample is not enough");
});

test("three confirmed degraded polls flag avoid (advisory only)", () => {
  const home = mkdtempSync(tmpdir() + "/mooter-arb3-");
  setEnabled(true, home);
  for (let i = 0; i < 3; i++) recordPoll([{ id: "anthropic", health: "down", description: "" }], { home, now: i });
  const b = suggestBias(home, { threshold: 3 });
  assert.deepStrictEqual(b.avoid, ["anthropic"]);
  assert.match(b.note, /tier unchanged/, "must state classify.js tier is unchanged");
});

test("recovery clears the avoid flag", () => {
  const home = mkdtempSync(tmpdir() + "/mooter-arb4-");
  setEnabled(true, home);
  for (let i = 0; i < 3; i++) recordPoll([{ id: "anthropic", health: "down", description: "" }], { home, now: i });
  recordPoll([{ id: "anthropic", health: "operational", description: "" }], { home, now: 4 });
  assert.deepStrictEqual(suggestBias(home, { threshold: 3 }).avoid, [], "recovered → no longer avoided");
});

test("statusChip reflects enabled + avoid state", () => {
  const home = mkdtempSync(tmpdir() + "/mooter-arb5-");
  assert.strictEqual(statusChip(home), null);
  setEnabled(true, home);
  assert.strictEqual(statusChip(home), "📊 arbitrage active");
});

test("pollAll fans out across providers", async () => {
  const r = await pollAll({ fetchImpl: fakeFetch("none"), providers: [EP, { id: "openai", url: "https://x/s.json" }] });
  assert.strictEqual(r.length, 2);
  assert.ok(r.every((x) => x.health === "operational"));
});

test("isActive tracks the enabled flag", () => {
  const home = mkdtempSync(tmpdir() + "/mooter-arb6-");
  assert.strictEqual(isActive(home), false);
  setEnabled(true, home);
  assert.strictEqual(isActive(home), true);
  assert.strictEqual(readState(home).enabled, true);
});

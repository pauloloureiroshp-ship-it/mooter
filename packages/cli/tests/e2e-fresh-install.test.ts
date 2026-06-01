// E2E smoke — fresh install → init → 10 prompts → statusline → per-session
// isolation (Wave 2.5 Day 4 sub-feature 2; the Wave-3 GATE check).
//
// Composes the real shipped units end to end, hermetically and at $0:
//   · runInit (Day 2)            — writes the three ~/.mooter schemas
//   · digest  (Day 1 isolation)  — session-scoped aggregation of decisions.log
//   · renderFromContext (D1+D3)  — statusline render incl. rotating tier-mix
//
// The 10 prompts are represented as synthetic "classified" log lines in the
// exact shape inject_context.js writes — we do NOT spawn the classifier or the
// hook here (that would cost tokens and write to the real decisions.log). The
// hook's own emission is covered by tools/router/badge.test.js + inject_context
// .test.js; this test validates the install→aggregate→render→isolate pipeline.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit, type HardwareProfile, type InitIO, type AnthropicValidation } from "../src/commands/init.ts";

const require = createRequire(import.meta.url);
// statusline-multi.js is a CJS module in tools/router; pull its pure helpers.
const { digest, renderFromContext } = require("../../../tools/router/statusline-multi.js") as {
  digest: (lines: string[], opts?: { sessionFilter?: string | null }) => {
    counts: Record<string, number>;
    total: number;
    last: unknown;
    recent: Array<{ tier?: string }>;
  };
  renderFromContext: (ctx: Record<string, unknown>) => string;
};

const FIXED_NOW = new Date("2026-06-03T12:00:00.000Z");

function mockProbe(): HardwareProfile {
  return {
    os: "linux",
    os_version: "6.6.87-wsl2",
    node_version: "v20.11.0",
    cpu_cores: 16,
    ram_gb: 32,
    gpu: { model: "RTX 4090", vram_gb: 24 },
    ollama: { url: "http://host.docker.internal:11434", models: ["qwen3:30b"], available: true },
  };
}

const mockValidate: AnthropicValidation = {
  valid: true,
  tier_detected: "max",
  budget_5h_limit: 80,
  budget_7d_limit: 1000,
};

function scriptedIO(answers: { confirm?: boolean[]; ask?: string[]; hidden?: string[] }): InitIO {
  const confirm = [...(answers.confirm ?? [])];
  const ask = [...(answers.ask ?? [])];
  const hidden = [...(answers.hidden ?? [])];
  return {
    print: () => {},
    ask: async () => ask.shift() ?? "",
    askHidden: async () => hidden.shift() ?? "",
    confirm: async (_q, def) => (confirm.length ? (confirm.shift() as boolean) : def),
  };
}

/** A "classified" decisions.log line in inject_context.js's shape. */
function classifiedLine(i: number, sessionId: string, nowIso: string): string {
  const tier = `T${i % 4}`;
  return JSON.stringify({
    ts: nowIso,
    ts_ms: Date.parse(nowIso) + i,
    event: "classified",
    session_id: sessionId,
    tier,
    recommended_model: tier === "T0" ? "qwen3:30b" : "claude-sonnet-4-6",
    confidence: 0.85,
  });
}

test("E2E: fresh install → init → 10 prompts → statusline correct → session isolation", async () => {
  // Step 1 — fresh state.
  const home = mkdtempSync(join(tmpdir(), "mooter-e2e-"));
  const mooterHome = join(home, ".mooter");
  assert.equal(existsSync(mooterHome), false, "must start with no ~/.mooter");

  // Step 2 — run the real wizard with mocks (no network, no Ollama, no API).
  const res = await runInit({
    io: scriptedIO({ confirm: [true, false, false, false, false], ask: ["2"] }), // anthropic yes · Max · skip packs · telemetry off
    mooterHome,
    now: () => FIXED_NOW,
    probe: async () => mockProbe(),
    validateAnthropic: async () => mockValidate,
  });
  assert.equal(res.exitCode, 0);

  // Step 3 — the three schemas exist.
  for (const f of ["profile.json", "credentials.json", "consent.json"]) {
    assert.ok(existsSync(join(mooterHome, f)), `${f} not written`);
  }

  // Step 4 — 10 synthetic prompts as classified log lines (mix of T0–T3).
  // Stamp them with the real current date: digest's count/tier buckets are
  // "today"-scoped, so a fixed future date would read as zero activity.
  const SID = "e2e-session-1";
  const nowIso = new Date().toISOString();
  const lines = Array.from({ length: 10 }, (_, i) => classifiedLine(i, SID, nowIso));

  // Step 5 — digest sees exactly 10 events for this session (today).
  const d = digest(lines, { sessionFilter: SID });
  assert.equal(d.total, 10, "all 10 events counted for the session");
  assert.equal(d.recent.length, 10, "recent window holds the 10 events");

  // Step 6 — render the statusline; it shows the cow + a tier label, and view B
  // surfaces the tier-mix chip (Day 3) over the same recent events.
  const baseCtx = {
    counts: d.counts,
    total: d.total,
    last: d.last,
    recent: d.recent,
    anthRem: 100,
    savedUsd: 0.27,
    savedPct: 89,
    todayCost: 0.04,
    ctxPercent: 23,
    lastTurnCost: 0.04,
    alltimeCost: 4.21,
    dataMissing: false,
  };
  const lineA = renderFromContext({ ...baseCtx, tick: 0 });
  assert.match(lineA, /🐮/);
  assert.match(lineA, /saved \$0\.27/);
  assert.match(lineA, /T[0-3]/);

  const lineB = renderFromContext({ ...baseCtx, tick: 5 }); // view B window
  assert.match(lineB, /last10: T0:\d+ T1:\d+ T2:\d+ T3:\d+/, "tier-mix chip visible in view B");

  // Step 7 — per-session isolation: a different session sees none of these events.
  const dOther = digest(lines, { sessionFilter: "e2e-session-2" });
  assert.equal(dOther.total, 0, "other session must see $0 activity");
  assert.equal(dOther.recent.length, 0);
  assert.equal(dOther.last, null, "no last decision leaks across sessions");
});

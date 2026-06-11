// Wave 50-51 Phase 1.C — functional tests for the 4 new MCP tools.
//
// Conventions follow mcp-wave32.test.ts: isolated HOME/MOOTER_HOME, plus
// MOOTER_CLAUDE_DIR isolation so decisions.log fixtures never touch the real
// ~/.claude. The savings-tracker is ALWAYS mocked via ctx.fetchImpl (hermetic —
// no HTTP, no network). mooter_route_query is exercised against the REAL
// frozen tools/router/classify.js (local, read-only spawn, no network).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleRequest, type JsonRpcRequest } from "../src/server.ts";
import { buildRegistry, type ToolContext } from "../src/tools.ts";

const registry = buildRegistry();

function req(method: string, params?: unknown): JsonRpcRequest {
  return { jsonrpc: "2.0", id: 1, method, params: params as JsonRpcRequest["params"] };
}
function call(name: string, args: Record<string, unknown> = {}, ctx: ToolContext = {}) {
  return handleRequest(req("tools/call", { name, arguments: args }), registry, ctx);
}
async function asJson(r: Awaited<ReturnType<typeof handleRequest>>): Promise<Record<string, unknown>> {
  return JSON.parse((r!.result as { content: Array<{ text: string }> }).content[0].text);
}

/** Mock tracker fetch — never hits the network. `metrics: null` = offline. */
function mockFetch(metrics: Record<string, unknown> | null): typeof fetch {
  return (async () => {
    if (metrics === null) throw new Error("ECONNREFUSED (mock offline)");
    return { ok: true, json: async () => metrics } as unknown as Response;
  }) as unknown as typeof fetch;
}

/** Isolate HOME + MOOTER_HOME + MOOTER_CLAUDE_DIR; optionally seed decisions.log. */
function withIsolatedState<T>(decisionLines: string[] | null, fn: () => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "mooter-mcp50-"));
  const claudeDir = join(dir, "claude");
  mkdirSync(join(claudeDir, "tools", "router"), { recursive: true });
  mkdirSync(join(dir, ".mooter"), { recursive: true });
  if (decisionLines) {
    writeFileSync(join(claudeDir, "tools", "router", "decisions.log"), decisionLines.join("\n") + "\n");
  }
  const prevH = process.env.HOME;
  const prevM = process.env.MOOTER_HOME;
  const prevC = process.env.MOOTER_CLAUDE_DIR;
  process.env.HOME = dir;
  process.env.MOOTER_HOME = join(dir, ".mooter");
  process.env.MOOTER_CLAUDE_DIR = claudeDir;
  return fn().finally(() => {
    if (prevH === undefined) delete process.env.HOME; else process.env.HOME = prevH;
    if (prevM === undefined) delete process.env.MOOTER_HOME; else process.env.MOOTER_HOME = prevM;
    if (prevC === undefined) delete process.env.MOOTER_CLAUDE_DIR; else process.env.MOOTER_CLAUDE_DIR = prevC;
    rmSync(dir, { recursive: true, force: true });
  });
}

function classified(tier: string, tsMs: number, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ event: "classified", tier, ts_ms: tsMs, recommended_model: "x", ...extra });
}

// ── mooter_route_query ────────────────────────────────────────────────────────

test("mooter_route_query classifies via the real frozen classify.js", async () => {
  const obj = await asJson(await call("mooter_route_query", { prompt: "summarize this file please" }));
  assert.match(String(obj.tier), /^T\d$/);
  assert.ok(typeof obj.confidence === "number");
  assert.ok(obj.recommended_model, "recommended_model present");
  assert.ok(obj.recommended_backend, "recommended_backend present");
  assert.match(String(obj.rationale), /T\d/);
  assert.equal(obj.error, undefined);
});

test("mooter_route_query returns a structured error on empty prompt (no throw)", async () => {
  const obj = await asJson(await call("mooter_route_query", { prompt: "   " }));
  assert.equal(obj.error, "invalid_input");
});

// ── mooter_get_savings ────────────────────────────────────────────────────────

test("mooter_get_savings mirrors decisions.log counts + tracker dollars (period=all)", async () => {
  const now = Date.now();
  await withIsolatedState(
    [classified("T0", now - 1000), classified("T0", now - 900), classified("T3", now - 800)],
    async () => {
      const obj = await asJson(
        await call("mooter_get_savings", { period: "all" }, { fetchImpl: mockFetch({ saved: 12.5, saved_pct: 47, alltime_cost_usd: 14.1 }) }),
      );
      assert.equal(obj.period, "all");
      assert.equal(obj.prompts, 3);
      assert.deepEqual(obj.tiers, { T0: 2, T3: 1 });
      const tracker = obj.tracker as Record<string, unknown>;
      assert.equal(tracker.savedUsd, 12.5);
      assert.equal(tracker.savedPct, 47);
      assert.equal(tracker.spentUsd, 14.1);
    },
  );
});

test("mooter_get_savings period=today filters out yesterday's decisions", async () => {
  const now = Date.now();
  const yesterday = now - 36 * 3600 * 1000;
  await withIsolatedState([classified("T1", yesterday), classified("T2", now - 500)], async () => {
    const obj = await asJson(
      await call("mooter_get_savings", { period: "today" }, { fetchImpl: mockFetch({ saved: 1 }) }),
    );
    assert.equal(obj.period, "today");
    assert.equal(obj.prompts, 1);
    assert.deepEqual(obj.tiers, { T2: 1 });
  });
});

test("mooter_get_savings explicit empty-state when no log and tracker offline", async () => {
  await withIsolatedState(null, async () => {
    const obj = await asJson(await call("mooter_get_savings", {}, { fetchImpl: mockFetch(null) }));
    assert.equal(obj.prompts, 0);
    assert.equal(obj.tracker, null);
    assert.match(String(obj.note), /no data yet/);
  });
});

// ── mooter_explain_tier ───────────────────────────────────────────────────────

test("mooter_explain_tier T3 returns Opus 4.6 at $5/$25 per MTok", async () => {
  const obj = await asJson(await call("mooter_explain_tier", { tier: "T3" }));
  assert.equal(obj.exists, true);
  assert.match(String(obj.model), /Opus 4\.6/);
  assert.deepEqual(obj.pricingPerMTok, { input: 5, output: 25 });
});

test("mooter_explain_tier T5 is Fable 5 $10/$50, opt-in only, never auto-routed", async () => {
  const obj = await asJson(await call("mooter_explain_tier", { tier: "T5" }));
  assert.equal(obj.exists, true);
  assert.equal(obj.optInOnly, true);
  assert.match(String(obj.model), /Fable 5/);
  assert.deepEqual(obj.pricingPerMTok, { input: 10, output: 50 });
  assert.match(String(obj.description), /NEVER auto-routes/);
});

test("mooter_explain_tier T4 honestly reports the tier does not exist", async () => {
  const obj = await asJson(await call("mooter_explain_tier", { tier: "T4" }));
  assert.equal(obj.exists, false);
  assert.match(String(obj.note), /no T4/);
});

// ── mooter_session_summary ────────────────────────────────────────────────────

test("mooter_session_summary reports effort mode + tail tier counts + tracker savings", async () => {
  const now = Date.now();
  await withIsolatedState(
    [classified("T0", now - 3000), classified("T0", now - 2000), classified("T1", now - 1000)],
    async () => {
      const obj = await asJson(
        await call("mooter_session_summary", { window: 2 }, { fetchImpl: mockFetch({ saved: 3.2, saved_pct: 60 }) }),
      );
      assert.equal(obj.effortMode, "default"); // fresh isolated HOME → default
      const recent = obj.recentDecisions as { window: number; total: number; byTier: Record<string, number> };
      assert.equal(recent.window, 2);
      assert.equal(recent.total, 2); // tail of 2 → T0 + T1
      assert.deepEqual(recent.byTier, { T0: 1, T1: 1 });
      assert.equal(obj.decisionsToday, 3);
      const savings = obj.savings as Record<string, unknown>;
      assert.equal(savings.savedUsd, 3.2);
      assert.equal(savings.savedPct, 60);
    },
  );
});

test("mooter_session_summary empty-state: no log, tracker offline", async () => {
  await withIsolatedState(null, async () => {
    const obj = await asJson(await call("mooter_session_summary", {}, { fetchImpl: mockFetch(null) }));
    const recent = obj.recentDecisions as { total: number };
    assert.equal(recent.total, 0);
    assert.equal(obj.savings, null);
    assert.match(String(obj.note), /tracker offline/);
  });
});

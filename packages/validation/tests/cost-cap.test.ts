import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseToml,
  coerceConfig,
  loadLimits,
  ensureDefaultLimits,
  DEFAULT_LIMITS_CONFIG,
  DEFAULT_LIMITS_TOML,
} from "../src/cost-cap/limits-config.ts";
import {
  LimitsEnforcer,
  LimitExceededError,
  detectUnusualSpend,
  detectProviderOutage,
} from "../src/cost-cap/limits-enforcer.ts";

// ─── config ─────────────────────────────────────────────────────────────────

test("parseToml reads sections, numbers, bools, comments", () => {
  const t = parseToml(DEFAULT_LIMITS_TOML);
  assert.equal(t.limits.max_workflow_cost_usd, 5);
  assert.equal(t.limits.max_t3_calls_per_5min, 30);
  assert.equal(t.anomalies.detect_unusual_spend, true);
});

test("coerceConfig fills defaults for missing keys", () => {
  const cfg = coerceConfig({ limits: { max_session_cost_usd: 12 } });
  assert.equal(cfg.limits.max_session_cost_usd, 12);
  assert.equal(cfg.limits.max_workflow_cost_usd, DEFAULT_LIMITS_CONFIG.limits.max_workflow_cost_usd);
});

test("loadLimits returns defaults when file absent; ensureDefaultLimits scaffolds", () => {
  const dir = mkdtempSync(join(tmpdir(), "mooter-limits-"));
  try {
    const p = join(dir, "limits.toml");
    assert.deepEqual(loadLimits(p), DEFAULT_LIMITS_CONFIG);
    assert.equal(ensureDefaultLimits(p), true);
    assert.ok(existsSync(p));
    assert.equal(ensureDefaultLimits(p), false); // idempotent
    const custom = parseToml("[limits]\nmax_session_cost_usd = 7\n");
    assert.equal(custom.limits.max_session_cost_usd, 7);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadLimits parses a real file", () => {
  const dir = mkdtempSync(join(tmpdir(), "mooter-limits2-"));
  try {
    const p = join(dir, "limits.toml");
    writeFileSync(p, "[limits]\nmax_workflow_cost_usd = 2.5\nmax_concurrent_workflows = 1\n");
    const cfg = loadLimits(p);
    assert.equal(cfg.limits.max_workflow_cost_usd, 2.5);
    assert.equal(cfg.limits.max_concurrent_workflows, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─── enforcer ───────────────────────────────────────────────────────────────

const cfg = coerceConfig(parseToml("[limits]\nmax_workflow_cost_usd = 5\nmax_session_cost_usd = 50\nmax_t3_calls_per_5min = 3\nmax_concurrent_workflows = 2\n"));

test("workflow cost cap trips", () => {
  const e = new LimitsEnforcer(cfg);
  e.recordSpend(4.5, { workflowId: "wf1" });
  assert.throws(
    () => e.enforceSpawn({ workflowId: "wf1", estCostUsd: 1.0, nowMs: 0 }),
    (err: unknown) => err instanceof LimitExceededError && err.violation.kind === "workflow_cost",
  );
});

test("session cost cap trips across workflows", () => {
  const e = new LimitsEnforcer(cfg);
  e.recordSpend(49.5, { workflowId: "wf1" });
  assert.throws(
    () => e.enforceSpawn({ workflowId: "wf2", estCostUsd: 1.0, nowMs: 0 }),
    (err: unknown) => err instanceof LimitExceededError && err.violation.kind === "session_cost",
  );
});

test("T3 rate window slides — old calls expire", () => {
  const e = new LimitsEnforcer(cfg); // cap 3 per 5min
  e.enforceSpawn({ workflowId: "wf", t3: true, nowMs: 0 });
  e.enforceSpawn({ workflowId: "wf", t3: true, nowMs: 1000 });
  e.enforceSpawn({ workflowId: "wf", t3: true, nowMs: 2000 });
  // 4th within window → trips
  assert.throws(
    () => e.enforceSpawn({ workflowId: "wf", t3: true, nowMs: 3000 }),
    (err: unknown) => err instanceof LimitExceededError && err.violation.kind === "t3_rate",
  );
  // but 6 minutes later the early ticks have expired → allowed again
  assert.doesNotThrow(() => e.enforceSpawn({ workflowId: "wf", t3: true, nowMs: 6 * 60 * 1000 }));
});

test("enforceSpawn does not count a T3 tick when it throws", () => {
  const e = new LimitsEnforcer(cfg);
  e.recordSpend(49.9);
  try {
    e.enforceSpawn({ workflowId: "wf", estCostUsd: 1, t3: true, nowMs: 0 });
  } catch {
    /* expected */
  }
  assert.equal(e.status(0).t3InWindow, 0);
});

test("status snapshot reflects spend + t3 window", () => {
  const e = new LimitsEnforcer(cfg);
  e.recordSpend(10);
  e.recordT3Call(0);
  const s = e.status(1000);
  assert.equal(s.sessionSpend, 10);
  assert.equal(s.t3InWindow, 1);
  assert.equal(s.ok, true);
});

// ─── anomaly detection ──────────────────────────────────────────────────────

test("detectUnusualSpend flags a 3x+ spike (with enough history)", () => {
  assert.equal(detectUnusualSpend([1, 1, 1, 1, 1], 2), null); // 2x, below factor 3
  const a = detectUnusualSpend([1, 1, 1, 1, 1], 5);
  assert.ok(a && a.kind === "unusual_spend");
  assert.equal(detectUnusualSpend([1, 1], 99), null); // not enough history
});

test("detectProviderOutage flags all-failing provider", () => {
  const a = detectProviderOutage([
    { provider: "openai", ok: false },
    { provider: "openai", ok: false },
    { provider: "openai", ok: false },
    { provider: "anthropic", ok: true },
  ]);
  assert.ok(a && a.kind === "provider_outage");
  assert.match(a.detail, /openai/);
  assert.equal(detectProviderOutage([{ provider: "x", ok: false }]), null); // < minAttempts
});

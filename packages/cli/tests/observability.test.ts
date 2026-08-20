// Wave Mega 50-51 Phase 1.A — `mooter observability` (OTLP export of routing decisions).
// No network is ever hit: export tests inject a fake `post`, dry-run is network-free.
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runObservability } from "../src/commands/observability.ts";
import { readConfig } from "../src/observability/config.ts";
import { decisionToSpan, readDecisionsTail, buildOtlpPayload, type OtlpAttribute } from "../src/observability/convert.ts";
import type { OtlpPayload } from "../src/observability/convert.ts";

function withHome<T>(fn: (home: string) => T): T {
  const prev = process.env.HOME;
  const home = mkdtempSync(join(tmpdir(), "mooter-obs-"));
  process.env.HOME = home;
  process.env.MOOTER_HOME = join(home, ".mooter");
  try {
    return fn(home);
  } finally {
    if (prev === undefined) delete process.env.HOME;
    else process.env.HOME = prev;
  }
}

function tmpLog(lines: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "mooter-obs-log-"));
  const path = join(dir, "decisions.log");
  writeFileSync(path, lines.join("\n") + "\n", "utf8");
  return path;
}

const CLASSIFIED_FIXTURE = JSON.stringify({
  ts: "2026-06-09T23:57:53.283Z",
  ts_ms: 1781049473284,
  event: "classified",
  session_id: "s-test",
  prompt_len: 54,
  prompt_preview: "SHOULD NEVER APPEAR IN A SPAN",
  tier: "T2",
  task_category: "bug_investigation",
  recommended_backend: "claude_subagent",
  recommended_model: "claude-sonnet-4-6",
  confidence: 0.85,
});

const EXECUTED_FIXTURE = JSON.stringify({
  ts: "2026-05-31T02:23:13.688Z",
  event: "executed",
  tier: "T1",
  confidence: 0.9,
  model_used: "claude-haiku-4-5",
  duration_ms: 1200,
  tokens_in: 1_000_000,
  tokens_out: 100_000,
  cost_usd: 1.5,
});

function attr(span: { attributes: OtlpAttribute[] }, key: string): OtlpAttribute | undefined {
  return span.attributes.find((a) => a.key === key);
}

// ---------------------------------------------------------------------------
// config enable/disable roundtrip

test("observability enable/disable roundtrip persists to ~/.mooter/observability.json", async () => {
  await withHome(async (home) => {
    const log = tmpLog([]);
    // default: disabled
    let r = await runObservability(["status"], { home, decisionsLog: log });
    assert.strictEqual(r.exitCode, 0);
    assert.match(r.output, /observability: disabled/);
    assert.match(r.output, /http:\/\/127\.0\.0\.1:4318/);
    assert.match(r.output, /mooter-router/);

    r = await runObservability(["enable"], { home, decisionsLog: log });
    assert.strictEqual(r.exitCode, 0);
    const onDisk = JSON.parse(readFileSync(join(home, ".mooter", "observability.json"), "utf8"));
    assert.strictEqual(onDisk.enabled, true);
    assert.strictEqual(onDisk.otlp_endpoint, "http://127.0.0.1:4318");
    assert.strictEqual(onDisk.service_name, "mooter-router");
    assert.strictEqual(readConfig(home).enabled, true);

    r = await runObservability(["disable"], { home, decisionsLog: log });
    assert.strictEqual(r.exitCode, 0);
    assert.strictEqual(readConfig(home).enabled, false);
  });
});

test("status counts routing decisions and skips non-route/malformed lines", async () => {
  await withHome(async (home) => {
    const log = tmpLog([
      CLASSIFIED_FIXTURE,
      '{"ts":"2026-06-09T23:57:36.778Z","event":"turn_end"}', // not a route
      "{{{not json", // malformed
      EXECUTED_FIXTURE,
    ]);
    const r = await runObservability(["status"], { home, decisionsLog: log });
    assert.match(r.output, /2 routing decision\(s\) available/);
  });
});

// ---------------------------------------------------------------------------
// decisions → span conversion

test("classified decision converts to mooter.route span with honest attributes (no cost fabricated)", () => {
  const [d] = readDecisionsTail(tmpLog([CLASSIFIED_FIXTURE]), 10);
  const span = decisionToSpan(d);

  assert.strictEqual(span.name, "mooter.route");
  assert.strictEqual(span.kind, 1);
  assert.match(span.traceId, /^[0-9a-f]{32}$/);
  assert.match(span.spanId, /^[0-9a-f]{16}$/);
  assert.strictEqual(span.startTimeUnixNano, String(1781049473284 * 1e6));

  assert.deepStrictEqual(attr(span, "mooter.tier")?.value, { stringValue: "T2" });
  assert.deepStrictEqual(attr(span, "mooter.model")?.value, { stringValue: "claude-sonnet-4-6" });
  assert.deepStrictEqual(attr(span, "gen_ai.request.model")?.value, { stringValue: "claude-sonnet-4-6" });
  assert.deepStrictEqual(attr(span, "gen_ai.system")?.value, { stringValue: "claude_subagent" });
  assert.deepStrictEqual(attr(span, "mooter.confidence")?.value, { doubleValue: 0.85 });

  // no token info in classified events → cost/savings MUST be absent
  assert.strictEqual(attr(span, "mooter.cost_estimate_usd"), undefined);
  assert.strictEqual(attr(span, "mooter.savings_vs_t3_usd"), undefined);

  // privacy: prompt contents never exported
  assert.ok(!JSON.stringify(span).includes("SHOULD NEVER APPEAR"));
});

test("executed decision with real tokens computes savings vs T3", () => {
  const [d] = readDecisionsTail(tmpLog([EXECUTED_FIXTURE]), 10);
  const span = decisionToSpan(d);

  // logged cost preferred for the estimate
  assert.deepStrictEqual(attr(span, "mooter.cost_estimate_usd")?.value, { doubleValue: 1.5 });
  // T3 cost of 1M in + 100k out = $5 + $2.5 = $7.5 → savings = 7.5 - 1.5 = 6.0
  const savings = attr(span, "mooter.savings_vs_t3_usd")?.value as { doubleValue: number };
  assert.ok(savings, "savings attribute present when tokens exist");
  assert.ok(Math.abs(savings.doubleValue - 6.0) < 1e-9, `expected 6.0, got ${savings.doubleValue}`);
  // duration reflected in end time
  assert.strictEqual(
    Number(span.endTimeUnixNano) - Number(span.startTimeUnixNano),
    1200 * 1e6,
  );
});

test("buildOtlpPayload wraps spans with service.name resource", () => {
  const [d] = readDecisionsTail(tmpLog([CLASSIFIED_FIXTURE]), 10);
  const payload = buildOtlpPayload([decisionToSpan(d)], "mooter-router");
  const res = payload.resourceSpans[0];
  assert.deepStrictEqual(res.resource.attributes[0], { key: "service.name", value: { stringValue: "mooter-router" } });
  assert.strictEqual(res.scopeSpans[0].spans.length, 1);
});

// ---------------------------------------------------------------------------
// export: dry-run + mocked POST (never the network)

test("export --dry-run prints first span + counts without network, even when disabled", async () => {
  await withHome(async (home) => {
    const log = tmpLog([CLASSIFIED_FIXTURE, EXECUTED_FIXTURE]);
    const post = async (): Promise<never> => {
      throw new Error("network MUST NOT be called in dry-run");
    };
    const r = await runObservability(["export", "--dry-run", "--last", "2"], { home, decisionsLog: log, post });
    assert.strictEqual(r.exitCode, 0);
    assert.match(r.output, /dry-run: 2 decision\(s\) → 2 span\(s\)\. No network calls made\./);
    assert.match(r.output, /"name": "mooter\.route"/);
    assert.match(r.output, /"mooter\.tier"/);
  });
});

test("export refuses when disabled; reports honest success/failure when enabled", async () => {
  await withHome(async (home) => {
    const log = tmpLog([CLASSIFIED_FIXTURE]);
    let posted: { endpoint: string; payload: OtlpPayload } | null = null;

    // disabled → refuse (no post)
    let r = await runObservability(["export"], {
      home,
      decisionsLog: log,
      post: async () => ({ ok: true, status: 200, error: null }),
    });
    assert.strictEqual(r.exitCode, 1);
    assert.match(r.output, /disabled/);

    await runObservability(["enable"], { home, decisionsLog: log });

    // success path
    r = await runObservability(["export", "--last", "5"], {
      home,
      decisionsLog: log,
      post: async (endpoint, payload) => {
        posted = { endpoint, payload };
        return { ok: true, status: 200, error: null };
      },
    });
    assert.strictEqual(r.exitCode, 0);
    assert.match(r.output, /✓ exported 1 span\(s\) to http:\/\/127\.0\.0\.1:4318\/v1\/traces \(HTTP 200\)/);
    assert.strictEqual(posted!.endpoint, "http://127.0.0.1:4318");
    assert.strictEqual(posted!.payload.resourceSpans[0].scopeSpans[0].spans.length, 1);

    // failure path — honest counts
    r = await runObservability(["export"], {
      home,
      decisionsLog: log,
      post: async () => ({ ok: false, status: null, error: "connect ECONNREFUSED" }),
    });
    assert.strictEqual(r.exitCode, 1);
    assert.match(r.output, /✗ export failed: connect ECONNREFUSED — 0 of 1 span\(s\) delivered/);
  });
});

test("export with empty log reports nothing to export", async () => {
  await withHome(async (home) => {
    const log = join(mkdtempSync(join(tmpdir(), "mooter-obs-none-")), "decisions.log"); // never created
    await runObservability(["enable"], { home, decisionsLog: log });
    const r = await runObservability(["export"], {
      home,
      decisionsLog: log,
      post: async (): Promise<never> => {
        throw new Error("must not POST when there is nothing to export");
      },
    });
    assert.strictEqual(r.exitCode, 0);
    assert.match(r.output, /nothing to export — 0 routing decisions/);
  });
});

test("export-config prints collector receiver snippet + OpenLLMetry note", async () => {
  await withHome(async (home) => {
    const r = await runObservability(["export-config"], { home, decisionsLog: tmpLog([]) });
    assert.strictEqual(r.exitCode, 0);
    assert.match(r.output, /receivers:/);
    assert.match(r.output, /otlp:/);
    assert.match(r.output, /127\.0\.0\.1:4318/);
    assert.match(r.output, /OpenLLMetry/);
    assert.match(r.output, /gen_ai\.request\.model/);
  });
});

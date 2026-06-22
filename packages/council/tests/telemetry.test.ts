import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTelemetryRecord,
  confidenceBucket,
  costBucket,
  postTelemetry,
} from "../src/telemetry.ts";
import type { CouncilVerdict } from "../src/types.ts";

function v(partial: Partial<CouncilVerdict>): CouncilVerdict {
  return {
    recommendation: "SECRET ANSWER TEXT that must never leave the machine",
    confidence: 0.9,
    consensus: ["secret rationale"],
    dissent: [],
    uniqueFindings: [],
    minorityReport: [{ reviewer: "c", lens: "security", verdict: "refute", confidence: 0.8, rationale: "secret refute text" }],
    seats: ["a", "b", "c"],
    winnerSeatId: "a",
    judge: null,
    rounds: 2,
    costUsd: 0,
    latencyMs: 1000,
    modelCalls: 9,
    stable: true,
    convergence: "CONFIRMED",
    voteScore: 0.9,
    coverageNote: "all-local",
    ...partial,
  };
}

test("confidenceBucket buckets to 0.2 bins capped at 0.8-1.0", () => {
  assert.equal(confidenceBucket(0.9), "0.8-1.0");
  assert.equal(confidenceBucket(1.0), "0.8-1.0");
  assert.equal(confidenceBucket(0.5), "0.4-0.6");
  assert.equal(confidenceBucket(0.0), "0.0-0.2");
});

test("costBucket buckets cost honestly", () => {
  assert.equal(costBucket(0), "$0");
  assert.equal(costBucket(0.005), "<$0.01");
  assert.equal(costBucket(0.05), "<$0.10");
  assert.equal(costBucket(0.5), "<$1");
  assert.equal(costBucket(2), ">=$1");
});

test("telemetry record is CONTENT-FREE (no prompt/answer/rationale leaks)", () => {
  const rec = buildTelemetryRecord(v({}), { category: "coding.security", localOnly: true, autoConvened: true, decision: "ESCALATE" });
  const blob = JSON.stringify(rec);
  assert.ok(!/SECRET ANSWER TEXT/.test(blob), "no recommendation text");
  assert.ok(!/secret rationale/.test(blob), "no consensus text");
  assert.ok(!/secret refute text/.test(blob), "no minority rationale");
  assert.equal(rec.category, "coding.security");
  assert.equal(rec.confidenceBucket, "0.8-1.0");
  assert.equal(rec.costBucket, "$0");
  assert.equal(rec.seatCount, 3);
  assert.equal(rec.localOnly, true);
  assert.equal(rec.autoConvened, true);
  assert.equal(rec.decision, "ESCALATE");
  assert.equal(rec.stable, true);
});

test("postTelemetry: no endpoint → disabled (opt-in)", async () => {
  const r = await postTelemetry(buildTelemetryRecord(v({}), { category: "x", localOnly: true }), {});
  assert.equal(r.sent, false);
  assert.match(r.reason, /no endpoint/);
});

test("postTelemetry: injected fetch ok → sent", async () => {
  let body = "";
  const fakeFetch = (async (_url: string, init: any) => {
    body = init.body;
    return { ok: true, status: 200 } as Response;
  }) as any;
  const r = await postTelemetry(buildTelemetryRecord(v({}), { category: "x", localOnly: true }), {
    endpoint: "https://hub.example/telemetry",
    fetchImpl: fakeFetch,
  });
  assert.equal(r.sent, true);
  assert.ok(!/SECRET ANSWER TEXT/.test(body), "posted body is content-free");
});

test("postTelemetry: fetch throwing → not sent, never throws", async () => {
  const r = await postTelemetry(buildTelemetryRecord(v({}), { category: "x", localOnly: true }), {
    endpoint: "https://hub.example/telemetry",
    fetchImpl: (async () => {
      throw new Error("network down");
    }) as any,
  });
  assert.equal(r.sent, false);
  assert.match(r.reason, /network down/);
});

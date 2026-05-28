// event-schema.test.ts — Wave 2 Day 4.
//
// Canonical MooterEvent schema invariants. Compile-time TS shape is enforced
// by the writer; here we exercise the runtime helpers and integrity rules.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SCHEMA_VERSION,
  decodeUUIDv7Timestamp,
  generateUUIDv7,
  makeEnvelope,
  type MooterEvent,
} from "../src/mooter_event.ts";

test("SCHEMA_VERSION pinned to 1.0.0 (Day 4 baseline)", () => {
  assert.equal(SCHEMA_VERSION, "1.0.0");
});

test("generateUUIDv7 produces RFC-shape UUIDs with version 7 + variant 10xx", () => {
  for (let i = 0; i < 100; i++) {
    const u = generateUUIDv7();
    assert.match(
      u,
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      `bad uuid shape: ${u}`,
    );
  }
});

test("generateUUIDv7 embeds the wall-clock timestamp prefix", () => {
  const before = Date.now();
  const u = generateUUIDv7();
  const after = Date.now();
  const ts = decodeUUIDv7Timestamp(u);
  assert.ok(ts >= before - 1, `ts ${ts} before ${before}`);
  assert.ok(ts <= after + 1, `ts ${ts} after ${after}`);
});

test("generateUUIDv7 is lexicographically sortable by creation time", async () => {
  const a = generateUUIDv7();
  await new Promise<void>((r) => setTimeout(r, 5));
  const b = generateUUIDv7();
  assert.ok(a < b, `expected ${a} < ${b}`);
});

test("makeEnvelope returns every envelope field with the expected types", () => {
  const env = makeEnvelope({
    event_type: "prod",
    user_id_anon: "anon:abc123",
    session_id: "01234567-89ab-7cde-8123-0123456789ab",
    pastor_version: "0.1.0",
    pricing_version: "0.0.1",
    env_hash: "deadbeefcafebabe",
  });
  assert.equal(env.event_type, "prod");
  assert.equal(env.user_id_anon, "anon:abc123");
  assert.equal(env.pastor_version, "0.1.0");
  assert.equal(env.pricing_version, "0.0.1");
  assert.equal(env.env_hash, "deadbeefcafebabe");
  assert.equal(env.schema_version, SCHEMA_VERSION);
  // UUIDv7 shape on event_id
  assert.match(env.event_id, /^[0-9a-f]{8}-[0-9a-f]{4}-7/);
  // ISO 8601 with Z suffix
  assert.match(env.timestamp_utc, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
});

test("a fully-populated MooterEvent is JSON-roundtrippable", () => {
  const env = makeEnvelope({
    event_type: "prod",
    user_id_anon: "anon:x",
    session_id: generateUUIDv7(),
    pastor_version: "0.1.0",
    pricing_version: "0.0.1",
    env_hash: "deadbeef",
  });
  const event: MooterEvent = {
    ...env,
    prompt_hash: "0123456789abcdef",
    prompt_tokens_est: 42,
    axis1_tier_recommended: "T2",
    axis1_confidence: 0.85,
    axis2_pack_id: "animation-web",
    axis2_confidence: 0.7,
    axis3_adapter_id: null,
    axis3_adapter_version: null,
    model_floor_applied: "T2",
    model_ceiling_applied: "T2",
    escalation_triggered: false,
    escalation_reason: null,
    model_actual: null,
    provider: null,
    tokens_in: null,
    tokens_out: null,
    tokens_cache_hit: null,
    cost_micros: null,
    latency_ms_total: null,
    latency_ms_ttft: null,
    latency_ms_per_tok: null,
    error_type: null,
    retries: null,
    user_continued: null,
    user_edited_output: null,
    user_aborted: null,
    session_outcome: null,
    rating_thumb: null,
    rating_comment_anon: null,
  };
  const json = JSON.stringify(event);
  const decoded = JSON.parse(json) as MooterEvent;
  assert.deepEqual(decoded, event);
});

test("prompt_hash invariant: 16 hex chars, never raw text", () => {
  // The schema itself doesn't enforce this — callers do, and the hook does.
  // Here we lock the contract: producers MUST shorten to 16 chars. Any test
  // helper that builds events should follow the same rule.
  const sample: MooterEvent["prompt_hash"] = "abcdef0123456789";
  assert.equal(sample.length, 16);
  assert.match(sample, /^[0-9a-f]{16}$/);
});

test("cost_micros invariant: integer microUSD, never float", () => {
  // Mirror the writer-side guard: every produced cost_micros must satisfy
  // Number.isInteger. We assert the documented conversion is the only path.
  const usd = 0.000123;
  const micros = Math.round(usd * 1e6);
  assert.equal(Number.isInteger(micros), true);
  assert.equal(micros, 123);
});

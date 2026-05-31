// Wave 3 Day 3 — mooter_sync_event schema v1. node:test + tsx.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  pseudoClientId, gpuClass, ramClass, normalizeOs, signSyncEvent, verifySyncEvent,
  validateSyncEvent, findForbiddenKeys, makeEventId, SYNC_SCHEMA_VERSION, type MooterSyncEvent,
} from "../src/sync/sync_event_schema.ts";

const SECRET = "sync-secret-cafef00d";

function fixture(): Omit<MooterSyncEvent, "signature"> {
  return {
    schema_version: SYNC_SCHEMA_VERSION,
    event_id: makeEventId(1_780_000_000_000, 0, SECRET),
    client_id_pseudonymous: pseudoClientId(SECRET),
    emitted_at_utc: "2026-05-31T18:00:00.000Z",
    tier_distribution: { window_start_utc: "a", window_end_utc: "b", counts: { T0: 35, T1: 5, T2: 5, T3: 2 }, avg_confidence: 0.82 },
    hardware_info: { os: "linux", gpu_class: "high-end", ram_class: "high", ollama_available: true },
  };
}

test("pseudoClientId: derived from secret, never reveals it, stable", () => {
  const id = pseudoClientId(SECRET);
  assert.ok(!id.includes(SECRET), "must not contain the raw secret");
  assert.equal(id, pseudoClientId(SECRET), "stable");
  assert.notEqual(id, pseudoClientId("other"), "differs per secret");
});

test("hardware anonymization: classes, never exact model", () => {
  assert.equal(gpuClass({ model: "NVIDIA RTX 4090", vram_gb: 24 }), "high-end");
  assert.equal(gpuClass({ model: "Intel Iris", vram_gb: 1 }), "integrated");
  assert.equal(gpuClass(null), "none");
  assert.equal(ramClass(8), "low");
  assert.equal(ramClass(32), "mid");
  assert.equal(ramClass(64), "high");
  assert.equal(normalizeOs("darwin-23"), "darwin");
  assert.equal(normalizeOs("linux-6.6-microsoft-WSL2"), "windows-wsl");
});

test("sign + verify roundtrip; tamper detection", () => {
  const signed = signSyncEvent(fixture(), SECRET);
  assert.equal(signed.signature.algo, "HMAC-SHA256");
  assert.equal(verifySyncEvent(signed, SECRET), true);
  assert.equal(verifySyncEvent(signed, "wrong"), false);
  const tampered = { ...signed, tier_distribution: { ...signed.tier_distribution!, counts: { T0: 999, T1: 0, T2: 0, T3: 0 } } } as MooterSyncEvent;
  assert.equal(verifySyncEvent(tampered, SECRET), false, "mutating payload breaks the signature");
});

test("validateSyncEvent: passes a clean event", () => {
  const signed = signSyncEvent(fixture(), SECRET);
  const v = validateSyncEvent(signed);
  assert.equal(v.valid, true, v.errors.join("; "));
});

test("findForbiddenKeys: rejects any prompt_content / model / file_path leak", () => {
  assert.deepEqual(findForbiddenKeys({ tier_distribution: { counts: {} } }), []);
  assert.ok(findForbiddenKeys({ x: { prompt_content: "secret code" } }).length > 0);
  assert.ok(findForbiddenKeys({ hardware_info: { model: "RTX 4090" } }).length > 0, "exact model is forbidden");
  const v = validateSyncEvent(signSyncEvent({ ...fixture(), pack_usage: { window_start_utc: "a", window_end_utc: "b", pack_ids: ["x"], counts: {} } } as any, SECRET));
  assert.equal(v.valid, true);
});

test("makeEventId: UUIDv7-shaped, deterministic, time-ordered", () => {
  const a = makeEventId(1_780_000_000_000, 0, SECRET);
  const b = makeEventId(1_780_000_000_000, 0, SECRET);
  assert.equal(a, b, "deterministic");
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/, "v7-shaped");
  const later = makeEventId(1_780_000_001_000, 0, SECRET);
  assert.ok(later > a, "time-ordered");
});

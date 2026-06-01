// Wave 3 Day 3 — sync queue build + roundtrip. node:test + tsx.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildSyncEvents, appendToQueue, listQueue, clearQueue } from "../src/sync/sync_queue.ts";
import { buildConsent } from "../src/consent.ts";
import { findForbiddenKeys } from "../src/sync/sync_event_schema.ts";

const NOW = 1_780_000_000_000;
const DAY = 864e5;
const SECRET = "queue-secret";

function evt(daysAgo: number, tier: string, applied = false) {
  return JSON.stringify({ event: "classified", ts_ms: NOW - daysAgo * DAY, tier, confidence: 0.8, safety_boost_applied: applied, safety_boost_reason: applied ? "critical_phrase_match: x" : null });
}
const LINES = [evt(0.1, "T0"), evt(0.2, "T2", true), evt(0.3, "T0"), evt(5, "T3") /* outside 24h window */];

const consentOn = buildConsent(true, new Date(NOW), SECRET);
const consentOff = buildConsent(false, new Date(NOW), SECRET);
const profile = { os: "linux-wsl", gpu: { model: "RTX 4090", vram_gb: 24 }, ram_gb: 64, ollama_available: true };
const base = { secret: SECRET, windowStartMs: NOW - DAY, windowEndMs: NOW, nowMs: NOW, lines: LINES, profile, installedPacks: ["diagram-systems"] };

test("consent gate is absolute: opt-out → no events", () => {
  assert.deepEqual(buildSyncEvents({ ...base, consent: consentOff }), []);
});

test("opt-in: builds one event with the enabled categories", () => {
  const [e] = buildSyncEvents({ ...base, consent: consentOn });
  assert.ok(e, "event built");
  assert.equal(e.schema_version, 1);
  assert.deepEqual(e.tier_distribution!.counts, { T0: 2, T1: 0, T2: 1, T3: 0 }, "T3 outside window excluded");
  assert.equal(e.safety_boost_reasons!.applied, 1);
  assert.equal(e.hardware_info!.gpu_class, "high-end", "anonymized, not 'RTX 4090'");
  assert.equal(e.pack_usage!.pack_ids[0], "diagram-systems");
});

test("payload never contains forbidden keys (no model/prompt leak)", () => {
  const [e] = buildSyncEvents({ ...base, consent: consentOn });
  assert.deepEqual(findForbiddenKeys(e), [], "no prompt_content/model/file_path anywhere");
  assert.ok(!JSON.stringify(e).includes("RTX 4090"), "exact GPU model never serialized");
});

test("empty window → no events", () => {
  assert.deepEqual(buildSyncEvents({ ...base, consent: consentOn, lines: [] }), []);
});

test("append + list + clear roundtrip", () => {
  const home = mkdtempSync(join(tmpdir(), "mooter-q-"));
  const events = buildSyncEvents({ ...base, consent: consentOn });
  appendToQueue(events, home);
  const listed = listQueue(home);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].event_id, events[0].event_id);
  clearQueue(home);
  assert.deepEqual(listQueue(home), [], "cleared");
});

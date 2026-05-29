// event-writer.test.ts — Wave 2 Day 4.
//
// EventWriter writes one MooterEvent per line to sessions/<id>.jsonl, rolls up
// into events/<date>.jsonl idempotently, and prunes based on age (events 30d,
// sessions 90d). All file ops must respect 0o700/0o600 perms and never throw
// on degenerate input.

import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EventWriter,
  EVENT_RETENTION_MS,
  SESSION_RETENTION_MS,
} from "../src/event_writer.ts";
import {
  generateUUIDv7,
  makeEnvelope,
  type MooterEvent,
} from "../src/mooter_event.ts";

function tmpHome(): string {
  return mkdtempSync(join(tmpdir(), "mooter-events-"));
}

function makeEvent(overrides: Partial<MooterEvent> = {}): MooterEvent {
  const envelope = makeEnvelope({
    event_type: "prod",
    user_id_anon: "anon:test",
    session_id: overrides.session_id ?? generateUUIDv7(),
    pastor_version: "0.1.0",
    pricing_version: "0.0.1",
    env_hash: "deadbeefcafebabe",
  });
  return {
    ...envelope,
    prompt_hash: "abcdef0123456789",
    prompt_tokens_est: 12,
    axis1_tier_recommended: "T2",
    axis1_confidence: 0.8,
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
    ...overrides,
  };
}

test("init() creates sessions/ + events/ with 0o700 perms", async () => {
  const home = tmpHome();
  const w = new EventWriter(home);
  await w.init();
  const { sessions, events } = w.getDirs();
  const s = await fs.stat(sessions);
  const e = await fs.stat(events);
  // Lower 9 bits of the mode are the permission bits.
  assert.equal(s.mode & 0o777, 0o700, "sessions dir perms 0o700");
  assert.equal(e.mode & 0o777, 0o700, "events dir perms 0o700");
});

test("write() appends one JSONL line per event, file lives under sessions/", async () => {
  const w = new EventWriter(tmpHome());
  const session = generateUUIDv7();
  const evA = makeEvent({ session_id: session });
  const evB = makeEvent({ session_id: session });
  await w.write(evA);
  await w.write(evB);

  const file = join(w.getDirs().sessions, `${session}.jsonl`);
  const raw = await fs.readFile(file, "utf8");
  const lines = raw.trim().split("\n");
  assert.equal(lines.length, 2);
  const parsedA = JSON.parse(lines[0]!) as MooterEvent;
  const parsedB = JSON.parse(lines[1]!) as MooterEvent;
  assert.equal(parsedA.event_id, evA.event_id);
  assert.equal(parsedB.event_id, evB.event_id);
});

test("write() p99 over 100 events stays under 5ms", async () => {
  const w = new EventWriter(tmpHome());
  await w.init(); // exclude one-time dir setup from the measurement
  const samples: number[] = [];
  for (let i = 0; i < 100; i++) {
    const ev = makeEvent();
    const t0 = process.hrtime.bigint();
    await w.write(ev);
    samples.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  samples.sort((a, b) => a - b);
  const p99 = samples[Math.floor(0.99 * samples.length)]!;
  assert.ok(p99 < 5, `write p99 ${p99.toFixed(3)}ms > 5ms`);
});

test("rollupDaily() consolidates session events matching the date prefix", async () => {
  const w = new EventWriter(tmpHome());
  const sA = generateUUIDv7();
  const sB = generateUUIDv7();
  await w.write(makeEvent({ session_id: sA, timestamp_utc: "2026-05-28T10:00:00.000Z" }));
  await w.write(makeEvent({ session_id: sA, timestamp_utc: "2026-05-28T11:00:00.000Z" }));
  await w.write(makeEvent({ session_id: sB, timestamp_utc: "2026-05-29T09:00:00.000Z" }));

  const r = await w.rollupDaily("2026-05-28");
  assert.equal(r.events_written, 2);
  assert.equal(r.sessions_touched, 1);

  const eventsFile = join(w.getDirs().events, "2026-05-28.jsonl");
  const content = await fs.readFile(eventsFile, "utf8");
  const lines = content.trim().split("\n");
  assert.equal(lines.length, 2);
});

test("rollupDaily() is idempotent — running twice never duplicates", async () => {
  const w = new EventWriter(tmpHome());
  const session = generateUUIDv7();
  await w.write(makeEvent({ session_id: session, timestamp_utc: "2026-05-28T10:00:00.000Z" }));
  await w.write(makeEvent({ session_id: session, timestamp_utc: "2026-05-28T11:00:00.000Z" }));

  const r1 = await w.rollupDaily("2026-05-28");
  const r2 = await w.rollupDaily("2026-05-28");
  assert.equal(r1.events_written, 2);
  assert.equal(r2.events_written, 0, "second roll-up must be a no-op");

  const eventsFile = join(w.getDirs().events, "2026-05-28.jsonl");
  const content = await fs.readFile(eventsFile, "utf8");
  const lines = content.trim().split("\n");
  assert.equal(lines.length, 2, "events file must not double");
});

test("pruneRetention() drops events older than 30d, sessions older than 90d", async () => {
  const w = new EventWriter(tmpHome());
  await w.init();
  const { sessions, events } = w.getDirs();

  // Create stale + fresh files for both dirs.
  const staleEventA = join(events, "2026-01-01.jsonl");
  const freshEventA = join(events, "2026-05-28.jsonl");
  await fs.writeFile(staleEventA, "old\n", { mode: 0o600 });
  await fs.writeFile(freshEventA, "new\n", { mode: 0o600 });
  // Set mtimes explicitly (90d ago for stale, 1h ago for fresh).
  const now = Date.now();
  const oldEv = new Date(now - EVENT_RETENTION_MS - 60_000);
  await fs.utimes(staleEventA, oldEv, oldEv);

  const staleSession = join(sessions, "stale.jsonl");
  const freshSession = join(sessions, "fresh.jsonl");
  await fs.writeFile(staleSession, "x\n", { mode: 0o600 });
  await fs.writeFile(freshSession, "y\n", { mode: 0o600 });
  const oldSess = new Date(now - SESSION_RETENTION_MS - 60_000);
  await fs.utimes(staleSession, oldSess, oldSess);

  const r = await w.pruneRetention(now);
  assert.equal(r.events_pruned, 1, "1 stale event file pruned");
  assert.equal(r.sessions_pruned, 1, "1 stale session file pruned");

  await assert.rejects(fs.stat(staleEventA), "stale event file gone");
  await assert.rejects(fs.stat(staleSession), "stale session file gone");
  await fs.stat(freshEventA); // does not throw
  await fs.stat(freshSession); // does not throw
});

test("write() swallows errors silently — never breaks the turn", async () => {
  // Point the writer at a path that cannot be created (file masquerading as a dir).
  const home = tmpHome();
  await fs.writeFile(join(home, "events"), "i am a file");
  const w = new EventWriter(home);
  // Must not throw even though init() will fail under the hood.
  await w.write(makeEvent());
});

test("events store cost_micros as integer when caller respects the contract", async () => {
  const w = new EventWriter(tmpHome());
  const session = generateUUIDv7();
  // Caller-side conversion: 0.000123 USD → 123 microUSD.
  const ev = makeEvent({ session_id: session, cost_micros: Math.round(0.000123 * 1e6) });
  assert.equal(Number.isInteger(ev.cost_micros), true);
  await w.write(ev);
  const file = join(w.getDirs().sessions, `${session}.jsonl`);
  const raw = await fs.readFile(file, "utf8");
  const decoded = JSON.parse(raw.trim()) as MooterEvent;
  assert.equal(decoded.cost_micros, 123);
});

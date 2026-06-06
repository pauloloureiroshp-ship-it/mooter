// Wave 4 Phase D — `mooter sync` real mode (client only). node:test + tsx.
// ZERO real network: an injected fetchImpl stands in for the backend; a real
// global fetch is never called.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runSyncReal } from "../src/commands/sync.ts";
import { buildConsent } from "../src/consent.ts";
import { listAudit } from "../src/sync/sync_audit.ts";

const NOW = 1_780_000_000_000;
const DAY = 864e5;
const SECRET = "real-secret";

function home(opts: { consent?: boolean; auth?: boolean } = {}): string {
  const h = mkdtempSync(join(tmpdir(), "mooter-real-"));
  writeFileSync(join(h, "consent.json"), JSON.stringify(buildConsent(opts.consent ?? true, new Date(NOW), SECRET)));
  writeFileSync(join(h, "profile.json"), JSON.stringify({ os: "linux", gpu: { model: "x", vram_gb: 24 }, ram_gb: 64, providers: { ollama: {} } }));
  if (opts.auth ?? true) writeFileSync(join(h, "auth.json"), JSON.stringify({ access_token: "tok-123", user_id_hash: "abc", saved_at: "x", source: "mooter login" }));
  return h;
}
const LINES = [JSON.stringify({ event: "classified", ts_ms: NOW - 0.1 * DAY, tier: "T0", confidence: 0.9, safety_boost_applied: false })];

test("no backend URL → falls back to dry-run with a clear warning", async () => {
  const res = await runSyncReal({ mooterHome: home(), lines: LINES, nowMs: NOW, secret: SECRET, fetchImpl: () => { throw new Error("must not fetch"); } });
  assert.match(res.output, /Falling back to dry-run/);
  assert.match(res.output, /MOOTER_CF_BACKEND_URL/);
});

test("α: backend set, not logged in → syncs anonymously (no auth header)", async () => {
  let calledAuth: string | undefined = "unset";
  const fetchImpl = async (_url: string, init: any) => {
    calledAuth = init.headers.Authorization;
    return { ok: true, status: 202, json: async () => ({ accepted: 1, rejected: 0 }) };
  };
  const res = await runSyncReal({ backendUrl: "https://b.example", mooterHome: home({ auth: false }), lines: LINES, nowMs: NOW, secret: SECRET, fetchImpl });
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /Synced 1 event/);
  assert.equal(calledAuth, undefined, "no Authorization header when anonymous (auth model α)");
});

test("backend set but telemetry off → exit 1", async () => {
  const res = await runSyncReal({ backendUrl: "https://b.example", mooterHome: home({ consent: false }), lines: LINES, nowMs: NOW, secret: SECRET, fetchImpl: () => { throw new Error("no"); } });
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /not opted-in/);
});

test("real POST (injected fetch) → 202 success + real-sync audit (no network)", async () => {
  const h = home();
  let calledUrl = "", calledAuth = "";
  const fetchImpl = async (url: string, init: any) => {
    calledUrl = url; calledAuth = init.headers.Authorization;
    return { ok: true, status: 202, json: async () => ({ accepted: 1, rejected: 0 }) };
  };
  const res = await runSyncReal({ backendUrl: "https://b.example", mooterHome: h, lines: LINES, nowMs: NOW, secret: SECRET, fetchImpl });
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /Synced 1 event/);
  assert.equal(calledUrl, "https://b.example/v1/events");
  assert.equal(calledAuth, "Bearer tok-123");
  const audit = listAudit(h);
  assert.equal(audit.at(-1)!.kind, "real-sync");
  assert.ok(audit.at(-1)!.bytes_sent > 0, "real sync sent bytes (unlike dry-run)");
});

test("pastor hint in the response is surfaced to the user (26.D)", async () => {
  const h = home();
  const fetchImpl = async () => ({ ok: true, status: 202, json: async () => ({ accepted: 1, rejected: 0, pastor_hint: { code: "high_t3", message: "Over 25% of your prompts hit T3 Opus." } }) });
  const res = await runSyncReal({ backendUrl: "https://b.example", mooterHome: h, lines: LINES, nowMs: NOW, secret: SECRET, fetchImpl });
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /🐂 Pastor:/);
  assert.match(res.output, /T3 Opus/);
});

test("server 401 → graceful exit 1 + audit captures status", async () => {
  const h = home();
  const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({ error: "invalid_token" }) });
  const res = await runSyncReal({ backendUrl: "https://b.example", mooterHome: h, lines: LINES, nowMs: NOW, secret: SECRET, fetchImpl });
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /HTTP 401/);
  assert.equal(listAudit(h).at(-1)!.http_status, 401);
});

test("fetch throws → graceful exit 1 + audit logged", async () => {
  const h = home();
  const fetchImpl = async () => { throw new Error("network down"); };
  const res = await runSyncReal({ backendUrl: "https://b.example", mooterHome: h, lines: LINES, nowMs: NOW, secret: SECRET, fetchImpl });
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /Sync error/);
  assert.equal(listAudit(h).at(-1)!.kind, "real-sync");
});

test("empty window → nothing to sync (no fetch)", async () => {
  const res = await runSyncReal({ backendUrl: "https://b.example", mooterHome: home(), lines: [], nowMs: NOW, secret: SECRET, fetchImpl: () => { throw new Error("must not fetch"); } });
  assert.match(res.output, /Nothing to sync/);
});

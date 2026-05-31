// Wave 3 Day 3 — signed sync audit log. node:test + tsx.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { appendAuditEntry, listAudit, verifyAudit, signAuditEntry, type AuditEntry } from "../src/sync/sync_audit.ts";

const SECRET = "audit-secret";

test("each operation appends one signed entry", () => {
  const home = mkdtempSync(join(tmpdir(), "mooter-au-"));
  appendAuditEntry({ kind: "dry-run", events: 4, bytesSent: 0, nowIso: "2026-05-31T18:00:00Z" }, SECRET, home);
  appendAuditEntry({ kind: "queue-clear", events: 0, nowIso: "2026-05-31T18:05:00Z" }, SECRET, home);
  const a = listAudit(home);
  assert.equal(a.length, 2);
  assert.equal(a[0].kind, "dry-run");
  assert.equal(a[0].bytes_sent, 0);
  assert.equal(a[1].kind, "queue-clear");
});

test("signatures are user-verifiable", () => {
  const home = mkdtempSync(join(tmpdir(), "mooter-au-"));
  appendAuditEntry({ kind: "dry-run", events: 1, nowIso: "2026-05-31T18:00:00Z" }, SECRET, home);
  const v = verifyAudit(listAudit(home), SECRET);
  assert.equal(v.allOk, true);
  assert.equal(verifyAudit(listAudit(home), "wrong-secret").allOk, false);
});

test("tamper detection: editing an entry breaks verify", () => {
  const home = mkdtempSync(join(tmpdir(), "mooter-au-"));
  appendAuditEntry({ kind: "dry-run", events: 1, bytesSent: 0, nowIso: "2026-05-31T18:00:00Z" }, SECRET, home);
  // Tamper: bump events to 999 without re-signing.
  const path = join(home, "sync-audit.jsonl");
  const entry = JSON.parse(readFileSync(path, "utf8").trim()) as AuditEntry;
  entry.events = 999;
  writeFileSync(path, JSON.stringify(entry) + "\n");
  const v = verifyAudit(listAudit(home), SECRET);
  assert.equal(v.allOk, false, "tampered entry must fail verification");
});

test("signAuditEntry is deterministic", () => {
  const e = { ts: "t", kind: "dry-run" as const, events: 2, bytes_sent: 0, endpoint: "x", http_status: null };
  assert.equal(signAuditEntry(e, SECRET), signAuditEntry(e, SECRET));
});

test("listAudit: empty when no log", () => {
  const home = mkdtempSync(join(tmpdir(), "mooter-au-"));
  assert.deepEqual(listAudit(home), []);
});

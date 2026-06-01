// Sync audit log (Wave 3 Day 3) — every sync operation (even a dry-run) appends a
// signed entry to ~/.mooter/sync-audit.jsonl, so the user has a tamper-evident
// record of what the client did. HMAC-signed with the machine-local secret; the
// user can verify it themselves. ZERO network.

import { createHmac } from "node:crypto";
import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { mooterHomeDefault } from "../packs.ts";
import { SYNC_ENDPOINT } from "./sync_event_schema.ts";

export interface AuditEntry {
  ts: string;
  kind: "dry-run" | "real-sync" | "queue-clear";
  events: number;
  bytes_sent: number;
  endpoint: string;
  http_status: number | null;
  signature: string;
}

function auditPath(mooterHome?: string): string {
  return join(mooterHome ?? mooterHomeDefault(), "sync-audit.jsonl");
}

/** The fields that get signed (everything except the signature itself). */
function signablePayload(e: Omit<AuditEntry, "signature">): string {
  return JSON.stringify({ ts: e.ts, kind: e.kind, events: e.events, bytes_sent: e.bytes_sent, endpoint: e.endpoint, http_status: e.http_status });
}

export function signAuditEntry(e: Omit<AuditEntry, "signature">, secret: string): string {
  return createHmac("sha256", secret).update(signablePayload(e)).digest("hex");
}

/**
 * Append a signed audit entry. `bytes_sent` is 0 for a dry-run (nothing left the
 * machine) — that zero is the proof of no network. Pure side effect (append).
 */
export function appendAuditEntry(
  fields: { kind: AuditEntry["kind"]; events: number; bytesSent?: number; httpStatus?: number | null; nowIso: string },
  secret: string,
  mooterHome?: string,
): AuditEntry {
  const unsigned: Omit<AuditEntry, "signature"> = {
    ts: fields.nowIso,
    kind: fields.kind,
    events: fields.events,
    bytes_sent: fields.bytesSent ?? 0,
    endpoint: SYNC_ENDPOINT,
    http_status: fields.httpStatus ?? null,
  };
  const entry: AuditEntry = { ...unsigned, signature: signAuditEntry(unsigned, secret) };
  const home = mooterHome ?? mooterHomeDefault();
  mkdirSync(home, { recursive: true });
  appendFileSync(auditPath(mooterHome), JSON.stringify(entry) + "\n");
  return entry;
}

export function listAudit(mooterHome?: string, limit = 50): AuditEntry[] {
  try {
    const all = readFileSync(auditPath(mooterHome), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as AuditEntry);
    return all.slice(-limit);
  } catch {
    return [];
  }
}

/** Verify every entry's HMAC. Returns per-entry ok flags + an overall verdict. */
export function verifyAudit(entries: AuditEntry[], secret: string): { allOk: boolean; results: Array<{ ts: string; ok: boolean }> } {
  const results = entries.map((e) => {
    const { signature, ...unsigned } = e;
    return { ts: e.ts, ok: signAuditEntry(unsigned, secret) === signature };
  });
  return { allOk: results.every((r) => r.ok), results };
}

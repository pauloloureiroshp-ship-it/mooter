// `mooter sync` (Wave 3 Day 3) — the remote-sync client, in DRY-RUN only. It runs
// the full pipeline (consent gate → build anonymized events → queue → sign →
// MOCK POST) and writes a signed audit entry, but makes ZERO network calls. Real
// upload ships in Wave 4 Phase D (CF Workers); this proves the contract now.
//
// Subcommands: `--dry-run` · `queue list|show <id>|clear` · `audit list|verify`.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mooterHomeDefault } from "../packs.ts";
import { getLocalSecret, type Consent } from "../consent.ts";
import { SYNC_ENDPOINT, SYNC_SCHEMA_VERSION, type MooterSyncEvent } from "../sync/sync_event_schema.ts";
import { buildSyncEvents, appendToQueue, listQueue, clearQueue, type BuildSyncOptions } from "../sync/sync_queue.ts";
import { appendAuditEntry, listAudit, verifyAudit } from "../sync/sync_audit.ts";

export interface CmdResult {
  exitCode: number;
  output: string;
}

export interface SyncOptions {
  dryRun?: boolean;
  queueList?: boolean;
  queueClear?: boolean;
  queueShow?: string;
  auditList?: boolean;
  auditVerify?: boolean;
  // injection for tests
  mooterHome?: string;
  lines?: string[];
  profile?: BuildSyncOptions["profile"];
  nowMs?: number;
  secret?: string;
}

function readConsent(mooterHome: string): Consent | null {
  try {
    return JSON.parse(readFileSync(join(mooterHome, "consent.json"), "utf8")) as Consent;
  } catch {
    return null;
  }
}

function readProfile(mooterHome: string): BuildSyncOptions["profile"] | undefined {
  try {
    const p = JSON.parse(readFileSync(join(mooterHome, "profile.json"), "utf8"));
    return { os: p.os, gpu: p.gpu, ram_gb: p.ram_gb, ollama_available: !!(p.providers?.ollama || p.ollama_available) };
  } catch {
    return undefined;
  }
}

function fmtBytes(n: number): string {
  return n.toLocaleString("en-US");
}

function printDryRunReport(events: MooterSyncEvent[], consent: Consent): string {
  const lines: string[] = [];
  lines.push("🐮 Mooter sync — DRY RUN (no network)");
  lines.push("");
  const since = consent.consent_timestamp_utc ?? "—";
  lines.push(`Consent: ✓ opt-in since ${since} (signed ${consent.consent_signature ? "✓" : "✗"})`);
  lines.push("Categories enabled:");
  for (const [k, v] of Object.entries(consent.data_categories)) if (v === true) lines.push(`  · ${k}`);
  lines.push("");
  if (events.length === 0) {
    lines.push("No events to sync in the window (nothing to send).");
  } else {
    const e = events[0];
    lines.push("Built sync event from the window:");
    if (e.tier_distribution) {
      const c = e.tier_distribution.counts;
      lines.push(`  · tier_distribution: T0:${c.T0} T1:${c.T1} T2:${c.T2} T3:${c.T3} (avg conf ${e.tier_distribution.avg_confidence})`);
    }
    if (e.safety_boost_reasons) {
      const r = Object.entries(e.safety_boost_reasons.reasons).map(([k, n]) => `${k}:${n}`).join(", ") || "none";
      lines.push(`  · safety_boost_reasons: ${e.safety_boost_reasons.applied}/${e.safety_boost_reasons.total_prompts} (${r})`);
    }
    if (e.pack_usage) lines.push(`  · pack_usage: ${e.pack_usage.pack_ids.length} packs (no per-pack usage counts in this build)`);
    if (e.hardware_info) lines.push(`  · hardware_info: ${e.hardware_info.os} · ${e.hardware_info.gpu_class} gpu · ${e.hardware_info.ram_class} ram`);
    const payload = JSON.stringify(e);
    lines.push("");
    lines.push(`Payload size: ${fmtBytes(payload.length)} bytes`);
    lines.push(`Signature: HMAC-SHA256 = ${e.signature.value.slice(0, 5)}…${e.signature.value.slice(-4)}`);
    lines.push(`Endpoint (target): ${SYNC_ENDPOINT} (NOT contacted in dry-run)`);
    lines.push("HTTP method: POST");
    lines.push("Headers (mock):");
    lines.push("  Content-Type: application/json");
    lines.push(`  X-Mooter-Schema-Version: ${SYNC_SCHEMA_VERSION}`);
    lines.push(`  X-Mooter-Client-Id: ${e.client_id_pseudonymous.slice(0, 8)}…`);
    lines.push("");
    lines.push("Mock response: 202 Accepted (simulated)");
  }
  lines.push("");
  lines.push("✓ Dry-run complete. Audit logged to ~/.mooter/sync-audit.jsonl");
  lines.push("ℹ Real sync ships in Wave 4 Phase D (CF Workers backend).");
  return lines.join("\n");
}

export function runSync(opts: SyncOptions = {}): CmdResult {
  const mooterHome = opts.mooterHome ?? mooterHomeDefault();
  const secret = opts.secret ?? getLocalSecret(mooterHome);
  const nowMs = opts.nowMs ?? Date.now();

  // ── queue subcommands ──
  if (opts.queueList) {
    const q = listQueue(mooterHome);
    return { exitCode: 0, output: q.length ? q.map((e) => `${e.event_id} · ${e.emitted_at_utc}`).join("\n") : "(sync queue empty)" };
  }
  if (opts.queueShow) {
    const e = listQueue(mooterHome).find((x) => x.event_id === opts.queueShow);
    return e ? { exitCode: 0, output: JSON.stringify(e, null, 2) } : { exitCode: 1, output: `event not found: ${opts.queueShow}` };
  }
  if (opts.queueClear) {
    clearQueue(mooterHome);
    appendAuditEntry({ kind: "queue-clear", events: 0, nowIso: new Date(nowMs).toISOString() }, secret, mooterHome);
    return { exitCode: 0, output: "✓ sync queue cleared" };
  }

  // ── audit subcommands ──
  if (opts.auditList) {
    const a = listAudit(mooterHome);
    return { exitCode: 0, output: a.length ? a.map((e) => `${e.ts} · ${e.kind} · ${e.events} events · ${e.bytes_sent} bytes`).join("\n") : "(no sync audit entries)" };
  }
  if (opts.auditVerify) {
    const v = verifyAudit(listAudit(mooterHome, 1000), secret);
    return { exitCode: v.allOk ? 0 : 1, output: v.allOk ? `✓ all ${v.results.length} audit entries verify` : `✗ ${v.results.filter((r) => !r.ok).length} of ${v.results.length} audit entries FAILED verification` };
  }

  // ── default: sync (dry-run only) ──
  if (!opts.dryRun) {
    return { exitCode: 1, output: "⚠ Real sync not implemented yet (Wave 4 Phase D). Use --dry-run." };
  }
  const consent = readConsent(mooterHome);
  if (!consent || consent.telemetry_enabled !== true) {
    return { exitCode: 1, output: "✗ Telemetry not opted-in. Run `mooter init` to opt-in." };
  }
  const windowEndMs = nowMs;
  const windowStartMs = nowMs - 24 * 3600 * 1000;
  const events = buildSyncEvents({
    consent, secret, windowStartMs, windowEndMs, nowMs,
    lines: opts.lines,
    profile: opts.profile ?? readProfile(mooterHome),
    mooterHome,
  });
  appendToQueue(events, mooterHome);
  const report = printDryRunReport(events, consent);
  // bytes_sent = 0 — the zero is the proof that nothing left the machine.
  appendAuditEntry({ kind: "dry-run", events: events.length, bytesSent: 0, nowIso: new Date(nowMs).toISOString() }, secret, mooterHome);
  return { exitCode: 0, output: report };
}

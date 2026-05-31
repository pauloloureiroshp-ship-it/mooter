// Sync queue (Wave 3 Day 3) — builds anonymized sync events from the local
// decisions.log (gated by consent) and parks them in ~/.mooter/sync-queue.jsonl
// so the user can review EXACTLY what would be uploaded before anything leaves
// the machine. ZERO network. Nothing here ever sends.

import { readFileSync, appendFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  type MooterSyncEvent,
  type HardwareInfoPayload,
  SYNC_SCHEMA_VERSION,
  pseudoClientId,
  gpuClass,
  ramClass,
  normalizeOs,
  signSyncEvent,
  makeEventId,
} from "./sync_event_schema.ts";
import type { Consent } from "../consent.ts";
import { mooterHomeDefault, listInstalledPacks } from "../packs.ts";

export interface WindowedEvent {
  ts_ms: number;
  tier?: string;
  confidence?: number;
  safety_boost_applied?: boolean;
  safety_boost_reason?: string | null;
}

export interface BuildSyncOptions {
  consent: Consent;
  secret: string;
  windowStartMs: number;
  windowEndMs: number;
  nowMs: number;
  /** Pre-supplied decisions.log lines (default: read from disk). */
  lines?: string[];
  /** Anonymized hardware source (profile.json shape). */
  profile?: { os?: string; gpu?: { model?: string; vram_gb?: number } | null; ram_gb?: number; ollama_available?: boolean };
  /** Installed pack ids (default: read installed.json). */
  installedPacks?: string[];
  mooterHome?: string;
}

function parseWindowed(lines: string[], startMs: number, endMs: number): WindowedEvent[] {
  const out: WindowedEvent[] = [];
  for (const line of lines) {
    let e: any;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (!e || e.event !== "classified" || e.source === "mooter-tester") continue;
    if (typeof e.ts_ms !== "number" || e.ts_ms < startMs || e.ts_ms > endMs) continue;
    out.push({ ts_ms: e.ts_ms, tier: e.tier, confidence: e.confidence, safety_boost_applied: e.safety_boost_applied === true, safety_boost_reason: e.safety_boost_reason ?? null });
  }
  return out;
}

/**
 * Build the (zero or one) sync event for the window. Returns [] when telemetry
 * is not opted-in (the consent gate is ABSOLUTE) or when no data is in the
 * window. Only categories enabled in consent.data_categories are included; each
 * is an anonymized aggregate. Pure given its options.
 */
export function buildSyncEvents(opts: BuildSyncOptions): MooterSyncEvent[] {
  if (!opts.consent || opts.consent.telemetry_enabled !== true) return []; // absolute gate
  const lines = opts.lines ?? readDecisionsLines(opts.mooterHome);
  const evts = parseWindowed(lines, opts.windowStartMs, opts.windowEndMs);
  if (evts.length === 0) return [];

  const cats = opts.consent.data_categories;
  const startIso = new Date(opts.windowStartMs).toISOString();
  const endIso = new Date(opts.windowEndMs).toISOString();

  const unsigned: Omit<MooterSyncEvent, "signature"> = {
    schema_version: SYNC_SCHEMA_VERSION,
    event_id: makeEventId(opts.nowMs, 0, opts.secret),
    client_id_pseudonymous: pseudoClientId(opts.secret),
    emitted_at_utc: new Date(opts.nowMs).toISOString(),
  };

  if (cats.tier_distribution) {
    const counts = { T0: 0, T1: 0, T2: 0, T3: 0 };
    let confSum = 0, confN = 0;
    for (const e of evts) {
      if (e.tier && e.tier in counts) (counts as any)[e.tier]++;
      if (typeof e.confidence === "number") { confSum += e.confidence; confN++; }
    }
    unsigned.tier_distribution = { window_start_utc: startIso, window_end_utc: endIso, counts, avg_confidence: confN ? Math.round((confSum / confN) * 1000) / 1000 : 0 };
  }

  if (cats.safety_boost_reasons) {
    const reasons: Record<string, number> = {};
    let applied = 0;
    for (const e of evts) {
      if (e.safety_boost_applied) {
        applied++;
        const kind = e.safety_boost_reason ? e.safety_boost_reason.split(/[:(]/)[0].trim() : "unknown";
        reasons[kind] = (reasons[kind] || 0) + 1;
      }
    }
    unsigned.safety_boost_reasons = { window_start_utc: startIso, window_end_utc: endIso, applied, total_prompts: evts.length, reasons };
  }

  if (cats.pack_usage) {
    // Honest: no per-pack usage log exists, so counts are empty rather than faked.
    const installed = opts.installedPacks ?? listInstalledPacks(opts.mooterHome);
    unsigned.pack_usage = { window_start_utc: startIso, window_end_utc: endIso, pack_ids: installed, counts: {} };
  }

  if (cats.hardware_info && opts.profile) {
    const hw: HardwareInfoPayload = {
      os: normalizeOs(opts.profile.os),
      gpu_class: gpuClass(opts.profile.gpu),
      ram_class: ramClass(opts.profile.ram_gb),
      ollama_available: opts.profile.ollama_available === true,
    };
    unsigned.hardware_info = hw;
  }

  return [signSyncEvent(unsigned, opts.secret)];
}

function queuePath(mooterHome?: string): string {
  return join(mooterHome ?? mooterHomeDefault(), "sync-queue.jsonl");
}

function readDecisionsLines(mooterHome?: string): string[] {
  // Mirror of the router dir resolution used elsewhere in the CLI.
  const claudeDir = process.env.MOOTER_CLAUDE_DIR || process.env.FRUGAL_CLAUDE_DIR || join(process.env.HOME || "", ".claude");
  try {
    return readFileSync(join(claudeDir, "tools", "router", "decisions.log"), "utf8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export function appendToQueue(events: MooterSyncEvent[], mooterHome?: string): void {
  if (events.length === 0) return;
  const home = mooterHome ?? mooterHomeDefault();
  mkdirSync(home, { recursive: true });
  for (const e of events) appendFileSync(queuePath(mooterHome), JSON.stringify(e) + "\n");
}

export function listQueue(mooterHome?: string): MooterSyncEvent[] {
  try {
    return readFileSync(queuePath(mooterHome), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

export function clearQueue(mooterHome?: string): void {
  try {
    if (existsSync(queuePath(mooterHome))) unlinkSync(queuePath(mooterHome));
  } catch {
    /* already gone */
  }
}

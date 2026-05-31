// `mooter_sync_event` schema v1 (Wave 3 Day 3) — the canonical JSON shape the
// Wave 4 Phase D CF Workers backend will receive. Defined and signed locally NOW
// so the client is ready and testable before any real network exists.
//
// CRITICAL invariants encoded here:
//   · NEVER carries prompt_content / file paths / project names / real IPs / real
//     model strings — only anonymized aggregates.
//   · hardware is bucketed into classes (e.g. "high-end"), never the exact model.
//   · client id is pseudonymous (derived from the local secret, never the secret
//     itself nor any real identity).
// This module performs ZERO network I/O — it only shapes, anonymizes, and signs.

import { createHmac, createHash } from "node:crypto";

export interface SyncSignature {
  algo: "HMAC-SHA256";
  value: string;
  signed_payload_hash: string;
}

export interface TierDistributionPayload {
  window_start_utc: string;
  window_end_utc: string;
  counts: { T0: number; T1: number; T2: number; T3: number };
  avg_confidence: number;
}

export interface SafetyBoostPayload {
  window_start_utc: string;
  window_end_utc: string;
  applied: number;
  total_prompts: number;
  reasons: Record<string, number>;
}

export interface PackUsagePayload {
  window_start_utc: string;
  window_end_utc: string;
  pack_ids: string[];
  counts: Record<string, number>;
}

export interface HardwareInfoPayload {
  os: "linux" | "darwin" | "windows-wsl";
  gpu_class: "none" | "integrated" | "discrete" | "high-end";
  ram_class: "low" | "mid" | "high";
  ollama_available: boolean;
}

export interface MooterSyncEventV1 {
  schema_version: 1;
  event_id: string;
  client_id_pseudonymous: string;
  emitted_at_utc: string;
  tier_distribution?: TierDistributionPayload;
  safety_boost_reasons?: SafetyBoostPayload;
  pack_usage?: PackUsagePayload;
  hardware_info?: HardwareInfoPayload;
  signature: SyncSignature;
}

export type MooterSyncEvent = MooterSyncEventV1;

export const SYNC_SCHEMA_VERSION = 1 as const;
export const SYNC_ENDPOINT = "https://sync.mooter.ai/v1/events"; // target only — never contacted in this build

// Keys that must NEVER appear anywhere in a sync payload (defense in depth).
const FORBIDDEN_KEYS = ["prompt_content", "prompt", "prompt_preview", "file_path", "file_paths", "project", "ip", "recommended_model", "model"];

/** Pseudonymous client id — sha256 of the local secret. Stable per machine,
 * never reveals the secret (one-way) nor any real identity. */
export function pseudoClientId(secret: string): string {
  return createHash("sha256").update("mooter-client:" + secret).digest("hex").slice(0, 32);
}

/** Map an exact GPU model to an anonymized class (never the model string). */
export function gpuClass(gpu: { model?: string; vram_gb?: number } | null | undefined): HardwareInfoPayload["gpu_class"] {
  if (!gpu) return "none";
  const vram = typeof gpu.vram_gb === "number" ? gpu.vram_gb : 0;
  const m = String(gpu.model || "").toLowerCase();
  if (!gpu.model && vram === 0) return "none";
  if (vram >= 16) return "high-end";
  if (/integrated|igpu|uhd|iris|apple/.test(m) || (vram > 0 && vram < 4)) return "integrated";
  return "discrete";
}

export function ramClass(ramGb: number | undefined): HardwareInfoPayload["ram_class"] {
  const r = typeof ramGb === "number" ? ramGb : 0;
  return r < 16 ? "low" : r <= 32 ? "mid" : "high";
}

export function normalizeOs(os: string | undefined): HardwareInfoPayload["os"] {
  const s = String(os || "").toLowerCase();
  if (s.includes("darwin") || s.includes("mac")) return "darwin";
  if (s.includes("wsl") || s.includes("windows")) return "windows-wsl";
  return "linux";
}

/** Deep-scan a value for any forbidden key — used by validation + tests. */
export function findForbiddenKeys(obj: unknown, path = ""): string[] {
  const hits: string[] = [];
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      if (FORBIDDEN_KEYS.includes(k)) hits.push(path ? `${path}.${k}` : k);
      hits.push(...findForbiddenKeys(v, path ? `${path}.${k}` : k));
    }
  }
  return hits;
}

/** The payload that gets hashed + signed (everything except the signature). */
function payloadForSigning(e: Omit<MooterSyncEvent, "signature">): string {
  return JSON.stringify(e);
}

/** Sign an unsigned event, returning the full signed event. Pure. */
export function signSyncEvent(unsigned: Omit<MooterSyncEvent, "signature">, secret: string): MooterSyncEvent {
  const payload = payloadForSigning(unsigned);
  const signed_payload_hash = createHash("sha256").update(payload).digest("hex");
  const value = createHmac("sha256", secret).update(payload).digest("hex");
  return { ...unsigned, signature: { algo: "HMAC-SHA256", value, signed_payload_hash } };
}

/** Re-derive the signature and compare — proves the event wasn't tampered. */
export function verifySyncEvent(e: MooterSyncEvent, secret: string): boolean {
  if (!e || !e.signature) return false;
  const { signature, ...unsigned } = e;
  const payload = payloadForSigning(unsigned as Omit<MooterSyncEvent, "signature">);
  if (createHash("sha256").update(payload).digest("hex") !== signature.signed_payload_hash) return false;
  return createHmac("sha256", secret).update(payload).digest("hex") === signature.value;
}

/** Structural validation: version, required fields, and the no-forbidden-keys rule. */
export function validateSyncEvent(e: MooterSyncEvent): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (e.schema_version !== SYNC_SCHEMA_VERSION) errors.push(`schema_version must be ${SYNC_SCHEMA_VERSION}`);
  if (!e.event_id) errors.push("event_id required");
  if (!e.client_id_pseudonymous) errors.push("client_id_pseudonymous required");
  if (!e.emitted_at_utc) errors.push("emitted_at_utc required");
  if (!e.signature || !e.signature.value) errors.push("signature required");
  const forbidden = findForbiddenKeys(e);
  if (forbidden.length) errors.push(`forbidden keys present: ${forbidden.join(", ")}`);
  return { valid: errors.length === 0, errors };
}

/**
 * Deterministic UUIDv7-shaped id from a counter + timestamp + secret. Not a true
 * random UUIDv7 (Math.random is avoided for reproducibility); good enough as a
 * unique, time-ordered, non-identifying event id. `nowMs` + `seq` are injectable.
 */
export function makeEventId(nowMs: number, seq: number, secret: string): string {
  const ts = nowMs.toString(16).padStart(12, "0").slice(-12);
  const rand = createHash("sha256").update(`${secret}:${nowMs}:${seq}`).digest("hex").slice(0, 18);
  return `${ts.slice(0, 8)}-${ts.slice(8, 12)}-7${rand.slice(0, 3)}-${rand.slice(3, 7)}-${rand.slice(7, 18)}`;
}

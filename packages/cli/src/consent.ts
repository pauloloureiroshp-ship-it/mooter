// Telemetry consent — audit-trail with a user-verifiable HMAC signature
// (Wave 3 Day 2). Opt-in is OFF by default; when the user opts in we record a
// signed, timestamped consent so it can never be silently flipped — the user
// can re-derive the signature locally (the secret lives only on their machine).
//
// CRITICAL: this prepares the consent record ONLY. It sends NOTHING over the
// network (Wave 4 Phase D owns any upload). `prompt_content` is hard-wired to
// false and can never be enabled.

import { createHmac, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { join } from "node:path";

const SECRET_FILE = ".telemetry_secret";

export interface ConsentCategories {
  tier_distribution: boolean;
  safety_boost_reasons: boolean;
  pack_usage: boolean;
  /** Always false — content is never collected. */
  prompt_content: false;
  hardware_info: boolean;
}

export type SyncCadence = "daily" | "weekly" | "manual-only";

export interface SyncSchedule {
  cadence: SyncCadence;
  time_of_day: string;
  timezone: string;
}

export interface Consent {
  schema_version: string;
  telemetry_enabled: boolean;
  consent_timestamp_utc: string | null;
  consent_signature: string | null;
  consent_version: string;
  can_revoke: true;
  data_categories: ConsentCategories;
  retention_days: number;
  /** Wave 3 D3 — sync cadence spec. NO cron is started; this only records intent. */
  sync_schedule: SyncSchedule;
}

/**
 * Read the machine-local HMAC secret, creating it (0600) on first use. The
 * secret never leaves the machine — it exists so the user can verify their own
 * consent signature. Tests inject `seed` for determinism.
 */
export function getLocalSecret(mooterHome: string, seed?: string): string {
  const p = join(mooterHome, SECRET_FILE);
  if (seed) return seed;
  try {
    if (existsSync(p)) return readFileSync(p, "utf8").trim();
  } catch {
    /* regenerate below */
  }
  const secret = randomBytes(32).toString("hex");
  try {
    writeFileSync(p, secret + "\n", { mode: 0o600 });
    chmodSync(p, 0o600);
  } catch {
    /* if we can't persist, the in-memory secret still signs this run */
  }
  return secret;
}

/** The canonical payload that gets signed (stable key order). */
function signedPayload(c: Pick<Consent, "telemetry_enabled" | "consent_timestamp_utc" | "consent_version" | "data_categories">): string {
  return JSON.stringify({
    telemetry_enabled: c.telemetry_enabled,
    consent_timestamp_utc: c.consent_timestamp_utc,
    consent_version: c.consent_version,
    data_categories: c.data_categories,
  });
}

export function signConsent(c: Consent, secret: string): string {
  return createHmac("sha256", secret).update(signedPayload(c)).digest("hex");
}

function categories(enabled: boolean): ConsentCategories {
  return {
    tier_distribution: enabled,
    safety_boost_reasons: enabled,
    pack_usage: enabled,
    prompt_content: false, // never, regardless of opt-in
    hardware_info: enabled,
  };
}

/**
 * Build a consent record. When opted in it carries a timestamp + HMAC signature;
 * when opted out the signature/timestamp are null (nothing to attest). Pure.
 */
export function buildConsent(enabled: boolean, now: Date, secret?: string): Consent {
  // A disabled consent has nothing to sign; an enabled one without an explicit
  // secret gets an ephemeral one (the wizard always passes the persisted secret).
  const sec = secret || randomBytes(16).toString("hex");
  const base: Consent = {
    schema_version: "1.0.0",
    telemetry_enabled: enabled,
    consent_timestamp_utc: enabled ? now.toISOString() : null,
    consent_signature: null,
    consent_version: "1.0.0",
    can_revoke: true,
    data_categories: categories(enabled),
    retention_days: 90,
    sync_schedule: { cadence: "daily", time_of_day: "03:00", timezone: "local" },
  };
  base.consent_signature = enabled ? signConsent(base, sec) : null;
  return base;
}

/** Re-derive the signature and compare — proves the record wasn't tampered. */
export function verifyConsent(c: Consent, secret: string): boolean {
  if (!c.telemetry_enabled) return c.consent_signature === null;
  if (!c.consent_signature) return false;
  return signConsent(c, secret) === c.consent_signature;
}

/** Long-form details shown when the user picks [d] in the wizard. */
export function consentDetailsLong(): string {
  return [
    "  Telemetry details (opt-in, anonymous):",
    "    · tier_distribution  — counts of T0/T1/T2/T3 (no prompts)",
    "    · safety_boost_reasons — which safety rules fired (no prompts)",
    "    · pack_usage        — which packs activate (no content)",
    "    · hardware_info     — GPU/RAM tier bucket (no serials)",
    "    · prompt_content    — NEVER collected",
    "  Retention: 90 days · Signed locally (HMAC) · Revoke: mooter quiet --telemetry-off",
    "  Nothing is sent yet — opt-in only prepares the channel (no network in this build).",
  ].join("\n");
}

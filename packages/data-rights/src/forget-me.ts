// Wave 32 (Phase NEW3) — `mooter data forget-me`. Asks the hub to erase this
// device's contributions from the federated aggregates (k-anonymity erasure).
// Sends only an HMAC-signed device_id — never raw telemetry. The hub queues the
// erasure and replies 202.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHmac } from "node:crypto";

const DEFAULT_HUB = process.env.NEXT_PUBLIC_MOOTER_HUB_URL || "https://mooter-hub.frugal-hub.workers.dev";

/** Stable device id (frugal-doctor writes ~/.frugal/device.id). */
export function getDeviceId(home = homedir()): string | null {
  for (const p of [join(home, ".frugal", "device.id"), join(home, ".mooter", "device.id")]) {
    try {
      const v = readFileSync(p, "utf8").trim();
      if (v) return v;
    } catch { /* try next */ }
  }
  return null;
}

function readSecret(home: string): string | null {
  try {
    return readFileSync(join(home, ".mooter", ".telemetry_secret"), "utf8").trim();
  } catch {
    return null;
  }
}

/** HMAC-SHA256(device_id|ts) with the local telemetry secret. */
export function signForget(deviceId: string, ts: number, secret: string): string {
  return createHmac("sha256", secret).update(`${deviceId}|${ts}`).digest("hex");
}

export interface ForgetResult {
  ok: boolean;
  status: number;
  queued: boolean;
  message: string;
}

/**
 * POST /v1/forget-me. `confirm` gates the network call. `fetchImpl`/`now`/`home`
 * are injectable for tests (no live network, deterministic signature).
 */
export async function forgetMe(opts: {
  confirm?: boolean;
  home?: string;
  hubUrl?: string;
  now?: number;
  fetchImpl?: typeof fetch;
} = {}): Promise<ForgetResult> {
  if (!opts.confirm) {
    return { ok: false, status: 0, queued: false, message: "forget-me requires --confirm (irreversible: erases your device's federated contributions)" };
  }
  const home = opts.home ?? homedir();
  const deviceId = getDeviceId(home);
  if (!deviceId) {
    return { ok: false, status: 0, queued: false, message: "no device id found — nothing was ever synced from this machine" };
  }
  const secret = readSecret(home);
  // Wave 33 (A.4) — real wall-clock when not injected, so the HMAC ts varies per
  // request and replay protection is meaningful (was always 0 in production).
  const ts = opts.now ?? Date.now();
  const signature = secret ? signForget(deviceId, ts, secret) : "";
  const hub = (opts.hubUrl ?? DEFAULT_HUB).replace(/\/$/, "");
  const doFetch = opts.fetchImpl ?? fetch;

  try {
    const res = await doFetch(`${hub}/v1/forget-me`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_id: deviceId, ts, signature }),
    });
    const queued = res.status === 202;
    return {
      ok: res.ok || queued,
      status: res.status,
      queued,
      message: queued
        ? "erasure queued (hub will remove your contributions on its next k-anonymity pass)"
        : `hub responded ${res.status}`,
    };
  } catch (e) {
    return { ok: false, status: 0, queued: false, message: `hub unreachable: ${(e as Error).message}` };
  }
}

export { DEFAULT_HUB };

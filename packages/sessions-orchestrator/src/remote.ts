// Frente F — cross-machine live-session sync.
//
// Lets a user's OWN cockpits (a Windows PC and a Mac, say) see each other's
// live Claude Code sessions + the latest combined handoff, mirrored through the
// hub that already exists (additive /v1/live-sessions endpoint). The contract
// is shared verbatim with the VSCode bg writer (hub-client.js); neither
// requires the other at runtime, so each host stays dependency-free.
//
// Everything here is local-first and FAIL-SOFT: a hub hiccup yields an empty
// remote fleet, never a throw — the cockpit lane simply reads "n/d". Identity
// is two pseudonymous hashes (device_id + owner_hash) supplied by the caller;
// NO PII, NO prompt/code/file content ever crosses the wire (METADATA ONLY).

import { readFileSync } from "node:fs";

import { mooterPath } from "../../synthesis/src/config.ts";
import type { SessionInfo, TierMix, Tier } from "./types.ts";

export type OsType = "windows" | "macos" | "linux" | "unknown";

/** One live session as mirrored cross-machine — METADATA only (no prompt text). */
export interface LiveSessionRow {
  sid: string;
  name?: string;
  model?: string | null;
  tier?: string | null;
  branch?: string | null;
  status?: string | null;
  ctxPct?: number | null;
}

/** The payload one device upserts to the hub. */
export interface LiveSessionState {
  device_id: string;
  owner_hash: string;
  os_type: OsType;
  device_label?: string | null;
  sessions: LiveSessionRow[];
  handoff?: string | null;
  totals?: Record<string, unknown> | null;
  at: string;
}

/** One of the owner's OTHER devices, as read back from the hub. */
export interface RemoteDevice {
  deviceId: string;
  osType: OsType;
  deviceLabel: string | null;
  online: boolean;
  /** Minutes since the device last reported (null when its clock is unreadable). */
  offlineForMin: number | null;
  updatedAt: string | null;
  sessions: LiveSessionRow[];
  handoff: string | null;
}

/** Minimal fetch shape so global fetch and a test stub both satisfy it. */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface RemoteOptions {
  deviceId: string;
  ownerHash: string;
  /** Override the hub base URL (default: env MOOTER_CF_BACKEND_URL → prod hub). */
  hubUrl?: string;
  /** Injected fetch (tests) — defaults to global fetch. */
  fetchImpl?: FetchLike;
  /** Fixed "now" for honest-offline recompute (tests). */
  now?: number;
  /** Devices silent longer than this are reported offline (default 5 min). */
  staleMin?: number;
  /** GET cap. */
  limit?: number;
}

export const DEFAULT_HUB_URL = "https://mooter-hub.frugal-hub.workers.dev";
export const DEFAULT_STALE_MIN = 5;

export function resolveHubUrl(hubUrl?: string): string {
  if (hubUrl) return hubUrl.replace(/\/$/, "");
  const env = process.env.MOOTER_CF_BACKEND_URL;
  if (env && env.length > 0) return env.replace(/\/$/, "");
  return DEFAULT_HUB_URL;
}

/** Map node `process.platform` (or any string) to a stable os_type. PURE. */
export function osType(platform?: string): OsType {
  const p = String(platform ?? process.platform ?? "").toLowerCase();
  if (p === "win32" || p === "windows") return "windows";
  if (p === "darwin" || p === "macos" || p === "mac") return "macos";
  if (p === "linux") return "linux";
  return "unknown";
}

function modalTier(t: TierMix | undefined): Tier | null {
  if (!t) return null;
  let best: Tier = "T0";
  let max = -1;
  for (const k of ["T0", "T1", "T2", "T3"] as Tier[]) {
    const v = Number(t[k]) || 0;
    if (v > max) { max = v; best = k; }
  }
  return max > 0 ? best : null;
}

/** PURE: project a discovered SessionInfo down to a mirror row (metadata only). */
export function sessionInfoToRow(s: SessionInfo): LiveSessionRow {
  return {
    sid: s.sessionId,
    name: s.terminalName || s.project,
    model: null, // SessionInfo carries no per-session model; honest null, never faked
    tier: modalTier(s.tiers),
    branch: s.branch ?? null,
    status: s.live ? "working" : "idle",
    ctxPct: null,
  };
}

export interface BuildStateInput {
  deviceId: string;
  ownerHash: string;
  osType?: OsType;
  deviceLabel?: string | null;
  sessions: LiveSessionRow[];
  handoff?: string | null;
  totals?: Record<string, unknown> | null;
  now?: number;
}

/** PURE: assemble the upsert payload. Caps the session list (hub schema max 64). */
export function buildLiveSessionState(input: BuildStateInput): LiveSessionState {
  const at = new Date(input.now ?? Date.now()).toISOString();
  return {
    device_id: input.deviceId,
    owner_hash: input.ownerHash,
    os_type: input.osType ?? osType(),
    device_label: input.deviceLabel ?? null,
    sessions: (input.sessions || []).slice(0, 64),
    handoff: input.handoff ?? null,
    totals: input.totals ?? null,
    at,
  };
}

/**
 * Push this device's snapshot to the hub. FAIL-SOFT: any error (offline, 5xx,
 * bad JSON) resolves to { ok:false } — a sync miss never breaks the caller.
 */
export async function pushLiveSessionState(
  state: LiveSessionState,
  opts: { hubUrl?: string; fetchImpl?: FetchLike } = {},
): Promise<{ ok: boolean; status: number }> {
  const f = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  if (typeof f !== "function") return { ok: false, status: 0 };
  try {
    const res = await f(`${resolveHubUrl(opts.hubUrl)}/v1/live-sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
    return { ok: !!res.ok, status: Number(res.status) || 0 };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** PURE: re-stamp the honest online/offline calc from a device's updatedAt. Used
 *  both on the live poll and when re-rendering a cached snapshot that has since
 *  gone stale. A device with no parseable updatedAt is reported offline. */
export function markOffline(devices: RemoteDevice[], nowMs: number, staleMin = DEFAULT_STALE_MIN): RemoteDevice[] {
  return devices.map((d) => {
    const ms = d.updatedAt ? Date.parse(d.updatedAt) : NaN;
    if (!Number.isFinite(ms)) return { ...d, online: false, offlineForMin: null };
    const ageMs = Math.max(0, nowMs - ms);
    return { ...d, online: ageMs < staleMin * 60000, offlineForMin: Math.floor(ageMs / 60000) };
  });
}

/** PURE: parse the hub's GET response into RemoteDevice[] (tolerant of shape). */
export function parseRemoteDevices(body: unknown): RemoteDevice[] {
  const devices = (body && typeof body === "object" && Array.isArray((body as any).devices))
    ? (body as any).devices : [];
  return devices.map((d: any): RemoteDevice => ({
    deviceId: String(d?.device_id ?? ""),
    osType: osType(d?.os_type),
    deviceLabel: d?.device_label ?? null,
    online: d?.online === true,
    offlineForMin: typeof d?.offlineForMin === "number" ? d.offlineForMin : null,
    updatedAt: typeof d?.updatedAt === "string" ? d.updatedAt : null,
    sessions: Array.isArray(d?.sessions) ? d.sessions : [],
    handoff: typeof d?.handoff === "string" ? d.handoff : null,
  })).filter((d: RemoteDevice) => d.deviceId.length > 0);
}

/**
 * Poll the hub for the owner's OTHER devices' live sessions. FAIL-SOFT: returns
 * [] on any error so the cockpit's "Remote device" lane degrades to empty (the
 * render layer shows "n/d"), never throws. The server already computes the
 * honest offline flag; we recompute it locally against `opts.now` too, so a
 * snapshot rendered after a delay still tells the truth.
 */
export async function remoteSessions(opts: RemoteOptions): Promise<RemoteDevice[]> {
  const f = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  if (typeof f !== "function" || !opts.ownerHash) return [];
  const staleMin = opts.staleMin ?? DEFAULT_STALE_MIN;
  const limit = Math.max(1, Math.min(50, opts.limit ?? 20));
  const url = `${resolveHubUrl(opts.hubUrl)}/v1/live-sessions`
    + `?owner=${encodeURIComponent(opts.ownerHash)}`
    + `&self=${encodeURIComponent(opts.deviceId)}`
    + `&limit=${limit}`;
  try {
    const res = await f(url, { method: "GET" });
    if (!res.ok) return [];
    const body = await res.json();
    const devices = parseRemoteDevices(body);
    return markOffline(devices, opts.now ?? Date.now(), staleMin);
  } catch {
    return [];
  }
}

/** The two pseudonymous identity hashes, read from ~/.mooter/identity.json. Both
 *  null when absent — the caller decides whether to mint one. FAIL-SOFT. */
export interface Identity { deviceId: string | null; ownerHash: string | null; deviceLabel: string | null; }

export function readIdentity(path = mooterPath("identity.json")): Identity {
  try {
    const o = JSON.parse(readFileSync(path, "utf8"));
    return {
      deviceId: typeof o.device_id === "string" ? o.device_id : null,
      ownerHash: typeof o.owner_hash === "string" ? o.owner_hash : null,
      deviceLabel: typeof o.device_label === "string" ? o.device_label : null,
    };
  } catch {
    return { deviceId: null, ownerHash: null, deviceLabel: null };
  }
}

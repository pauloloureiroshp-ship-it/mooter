// stats-reconcile.ts — Wave 33.8 Block A.
//
// The statusline shows THIS MACHINE's local all-time (decisions.log), while the
// landing/dashboard shows the user's CROSS-DEVICE all-time (hub D1, summed by
// user_id_hash). Those legitimately differ — but until now nothing told the user
// that, so "$0.00 all-time" next to the landing's "$25.95" read as a bug (Q7/Q10).
//
// This module reconciles the two: it counts local calls (cheap line count), reads
// a cached copy of the hub `/v1/user/dashboard` response, and reports the drift.
// `mooter doctor` surfaces it as a health check; `mooter sync --rebuild-stats`
// refreshes the hub cache. All IO is injectable so the logic is unit-testable
// without a network or a real home dir.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readAuth } from "./login.ts";

export interface LocalStats {
  /** All-time classified calls = lines in decisions.log (this machine). */
  calls: number;
}

export interface HubStats {
  total_calls: number;
  saved_usd: number | null;
  last_updated?: string;
}

export type ReconcileLevel = "ok" | "warn" | "unknown";

export interface ReconcileResult {
  level: ReconcileLevel;
  detail: string;
  local?: LocalStats;
  hub?: HubStats;
  driftPct?: number;
}

const DRIFT_THRESHOLD_PCT = 5;
const HUB_CACHE_FILE = "hub-dashboard-cache.json";
const DEFAULT_DECISIONS_LOG = join(homedir(), ".claude", "tools", "router", "decisions.log");

/** Count non-empty lines in decisions.log = all-time local calls. 0 when absent. */
export function readLocalCalls(decisionsLogPath: string = DEFAULT_DECISIONS_LOG): number {
  try {
    const raw = readFileSync(decisionsLogPath, "utf8");
    let n = 0;
    for (const line of raw.split("\n")) if (line.trim().length) n += 1;
    return n;
  } catch {
    return 0;
  }
}

/** Read the cached hub dashboard snapshot. Null when never synced. */
export function readHubCache(mooterHome: string): HubStats | null {
  try {
    const obj = JSON.parse(readFileSync(join(mooterHome, HUB_CACHE_FILE), "utf8"));
    if (typeof obj.total_calls !== "number") return null;
    return {
      total_calls: obj.total_calls,
      saved_usd: typeof obj.saved_usd === "number" ? obj.saved_usd : null,
      last_updated: typeof obj.last_updated === "string" ? obj.last_updated : undefined,
    };
  } catch {
    return null;
  }
}

/** Pure: drift between two counts as a percentage of the larger (0 when both 0). */
export function driftPct(a: number, b: number): number {
  const hi = Math.max(Math.abs(a), Math.abs(b));
  if (hi === 0) return 0;
  return Math.round((Math.abs(a - b) / hi) * 100);
}

/**
 * Pure: reconcile local vs hub. The hub is a SUPERSET (cross-device) so the hub
 * having MORE than local is expected and not an error; we only warn when the two
 * diverge enough to confuse, and we never call the legitimate multi-device gap a
 * failure. `unknown` when the hub was never cached (the actionable state).
 */
export function reconcile(local: LocalStats, hub: HubStats | null): ReconcileResult {
  if (!hub) {
    return {
      level: "unknown",
      detail: "hub stats not cached — run `mooter sync --rebuild-stats` to compare cross-device totals",
      local,
    };
  }
  const dPct = driftPct(local.calls, hub.total_calls);
  if (dPct > DRIFT_THRESHOLD_PCT) {
    const savedStr = hub.saved_usd != null ? ` · hub saved $${hub.saved_usd.toFixed(2)}` : "";
    return {
      level: "warn",
      detail: `${dPct}% drift — local ${local.calls} calls vs hub ${hub.total_calls} (cross-device)${savedStr}. Expected if you run Mooter on >1 machine; if not, run \`mooter sync --rebuild-stats\``,
      local,
      hub,
      driftPct: dPct,
    };
  }
  return {
    level: "ok",
    detail: `local ${local.calls} calls ≈ hub ${hub.total_calls} (${dPct}% drift)`,
    local,
    hub,
    driftPct: dPct,
  };
}

/** Doctor-facing entry: reads both sides and reconciles. Injectable paths. */
export function reconcileStats(opts: { mooterHome?: string; decisionsLogPath?: string } = {}): ReconcileResult {
  const mooterHome = opts.mooterHome ?? join(homedir(), ".mooter");
  const local: LocalStats = { calls: readLocalCalls(opts.decisionsLogPath) };
  return reconcile(local, readHubCache(mooterHome));
}

export interface CmdResult {
  exitCode: number;
  output: string;
}

type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

function resolveBackendUrl(mooterHome: string): string | null {
  if (process.env.MOOTER_CF_BACKEND_URL) return process.env.MOOTER_CF_BACKEND_URL;
  try {
    const cfg = JSON.parse(readFileSync(join(mooterHome, "sync-config.json"), "utf8"));
    return typeof cfg.backend_url === "string" ? cfg.backend_url : null;
  } catch {
    return null;
  }
}

/**
 * `mooter sync --rebuild-stats` — refresh the hub-dashboard cache so the next
 * reconcile (and `mooter doctor`) compares against fresh cross-device numbers.
 * Reads the opaque user_id_hash from ~/.mooter/auth.json (set by `mooter login`),
 * GETs /v1/user/dashboard?user_hash=…, writes the cache. Honest about every miss.
 */
export async function rebuildStats(opts: {
  mooterHome?: string;
  backendUrl?: string;
  fetchImpl?: FetchLike;
} = {}): Promise<CmdResult> {
  const mooterHome = opts.mooterHome ?? join(homedir(), ".mooter");
  const auth = readAuth(mooterHome);
  if (!auth || !auth.user_id_hash) {
    return { exitCode: 1, output: "✗ Not logged in (no user_id_hash). Run `mooter login` first — the hub total is per-user." };
  }
  // Defensive: the hash must be the opaque hex id `mooter login` writes. Reject a
  // malformed auth.json before it reaches the URL (parity with user-status.js).
  if (!/^[0-9a-f]{8,}$/i.test(auth.user_id_hash)) {
    return { exitCode: 1, output: "✗ Stored user_id_hash is malformed. Run `mooter login` to refresh." };
  }
  const backend = opts.backendUrl ?? resolveBackendUrl(mooterHome);
  if (!backend) {
    return { exitCode: 1, output: "✗ No hub backend URL (set MOOTER_CF_BACKEND_URL or ~/.mooter/sync-config.json)." };
  }
  const doFetch: FetchLike = opts.fetchImpl ?? ((url) => fetch(url) as unknown as ReturnType<FetchLike>);
  const url = `${backend.replace(/\/$/, "")}/v1/user/dashboard?user_hash=${encodeURIComponent(auth.user_id_hash)}`;
  try {
    const res = await doFetch(url);
    if (!res.ok) return { exitCode: 1, output: `✗ Hub returned HTTP ${res.status}.` };
    const body = (await res.json()) as Record<string, unknown>;
    const cache: HubStats = {
      total_calls: typeof body.total_calls === "number" ? body.total_calls : 0,
      saved_usd: typeof body.saved_usd === "number" ? body.saved_usd : null,
      last_updated: typeof body.last_updated === "string" ? body.last_updated : new Date().toISOString(),
    };
    writeFileSync(join(mooterHome, HUB_CACHE_FILE), JSON.stringify(cache) + "\n");
    const r = reconcileStats({ mooterHome });
    return { exitCode: 0, output: `✓ Hub stats cached: ${cache.total_calls} calls${cache.saved_usd != null ? ` · saved $${cache.saved_usd.toFixed(2)}` : ""}.\n${r.detail}` };
  } catch (e) {
    return { exitCode: 1, output: `✗ Rebuild failed: ${String((e as Error).message)}` };
  }
}

/** True when a hub cache already exists (used by doctor to phrase its hint). */
export function hasHubCache(mooterHome: string): boolean {
  return existsSync(join(mooterHome, HUB_CACHE_FILE));
}

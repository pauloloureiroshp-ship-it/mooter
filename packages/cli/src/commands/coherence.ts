// coherence.ts — Wave 59A: cross-surface number coherence audit.
//
// The recurring confusion (Q7 / STATUSLINE_AUDIT_AND_2_0_PROPOSAL.md): the
// statusline shows "$0.00 all-time · 269 calls" while the landing shows
// "$25.95 · 658 calls". Both are correct — they just measure different things:
//   • statusline / tracker → THIS MACHINE (local decisions.log + savings daemon)
//   • hub / landing        → CROSS-DEVICE all-time (D1, summed by user_id_hash)
//
// `mooter doctor` already reconciles the CALL COUNT (stats-reconcile.ts). This
// augments it: it cross-checks BOTH calls and savings $ across the local and hub
// surfaces and — when they diverge — names the PROBABLE CAUSE (fresh session /
// different MOOTER_HOME / never synced / stale cache / genuine multi-device gap)
// instead of leaving the user to guess. Honest-by-design: a legitimate gap is
// explained, never dressed up as a failure. All IO is injectable for testing.

import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

import { readLocalCalls, readHubCache, driftPct, type HubStats } from "./stats-reconcile.ts";

/** Savings as the local savings daemon (127.0.0.1:7821/metrics) reports them. */
export interface LocalSavings {
  savedUsd: number | null;
  savedPct: number | null;
}

export type CoherenceLevel = "ok" | "warn" | "unknown";

export interface CoherenceRow {
  metric: string;
  /** This-machine value (decisions.log / savings daemon). null = unavailable. */
  local: number | null;
  /** Cross-device hub value (cached /v1/user/dashboard). null = unavailable. */
  hub: number | null;
  level: CoherenceLevel;
  /** Plain-language probable cause when local and hub diverge. */
  cause: string;
}

export interface CoherenceReport {
  rows: CoherenceRow[];
  level: CoherenceLevel;
  mooterHome: string;
  /** Age of the cached hub snapshot in hours, or null when never synced. */
  hubCacheAgeHours: number | null;
}

export interface CoherenceInputs {
  localCalls: number;
  /** null when the savings daemon is unreachable. */
  localSavings: LocalSavings | null;
  /** null when the hub was never synced (no cache). */
  hub: HubStats | null;
  mooterHome: string;
  nowMs: number;
}

const DRIFT_THRESHOLD_PCT = 5;
const SYNC_HINT = "run `mooter sync --rebuild-stats`";

function ageHours(lastUpdated: string | undefined, nowMs: number): number | null {
  if (!lastUpdated) return null;
  const t = Date.parse(lastUpdated);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((nowMs - t) / 3_600_000));
}

/** Worst-of: warn dominates unknown dominates ok. */
function worst(levels: CoherenceLevel[]): CoherenceLevel {
  if (levels.includes("warn")) return "warn";
  if (levels.includes("unknown")) return "unknown";
  return "ok";
}

/**
 * Pure: turn gathered numbers into a coherence verdict per metric with a probable
 * cause. The hub is a cross-device SUPERSET, so hub > local is expected, never a
 * failure. `unknown` is the honest state when a source is simply unavailable.
 */
export function buildCoherence(i: CoherenceInputs): CoherenceReport {
  const cacheAge = i.hub ? ageHours(i.hub.last_updated, i.nowMs) : null;
  const staleNote = cacheAge != null && cacheAge >= 24 ? ` (hub cache is ${cacheAge}h old — ${SYNC_HINT} to refresh)` : "";
  const rows: CoherenceRow[] = [];

  // ── calls ─────────────────────────────────────────────────────────────────
  if (!i.hub) {
    rows.push({
      metric: "calls",
      local: i.localCalls,
      hub: null,
      level: "unknown",
      cause: `hub never synced — ${SYNC_HINT} to compare against cross-device all-time`,
    });
  } else if (i.localCalls === 0 && i.hub.total_calls > 0) {
    rows.push({
      metric: "calls",
      local: 0,
      hub: i.hub.total_calls,
      level: "warn",
      cause: `local decisions.log is empty here but the hub has ${i.hub.total_calls} — fresh session or a different MOOTER_HOME (${i.mooterHome}); the statusline is per-machine, the hub is cross-device`,
    });
  } else {
    const d = driftPct(i.localCalls, i.hub.total_calls);
    rows.push(
      d > DRIFT_THRESHOLD_PCT
        ? {
            metric: "calls",
            local: i.localCalls,
            hub: i.hub.total_calls,
            level: "warn",
            cause: `${d}% drift — local ${i.localCalls} vs hub ${i.hub.total_calls}. Expected if you run Mooter on >1 machine${staleNote || `; otherwise ${SYNC_HINT}`}`,
          }
        : {
            metric: "calls",
            local: i.localCalls,
            hub: i.hub.total_calls,
            level: "ok",
            cause: `aligned (${d}% drift)`,
          },
    );
  }

  // ── savings $ ───────────────────────────────────────────────────────────────
  if (!i.localSavings) {
    rows.push({
      metric: "savings_usd",
      local: null,
      hub: i.hub?.saved_usd ?? null,
      level: "unknown",
      cause: "savings daemon (127.0.0.1:7821) not reachable — start a Mooter session, then re-check",
    });
  } else if (!i.hub || i.hub.saved_usd == null) {
    rows.push({
      metric: "savings_usd",
      local: i.localSavings.savedUsd,
      hub: i.hub?.saved_usd ?? null,
      level: "unknown",
      cause: i.hub ? "hub has no saved_usd yet" : `hub never synced — ${SYNC_HINT}`,
    });
  } else {
    const lUsd = i.localSavings.savedUsd ?? 0;
    const hUsd = i.hub.saved_usd;
    if (lUsd === 0 && hUsd > 0) {
      rows.push({
        metric: "savings_usd",
        local: lUsd,
        hub: hUsd,
        level: "warn",
        cause: `tracker shows $0 on this machine but the hub all-time is $${hUsd.toFixed(2)} — fresh session or a different MOOTER_HOME (${i.mooterHome})`,
      });
    } else {
      const d = driftPct(Math.round(lUsd * 100), Math.round(hUsd * 100));
      rows.push(
        d > DRIFT_THRESHOLD_PCT
          ? {
              metric: "savings_usd",
              local: lUsd,
              hub: hUsd,
              level: "warn",
              cause: `${d}% drift — local $${lUsd.toFixed(2)} (this machine) vs hub $${hUsd.toFixed(2)} (cross-device all-time). Expected on multi-device${staleNote || `; otherwise ${SYNC_HINT}`}`,
            }
          : {
              metric: "savings_usd",
              local: lUsd,
              hub: hUsd,
              level: "ok",
              cause: `aligned (${d}% drift)`,
            },
      );
    }
  }

  return { rows, level: worst(rows.map((r) => r.level)), mooterHome: i.mooterHome, hubCacheAgeHours: cacheAge };
}

/** Default savings reader: curl the local daemon, fail-open to null. */
function defaultReadSavings(): LocalSavings | null {
  try {
    const raw = execFileSync("curl", ["-fsS", "--max-time", "1", "http://127.0.0.1:7821/metrics"], { encoding: "utf8" });
    const m = JSON.parse(raw) as Record<string, unknown>;
    return {
      savedUsd: typeof m.saved === "number" ? m.saved : null,
      savedPct: typeof m.saved_pct === "number" ? m.saved_pct : null,
    };
  } catch {
    return null;
  }
}

export interface CoherenceOpts {
  mooterHome?: string;
  decisionsLogPath?: string;
  /** Inject the savings reader (tests). */
  readSavings?: () => LocalSavings | null;
  /** Inject "now" for deterministic cache-age (tests). */
  nowMs?: number;
}

/** Gather the live numbers and reconcile them. Every source is injectable. */
export function gatherCoherence(opts: CoherenceOpts = {}): CoherenceReport {
  const mooterHome = opts.mooterHome ?? join(homedir(), ".mooter");
  return buildCoherence({
    localCalls: readLocalCalls(opts.decisionsLogPath),
    localSavings: (opts.readSavings ?? defaultReadSavings)(),
    hub: readHubCache(mooterHome),
    mooterHome,
    nowMs: opts.nowMs ?? Date.now(),
  });
}

const GLYPH: Record<CoherenceLevel, string> = { ok: "✓", warn: "⚠", unknown: "?" };

function fmt(v: number | null): string {
  return v == null ? "—" : String(v);
}

/** Render the coherence report as table lines (appended under `mooter doctor`). */
export function renderCoherence(r: CoherenceReport): string[] {
  const out: string[] = [
    "",
    "Coherence — local (this machine) vs hub (cross-device all-time)",
    `  MOOTER_HOME: ${r.mooterHome}${r.hubCacheAgeHours != null ? ` · hub cache age ${r.hubCacheAgeHours}h` : " · hub never synced"}`,
    "",
  ];
  for (const row of r.rows) {
    out.push(`  ${GLYPH[row.level]} ${row.metric.padEnd(12)} local ${fmt(row.local).padEnd(10)} hub ${fmt(row.hub).padEnd(10)}`);
    if (row.level !== "ok") out.push(`      ↳ ${row.cause}`);
  }
  out.push("");
  out.push(
    r.level === "ok"
      ? "Surfaces coherent. 🐮"
      : r.level === "unknown"
        ? "Some sources unavailable — see hints above (no divergence proven)."
        : "Surfaces diverge — see the probable cause for each metric above.",
  );
  return out;
}

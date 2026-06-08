// Wave 33.5 Block A — 5h quota forecast (A.2 `mooter sessions quota`).
//
// Claude Max enforces a rolling 5-hour usage window. decisions.log carries no
// server quota, so this is an HONEST LOCAL PROJECTION: count classified cloud
// (T2/T3) calls in the trailing window, derive a calls/hour rate over the
// observed span, and project to the window end. `estimated: true` is non-optional
// on the result so no caller can render it as an authoritative quota.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { QuotaForecast } from "./types.ts";

export interface QuotaOptions {
  home?: string;
  now?: number;
  windowHours?: number;
}

interface Stamp {
  ms: number;
  cloud: boolean;
}

function decisionsLogPath(home: string): string {
  return join(home, ".claude", "tools", "router", "decisions.log");
}

/** Extract (ts_ms, isCloud) for every classified event. Best-effort. */
export function readStamps(home: string): Stamp[] {
  let data: string;
  try {
    data = readFileSync(decisionsLogPath(home), "utf8");
  } catch {
    return [];
  }
  const out: Stamp[] = [];
  for (const line of data.split("\n")) {
    if (!line || line.indexOf('"classified"') === -1) continue;
    try {
      const o = JSON.parse(line);
      if (o.event !== "classified") continue;
      const ms = typeof o.ts_ms === "number" ? o.ts_ms : Date.parse(o.ts);
      if (!Number.isFinite(ms)) continue;
      const tier = String(o.tier ?? "");
      out.push({ ms, cloud: tier === "T2" || tier === "T3" });
    } catch {
      /* skip */
    }
  }
  return out;
}

export function forecastQuota(opts: QuotaOptions = {}): QuotaForecast {
  const home = opts.home ?? homedir();
  const now = opts.now ?? Date.now();
  const windowHours = opts.windowHours ?? 5;
  const windowMs = windowHours * 3600000;
  const cutoff = now - windowMs;

  const inWindow = readStamps(home).filter((s) => s.ms >= cutoff && s.ms <= now);
  const total = inWindow.length;
  const cloud = inWindow.filter((s) => s.cloud).length;

  if (total === 0) {
    return {
      windowHours,
      cloudCallsInWindow: 0,
      totalCallsInWindow: 0,
      ratePerHour: 0,
      projectedCloudCalls: 0,
      windowResetInMin: 0,
      estimated: true,
    };
  }

  const oldest = Math.min(...inWindow.map((s) => s.ms));
  // Observed span: from the oldest in-window call to now. Floor at 6 min so a
  // single recent burst doesn't extrapolate to an absurd hourly rate.
  const spanHours = Math.max((now - oldest) / 3600000, 0.1);
  const ratePerHour = cloud / spanHours;
  const projectedCloudCalls = Math.round(ratePerHour * windowHours);
  // The oldest in-window call ages out at oldest + windowMs.
  const windowResetInMin = Math.max(0, Math.round((oldest + windowMs - now) / 60000));

  return {
    windowHours,
    cloudCallsInWindow: cloud,
    totalCallsInWindow: total,
    ratePerHour: Math.round(ratePerHour * 10) / 10,
    projectedCloudCalls,
    windowResetInMin,
    estimated: true,
  };
}

export function renderQuota(q: QuotaForecast): string {
  const out: string[] = [];
  out.push(`5h quota forecast (estimated — local rate projection, not a server quota)`);
  out.push(`  cloud calls (T2/T3) in window : ${q.cloudCallsInWindow}`);
  out.push(`  total classified in window    : ${q.totalCallsInWindow}`);
  out.push(`  observed rate                 : ${q.ratePerHour}/h cloud`);
  out.push(`  projected by window end       : ~${q.projectedCloudCalls} cloud calls`);
  out.push(`  oldest call ages out in       : ${q.windowResetInMin}m`);
  return out.join("\n");
}

// Council telemetry — FEATURES ONLY, no content, k-anon-friendly.
//
// A telemetry record carries NO prompt, NO answer text, NO rationales — only bucketed
// features (category, convergence, confidence/cost buckets, rounds, seat count). That
// content-free + bucketed shape is the precondition for k-anonymity; the hub (D1)
// enforces k-anon by AGGREGATION across users. A single record identifies nothing.

import type { CouncilVerdict, Convergence } from "./types.ts";
import type { Decision } from "./escalation.ts";

export interface TelemetryMeta {
  category: string;
  localOnly: boolean;
  autoConvened?: boolean;
  decision?: Decision;
  /** Caller-stamped timestamp (kept out of the pure builder for determinism). */
  ts?: number;
}

export interface CouncilTelemetry {
  ts?: number;
  category: string;
  convergence: Convergence;
  /** Bucketed confidence (e.g. "0.8-1.0") — never the raw value. */
  confidenceBucket: string;
  /** Bucketed cost (e.g. "$0", "<$0.01"). */
  costBucket: string;
  rounds: number;
  stable: boolean;
  seatCount: number;
  localOnly: boolean;
  modelCalls: number;
  autoConvened?: boolean;
  decision?: Decision;
}

export function confidenceBucket(c: number): string {
  const x = Math.max(0, Math.min(1, c));
  const lo = Math.min(0.8, Math.floor(x * 5) / 5);
  return `${lo.toFixed(1)}-${(lo + 0.2).toFixed(1)}`;
}

export function costBucket(usd: number): string {
  if (usd <= 0) return "$0";
  if (usd < 0.01) return "<$0.01";
  if (usd < 0.1) return "<$0.10";
  if (usd < 1) return "<$1";
  return ">=$1";
}

/** Build a content-free telemetry record from a verdict. No prompt, no text. */
export function buildTelemetryRecord(verdict: CouncilVerdict, meta: TelemetryMeta): CouncilTelemetry {
  return {
    ts: meta.ts,
    category: meta.category,
    convergence: verdict.convergence,
    confidenceBucket: confidenceBucket(verdict.confidence),
    costBucket: costBucket(verdict.costUsd),
    rounds: verdict.rounds,
    stable: verdict.stable ?? false,
    seatCount: verdict.seats.length,
    localOnly: meta.localOnly,
    modelCalls: verdict.modelCalls,
    autoConvened: meta.autoConvened,
    decision: meta.decision,
  };
}

export interface PostOptions {
  endpoint?: string;
  fetchImpl?: typeof fetch;
  token?: string;
}

/**
 * POST a telemetry record to the hub (D1). No-op when no endpoint is configured —
 * telemetry is strictly opt-in. Never throws.
 */
export async function postTelemetry(
  rec: CouncilTelemetry,
  opts: PostOptions = {},
): Promise<{ sent: boolean; reason: string }> {
  const endpoint = opts.endpoint ?? process.env.MOOTER_HUB_TELEMETRY_URL;
  if (!endpoint) return { sent: false, reason: "no endpoint configured (telemetry disabled)" };
  const f = opts.fetchImpl ?? fetch;
  try {
    const res = await f(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: JSON.stringify(rec),
    });
    return { sent: res.ok, reason: res.ok ? "ok" : `HTTP ${res.status}` };
  } catch (e) {
    return { sent: false, reason: (e as Error).message };
  }
}

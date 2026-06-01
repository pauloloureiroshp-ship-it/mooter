// Wave 10 Phase B.1a — server-side hub aggregate fetch.
//
// Pulls community-wide aggregates from the CF Workers hub `/aggregate-stats`
// (the live aggregation over `mooter_events` / `frugal_events`). Used by the
// landing API routes that feed the homepage CommunityPulse and the dashboard
// Workflow tab. Read-only, anon-safe (no per-user data, no PII) — the per-user
// filtered variant is Phase B.1b (requires a hub query-param change + redeploy).

// Read the hub URL directly (with the canonical fallback) rather than importing
// the strict env singleton — this keeps the helper decoupled and unit-testable
// without a fully-populated env. Same precedence as lib/env.ts HUB_URL.
const HUB_URL =
  process.env.NEXT_PUBLIC_MOOTER_HUB_URL ||
  process.env.NEXT_PUBLIC_FRUGAL_HUB_URL ||
  "https://mooter-hub.frugal-hub.workers.dev";

export interface HubAggregates {
  total_events: number;
  unique_instances: number;
  tier_distribution: Record<string, number>; // T0..T3 → fraction 0..1
  top_categories: Array<{ category: string; count: number }>;
  savings: { total_usd: number; avg_per_decision_usd: number };
  avg_confidence: number;
  last_updated: string;
  data_window_days: number;
}

/**
 * Fetch community aggregates from the hub. Returns null on any failure or when
 * the hub has no events yet (so callers render an honest "Demo data" state
 * instead of fabricated numbers).
 */
export async function fetchHubAggregates(): Promise<HubAggregates | null> {
  try {
    const r = await fetch(`${HUB_URL}/aggregate-stats`, {
      signal: AbortSignal.timeout(2500),
      // Cache the public aggregate briefly to avoid hammering the hub on every render.
      next: { revalidate: 60 },
    });
    if (!r.ok) return null;
    const d = (await r.json()) as Partial<HubAggregates>;
    if (d == null || typeof d.total_events !== "number") return null;
    return d as HubAggregates;
  } catch {
    return null;
  }
}

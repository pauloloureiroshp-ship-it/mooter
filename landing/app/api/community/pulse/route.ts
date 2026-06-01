import { NextResponse } from "next/server";
import { fetchHubAggregates } from "../../../lib/hub";

// Wave 10 Phase B.1a — community pulse for the homepage.
//
// Replaces the hardcoded "14,231 / 89.9% / 247" placeholder: serves REAL
// community aggregates from the hub, or `{ source: "demo" }` when the hub is
// unreachable / empty (so CommunityPulse renders an honest illustrative state).
// avg_savings_pct is intentionally omitted — the hub exposes total saved $ but
// no community savings-% aggregate, and fabricating one would be dishonest.

export async function GET() {
  const agg = await fetchHubAggregates();
  if (!agg || agg.total_events === 0) {
    return NextResponse.json({ source: "demo" }, { status: 200 });
  }
  return NextResponse.json({
    source: "live",
    prompts_routed: agg.total_events,
    active_devs: agg.unique_instances,
    saved_last_7d: typeof agg.savings?.total_usd === "number" ? agg.savings.total_usd : null,
    avg_savings_pct: null,
    last_updated: agg.last_updated,
  });
}

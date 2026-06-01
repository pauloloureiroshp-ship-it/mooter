import { NextResponse } from "next/server";
import { fetchHubAggregates } from "../../../lib/hub";

// Wave 10 Phase B.1a — dashboard aggregates (community scope).
//
// Feeds the dashboard Workflow tab (A.5-V2 Sankey) with the community-wide tier
// distribution + top categories + savings from the hub. Returns
// `{ source: "demo" }` when the hub is empty/unreachable. The per-user ("My
// usage") scope is Phase B.1b — it needs a `user_id_hash` filter in the hub,
// which requires a hub redeploy (deferred, pending approval).

export async function GET() {
  const agg = await fetchHubAggregates();
  if (!agg || agg.total_events === 0) {
    return NextResponse.json({ source: "demo" }, { status: 200 });
  }
  return NextResponse.json({
    source: "live",
    scope: "community",
    total_events: agg.total_events,
    unique_instances: agg.unique_instances,
    tier_distribution: agg.tier_distribution,
    top_categories: agg.top_categories,
    savings: agg.savings,
    last_updated: agg.last_updated,
    data_window_days: agg.data_window_days,
  });
}

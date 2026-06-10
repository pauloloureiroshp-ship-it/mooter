import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { fetchHubAggregates, fetchUserDashboard } from "../../../lib/hub";
import { getUser } from "../../../lib/supabase";

// Wave 10 Phase B.1a — dashboard aggregates (community scope).
// Wave 33.7 — closes the per-user ("My usage") gap that was Phase B.1b.
//
// Default (no `?scope`): community-wide tier distribution + savings from the
// hub `/aggregate-stats`. Unchanged — every existing consumer keeps working.
//
// `?scope=user`: per-user aggregates. We read the Supabase session cookie,
// resolve the user via the existing thin GoTrue wrapper, and forward ONLY the
// anonymous hash SHA256(user_id)[:16] to the hub `/v1/user/dashboard` (the hub
// never sees the raw id or JWT — the anonymous-by-default model of migration
// 008). user_id is derived from the session, never the request body. Logged-out
// → 401; no data yet → honest empty state (never fabricated numbers).

const PRIVATE = { "Cache-Control": "private, no-store" } as const;

/** SHA256(user_id)[:16] — the same anonymous hash migration 008 / the CLI use. */
function userHash(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 16);
}

export async function GET(request: NextRequest) {
  const scope = new URL(request.url).searchParams.get("scope");

  if (scope === "user") {
    const token = request.cookies.get("sb-access-token")?.value;
    if (!token) {
      return NextResponse.json({ scope: "user", source: "unauthenticated" }, { status: 401, headers: PRIVATE });
    }
    const user = await getUser(token);
    if (!user?.id) {
      return NextResponse.json({ scope: "user", source: "unauthenticated" }, { status: 401, headers: PRIVATE });
    }
    const data = await fetchUserDashboard(userHash(user.id));
    if (!data) {
      // Hub unreachable or unexpected shape — honest empty, not fabricated.
      return NextResponse.json({ scope: "user", source: "empty", total_calls: 0 }, { status: 200, headers: PRIVATE });
    }
    return NextResponse.json(data, { status: 200, headers: PRIVATE });
  }

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

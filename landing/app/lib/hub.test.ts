// Wave 10 Phase B.1a — hub aggregate fetch. node-env vitest.
// Verifies the honesty contract: a failing/empty/malformed hub response yields
// null (caller renders "Demo data"), never a fabricated number; a valid payload
// is passed through.

import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchHubAggregates } from "./hub";

const VALID = {
  total_events: 412,
  unique_instances: 7,
  tier_distribution: { T0: 0.66, T1: 0.21, T2: 0.1, T3: 0.03 },
  top_categories: [{ category: "trivial_local", count: 271 }],
  savings: { total_usd: 0.63, avg_per_decision_usd: 0.0015 },
  avg_confidence: 0.84,
  last_updated: "2026-06-01T12:00:00.000Z",
  data_window_days: 7,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchHubAggregates", () => {
  it("returns parsed aggregates on a valid hub response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(VALID), { status: 200 })));
    const got = await fetchHubAggregates();
    expect(got?.total_events).toBe(412);
    expect(got?.tier_distribution.T0).toBe(0.66);
  });

  it("returns null on a non-ok response (→ Demo data, no fabrication)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 502 })));
    expect(await fetchHubAggregates()).toBeNull();
  });

  it("returns null when the payload lacks total_events", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ tier_distribution: {} }), { status: 200 })));
    expect(await fetchHubAggregates()).toBeNull();
  });

  it("returns null when fetch throws / times out", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timeout"); }));
    expect(await fetchHubAggregates()).toBeNull();
  });
});

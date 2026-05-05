/**
 * stats.js — GET /api/stats
 *
 * Returns aggregated public statistics about the frugal community.
 * No PII, no individual deltas — only aggregate numbers.
 */

async function handleStats(request, env) {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405 });
  }

  try {
    // Total deltas and unique profiles
    const totals = await env.DB.prepare(`
      SELECT
        COUNT(*) as total_deltas,
        SUM(prompt_count) as total_prompts,
        AVG(trust_score) as avg_trust
      FROM deltas
      WHERE received_at > datetime('now', '-7 days')
    `).first();

    // Distribution by hw_tier
    const hwDist = await env.DB.prepare(`
      SELECT hw_tier, COUNT(*) as count, AVG(trust_score) as avg_trust
      FROM deltas
      WHERE received_at > datetime('now', '-7 days')
      GROUP BY hw_tier
      ORDER BY count DESC
    `).all();

    // Distribution by sub_profile
    const subDist = await env.DB.prepare(`
      SELECT sub_profile, COUNT(*) as count
      FROM deltas
      WHERE received_at > datetime('now', '-7 days')
      GROUP BY sub_profile
      ORDER BY count DESC
    `).all();

    // Installed-fleet distribution from device_heartbeats (last 30d, event=install_ok or alive).
    // Surfaces hw/sub distribution IMMEDIATELY on install — no 24h wait for deltas.
    let installedFleet = { by_hw: [], by_sub: [], total_devices: 0 };
    try {
      const hwByFleet = await env.DB.prepare(`
        SELECT hw_tier, COUNT(DISTINCT device_id) as count
        FROM device_heartbeats
        WHERE received_at > datetime('now', '-30 days')
          AND event IN ('install_ok', 'alive')
        GROUP BY hw_tier
        ORDER BY count DESC
      `).all();
      const subByFleet = await env.DB.prepare(`
        SELECT sub_profile, COUNT(DISTINCT device_id) as count
        FROM device_heartbeats
        WHERE received_at > datetime('now', '-30 days')
          AND event IN ('install_ok', 'alive')
        GROUP BY sub_profile
        ORDER BY count DESC
      `).all();
      const totalDevices = await env.DB.prepare(`
        SELECT COUNT(DISTINCT device_id) as count
        FROM device_heartbeats
        WHERE received_at > datetime('now', '-30 days')
          AND event IN ('install_ok', 'alive')
      `).first();
      installedFleet = {
        by_hw:  (hwByFleet.results  || []).map(r => ({ hw_tier: r.hw_tier, count: r.count })),
        by_sub: (subByFleet.results || []).map(r => ({ sub_profile: r.sub_profile, count: r.count })),
        total_devices: Number(totalDevices?.count || 0),
      };
    } catch (e) {
      // device_heartbeats table may not exist yet if migration 007 hasn't run
      console.error('stats: installed_fleet query failed (migration 007 applied?):', e && e.message);
    }

    // Average tier distribution (weighted by trust)
    const tierAvg = await env.DB.prepare(`
      SELECT
        AVG(json_extract(tier_distribution, '$.t0')) as avg_t0,
        AVG(json_extract(tier_distribution, '$.t1')) as avg_t1,
        AVG(json_extract(tier_distribution, '$.t2')) as avg_t2,
        AVG(json_extract(tier_distribution, '$.t3')) as avg_t3
      FROM deltas
      WHERE received_at > datetime('now', '-7 days')
        AND trust_score >= 0.4
    `).first();

    // Average savings estimate (1 - weighted cost)
    const avgSavings = tierAvg
      ? 1 - ((tierAvg.avg_t0 || 0) * 0 + (tierAvg.avg_t1 || 0) * 0.044 + (tierAvg.avg_t2 || 0) * 0.178 + (tierAvg.avg_t3 || 0) * 1.0)
      : null;

    // MP-18: Total savings and unique users from deltas with savings_usd (last 7d)
    const savingsAndUsers = await env.DB.prepare(`
      SELECT
        COUNT(DISTINCT profile_hash) as user_count,
        SUM(savings_usd) as total_savings_usd,
        SUM(prompt_count) as total_prompts_all
      FROM deltas
      WHERE received_at > datetime('now', '-7 days')
        AND savings_usd IS NOT NULL
    `).first();

    // 2026-05-05 (deepdive #38): cumulative all-time totals — what the landing
    // counter actually shows. The 7-day numbers above feed the tier/hw
    // distribution charts that need a recent window; the landing big counter
    // claims "since launch" so it must be unbounded.
    const lifetimeTotals = await env.DB.prepare(`
      SELECT
        COUNT(DISTINCT profile_hash) as user_count_all_time,
        SUM(savings_usd) as total_savings_usd_all_time,
        SUM(prompt_count) as total_prompts_all_time
      FROM deltas
      WHERE savings_usd IS NOT NULL
    `).first();

    // Pending model signals
    const pendingModels = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM model_signals WHERE status = 'pending'
    `).first();

    return new Response(JSON.stringify({
      period: 'last_7_days',
      generated_at: new Date().toISOString(),
      // Landing big counter — cumulative all-time. Falls back to the 7-day
      // figure (and the 1-row baseline) only if the lifetime query returns null.
      prompt_count: Number(
        lifetimeTotals?.total_prompts_all_time ||
        savingsAndUsers?.total_prompts_all ||
        totals?.total_prompts ||
        0,
      ),
      user_count: Number(
        lifetimeTotals?.user_count_all_time ||
        savingsAndUsers?.user_count ||
        1,
      ),
      total_savings_usd: Math.round(
        (Number(lifetimeTotals?.total_savings_usd_all_time) ||
          Number(savingsAndUsers?.total_savings_usd) ||
          0) * 100,
      ) / 100,
      // 7-day rolling totals — kept for charts and "this week" callouts.
      prompt_count_7d: Number(savingsAndUsers?.total_prompts_all || totals?.total_prompts || 0),
      user_count_7d: Number(savingsAndUsers?.user_count || 1),
      total_savings_usd_7d: Math.round((Number(savingsAndUsers?.total_savings_usd) || 0) * 100) / 100,
      avg_savings_pct: avgSavings !== null ? Math.round(avgSavings * 1000) / 10 : null,
      totals: {
        deltas: totals?.total_deltas || 0,
        prompts: totals?.total_prompts || 0,
        avg_trust: Math.round((totals?.avg_trust || 0) * 1000) / 1000,
      },
      hw_distribution: (hwDist.results || []).map(r => ({
        hw_tier: r.hw_tier,
        count: r.count,
        avg_trust: Math.round((r.avg_trust || 0) * 1000) / 1000,
      })),
      installed_fleet: installedFleet,
      sub_distribution: (subDist.results || []).map(r => ({
        sub_profile: r.sub_profile,
        count: r.count,
      })),
      avg_tier_distribution: tierAvg ? {
        t0: Math.round((tierAvg.avg_t0 || 0) * 1000) / 1000,
        t1: Math.round((tierAvg.avg_t1 || 0) * 1000) / 1000,
        t2: Math.round((tierAvg.avg_t2 || 0) * 1000) / 1000,
        t3: Math.round((tierAvg.avg_t3 || 0) * 1000) / 1000,
      } : null,
      avg_savings: avgSavings !== null ? Math.round(avgSavings * 1000) / 1000 : null,
      pending_models: pendingModels?.count || 0,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'query error', detail: e.message }), { status: 500 });
  }
}

export { handleStats };

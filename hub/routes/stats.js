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

    // Pending model signals
    const pendingModels = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM model_signals WHERE status = 'pending'
    `).first();

    return new Response(JSON.stringify({
      period: 'last_7_days',
      generated_at: new Date().toISOString(),
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

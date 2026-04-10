/**
 * models.js — GET /api/models
 *
 * Returns the known model catalog from R2 storage plus any pending
 * community-detected models from D1.
 */

async function handleModels(request, env) {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405 });
  }

  try {
    // Read latest model catalog from R2
    let catalog = null;
    try {
      const obj = await env.STORAGE.get('model-catalog-latest.json');
      if (obj) {
        catalog = JSON.parse(await obj.text());
      }
    } catch { /* no catalog yet */ }

    // Community-detected models (pending review)
    const pending = await env.DB.prepare(`
      SELECT model_name, mention_count, hw_tiers, first_seen, last_seen
      FROM model_signals
      WHERE status = 'pending'
      ORDER BY mention_count DESC
      LIMIT 20
    `).all();

    // Recently added models
    const added = await env.DB.prepare(`
      SELECT model_name, mention_count, hw_tiers, first_seen, last_seen
      FROM model_signals
      WHERE status = 'added'
      ORDER BY last_seen DESC
      LIMIT 20
    `).all();

    return new Response(JSON.stringify({
      catalog: catalog || { _version: '0.0.0', models: {} },
      community_pending: (pending.results || []).map(r => ({
        model: r.model_name,
        mentions: r.mention_count,
        hw_tiers: JSON.parse(r.hw_tiers || '{}'),
        first_seen: r.first_seen,
        last_seen: r.last_seen,
      })),
      community_added: (added.results || []).map(r => ({
        model: r.model_name,
        mentions: r.mention_count,
      })),
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=600',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'query error', detail: e.message }), { status: 500 });
  }
}

export { handleModels };

/**
 * version.js — GET /api/version
 *
 * Returns the current version of the community router-tuning and
 * model-catalog, so clients can decide whether to pull updates.
 */

async function handleVersion(request, env) {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405 });
  }

  try {
    // Read version metadata from R2 objects
    let tuningVersion = '0.0.0';
    let catalogVersion = '0.0.0';
    let tuningGenerated = null;
    let tuningsamples = 0;

    try {
      const tuningObj = await env.STORAGE.get('router-tuning-latest.json');
      if (tuningObj) {
        const tuning = JSON.parse(await tuningObj.text());
        tuningVersion = tuning._version || '0.0.0';
        tuningGenerated = tuning._generated || null;
        tuningsamples = tuning._samples || 0;
      }
    } catch { /* no tuning yet */ }

    try {
      const catalogObj = await env.STORAGE.get('model-catalog-latest.json');
      if (catalogObj) {
        const catalog = JSON.parse(await catalogObj.text());
        catalogVersion = catalog._version || '0.0.0';
      }
    } catch { /* no catalog yet */ }

    // Active delta count (last 7 days)
    const stats = await env.DB.prepare(`
      SELECT COUNT(*) as delta_count, SUM(prompt_count) as total_prompts
      FROM deltas
      WHERE received_at > datetime('now', '-7 days')
    `).first();

    return new Response(JSON.stringify({
      router_tuning: {
        version: tuningVersion,
        generated: tuningGenerated,
        samples: tuningsamples,
      },
      model_catalog: {
        version: catalogVersion,
      },
      community: {
        delta_count_7d: stats?.delta_count || 0,
        prompt_count_7d: stats?.total_prompts || 0,
      },
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'query error', detail: e.message }), { status: 500 });
  }
}

export { handleVersion };

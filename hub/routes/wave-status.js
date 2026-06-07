// @ts-check
/**
 * routes/wave-status.js — /v1/wave-status (Wave 30 Phase O).
 *
 * Cross-session wave progress sync from `mooter wave`. Opt-in, anonymous.
 *   POST { wave_number, phase?, done?, total?, tag?, status?, device_id?, event_id? }
 *        → 202 on accept, 422 on validation failure.
 *   GET  → latest shipped wave (metadata only; no aggregation).
 *
 * Stores ONLY wave/phase metadata (migration 015_wave_events.sql) — never code,
 * prompts, or content. Additive; preserves all existing routes.
 */

/**
 * Validate + normalise a wave event payload. Pure → unit-testable.
 * @param {any} body
 * @returns {{ ok: true, event: { event_id:string, device_id:string, ts:number, wave_number:number, phase:string|null, done:number|null, total:number|null, tag:string|null, status:string } } | { ok: false, error: string }}
 */
export function validateWaveEvent(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'body must be an object' };
  const wave_number = body.wave_number;
  if (typeof wave_number !== 'number' || !Number.isFinite(wave_number) || wave_number <= 0) {
    return { ok: false, error: 'wave_number must be a positive number' };
  }
  const status = body.status === 'shipped' ? 'shipped' : 'in_progress';
  const intOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null);
  const strOrNull = (v) => (typeof v === 'string' && v.length > 0 ? v.slice(0, 64) : null);
  return {
    ok: true,
    event: {
      event_id: strOrNull(body.event_id) ?? `we_${Math.abs(hashStr(`${wave_number}|${body.phase}|${body.tag}|${body.device_id}`))}`,
      device_id: strOrNull(body.device_id) ?? 'anonymous',
      ts: intOrNull(body.ts) ?? 0,
      wave_number: Math.trunc(wave_number),
      phase: strOrNull(body.phase),
      done: intOrNull(body.done),
      total: intOrNull(body.total),
      tag: strOrNull(body.tag),
      status,
    },
  };
}

/** Tiny deterministic string hash (djb2) for a fallback event_id. */
function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return h | 0;
}

export async function handleWaveStatus(request, env) {
  const cors = { 'Content-Type': 'application/json' };

  if (request.method === 'GET') {
    try {
      const row = env.DB
        ? await env.DB.prepare(
            "SELECT wave_number, phase, done, total, tag, status, ts FROM wave_events WHERE status = 'shipped' ORDER BY ts DESC LIMIT 1",
          ).first()
        : null;
      return new Response(JSON.stringify({ latest: row ?? null }), { status: 200, headers: cors });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'db_error', message: String(e && e.message) }), { status: 500, headers: cors });
    }
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: cors });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 422, headers: cors });
  }

  const v = validateWaveEvent(body);
  if (!v.ok) {
    return new Response(JSON.stringify({ error: 'validation_error', detail: v.error }), { status: 422, headers: cors });
  }

  try {
    if (env.DB) {
      const e = v.event;
      await env.DB.prepare(
        'INSERT OR REPLACE INTO wave_events (event_id, device_id, ts, wave_number, phase, done, total, tag, status) VALUES (?,?,?,?,?,?,?,?,?)',
      )
        .bind(e.event_id, e.device_id, e.ts, e.wave_number, e.phase, e.done, e.total, e.tag, e.status)
        .run();
    }
    return new Response(JSON.stringify({ accepted: true, event_id: v.event.event_id }), { status: 202, headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'db_error', message: String(e && e.message) }), { status: 500, headers: cors });
  }
}

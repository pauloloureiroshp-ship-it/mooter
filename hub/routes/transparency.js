// @ts-check
/**
 * routes/transparency.js — Wave 32.
 *
 *   POST /v1/transparency  → ingest opt-in UX telemetry (statusline mode, effort
 *                            change, dashboard open). FEATURES ONLY.
 *   POST /v1/forget-me     → GDPR erasure: queue a signed device_id for k-anonymity
 *                            removal on the next aggregation pass. Returns 202.
 *
 * Additive: migrations 001-016 + every existing route untouched. Self-contained
 * validation (no new shared-schema coupling); writes via env.DB prepared stmts.
 */

import { errorResponse, classifyException } from '../lib/errors.js';

const ALLOWED_EVENT_TYPES = new Set(['statusline_mode', 'effort_change', 'dashboard_open']);
// Reject any metadata key that smells like content (defence-in-depth; the client
// only ever sends feature flags).
const CONTENT_KEYS = /(prompt|response|content|message|text|code|body)/i;

/**
 * Validate a single transparency event. Pure → testable. Returns { ok, value|error }.
 * @param {unknown} e
 */
export function validateTransparencyEvent(e) {
  if (!e || typeof e !== 'object') return { ok: false, error: 'event must be an object' };
  const ev = /** @type {Record<string, unknown>} */ (e);
  if (typeof ev.event_id !== 'string' || !ev.event_id) return { ok: false, error: 'event_id required' };
  if (typeof ev.device_id !== 'string' || !ev.device_id) return { ok: false, error: 'device_id required' };
  if (typeof ev.ts !== 'number' || !Number.isFinite(ev.ts)) return { ok: false, error: 'ts must be a number' };
  if (ev.event_type !== undefined && !ALLOWED_EVENT_TYPES.has(String(ev.event_type))) {
    return { ok: false, error: `event_type must be one of ${[...ALLOWED_EVENT_TYPES].join(', ')}` };
  }
  let metadata = ev.metadata;
  if (metadata !== undefined && metadata !== null) {
    if (typeof metadata !== 'object') return { ok: false, error: 'metadata must be an object' };
    for (const k of Object.keys(metadata)) {
      if (CONTENT_KEYS.test(k)) return { ok: false, error: `metadata key '${k}' looks like content (features only)` };
    }
  }
  return {
    ok: true,
    value: {
      event_id: ev.event_id,
      device_id: ev.device_id,
      ts: ev.ts,
      event_type: ev.event_type ? String(ev.event_type) : null,
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  };
}

export async function handleTransparency(request, env) {
  if (request.method !== 'POST') return errorResponse('method_not_allowed', 'method_not_allowed');
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('invalid_json', 'bad_request', { message: 'Request body is not valid JSON' });
  }
  const events = Array.isArray(body?.events) ? body.events : body ? [body] : [];
  const valid = [];
  const rejection_reasons = [];
  events.slice(0, 100).forEach((e, i) => {
    const r = validateTransparencyEvent(e);
    if (r.ok) valid.push(r.value);
    else rejection_reasons.push(`#${i}: ${r.error}`);
  });
  if (valid.length === 0) {
    return errorResponse('no_valid_events', 'validation', { message: 'no valid transparency events', issues: rejection_reasons });
  }
  const receivedAt = new Date().toISOString();
  try {
    for (const v of valid) {
      await env.DB.prepare(
        `INSERT INTO transparency_events (event_id, device_id, ts, event_type, metadata, received_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(event_id) DO NOTHING`,
      ).bind(v.event_id, v.device_id, v.ts, v.event_type, v.metadata, receivedAt).run();
    }
  } catch (e) {
    return errorResponse('db_error', classifyException(e), { message: e.message });
  }
  return new Response(JSON.stringify({ accepted: valid.length, rejected: rejection_reasons.length, rejection_reasons }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Validate a forget-me request. Pure. */
export function validateForgetMe(b) {
  if (!b || typeof b !== 'object') return { ok: false, error: 'body must be an object' };
  if (typeof b.device_id !== 'string' || !b.device_id) return { ok: false, error: 'device_id required' };
  if (typeof b.ts !== 'number' || !Number.isFinite(b.ts)) return { ok: false, error: 'ts must be a number' };
  return { ok: true, value: { device_id: b.device_id, ts: b.ts, signature: typeof b.signature === 'string' ? b.signature : null } };
}

export async function handleForgetMe(request, env) {
  if (request.method !== 'POST') return errorResponse('method_not_allowed', 'method_not_allowed');
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('invalid_json', 'bad_request', { message: 'Request body is not valid JSON' });
  }
  const r = validateForgetMe(body);
  if (!r.ok) return errorResponse('invalid_forget_me', 'validation', { message: r.error });
  const receivedAt = new Date().toISOString();
  try {
    await env.DB.prepare(
      `INSERT INTO forget_me_requests (device_id, ts, signature, status, received_at)
       VALUES (?, ?, ?, 'queued', ?)
       ON CONFLICT(device_id) DO UPDATE SET ts=excluded.ts, signature=excluded.signature, status='queued', received_at=excluded.received_at`,
    ).bind(r.value.device_id, r.value.ts, r.value.signature, receivedAt).run();
  } catch (e) {
    return errorResponse('db_error', classifyException(e), { message: e.message });
  }
  return new Response(JSON.stringify({ status: 'queued', device_id: r.value.device_id }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' },
  });
}

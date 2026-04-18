/**
 * heartbeat.js — POST /api/device-heartbeat
 *
 * Receives a device heartbeat from an install.sh run or a live client.
 * Purpose: confirm install success and track device fleet (hw/sw distribution)
 * without tying to PII. Stored in D1 table `device_heartbeats`.
 *
 * Expected body:
 *   {
 *     device_id: string (UUID),
 *     setup_version: string (e.g. "install.sh@v0.9.4"),
 *     event: "install_start" | "install_ok" | "install_fail" | "alive",
 *     hw_tier: string,
 *     sub_profile: string,
 *     platform: string,
 *     node_version: string,
 *     claude_code_version: string,
 *     error?: string (only on install_fail),
 *     ts: ISO string (client clock — informational)
 *   }
 */

import { uuid } from '../lib/anomaly.js';
import { sanitizeJson } from '../lib/sanitize.js';
import { heartbeatBodySchema } from '../lib/schemas.js';

const MAX_FIELD_LEN = 256;

function capped(value) {
  if (value == null) return null;
  const s = String(value);
  return s.length > MAX_FIELD_LEN ? s.slice(0, MAX_FIELD_LEN) : s;
}

export async function handleHeartbeat(request, env) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405 });
  }

  let body;
  try {
    body = sanitizeJson(await request.json());
  } catch {
    return new Response(JSON.stringify({ error: 'invalid JSON' }), { status: 400 });
  }

  // Sprint 5.1 — Zod validation. Replaces the ad-hoc validate() + VALID_*
  // Sets with a single schema in hub/lib/schemas.js.
  const parsed = heartbeatBodySchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({
      path: i.path.join('.') || '<root>',
      message: i.message,
    }));
    return new Response(JSON.stringify({ error: 'validation_failed', issues }), { status: 422 });
  }
  body = parsed.data;

  const id = uuid();
  const receivedAt = new Date().toISOString();
  const clientTs = typeof body.ts === 'string' ? body.ts : null;

  try {
    await env.DB.prepare(`
      INSERT INTO device_heartbeats (
        id, device_id, event, setup_version, hw_tier, sub_profile,
        platform, node_version, claude_code_version, error,
        client_ts, received_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      capped(body.device_id),
      body.event,
      capped(body.setup_version),
      body.hw_tier || 'unknown',
      body.sub_profile || 'unknown',
      capped(body.platform),
      capped(body.node_version),
      capped(body.claude_code_version),
      capped(body.error),
      capped(clientTs),
      receivedAt
    ).run();
  } catch (e) {
    console.error('device-heartbeat db error:', e && e.message);
    return new Response(JSON.stringify({ error: 'internal error' }), { status: 500 });
  }

  return new Response(
    JSON.stringify({ ok: true, id, received_at: receivedAt }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

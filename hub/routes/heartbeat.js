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

const VALID_EVENTS = new Set(['install_start', 'install_ok', 'install_fail', 'alive']);
const VALID_HW_TIERS = new Set(['gpu-high', 'gpu-mid', 'gpu-low', 'apple-silicon', 'cpu-only', 'unknown']);
const VALID_SUB_PROFILES = new Set(['max', 'api-paid', 'api-free', 'none', 'unknown', 'claude_max']);

const MAX_FIELD_LEN = 256;

function capped(value) {
  if (value == null) return null;
  const s = String(value);
  return s.length > MAX_FIELD_LEN ? s.slice(0, MAX_FIELD_LEN) : s;
}

function validate(body) {
  if (!body || typeof body !== 'object') return 'invalid body';
  if (!body.device_id || typeof body.device_id !== 'string') return 'missing device_id';
  if (body.device_id.length > MAX_FIELD_LEN) return 'device_id too long';
  if (!body.event || !VALID_EVENTS.has(body.event)) return 'invalid event';
  if (body.hw_tier && !VALID_HW_TIERS.has(body.hw_tier)) return 'invalid hw_tier';
  if (body.sub_profile && !VALID_SUB_PROFILES.has(body.sub_profile)) return 'invalid sub_profile';
  return null;
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

  const err = validate(body);
  if (err) {
    return new Response(JSON.stringify({ error: err }), { status: 422 });
  }

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

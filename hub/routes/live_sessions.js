/**
 * live_sessions.js — POST/GET /v1/live-sessions (Frente F · cross-machine mirror)
 *
 * Lets a user's OWN cockpits (e.g. a Windows PC and a Mac) see each other's
 * live Claude Code sessions + the latest combined handoff, mirrored through the
 * hub that already exists. Additive — new table (migration 020), new route; no
 * existing schema/endpoint is touched.
 *
 *   POST { device_id, owner_hash, os_type?, device_label?, sessions:[…],
 *          handoff?, totals?, at? }
 *        → upsert this device's snapshot (latest wins, one row per device). 202.
 *
 *   GET  ?owner=<owner_hash>&self=<device_id>&limit=N
 *        → the owner's OTHER devices' snapshots, newest first, with an HONEST
 *          offline calc (online=false + offlineForMin when stale). 200.
 *
 * Identity/privacy: device_id + owner_hash are pseudonymous hashes (Wave 26/30
 * model), NEVER PII. A GET only returns rows sharing the requesting owner_hash,
 * minus the caller's own device. The Zod schema rejects any prompt/code/file
 * content in the payload — only session metadata + an already-local handoff.
 * Auth model α (same as /v1/events): no server secret in a public CLI; the
 * owner_hash is the scope key and is rate-limited per device.
 */

import * as Sentry from '@sentry/cloudflare';
import { sanitizeJson } from '../lib/sanitize.js';
import { liveSessionStateSchema } from '../lib/schemas.js';
import {
  upsertLiveSession, listLiveSessionsByOwner, countRecentLiveSessionsByDevice,
} from '../lib/db.js';

// A device whose last upsert is older than this is reported `online:false`. The
// bg writer pushes every ~10-15s, so 5 min of silence is an honest "offline".
export const LIVE_SESSION_STALE_MIN = 5;

// Anti-hammer: at most one upsert per device per this window (soft, fail-open).
const UPSERT_MIN_INTERVAL_MS = 2000;

const OWNER_RE = /^[a-f0-9]{8,128}$/;

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

/** PURE: shape one stored row → the wire device object with an honest offline calc. */
export function shapeDevice(row, nowMs, staleMin) {
  let payload = {};
  try { payload = JSON.parse(row.payload || '{}'); } catch { payload = {}; }
  const updatedMs = Date.parse(row.updated_at || '') || 0;
  const ageMs = updatedMs > 0 ? Math.max(0, nowMs - updatedMs) : null;
  const offlineForMin = ageMs == null ? null : Math.floor(ageMs / 60000);
  const online = ageMs != null && ageMs < (staleMin * 60000);
  return {
    device_id: row.device_id,
    os_type: row.os_type || 'unknown',
    device_label: row.device_label || null,
    online,
    offlineForMin,
    updatedAt: row.updated_at || null,
    sessions: Array.isArray(payload.sessions) ? payload.sessions : [],
    handoff: typeof payload.handoff === 'string' ? payload.handoff : null,
    totals: payload.totals || null,
  };
}

async function handlePost(request, env) {
  let body;
  try {
    body = sanitizeJson(await request.json());
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const parsed = liveSessionStateSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({
      path: i.path.join('.') || '<root>', message: i.message,
    }));
    return json({ error: 'validation_failed', issues }, 422);
  }
  const s = parsed.data;

  // Soft per-device anti-hammer (fail-open — never block a legit push on a hiccup).
  try {
    const recent = await countRecentLiveSessionsByDevice(env.DB, s.device_id, UPSERT_MIN_INTERVAL_MS);
    if (recent >= 1) {
      return json({ error: 'rate_limited', message: 'One upsert per ~2s per device' }, 429);
    }
  } catch { /* fail open */ }

  const updatedAt = new Date().toISOString();
  try {
    await upsertLiveSession(env.DB, s, updatedAt);
  } catch (e) {
    try { Sentry.captureException(e, { tags: { route: '/v1/live-sessions', kind: 'db_upsert_failed' } }); } catch { /* non-fatal */ }
    return json({ error: 'db_error', detail: e && e.message }, 500);
  }
  return json({ ok: true, updated_at: updatedAt }, 202);
}

async function handleGet(request, env) {
  const url = new URL(request.url);
  const owner = url.searchParams.get('owner');
  const self = url.searchParams.get('self') || '';
  const limit = url.searchParams.get('limit');

  if (!owner || !OWNER_RE.test(owner)) {
    return json({ error: 'bad_owner', message: 'owner must be an 8-128 hex owner_hash' }, 400);
  }

  let rows = [];
  try {
    rows = await listLiveSessionsByOwner(env.DB, owner, self, limit ? Number(limit) : 20);
  } catch (e) {
    try { Sentry.captureException(e, { tags: { route: '/v1/live-sessions', kind: 'db_list_failed' } }); } catch { /* non-fatal */ }
    // Fail-soft: an empty fleet, never a 500 that would blank the cockpit lane.
    return json({ devices: [], stale_min: LIVE_SESSION_STALE_MIN }, 200);
  }

  const nowMs = Date.now();
  const devices = rows.map((r) => shapeDevice(r, nowMs, LIVE_SESSION_STALE_MIN));
  return json({ devices, stale_min: LIVE_SESSION_STALE_MIN }, 200);
}

export async function handleLiveSessions(request, env) {
  if (request.method === 'POST') return handlePost(request, env);
  if (request.method === 'GET') return handleGet(request, env);
  return json({ error: 'method_not_allowed' }, 405);
}

/**
 * feedback.js — POST /api/feedback  ·  GET /api/feedback-list
 *
 * Wave 12 D1-2 (carryover Wave 11 PR-C): anonymous free-text feedback from
 * `mooter feedback "<msg>"`. NO login required. Anon by design, F-1-style
 * rate-limited by salted ip_hash, content PII-rejected (email regex) on top of
 * the client-side check. user_id_hash is optional (sent only by logged-in CLIs).
 *
 * GET /api/feedback-list is admin-only (Bearer === env.FRUGAL_ADMIN_TOKEN) so
 * Paulo can read feedback via `mooter feedback --list`. No PII columns exist.
 */

import { uuid } from '../lib/anomaly.js';
import { sanitizeJson } from '../lib/sanitize.js';
import { insertFeedback, countRecentFeedbackByIp, listFeedback } from '../lib/db.js';
import { errorResponse } from '../lib/errors.js';

const MAX_CONTENT = 1000;
const TOPICS = ['bug', 'feature', 'performance', 'docs', 'other'];
const SEVERITIES = ['low', 'medium', 'high'];
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const RATE_LIMIT = 10;            // per ip_hash
const RATE_WINDOW_MS = 60000;     // 60s

const J = (obj, status) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

async function hashIp(ip, salt) {
  try {
    const data = new TextEncoder().encode(`${salt}:${ip}`);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return 'unknown';
  }
}

const allow = (v, list, dflt) => (list.includes(String(v ?? '').toLowerCase()) ? String(v).toLowerCase() : dflt);

export async function handleFeedback(request, env) {
  // ── GET /api/feedback-list — admin read ──
  if (request.method === 'GET') {
    const auth = request.headers.get('Authorization') || '';
    if (!env.FRUGAL_ADMIN_TOKEN || !auth.startsWith('Bearer ') || auth.slice(7) !== env.FRUGAL_ADMIN_TOKEN) {
      return errorResponse('unauthorized', 'unauthorized');
    }
    try {
      const limit = new URL(request.url).searchParams.get('limit');
      const rows = await listFeedback(env.DB, limit);
      return J({ ok: true, feedback: rows }, 200);
    } catch {
      return errorResponse('internal', 'internal');
    }
  }

  if (request.method !== 'POST') return errorResponse('method_not_allowed', 'method_not_allowed');

  let body;
  try {
    body = sanitizeJson(await request.json());
  } catch {
    return errorResponse('invalid_json', 'bad_request', { message: 'Request body is not valid JSON' });
  }

  const content = String(body.message ?? body.content ?? '').trim();
  if (!content) return errorResponse('validation_failed', 'validation', { message: 'empty feedback' });
  if (EMAIL_RE.test(content)) {
    return errorResponse('validation_failed', 'validation', { message: 'feedback is anonymous — remove the email address' });
  }

  const ipHash = await hashIp(
    request.headers.get('CF-Connecting-IP') || 'none',
    env.FEEDBACK_IP_SALT || 'mooter-feedback'
  );

  // F-1-style rate limit (fail-open).
  try {
    if (await countRecentFeedbackByIp(env.DB, ipHash, RATE_WINDOW_MS) >= RATE_LIMIT) {
      return errorResponse('rate_limited', 'rate_limited', { message: `Too much feedback (max ${RATE_LIMIT}/min)` });
    }
  } catch { /* fail open */ }

  const row = {
    id: uuid(),
    user_id_hash: typeof body.user_id_hash === 'string' ? body.user_id_hash.slice(0, 64) : null,
    content: content.slice(0, MAX_CONTENT),
    topic: allow(body.topic, TOPICS, 'other'),
    severity: allow(body.severity, SEVERITIES, 'low'),
    mooter_version: typeof body.mooter_version === 'string' ? body.mooter_version.slice(0, 32) : null,
    hw_tier: typeof body.hw_tier === 'string' ? body.hw_tier.slice(0, 32)
      : (body.hardware_class && typeof body.hardware_class === 'object' ? String(body.hardware_class.gpu_class || '').slice(0, 32) : null),
    ip_hash: ipHash,
    received_at: new Date().toISOString(),
  };

  try {
    await insertFeedback(env.DB, row);
    return J({ ok: true, id: row.id }, 201);
  } catch {
    return errorResponse('internal', 'internal');
  }
}

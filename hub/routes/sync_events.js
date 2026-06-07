/**
 * sync_events.js — POST /v1/events (Wave 26, 26.A/B/D)
 *
 * The real landing point for `mooter sync` (runSyncReal). The CLI posts
 * `{ events: [MooterSyncEvent] }` — coarse 24h aggregate windows, never
 * per-decision rows or any prompt/code text.
 *
 * Auth model α (Wave 26 decision): NO bearer/admin token is required — putting
 * a server secret in a public open-source CLI would leak it. Clients are
 * identified by `client_id_pseudonymous` (SHA256 of a per-machine secret that
 * never leaves the device) and rate-limited per client. The HMAC signature is
 * stored for audit but is self-signed and NOT hub-verifiable by design.
 *
 * Pastor (26.D) is pull-based: each ingest recomputes the client's cumulative
 * tier mix and returns its routing hint in the response, so the device "pulls"
 * its hint on the very same sync — no cron (Free-plan cron slots are exhausted).
 */

import * as Sentry from '@sentry/cloudflare';
import { sanitizeJson } from '../lib/sanitize.js';
import { syncWindowSchema } from '../lib/schemas.js';
import {
  bindSyncEventInsert, batchInsertSyncEvents, countRecentSyncByClient,
  getPastorState, upsertPastorState,
} from '../lib/db.js';
import { errorResponse, classifyException } from '../lib/errors.js';

// Same fail-open hourly ceiling as /submit-events (5 batches of 100).
export const RATE_LIMIT_PER_HOUR = 500;

// A Pastor hint is only emitted once a client has this many cumulative decisions
// (brief risk table: avoid acting on n=1 noise).
export const PASTOR_MIN_DECISIONS = 20;

function validateWindow(w) {
  const r = syncWindowSchema.safeParse(w);
  if (r.success) return null;
  const first = r.error.issues[0];
  const path = first.path.join('.') || '<root>';
  return `${path}: ${first.message}`;
}

/**
 * Derive a routing hint from the client's cumulative tier mix + hardware. Pure;
 * returns { total_decisions, rates, hint }. hint is null below threshold.
 */
export function computePastor(agg, ollamaAvailable) {
  const total = agg.T0 + agg.T1 + agg.T2 + agg.T3;
  const rate = (n) => (total > 0 ? +(n / total).toFixed(3) : 0);
  const rates = { t0: rate(agg.T0), t1: rate(agg.T1), t2: rate(agg.T2), t3: rate(agg.T3) };
  let hint = null;
  if (total >= PASTOR_MIN_DECISIONS) {
    if (ollamaAvailable !== true && rates.t0 < 0.2) {
      hint = { code: 'install_ollama', message: 'You route little to free local T0. Installing Ollama could cut cost on simple tasks.' };
    } else if (rates.t3 > 0.25) {
      hint = { code: 'high_t3', message: 'Over 25% of your prompts hit T3 Opus. Consider `complexity_bias: T2` in CLAUDE.md for routine work.' };
    } else {
      hint = { code: 'balanced', message: 'Your routing mix looks balanced. No change suggested.' };
    }
  }
  return { total_decisions: total, rates, hint };
}

export async function handleSyncEvents(request, env) {
  if (request.method !== 'POST') {
    return errorResponse('method_not_allowed', 'method_not_allowed');
  }

  let body;
  try {
    body = sanitizeJson(await request.json());
  } catch {
    return errorResponse('invalid_json', 'bad_request', { message: 'Request body is not valid JSON' });
  }

  // Accept both { events: [...] } (CLI) and a bare array.
  const windows = Array.isArray(body) ? body : (body && Array.isArray(body.events) ? body.events : null);
  if (!windows || windows.length === 0) {
    return errorResponse('empty_batch', 'bad_request', { message: 'Body must be a non-empty array (or { events: [...] })' });
  }
  if (windows.length > 100) {
    return errorResponse('batch_too_large', 'bad_request', { message: `Max 100 windows per batch; got ${windows.length}` });
  }

  // Rate-limit by the first window's client (α: the pseudonym is the identity).
  const clientId = windows[0] && windows[0].client_id_pseudonymous;
  if (clientId) {
    let allowed = true;
    try { allowed = (await countRecentSyncByClient(env.DB, clientId)) < RATE_LIMIT_PER_HOUR; } catch { allowed = true; }
    if (!allowed) {
      return errorResponse('rate_limited', 'rate_limited', { message: 'Per-client hourly rate limit exceeded; retry after 1h' });
    }
  }

  const receivedAt = new Date().toISOString();
  const batch = [];
  const rejectionReasons = [];
  let ollamaSeen = null;
  for (const w of windows) {
    const err = validateWindow(w);
    if (err) { rejectionReasons.push(err); continue; }
    batch.push(bindSyncEventInsert(env.DB, w, receivedAt));
    if (w.hardware_info && typeof w.hardware_info.ollama_available === 'boolean') {
      ollamaSeen = w.hardware_info.ollama_available;
    }
  }

  if (batch.length > 0) {
    try {
      await batchInsertSyncEvents(env.DB, batch);
    } catch (e) {
      try { Sentry.captureException(e, { tags: { route: '/v1/events', kind: 'db_batch_failed' } }); } catch { /* non-fatal */ }
      return errorResponse('db_error', classifyException(e), { message: e.message });
    }
  }

  // ── 26.D Pastor: recompute cumulative mix for this client, persist, return hint.
  let pastorHint = null;
  if (clientId && batch.length > 0) {
    try {
      const row = /** @type {any} */ (
        await env.DB.prepare(
          'SELECT SUM(t0) AS T0, SUM(t1) AS T1, SUM(t2) AS T2, SUM(t3) AS T3 FROM sync_events WHERE client_id = ?'
        ).bind(clientId).first()
      );
      const agg = { T0: Number(row?.T0) || 0, T1: Number(row?.T1) || 0, T2: Number(row?.T2) || 0, T3: Number(row?.T3) || 0 };
      const prev = await getPastorState(env.DB, clientId).catch(() => null);
      const ollama = ollamaSeen != null ? ollamaSeen : (prev ? prev.ollama_available === 1 : null);
      const p = computePastor(agg, ollama);
      await upsertPastorState(env.DB, {
        client_id: clientId, total_decisions: p.total_decisions,
        t0_rate: p.rates.t0, t1_rate: p.rates.t1, t2_rate: p.rates.t2, t3_rate: p.rates.t3,
        ollama_available: ollama, hint: p.hint, updated_at: receivedAt,
      });
      pastorHint = p.hint;
    } catch (e) {
      try { Sentry.captureException(e, { tags: { route: '/v1/events', kind: 'pastor_failed' } }); } catch { /* non-fatal */ }
      // Pastor is best-effort; ingestion already succeeded.
    }
  }

  return new Response(JSON.stringify({
    accepted: batch.length,
    rejected: rejectionReasons.length,
    rejection_reasons: rejectionReasons,
    pastor_hint: pastorHint,
    // Wave 28: the pull surface now carries workflow hints alongside the Pastor
    // routing hint. Empty until the workflow engine accumulates patterns — the
    // field exists so clients can rely on its shape. Pastor's own logic is
    // untouched; this is plumbing, not a new Pastor signal.
    workflow_hints: [],
  }), { status: 202, headers: { 'Content-Type': 'application/json' } });
}

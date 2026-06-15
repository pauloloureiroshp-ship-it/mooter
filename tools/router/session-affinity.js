'use strict';

// session-affinity.js — Wave 60 Block B (GAP 2: cache continuity, host-side).
//
// The Anthropic prompt cache is keyed per-model, so changing the routed model
// mid-session abandons the warm prefix (the dollar cost of that is quantified by
// packages/router/src/cache-aware-cost.ts, the engine-side primitive). This module
// is the BEHAVIORAL layer: it records the model a session has been using and, when
// a new prompt would switch to a different model WITHOUT a strong reason, it lets
// the hook surface a `<session-affinity>` note so the agent can choose to stay and
// keep the cache warm. It is purely host-side and deterministic:
//   - it NEVER reads engine KV-cache and NEVER mutates the routing decision (the
//     classifier stays the only thing that picks a tier — NO-PROXY, mission §3/§5),
//   - it NEVER suppresses a strong reason: HIGH_RISK / safety-floor / beast / a big
//     tier jump always take the freshly-classified model, no affinity note.
//
// State: ~/.mooter/session-affinity/<sessionId>.json = { model, tier, ts }.
// Keyed per session, overwritten each turn, ignored when stale (a resumed old
// session starts a fresh cache epoch).

const fs = require('fs');
const path = require('path');
const os = require('os');

const STALE_MS = 12 * 60 * 60 * 1000; // 12h — older affinity is a stale epoch
const TIER_ORDER = ['T0', 'T1', 'T2', 'T3', 'T5'];

function affinityDir() {
  return path.join(process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter'), 'session-affinity');
}

/** Sanitize a session id into a safe flat filename (no path traversal). */
function safeId(sessionId) {
  return String(sessionId || 'nosession').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 128);
}

function statePath(sessionId) {
  return path.join(affinityDir(), `${safeId(sessionId)}.json`);
}

/** The session's established model, or null when none/stale/unreadable. */
function getEstablished(sessionId, now = Date.now()) {
  try {
    const s = JSON.parse(fs.readFileSync(statePath(sessionId), 'utf8'));
    if (!s || typeof s.model !== 'string') return null;
    const ts = Number(s.ts);
    if (!Number.isFinite(ts) || now - ts > STALE_MS) return null;
    return { model: s.model, tier: typeof s.tier === 'string' ? s.tier : null };
  } catch {
    return null;
  }
}

/** Record the model this session is now on. Best-effort; never throws. */
function recordModel(sessionId, model, tier, now = Date.now()) {
  if (!model) return;
  try {
    fs.mkdirSync(affinityDir(), { recursive: true });
    fs.writeFileSync(statePath(sessionId), JSON.stringify({ model, tier: tier || null, ts: now }));
  } catch { /* best-effort */ }
}

/** A "strong reason" forces the freshly-classified model — no affinity note. */
function hasStrongReason(decision) {
  if (!decision) return true;
  if (String(decision.risk_level).toLowerCase() === 'high') return true;
  if (decision.safety_boost_applied === true) return true;
  const esc = String(decision.escalation_rule || '').toLowerCase();
  if (/safety_floor|beast/.test(esc)) return true;
  if (String(decision.active_mode || '').toLowerCase() === 'beast') return true;
  if (decision.user_override && decision.user_override.honored) return true;
  return false;
}

/**
 * Pure: given the prior established model and the fresh decision, return a
 * `<session-affinity>` note string when staying is worth surfacing, else null.
 * Emits ONLY when: an established model exists, the fresh model differs, and there
 * is no strong reason to switch. A big tier jump (≥2 rungs) is treated as a strong
 * signal the task genuinely needs the new tier, so no note.
 */
function affinityNote(established, decision) {
  if (!established || !established.model || !decision) return null;
  const fresh = decision.recommended_model;
  if (!fresh || fresh === established.model) return null; // already continuous
  if (hasStrongReason(decision)) return null;
  const a = TIER_ORDER.indexOf(established.tier);
  const b = TIER_ORDER.indexOf(decision.tier);
  if (a >= 0 && b >= 0 && Math.abs(a - b) >= 2) return null; // big jump ⇒ really needed
  return `<session-affinity>this session has been on ${established.model}; switching to ${fresh} `
    + `abandons the warm prompt cache (re-write the prefix). If ${fresh} is not needed for quality, `
    + `staying on ${established.model} keeps the cache warm. Advisory — routing is unchanged.</session-affinity>`;
}

module.exports = { getEstablished, recordModel, affinityNote, hasStrongReason, STALE_MS };

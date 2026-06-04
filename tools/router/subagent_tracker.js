#!/usr/bin/env node
/**
 * subagent_tracker.js — "Show the Herd" runtime state machine (Wave 13).
 *
 * Tracks the count, identity, and activity of Moo agents (local subagents) and
 * cloud subagents spawned during a Claude Code session, so three renderers can
 * surface them:
 *   - statusline-multi.js : live `🐄×N` chip
 *   - post_tool_badge.js  : per-agent one-liner as spawns finish
 *   - the Stop-hook digest : cumulative "Moos that worked the session" tally
 *
 * Design constraints (Wave 13 non-negotiables):
 *   - PURE runtime state. No `mooter_event` schema fields, no hub telemetry,
 *     no decisions.log writes. State is session-scoped and ephemeral.
 *   - Hooks fire as SEPARATE processes (PreToolUse → PostToolUse → Stop are
 *     distinct node invocations), so module-level Maps cannot survive between
 *     them. State is backed by a per-session JSON file in os.tmpdir(), mirroring
 *     the existing `mooter-statusline-tick-<session>` pattern. reset() (called by
 *     the Stop hook AFTER rendering the digest) deletes the file.
 *   - Idempotent by spawn_id: a duplicate trackSpawn / trackComplete for the same
 *     spawn_id is a no-op (handles PostToolUse-before-PreToolUse races, §5).
 *   - Best-effort I/O: every fs operation is wrapped; a read/write failure
 *     degrades to an empty herd and NEVER throws. A hook must never crash the
 *     tool it is observing.
 *   - No prompt text. Only {agent_name, tier, model, duration_ms} ever stored.
 *
 * Pure Node built-ins. No deps.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const STATE_VERSION = 1;

// Local agents run on the user's own hardware (Ollama) — they are Moos (🐄).
// Everything else is a cloud subagent (☁) and is tracked but not counted as a
// Moo. Display names stay canonical (§5: never rename to "Summarizer Moo").
const LOCAL_AGENTS = new Set(['local-summarizer', 'local-transformer']);

// Model-name fragments that imply a local Ollama model (covers cheap-triage's
// keyless fallback to Ollama, and any Adapter Forge / dora-* adapter name).
const LOCAL_MODEL_RE = /(ollama|qwen|gemma|deepseek|llama|mistral|phi|dora|lora|adapter)/i;

/**
 * Classify a spawn as a local Moo (🐄) or a cloud agent (☁).
 * Precedence: explicit local agent name → local model fragment → tier T0 → cloud.
 */
function isLocalMoo({ agent_name, tier, model } = {}) {
  if (agent_name && LOCAL_AGENTS.has(String(agent_name))) return true;
  if (model && LOCAL_MODEL_RE.test(String(model))) return true;
  if (tier && String(tier).toUpperCase() === 'T0') return true;
  return false;
}

// ────────────────────────────────────────────────────────────────────────
// State file
// ────────────────────────────────────────────────────────────────────────

function sanitizeSession(sessionId) {
  // tmp filenames must be safe across OSes; keep only word chars and dashes.
  const s = sessionId == null ? '' : String(sessionId);
  const safe = s.replace(/[^\w-]/g, '').slice(0, 96);
  return safe || 'global';
}

function statePath(sessionId) {
  return path.join(os.tmpdir(), `mooter-herd-${sanitizeSession(sessionId)}.json`);
}

function emptyState() {
  return { version: STATE_VERSION, active: {}, cumulative: {}, peak_concurrent: 0 };
}

function readState(sessionId) {
  try {
    const raw = fs.readFileSync(statePath(sessionId), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return emptyState();
    return {
      version: STATE_VERSION,
      active: parsed.active && typeof parsed.active === 'object' ? parsed.active : {},
      cumulative: parsed.cumulative && typeof parsed.cumulative === 'object' ? parsed.cumulative : {},
      peak_concurrent: Number(parsed.peak_concurrent) || 0,
    };
  } catch {
    return emptyState();
  }
}

function writeState(sessionId, state) {
  try {
    fs.writeFileSync(statePath(sessionId), JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

// Monotonic-ish id when Claude Code does not hand us a spawn_id. Not relied on
// for idempotency (CC's spawn_id is); only a fallback so trackSpawn always has a
// key. Combines time + a per-process counter to avoid collisions within a run.
let _seq = 0;
function genSpawnId() {
  _seq = (_seq + 1) % 1e6;
  return `m-${Date.now().toString(36)}-${_seq.toString(36)}`;
}

function now() {
  return Date.now();
}

// ────────────────────────────────────────────────────────────────────────
// API
// ────────────────────────────────────────────────────────────────────────

/**
 * Record a subagent spawn. Idempotent by spawn_id.
 * @returns {string} the spawn_id (generated if not supplied)
 */
function trackSpawn({ agent_name, tier, model, spawn_id, session_id } = {}) {
  const id = spawn_id || genSpawnId();
  const state = readState(session_id);

  // Idempotent: a duplicate PreToolUse for the same spawn is a no-op. If the
  // spawn already completed (PostToolUse arrived first), don't resurrect it.
  if (state.active[id] || (state.cumulative.__done_ids && state.cumulative.__done_ids[id])) {
    return id;
  }

  const local = isLocalMoo({ agent_name, tier, model });
  state.active[id] = {
    agent_name: agent_name || 'unknown',
    tier: tier || null,
    model: model || null,
    local,
    started_at: now(),
  };

  const activeCount = Object.keys(state.active).length;
  if (activeCount > state.peak_concurrent) state.peak_concurrent = activeCount;

  writeState(session_id, state);
  return id;
}

function _finish(spawn_id, { duration_ms, error_class, session_id, agent_name, tier, model } = {}) {
  if (!spawn_id) return false;
  const state = readState(session_id);
  const entry = state.active[spawn_id];

  // Mark this id as done so a late PreToolUse cannot re-add it (race guard).
  if (!state.cumulative.__done_ids) state.cumulative.__done_ids = {};
  if (state.cumulative.__done_ids[spawn_id]) return false; // idempotent
  state.cumulative.__done_ids[spawn_id] = 1;

  // If PostToolUse arrived without a matching active entry (completion-before-
  // spawn race), fall back to the agent metadata the hook passes — PostToolUse
  // knows the agent identity too. Only 'unknown' when neither source has it.
  const agent = (entry && entry.agent_name) || agent_name || 'unknown';
  const aModel = (entry && entry.model) || model || null;
  const aTier = (entry && entry.tier) || tier || null;
  const local = entry ? entry.local : isLocalMoo({ agent_name, tier, model });
  const dur = Number.isFinite(Number(duration_ms))
    ? Number(duration_ms)
    : entry ? Math.max(0, now() - entry.started_at) : 0;

  const c = state.cumulative[agent] || { count: 0, total_ms: 0, errors: 0, local };
  c.count += 1;
  c.total_ms += dur;
  if (error_class) c.errors += 1;
  c.local = local;
  // Carry the model/tier so the Stop digest can label cloud agents
  // (☁ model-reasoner · sonnet). Real data; last spawn of the class wins.
  if (aModel) c.model = aModel;
  if (aTier) c.tier = aTier;
  c.last_seen = now();
  state.cumulative[agent] = c;

  if (entry) delete state.active[spawn_id];

  writeState(session_id, state);
  return true;
}

/** Move a spawn from active → cumulative. Idempotent by spawn_id. */
function trackComplete(spawn_id, opts = {}) {
  return _finish(spawn_id, opts);
}

/** Like trackComplete but records an error against the agent class. */
function trackError(spawn_id, opts = {}) {
  return _finish(spawn_id, { ...opts, error_class: opts.error_class || 'error' });
}

/**
 * Read-only view of the herd for the renderers.
 * @returns {{
 *   active_count:number, active_local:number, active_cloud:number,
 *   active:Array, by_agent:Object, peak_concurrent:number, cumulative:Array
 * }}
 */
function snapshot({ session_id } = {}) {
  const state = readState(session_id);
  const active = Object.entries(state.active).map(([id, v]) => ({ spawn_id: id, ...v }));
  const active_local = active.filter((a) => a.local).length;

  // Active grouped by agent class (for the live per-agent chip).
  const by_agent = {};
  for (const a of active) {
    by_agent[a.agent_name] = by_agent[a.agent_name] || { count: 0, local: a.local, tier: a.tier, model: a.model };
    by_agent[a.agent_name].count += 1;
  }

  const cumulative = Object.entries(state.cumulative)
    .filter(([k]) => k !== '__done_ids')
    .map(([agent_name, v]) => ({
      agent_name,
      count: v.count,
      total_ms: v.total_ms,
      avg_ms: v.count ? Math.round(v.total_ms / v.count) : 0,
      errors: v.errors || 0,
      local: !!v.local,
      model: v.model || null,
      tier: v.tier || null,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    active_count: active.length,
    active_local,
    active_cloud: active.length - active_local,
    active,
    by_agent,
    peak_concurrent: state.peak_concurrent || 0,
    cumulative,
  };
}

/** Clear all state for the session. Stop hook calls this AFTER the digest. */
function reset({ session_id } = {}) {
  try {
    fs.unlinkSync(statePath(session_id));
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  trackSpawn,
  trackComplete,
  trackError,
  snapshot,
  reset,
  // exported for tests / renderers
  isLocalMoo,
  statePath,
  STATE_VERSION,
};

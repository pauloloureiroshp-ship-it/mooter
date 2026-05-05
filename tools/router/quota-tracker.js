#!/usr/bin/env node
/**
 * quota-tracker.js — central state for all provider quotas.
 *
 * Tracks rolling 5h windows (Anthropic + Codex CLI), daily token/cost
 * counters (OpenAI API direct + Anthropic), and a simple weekly counter
 * for the Codex CLI weekly cap.
 *
 * Readers (classify.js, statusline-multi.js, providers/*) call:
 *   - getState()                       → full snapshot
 *   - getQuotaRemaining(provider)      → 0..1 fraction (1 = fully fresh)
 *   - shouldPreferCodex()              → bool, true if >20% Codex remaining
 *
 * Writers (providers/codex-cli.js, providers/openai-api.js) call:
 *   - recordUsage(provider, payload)   → append usage; auto-rolls windows
 *   - resetIfExpired()                 → idempotent; called on every read
 *
 * Storage:
 *   - tools/router/quota-state.json (versioned schema, JSON)
 *   - File-locked at single-process granularity by atomic rename.
 *
 * Additive only — does not modify any other router file. Safe to import
 * even if quota-state.json does not yet exist (returns sensible defaults).
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { ROUTER_DIR } = require('./paths');

const STATE_PATH = path.join(ROUTER_DIR, 'quota-state.json');
const SCHEMA_VERSION = 1;

const FIVE_HOURS_MS    = 5 * 60 * 60 * 1000;
const TWENTY_FOUR_H_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS    = 7 * 24 * 60 * 60 * 1000;

// Allow overrides from environment for non-Plus users.
const ANTHROPIC_5H_TOKEN_LIMIT =
  Number(process.env.MOOTER_ANTHROPIC_5H_LIMIT) || 200000;
const CODEX_5H_MSG_LIMIT =
  Number(process.env.MOOTER_CODEX_5H_LIMIT) || 150;

const PROVIDERS = ['anthropic', 'openai_codex_cli', 'openai_api', 'ollama'];

function defaultState() {
  return {
    version: SCHEMA_VERSION,
    providers: {
      anthropic: {
        window_5h: {
          tokens_used: 0,
          reset_at: null,
          limit: ANTHROPIC_5H_TOKEN_LIMIT,
        },
        today: { tokens: 0, cost_usd: 0, reset_at: null },
      },
      openai_codex_cli: {
        window_5h: {
          messages_used: 0,
          reset_at: null,
          limit: CODEX_5H_MSG_LIMIT,
        },
        weekly: { pct_used: 0, reset_at: null },
        last_status_check: null,
        exhausted: false,
      },
      openai_api: {
        today: { tokens_in: 0, tokens_out: 0, cost_usd: 0, reset_at: null },
      },
      ollama: {
        today: { calls: 0, reset_at: null },
      },
    },
    last_updated: null,
  };
}

function readRaw() {
  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== SCHEMA_VERSION) return defaultState();
    return mergeWithDefaults(parsed);
  } catch {
    return defaultState();
  }
}

function mergeWithDefaults(state) {
  const base = defaultState();
  const out  = { ...base, ...state };
  out.providers = { ...base.providers, ...(state.providers || {}) };
  for (const p of PROVIDERS) {
    out.providers[p] = { ...base.providers[p], ...(state.providers[p] || {}) };
  }
  return out;
}

function writeAtomic(state) {
  state.last_updated = new Date().toISOString();
  const tmp = `${STATE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_PATH);
  return state;
}

function nowMs() { return Date.now(); }

function rollWindow(target, fields, intervalMs) {
  if (!target.reset_at || nowMs() >= new Date(target.reset_at).getTime()) {
    for (const f of fields) target[f] = 0;
    target.reset_at = new Date(nowMs() + intervalMs).toISOString();
    return true;
  }
  return false;
}

function resetIfExpired(stateIn) {
  const state = stateIn || readRaw();
  let changed = false;

  changed = rollWindow(state.providers.anthropic.window_5h,
    ['tokens_used'], FIVE_HOURS_MS) || changed;
  changed = rollWindow(state.providers.anthropic.today,
    ['tokens', 'cost_usd'], TWENTY_FOUR_H_MS) || changed;

  changed = rollWindow(state.providers.openai_codex_cli.window_5h,
    ['messages_used'], FIVE_HOURS_MS) || changed;
  if (rollWindow(state.providers.openai_codex_cli.weekly,
        ['pct_used'], SEVEN_DAYS_MS)) {
    state.providers.openai_codex_cli.exhausted = false;
    changed = true;
  }

  changed = rollWindow(state.providers.openai_api.today,
    ['tokens_in', 'tokens_out', 'cost_usd'], TWENTY_FOUR_H_MS) || changed;
  changed = rollWindow(state.providers.ollama.today,
    ['calls'], TWENTY_FOUR_H_MS) || changed;

  if (changed && stateIn === undefined) writeAtomic(state);
  return state;
}

function getState() {
  return resetIfExpired();
}

/**
 * Append usage for a provider. Payload shape varies per provider:
 *   anthropic        → { tokens, cost_usd? }
 *   openai_codex_cli → { messages = 1, exhausted? = false }
 *   openai_api       → { tokens_in, tokens_out, cost_usd }
 *   ollama           → { calls = 1 }
 */
function recordUsage(provider, payload = {}) {
  if (!PROVIDERS.includes(provider)) {
    throw new Error(`quota-tracker: unknown provider "${provider}"`);
  }
  const state = resetIfExpired(readRaw());
  const p = state.providers[provider];

  switch (provider) {
    case 'anthropic': {
      const tokens   = Number(payload.tokens)   || 0;
      const costUsd  = Number(payload.cost_usd) || 0;
      p.window_5h.tokens_used += tokens;
      p.today.tokens          += tokens;
      p.today.cost_usd        += costUsd;
      break;
    }
    case 'openai_codex_cli': {
      const msgs = Number(payload.messages) || 1;
      p.window_5h.messages_used += msgs;
      if (payload.exhausted === true) p.exhausted = true;
      p.last_status_check = new Date().toISOString();
      break;
    }
    case 'openai_api': {
      p.today.tokens_in  += Number(payload.tokens_in)  || 0;
      p.today.tokens_out += Number(payload.tokens_out) || 0;
      p.today.cost_usd   += Number(payload.cost_usd)   || 0;
      break;
    }
    case 'ollama': {
      p.today.calls += Number(payload.calls) || 1;
      break;
    }
  }
  return writeAtomic(state);
}

/**
 * Returns the fraction of the most-relevant quota that is still available.
 * 1.0 means fully fresh; 0 means exhausted.
 *   - anthropic        → 1 - tokens_used/limit (5h window)
 *   - openai_codex_cli → 1 - messages_used/limit (5h window), 0 if exhausted
 *   - openai_api       → always 1 (no quota tracked client-side; pay-per-call)
 *   - ollama           → always 1 (local, free)
 */
function getQuotaRemaining(provider) {
  const state = getState();
  const p = state.providers[provider];
  if (!p) return 0;

  switch (provider) {
    case 'anthropic': {
      const w = p.window_5h;
      if (!w.limit) return 1;
      return clamp01(1 - (w.tokens_used / w.limit));
    }
    case 'openai_codex_cli': {
      if (p.exhausted) return 0;
      const w = p.window_5h;
      if (!w.limit) return 1;
      return clamp01(1 - (w.messages_used / w.limit));
    }
    case 'openai_api':
    case 'ollama':
    default:
      return 1;
  }
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }

/**
 * Heuristic the classifier consults: prefer Codex CLI if it still has a
 * comfortable cushion of quota left in the current 5h window. Threshold is
 * intentionally conservative (>20%) so we save Anthropic budget without
 * stranding code generation right before Codex hits its cap.
 */
function shouldPreferCodex() {
  const remaining = getQuotaRemaining('openai_codex_cli');
  return remaining > 0.20;
}

/** Convenience: snapshot used by inject_context.js to print quota lines. */
function summary() {
  const state = getState();
  const anth  = getQuotaRemaining('anthropic');
  const cdx   = getQuotaRemaining('openai_codex_cli');
  return {
    anthropic_remaining_pct: Math.round(anth * 100),
    codex_remaining_pct:     Math.round(cdx * 100),
    codex_exhausted:         !!state.providers.openai_codex_cli.exhausted,
    anthropic_5h_reset_at:   state.providers.anthropic.window_5h.reset_at,
    codex_5h_reset_at:       state.providers.openai_codex_cli.window_5h.reset_at,
    today_cost_usd: round2(
      (state.providers.anthropic.today.cost_usd || 0) +
      (state.providers.openai_api.today.cost_usd || 0)
    ),
  };
}

function round2(x) { return Math.round(x * 100) / 100; }

module.exports = {
  STATE_PATH,
  SCHEMA_VERSION,
  PROVIDERS,
  getState,
  recordUsage,
  getQuotaRemaining,
  shouldPreferCodex,
  resetIfExpired,
  summary,
};

// CLI usage: `node quota-tracker.js`            → prints summary
//            `node quota-tracker.js state`      → prints full state
//            `node quota-tracker.js reset`      → forces window reset write
if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === 'state') {
    process.stdout.write(JSON.stringify(getState(), null, 2) + '\n');
  } else if (cmd === 'reset') {
    const s = defaultState();
    writeAtomic(s);
    process.stdout.write('quota-state.json reset to defaults\n');
  } else {
    process.stdout.write(JSON.stringify(summary(), null, 2) + '\n');
  }
}

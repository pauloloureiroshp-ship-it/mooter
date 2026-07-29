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

// @ts-check
'use strict';

/**
 * @typedef {'anthropic' | 'openai_codex_cli' | 'openai_api' | 'ollama'} ProviderName
 *
 * @typedef {{
 *   version: number,
 *   providers: {
 *     anthropic: {
 *       window_5h: { tokens_used: number, reset_at: string | null, limit: number },
 *       today:     { tokens: number, cost_usd: number, reset_at: string | null },
 *     },
 *     openai_codex_cli: {
 *       window_5h: { messages_used: number, reset_at: string | null, limit: number },
 *       weekly:    { pct_used: number, reset_at: string | null },
 *       last_status_check: string | null,
 *       exhausted: boolean,
 *     },
 *     openai_api: {
 *       today: { tokens_in: number, tokens_out: number, cost_usd: number, reset_at: string | null },
 *     },
 *     ollama: {
 *       today: { calls: number, reset_at: string | null },
 *     },
 *   },
 *   last_updated: string | null,
 * }} QuotaState
 *
 * @typedef {{ tokens?: number, cost_usd?: number }}                                 AnthropicUsage
 * @typedef {{ messages?: number, exhausted?: boolean }}                             CodexCliUsage
 * @typedef {{ tokens_in?: number, tokens_out?: number, cost_usd?: number }}         OpenAIApiUsage
 * @typedef {{ calls?: number }}                                                     OllamaUsage
 * @typedef {AnthropicUsage | CodexCliUsage | OpenAIApiUsage | OllamaUsage}          UsagePayload
 */

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

/** @type {ProviderName[]} */
const PROVIDERS = ['anthropic', 'openai_codex_cli', 'openai_api', 'ollama'];

/** @returns {QuotaState} */
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

/** @returns {QuotaState} */
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

/**
 * @param {Partial<QuotaState>} state
 * @returns {QuotaState}
 */
function mergeWithDefaults(state) {
  const base = defaultState();
  /** @type {QuotaState} */
  const out  = /** @type {QuotaState} */ ({ ...base, ...state });
  /** @type {any} */
  const inputProviders = state.providers || {};
  /** @type {any} */
  const merged = { ...base.providers };
  for (const p of PROVIDERS) {
    merged[p] = { ...base.providers[p], ...(inputProviders[p] || {}) };
  }
  out.providers = merged;
  return out;
}

/**
 * @param {QuotaState} state
 * @returns {QuotaState}
 */
function writeAtomic(state) {
  state.last_updated = new Date().toISOString();
  const tmp = `${STATE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_PATH);
  return state;
}

function nowMs() { return Date.now(); }

/**
 * @param {Record<string, any>} target
 * @param {string[]} fields
 * @param {number} intervalMs
 * @returns {boolean}
 */
function rollWindow(target, fields, intervalMs) {
  if (!target.reset_at || nowMs() >= new Date(target.reset_at).getTime()) {
    for (const f of fields) target[f] = 0;
    target.reset_at = new Date(nowMs() + intervalMs).toISOString();
    return true;
  }
  return false;
}

/**
 * @param {QuotaState} [stateIn]
 * @returns {QuotaState}
 */
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

/** @returns {QuotaState} */
function getState() {
  return resetIfExpired();
}

/**
 * Append usage for a provider. Payload shape varies per provider:
 *   anthropic        → { tokens, cost_usd? }
 *   openai_codex_cli → { messages = 1, exhausted? = false }
 *   openai_api       → { tokens_in, tokens_out, cost_usd }
 *   ollama           → { calls = 1 }
 *
 * @param {ProviderName} provider
 * @param {UsagePayload} [payload]
 * @returns {QuotaState}
 */
function recordUsage(provider, payload = {}) {
  if (!PROVIDERS.includes(provider)) {
    throw new Error(`quota-tracker: unknown provider "${provider}"`);
  }
  const state = resetIfExpired(readRaw());

  switch (provider) {
    case 'anthropic': {
      const p = state.providers.anthropic;
      const a = /** @type {AnthropicUsage} */ (payload);
      const tokens   = Number(a.tokens)   || 0;
      const costUsd  = Number(a.cost_usd) || 0;
      p.window_5h.tokens_used += tokens;
      p.today.tokens          += tokens;
      p.today.cost_usd        += costUsd;
      break;
    }
    case 'openai_codex_cli': {
      const p = state.providers.openai_codex_cli;
      const c = /** @type {CodexCliUsage} */ (payload);
      const msgs = Number(c.messages) || 1;
      p.window_5h.messages_used += msgs;
      if (c.exhausted === true) p.exhausted = true;
      p.last_status_check = new Date().toISOString();
      break;
    }
    case 'openai_api': {
      const p = state.providers.openai_api;
      const o = /** @type {OpenAIApiUsage} */ (payload);
      p.today.tokens_in  += Number(o.tokens_in)  || 0;
      p.today.tokens_out += Number(o.tokens_out) || 0;
      p.today.cost_usd   += Number(o.cost_usd)   || 0;
      break;
    }
    case 'ollama': {
      const p = state.providers.ollama;
      const ol = /** @type {OllamaUsage} */ (payload);
      p.today.calls += Number(ol.calls) || 1;
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
/**
 * @param {ProviderName} provider
 * @returns {number}
 */
function getQuotaRemaining(provider) {
  // MP-Q Q2 — official-first: a fresh statusline rate_limits snapshot beats
  // our own estimates; the estimate below remains the fallback. Numeric
  // contract unchanged for every existing reader.
  return getQuotaRemainingDetailed(provider).remaining;
}

/**
 * The pre-Q2 estimate path (rolling token windows recorded by providers).
 * @param {ProviderName} provider
 * @returns {number}
 */
function getQuotaRemainingEstimated(provider) {
  const state = getState();

  switch (provider) {
    case 'anthropic': {
      const w = state.providers.anthropic.window_5h;
      if (!w.limit) return 1;
      return clamp01(1 - (w.tokens_used / w.limit));
    }
    case 'openai_codex_cli': {
      const p = state.providers.openai_codex_cli;
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

/** @param {number} x @returns {number} */
function clamp01(x) { return Math.max(0, Math.min(1, x)); }

// ── MP-Q Q2 — official-first quota (additive) ───────────────────────────────
// quota-live.json carries the OFFICIAL rate_limits Claude Code pipes to the
// wired statusline (see quota-live.js). When that snapshot is fresh (≤10 min)
// it beats our own token estimates; the estimate becomes the fallback. Every
// consumer can see which one it got via `basis: "official" | "estimated"`.

/**
 * Fresh official quota snapshot, or null (missing / stale / unreadable).
 * @returns {Record<string, any> | null}
 */
function getOfficialQuota() {
  try {
    const live = require('./quota-live.js').readQuotaLive();
    return live && live.fresh ? live : null;
  } catch {
    return null;
  }
}

/**
 * Like getQuotaRemaining, but says WHERE the number came from.
 * For 'anthropic' with fresh official data, remaining is computed from the
 * most-binding window (max of 5h/7d percent used) — for a subscription user
 * the weekly window is usually the one that actually runs out.
 * @param {ProviderName} provider
 * @returns {{remaining: number, basis: 'official'|'estimated',
 *            five_hour_pct?: number|null, seven_day_pct?: number|null,
 *            opus_or_fable_pct?: number|null, resets?: Record<string, string|null>}}
 */
function getQuotaRemainingDetailed(provider) {
  if (provider === 'anthropic') {
    const live = getOfficialQuota();
    if (live) {
      const used = Math.max(live.five_hour_pct || 0, live.seven_day_pct || 0);
      return {
        remaining: clamp01(1 - used / 100),
        basis: 'official',
        five_hour_pct: live.five_hour_pct,
        seven_day_pct: live.seven_day_pct,
        opus_or_fable_pct: live.opus_or_fable_pct,
        resets: live.resets,
      };
    }
  }
  return { remaining: getQuotaRemainingEstimated(provider), basis: 'estimated' };
}

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
  const anthD = getQuotaRemainingDetailed('anthropic');
  const cdx   = getQuotaRemaining('openai_codex_cli');
  return {
    anthropic_remaining_pct: Math.round(anthD.remaining * 100),
    // MP-Q Q2 — honesty fields: where the anthropic number came from, plus
    // the official weekly window when we have it (the Max-user constraint).
    anthropic_basis: anthD.basis,
    anthropic_weekly_pct: anthD.basis === 'official' && typeof anthD.seven_day_pct === 'number'
      ? anthD.seven_day_pct : null,
    anthropic_five_hour_pct: anthD.basis === 'official' && typeof anthD.five_hour_pct === 'number'
      ? anthD.five_hour_pct : null,
    anthropic_weekly_reset_at: anthD.basis === 'official' && anthD.resets
      ? (anthD.resets.seven_day || null) : null,
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

/** @param {number} x @returns {number} */
function round2(x) { return Math.round(x * 100) / 100; }

module.exports = {
  STATE_PATH,
  SCHEMA_VERSION,
  PROVIDERS,
  getState,
  recordUsage,
  getQuotaRemaining,
  getQuotaRemainingEstimated,
  getQuotaRemainingDetailed,
  getOfficialQuota,
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

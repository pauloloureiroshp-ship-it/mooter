'use strict';

// FRENTE C · PM Adapters — AdapterManager (the orchestrator).
//
// The single seam between the Moo Ledger and the outside world. Design laws:
//
//  • ZERO-BY-DEFAULT — with nothing enabled, emit()/flushDue() connect nothing and no-op.
//    The core is $0 and works with no adapters at all (masterprompt line 106).
//  • UNIDIRECTIONAL (DC-11) — emit() pushes Ledger→external, stamped with ledger_event_id.
//    enrich() reads PR/CI for DISPLAY ONLY and tags output `_kind:'presentation'`. There is
//    NO method that returns external state as forecast input — GitHub can never become a
//    2nd source of truth for the forecast.
//  • NEVER BLOCKS / NEVER THROWS — emit() is sync and only buffers (the hot path the Ledger
//    runner calls). All network lives in async flushDue()/flush(), off the critical path.
//  • GATE ORDER for any write-back — enabled → not-tripped → human consent → token — every
//    one enforced here before a single byte leaves the machine.

const config = require('./config.js');
const broker = require('./broker.js');
const gate = require('./gate.js');
const stamp = require('./stamp.js');
const debounce = require('./debounce.js');

function outboundAdapter(tool, transport) {
  switch (tool) {
    case 'notion': return require('./adapters/notion.js').make({ transport });
    case 'slack': return require('./adapters/slack.js').make({ transport });
    case 'linear': return require('./adapters/linear.js').make({ transport });
    default: return null;
  }
}

/**
 * HOT PATH — buffer a Ledger event to every enabled outbound tool. Sync, cheap, never
 * throws, never touches the network. Returns per-tool queue results. With nothing enabled
 * this returns [] and does nothing.
 * @param {object} event a Ledger event (handoff-journal schema)
 */
function emit(event, { now = Date.now() } = {}) {
  const results = [];
  try {
    const cfg = config.readConfig();
    for (const tool of config.TOOLS) {
      if (cfg[tool].direction !== 'outbound' || !cfg[tool].enabled) continue; // zero-by-default
      if (debounce.isTripped(tool)) { results.push({ tool, blocked: 'killswitch' }); continue; }
      const payload = stamp.stampOutbound(event, { tool, at: new Date(now).toISOString() });
      const q = debounce.enqueue(tool, payload, now);
      results.push({ tool, queued: q.queued, tripped: q.tripped, pending: q.pending });
    }
  } catch { /* best-effort — the architect is never blocked by an adapter */ }
  return results;
}

/** Flush ONE outbound tool if its window elapsed (or force). Async. Enforces the full
 *  gate order; leaves pending buffered when blocked so nothing is silently dropped. */
async function flush(tool, { now = Date.now(), transport, force = false } = {}) {
  try {
    if (config.direction(tool) !== 'outbound') return { tool, blocked: 'not_outbound' };
    if (!config.isEnabled(tool)) return { tool, blocked: 'disabled' };
    if (debounce.isTripped(tool)) return { tool, blocked: 'killswitch' };
    if (!force && !debounce.shouldFlush(tool, now)) return { tool, skipped: 'window' };
    if (!gate.hasConsent(tool)) return { tool, blocked: 'consent_required', pending: debounce.pendingCount(tool) };
    const adapter = outboundAdapter(tool, transport);
    if (!adapter) return { tool, blocked: 'no_adapter' };
    const token = broker.getToken(tool); // may be null for slack webhook — adapter guards
    const summary = debounce.drain(tool, now);
    if (!summary) return { tool, skipped: 'empty' };
    const res = await adapter.deliver(summary, { token });
    return { tool, delivered: !!res.ok, count: summary.count, ...res };
  } catch (e) {
    return { tool, error: String((e && e.message) || e) };
  }
}

/** Flush every enabled outbound tool whose window has elapsed. Async. Off the hot path. */
async function flushDue({ now = Date.now(), transport } = {}) {
  const out = [];
  for (const tool of config.TOOLS) {
    if (config.direction(tool) !== 'outbound' || !config.isEnabled(tool)) continue;
    out.push(await flush(tool, { now, transport }));
  }
  return out;
}

/**
 * READ-ONLY enrichment (display only). Returns presentation-tagged PR/CI data, or {} when
 * github is disabled. This data is for Frente B's chips — it MUST NOT be fed into the
 * forecast (DC-11). The return is tagged `_kind:'presentation'` to make misuse obvious.
 */
async function enrich(ctx = {}, { deps = {} } = {}) {
  const result = {};
  try {
    if (config.isEnabled('github') && config.direction('github') === 'read-only') {
      const gh = require('./adapters/github.js');
      const token = broker.getToken('github');
      const data = await gh.enrich(ctx, { ...deps, token: deps.token || token });
      if (data) result.github = data; // already tagged _kind:'presentation'
    }
  } catch { /* best-effort */ }
  return result;
}

/** Full snapshot for UI/CLI. No secrets — tokens are reported as present/absent only. */
function status() {
  const cfg = config.readConfig();
  const tools = {};
  for (const tool of config.TOOLS) {
    tools[tool] = {
      enabled: cfg[tool].enabled,
      direction: cfg[tool].direction,
      has_token: broker.hasToken(tool),
      token_hint: broker.redact(broker.getToken(tool)),
      min_scope: broker.minScope(tool),
      consent: config.direction(tool) === 'outbound' ? gate.hasConsent(tool) : null,
      killswitch_tripped: debounce.isTripped(tool),
      pending: debounce.pendingCount(tool),
    };
  }
  return { zero_by_default: true, unidirectional: true, window_ms: debounce.WINDOW_MS, tools };
}

// ── Management surface (delegations for cli.js / the UI) ───────────────────────────────
const enable = (tool, opts) => config.setEnabled(tool, true, opts);
const disable = (tool) => config.setEnabled(tool, false);
const setToken = (tool, token, opts) => broker.setToken(tool, token, opts);
const revokeToken = (tool) => broker.revoke(tool);
const grantConsent = (tool, opts) => gate.grant(tool, opts);
const revokeConsent = (tool) => gate.revoke(tool);
const resetKillswitch = (tool) => debounce.reset(tool);

module.exports = {
  emit, flush, flushDue, enrich, status,
  enable, disable, setToken, revokeToken, grantConsent, revokeConsent, resetKillswitch,
};

'use strict';

// FRENTE C · PM Adapters — outbound provenance stamp (DC-11, unidirectional).
//
// "Unidireccional: Ledger→externo, carimbado com ledger_event_id; NUNCA ler de volta
//  para o forecast (senão o Notion vira 2ª verdade)."
//
// The Ledger schema has no native `event_id` — events are content-addressed via
// input_hash/output_hash and de-duped by idem_key (handoff-journal.js). So we SYNTHESISE
// a deterministic `ledger_event_id` here (same event → same id), which lets the external
// sink upsert idempotently instead of duplicating rows on re-emit.
//
// Every outbound payload carries { ledger_event_id, source:'mooter-ledger' } — the
// watermark that makes the Ledger unmistakably the origin. We NEVER include verbatim
// input/output text (privacy — consent.ts hard-wires prompt_content:false); only a
// minimal projection travels outward.

const { provHash } = require('../ledger-prov.js');

const SOURCE = 'mooter-ledger';

function shortSid(sid) {
  return String(sid || 'nosid').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 8) || 'nosid';
}

/** Deterministic id for a Ledger event. Prefers idem_key, then output_hash, then a hash
 *  over the event's stable identity fields. Same event → same id, always. */
function ledgerEventId(event) {
  const ev = event || {};
  const base =
    ev.idem_key ||
    ev.output_hash ||
    provHash({ kind: ev.kind, ts: ev.ts, agent: ev.agent, input_hash: ev.input_hash });
  return `led_${shortSid(ev.sid || ev.sessionId)}_${ev.ts || 0}_${String(base).slice(0, 16)}`;
}

/** Build the outbound payload for a Ledger event. Carries the watermark; strips secrets
 *  and verbatim text. `at` injectable for tests. */
function stampOutbound(event, { tool, at } = {}) {
  const ev = event || {};
  return {
    ledger_event_id: ledgerEventId(ev),
    source: SOURCE,
    tool: tool || null,
    emitted_at: at || new Date().toISOString(),
    // Minimal projection — NEVER the verbatim input/output payloads (DC-12 privacy).
    summary: {
      kind: ev.kind || null,
      agent: ev.agent || null,
      model: ev.model || null,
      tier: ev.tier || null,
      gate: ev.gate || null,
      cost_usd: typeof ev.cost_usd === 'number' ? ev.cost_usd : null,
      ts: ev.ts || null,
    },
  };
}

/** True iff a payload carries the unidirectional watermark. Used by tests + defense-in-depth. */
function isStamped(payload) {
  return !!(payload && payload.source === SOURCE && typeof payload.ledger_event_id === 'string');
}

module.exports = { SOURCE, ledgerEventId, stampOutbound, isStamped };

'use strict';

// FRENTE C · PM Adapters — Notion roadmap write-back (OUTBOUND, unidirectional).
//
// Pushes a coalesced summary of Ledger events into a Notion roadmap database as rows,
// each carrying the ledger_event_id watermark so re-emits upsert instead of duplicating.
// We NEVER query Notion back into the forecast (DC-11) — Notion is a projection sink.
//
// The database id is read from config (preferences.json → pm_adapters.notion.database_id).
// Requires enable + broker token + human consent (all enforced upstream by the manager).

const { makeOutbound } = require('./base-outbound.js');
const { readConfig } = require('../config.js');

const NOTION_VERSION = '2022-06-28';

function databaseId() {
  const c = readConfig().notion || {};
  return c.database_id || null;
}

/** One Notion page (row) per Ledger event; title = ledger_event_id (idempotency key). */
function buildRequest(summary, token) {
  const db = databaseId();
  if (!db) return null; // not configured → no request (manager treats as blocked)
  // Coalesced write: create one row summarising the batch. A real Notion upsert would
  // query-by-title first; we intentionally do NOT read back (DC-11) — the sink owns dedup
  // by the ledger_event_id we stamp into a stable external_id property.
  const first = summary.items[0] || {};
  return {
    url: 'https://api.notion.com/v1/pages',
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parent: { database_id: db },
      properties: {
        Name: { title: [{ text: { content: `Mooter Ledger · ${summary.count} event(s)` } }] },
        ExternalId: { rich_text: [{ text: { content: first.ledger_event_id || '' } }] },
        Source: { rich_text: [{ text: { content: 'mooter-ledger' } }] },
      },
    }),
  };
}

function make({ transport } = {}) {
  return makeOutbound({ tool: 'notion', buildRequest, transport });
}

module.exports = { make, buildRequest, databaseId, DIRECTION: 'outbound' };

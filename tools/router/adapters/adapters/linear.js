'use strict';

// FRENTE C · PM Adapters — Linear write-back (OUTBOUND, optional).
//
// Creates/updates a Linear issue from the coalesced Ledger summary via the GraphQL API,
// carrying the ledger_event_id watermark. Unidirectional: we write, never read back into
// the forecast (DC-11). Requires enable + broker token + human consent (enforced upstream).

const { makeOutbound } = require('./base-outbound.js');
const { readConfig } = require('../config.js');

function teamId() {
  const c = readConfig().linear || {};
  return c.team_id || null;
}

function buildRequest(summary, token) {
  const team = teamId();
  if (!team) return null;
  const first = summary.items[0] || {};
  const title = `Mooter Ledger · ${summary.count} event(s)`;
  const description = `source: mooter-ledger\nexternal_id: ${first.ledger_event_id || ''}\n` +
    `events: ${summary.ledger_event_ids.join(', ')}`;
  const query = `mutation($input: IssueCreateInput!){ issueCreate(input:$input){ success } }`;
  return {
    url: 'https://api.linear.app/graphql',
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { input: { teamId: team, title, description } } }),
  };
}

function make({ transport } = {}) {
  return makeOutbound({ tool: 'linear', buildRequest, transport });
}

module.exports = { make, buildRequest, teamId, DIRECTION: 'outbound' };

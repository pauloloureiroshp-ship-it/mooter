'use strict';

// FRENTE C · PM Adapters — Slack summary notification (OUTBOUND, optional).
//
// The destination for the "1 notificação-resumo/5min" (DC-13): one message per flush
// summarising the coalesced batch — never one per event. Uses an incoming-webhook URL
// stored in config (preferences.json → pm_adapters.slack.webhook_url) OR chat.postMessage
// with a broker token + channel. Unidirectional: we post, we never read Slack back.

const { makeOutbound } = require('./base-outbound.js');
const { readConfig } = require('../config.js');

function cfg() {
  return readConfig().slack || {};
}

function buildRequest(summary, token) {
  const c = cfg();
  const text = `🐮 Mooter Ledger — ${summary.count} event(s) since last flush` +
    (summary.ledger_event_ids.length ? ` (${summary.ledger_event_ids.slice(0, 3).join(', ')}…)` : '');

  // Webhook path (no token needed) takes precedence when configured.
  if (c.webhook_url) {
    return {
      url: c.webhook_url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    };
  }
  // chat.postMessage path — needs token + channel.
  if (!token || !c.channel) return null;
  return {
    url: 'https://slack.com/api/chat.postMessage',
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ channel: c.channel, text }),
  };
}

function make({ transport } = {}) {
  // Slack may authenticate via webhook (no token) — allow deliver without a broker token
  // when a webhook_url is configured, by handing the base a sentinel so its no_token guard
  // doesn't block a legitimate webhook post.
  const base = makeOutbound({ tool: 'slack', buildRequest, transport });
  const orig = base.deliver.bind(base);
  base.deliver = (summary, opts = {}) => orig(summary, { token: opts.token || (cfg().webhook_url ? 'webhook' : undefined) });
  return base;
}

module.exports = { make, buildRequest, DIRECTION: 'outbound' };

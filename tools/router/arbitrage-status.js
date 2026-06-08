#!/usr/bin/env node
'use strict';
// Wave 33 (L11 / B.4) — statusline LINE 3 arbitrage chip. Reads the monitor state
// (~/.mooter/arbitrage_state.json). Shows "avoid X" only when a provider has been
// confirmed degraded/down. No network, no spawn. Silent when disabled.
// ADVISORY only — the tier classify.js assigns is never affected.

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIRM = 3;

function statusLine() {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.mooter', 'arbitrage_state.json'), 'utf8'));
    if (!s || s.enabled !== true) return '';
    const avoid = [];
    for (const [id, ps] of Object.entries(s.providers || {})) {
      const hist = Array.isArray(ps.history) ? ps.history.slice(0, CONFIRM) : [];
      if (hist.length >= CONFIRM && hist.every((h) => h === 'degraded' || h === 'down')) avoid.push(id);
    }
    return avoid.length ? `📊 arbitrage: avoid ${avoid.join('/')}` : '📊 arbitrage active';
  } catch {
    return '';
  }
}

module.exports = { statusLine };

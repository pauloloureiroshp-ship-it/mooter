#!/usr/bin/env node
'use strict';
// Wave 33 (B.1) — statusline LINE 3 TurboQuant chip. Reads the opt-in flag from
// ~/.mooter/preferences.json (turboquant_enabled) or MOOTER_TURBOQUANT=1. No
// network, no spawn — keeps the ≤10ms render budget. Silent when disabled.

const fs = require('fs');
const path = require('path');
const os = require('os');

function statusLine() {
  try {
    if (process.env.MOOTER_TURBOQUANT === '1') return '🐢 TQ-3bit';
    const prefs = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.mooter', 'preferences.json'), 'utf8'));
    return prefs && prefs.turboquant_enabled === true ? '🐢 TQ-3bit' : '';
  } catch {
    return '';
  }
}

module.exports = { statusLine };

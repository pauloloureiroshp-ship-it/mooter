#!/usr/bin/env node
'use strict';
// Wave 32 (Phase G) — statusline LINE 3 quant chip. Reads the cached snapshot
// `mooter quant status` writes (~/.mooter/cache/quant-snapshot.json). NEVER hits
// the network on the render path (keeps the ≤10ms budget). Silent if no snapshot.

const fs = require('fs');
const path = require('path');
const os = require('os');

function statusLine() {
  try {
    const snap = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.mooter', 'cache', 'quant-snapshot.json'), 'utf8'));
    const m = Array.isArray(snap.models) && snap.models[0];
    if (!m) return '';
    const size = typeof m.sizeGb === 'number' ? ` · ${m.sizeGb} GB` : '';
    return `📦 ${m.name} · ${m.quant}${size}`;
  } catch {
    return '';
  }
}

module.exports = { statusLine };
